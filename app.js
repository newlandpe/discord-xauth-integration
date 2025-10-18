import 'dotenv/config';
import { createServer } from 'node:http';
import { randomBytes, subtle } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import OAuth from 'discord-oauth2';
import Eris from 'eris';
import { updateDiscordMetadata, handleDiscordInteraction } from './src/discord/discord_api.js';
import { XAuthConnect } from './src/oauth/provider.js';
import { db, initializeDb } from './src/db/db.js';
import config from './config.json' with { type: 'json' };
import { log, error } from './src/utils/logger.js';
import { handleCommand, initializeCommands } from './src/commands/commands.js';
import { graceful } from './src/utils/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokenCache = new Map();
const stateCache = new Set();
const discordOauth = new OAuth();
const xauthProvider = new XAuthConnect(config.xauth);
const erisClient = new Eris(config.discord.botToken, {
    intents: ["guilds", "guildMessages", "guildPresences"]
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

                const interactionResponse = await handleDiscordInteraction(interaction);
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

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
});

rl.on('line', async (input) => {
    await handleCommand(input, server, db, rl);
    rl.prompt();
});

initializeDb().then(() => {
    erisClient.connect();
    erisClient.on('ready', () => {
        log('Eris client connected and ready!');
        erisClient.editStatus('online', {
            name: 'with XAuthConnect',
            type: 0 // Playing
        });
    });

    initializeCommands(erisClient);

    server.listen(process.env.PORT, () => {
        log(`Server running at http://localhost:${process.env.PORT}`);
        log(`Use the URL http://localhost:${process.env.PORT}/start to begin.`);
        rl.prompt();
    });
});

process.on('SIGINT', (signal) => graceful(signal, server, db, rl));
process.on('SIGTERM', (signal) => graceful(signal, server, db, rl));
