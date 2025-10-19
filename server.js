import 'dotenv/config';
import { createServer } from 'node:http';
import { randomBytes, subtle } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import OAuth from 'discord-oauth2';
import { Client, GatewayIntentBits } from 'discord.js';
import { updateDiscordMetadata, handleDiscordInteraction } from './src/discord/discord_api.js';
import { XAuthConnect } from './src/oauth/provider.js';
import { db, initializeDb } from './src/db/db.js';
import config from './config.json' with { type: 'json' };
import { log, error } from './src/utils/logger.js';
import { graceful } from './src/utils/utils.js';
import { AppServices } from './src/services/app_services.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokenCache = new Map();
const stateCache = new Set();
const discordOauth = new OAuth();
const xauthProvider = new XAuthConnect(config.xauth);
const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildPresences,
    ]
});

async function getHtml(fileName) {
    return await readFile(path.join(__dirname, 'views', fileName), 'utf-8');
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Interaction endpoint
    if (req.method === 'POST' && url.pathname === '/discord/interactions') {
        const signature = req.headers['x-signature-ed25519'];
        const timestamp = req.headers['x-signature-timestamp'];

        if (!signature || !timestamp) {
            res.writeHead(401).end('Unauthorized');
            return;
        }

        let body = [];
        req.on('data', chunk => {
            body.push(chunk);
        });

        req.on('end', async () => {
            const rawBody = Buffer.concat(body).toString();
            const interaction = JSON.parse(rawBody);

            if (interaction.application_id !== config.discord.clientId) {
                error(`Interaction received for unknown application_id: ${interaction.application_id}`);
                res.writeHead(401).end('Unauthorized');
                return;
            }

            const publicKey = config.discord.publicKey;
            if (!publicKey) {
                error(`Public key not found in config.json`);
                res.writeHead(401).end('Unauthorized');
                return;
            }

            try {
                const isVerified = await subtle.verify(
                    'Ed25519',
                    await subtle.importKey('raw', Buffer.from(publicKey, 'hex'), 'Ed25519', true, ['verify']),
                    Buffer.from(signature, 'hex'),
                    Buffer.from(timestamp + rawBody)
                );

                if (!isVerified) {
                    res.writeHead(401).end('Unauthorized');
                    return;
                }

                // Create appServices here to ensure db and discordClient are available
                const appServices = new AppServices(db, discordClient, config);
                const interactionResponse = await handleDiscordInteraction(interaction, appServices);
                res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(interactionResponse));

            } catch (err) {
                error(`Error handling Discord interaction: ${err}`);
                res.writeHead(500).end('Internal Server Error');
            }
        });
        return;
    }

    // Start OAuth flow
    if (url.pathname === '/start') {
        const state = randomBytes(16).toString('hex');
        stateCache.add(state);
        const authUrl = discordOauth.generateAuthUrl({
            clientId: config.discord.clientId,
            scope: ['identify', 'role_connections.write'],
            redirectUri: process.env.REDIRECT_URI,
            responseType: 'code',
            state: state,
        });
        res.writeHead(302, { Location: authUrl }).end();
        return;
    }

    // Discord callback
    if (url.pathname === '/discord/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (url.searchParams.get('error') === 'access_denied') {
            res.writeHead(302, { Location: '/?status=access_denied' }).end();
            return;
        }
        if (!code || !state || !stateCache.has(state)) {
            res.writeHead(302, { Location: '/?status=error' }).end();
            return;
        }
        stateCache.delete(state);

        try {
            const tokenResponse = await discordOauth.tokenRequest({
                clientId: config.discord.clientId,
                clientSecret: config.discord.clientSecret,
                grantType: 'authorization_code',
                code,
                scope: ['identify', 'role_connections.write'],
                redirectUri: process.env.REDIRECT_URI,
            });
            const user = await discordOauth.getUser(tokenResponse.access_token);
            const xauthState = randomBytes(16).toString('hex');
            const code_verifier = randomBytes(32).toString('hex');
            tokenCache.set(xauthState, {
                discordToken: tokenResponse.access_token,
                discordRefreshToken: tokenResponse.refresh_token,
                discordUser: user,
                code_verifier,
            });
            const authUrl = xauthProvider.getAuthorizationUrl({ state: xauthState, code_verifier });
            res.writeHead(302, { Location: authUrl }).end();
        } catch (err) {
            error(`Error during Discord OAuth: ${err}`);
            res.writeHead(302, { Location: '/error' }).end();
        }
        return;
    }

    // XAuthConnect callback
    if (url.pathname === '/xauth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (url.searchParams.get('error') === 'access_denied') {
            res.writeHead(302, { Location: '/?status=access_denied' }).end();
            return;
        }
        if (!code || !state || !tokenCache.has(state)) {
            res.writeHead(302, { Location: '/error' }).end();
            return;
        }
        const { code_verifier, discordToken, discordUser, discordRefreshToken } = tokenCache.get(state);
        tokenCache.delete(state);

        try {
            const xauthToken = await xauthProvider.getAccessToken({ code, code_verifier });
            const xauthUser = await xauthProvider.getResourceOwner(xauthToken);
            log('Successfully linked accounts!');
            log(`Discord User: ${discordUser.username} (${discordUser.id})`);
            log(`XAuth User: ${xauthUser.getNickname()} (${xauthUser.getId()})`);
            await updateDiscordMetadata(discordToken, xauthUser.getNickname(), { linked: 1 });
            const upsertQuery = `
                INSERT INTO linked_roles (discord_id, xauth_id, xauth_username, discord_access_token, discord_refresh_token)
                VALUES ($1, $2, $3, $4, $5) ON CONFLICT (discord_id) DO UPDATE SET
                    xauth_id = EXCLUDED.xauth_id, xauth_username = EXCLUDED.xauth_username,
                    discord_access_token = EXCLUDED.discord_access_token, discord_refresh_token = EXCLUDED.discord_refresh_token;`;
            await db.query(upsertQuery, [discordUser.id, xauthUser.getId(), xauthUser.getNickname(), discordToken, discordRefreshToken]);
            log('Saved linked account to the database.');
            res.writeHead(302, { Location: '/?status=success' }).end();
        } catch (err) {
            res.writeHead(302, { Location: '/?status=error' }).end();
        }
        return;
    }

    // Index page and status display
    if (url.pathname === '/') {
        const status = url.searchParams.get('status');
        let htmlToServe = '';

        if (status) {
            let fileName = '';
            switch (status) {
                case 'success':
                    fileName = 'success.html';
                    break;
                case 'error':
                    fileName = 'error.html';
                    break;
                case 'access_denied':
                    fileName = 'access_denied.html';
                    break;
                default:
                    // If status is unknown, serve default index.html
                    fileName = 'index.html';
                    break;
            }
            htmlToServe = await getHtml(fileName);
        } else {
            // No status parameter, serve default index.html
            htmlToServe = await getHtml('index.html');
        }

        res.writeHead(200, { 'Content-Type': 'text/html' }).end(htmlToServe);
        return;
    }

    // Fallback for any other route
    res.writeHead(404).end('Not Found');
});

export async function initializeDatabase() {
    await initializeDb();
}

let discordClientInitialized = false;

export async function initializeDiscordClient(discordClientInstance) {
    if (discordClientInitialized) {
        return Promise.resolve(); // Already initialized
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            discordClientInstance.removeListener('ready', onReady);
            discordClientInstance.removeListener('error', onError);
            reject(new Error('Discord client connection timed out.'));
        }, 10000); // 10 seconds timeout

        const onReady = () => {
            clearTimeout(timeout);
            discordClientInitialized = true;
            log('Discord client connected and ready.');
            discordClientInstance.user.setPresence({
                activities: [{
                    name: 'XAuthConnect',
                    type: 0 // Playing
                }],
                status: 'online'
            });
            resolve();
        };

        const onError = (err) => {
            clearTimeout(timeout);
            discordClientInstance.removeListener('ready', onReady);
            discordClientInstance.removeListener('error', onError);
            error(`Discord client connection error: ${err.message}. Full error: ${JSON.stringify(err)}`);
            reject(new Error(`Discord client connection error: ${err.message}`));
        };

        discordClientInstance.once('clientReady', onReady);
        discordClientInstance.once('error', onError);
        discordClientInstance.login(config.discord.botToken);
    });
}

export async function startServer() {
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
        log(`Server listening on port ${port}`);
    });
}

export { server, discordClient, db };
