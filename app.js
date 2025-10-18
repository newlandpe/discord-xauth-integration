import 'dotenv/config';
import { createServer } from 'node:http';
import { randomBytes, subtle } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import OAuth from 'discord-oauth2';
import { updateDiscordMetadata, handleDiscordInteraction } from './src/discord/discord_api.js';
import { XAuthConnect } from './src/oauth/provider.js';
import { db, initializeDb } from './src/db/db.js';
import config from './config.json' with { type: 'json' };
import { log, error } from './src/utils/logger.js';
import { handleCommand } from './src/commands/commands.js';
import { graceful } from './src/utils/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tokenCache = new Map();
const stateCache = new Set();
const discordOauth = new OAuth();
const xauthProvider = new XAuthConnect(config.xauth);

async function getHtml(fileName) {
    return await readFile(path.join(__dirname, 'views', fileName), 'utf-8');
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, process.env.REDIRECT_URI);

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

    if (url.pathname === '/discord/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const errorParam = url.searchParams.get('error');

        if (errorParam === 'access_denied') {
            const deniedHtml = await getHtml('access_denied.html');
            res.writeHead(200, {'Content-Type': 'text/html'}).end(deniedHtml);
            return;
        }

        if (!code || !state || !stateCache.has(state)) {
            res.writeHead(400).end('Invalid request or state expired.');
            return;
        }
        stateCache.delete(state); // State used, delete it

        try {
            const tokenResponse = await discordOauth.tokenRequest({
                clientId: config.discord.clientId,
                clientSecret: config.discord.clientSecret,
                grantType: 'authorization_code',
                code: code,
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
                code_verifier: code_verifier
            });

            const authUrl = xauthProvider.getAuthorizationUrl({ state: xauthState, code_verifier });
            res.writeHead(302, { Location: authUrl }).end();

        } catch (err) {
            error(`Error during Discord OAuth: ${err}`);
            const errorHtml = await getHtml('error.html');
            const errorMessage = `Error: ${err.message}\n\nStack: ${err.stack}`;
            res.writeHead(500, {'Content-Type': 'text/html'}).end(errorHtml.replace('{{errorMessage}}', errorMessage));
        }
        return;
    }

    if (url.pathname === '/xauth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const errorParam = url.searchParams.get('error');

        if (errorParam === 'access_denied') {
            const deniedHtml = await getHtml('access_denied.html');
            res.writeHead(200, {'Content-Type': 'text/html'}).end(deniedHtml);
            return;
        }

        if (!code || !state || !tokenCache.has(state)) {
            res.writeHead(400).end('Invalid request or state expired.');
            return;
        }

        const { code_verifier, discordToken, discordUser, discordRefreshToken } = tokenCache.get(state);

        try {
            const xauthToken = await xauthProvider.getAccessToken({ code, code_verifier });
            const xauthUser = await xauthProvider.getResourceOwner(xauthToken);

            tokenCache.delete(state);

            log('Successfully linked accounts!');
            log(`Discord User: ${discordUser.username} (${discordUser.id})`);
            log(`XAuth User: ${xauthUser.getNickname()} (${xauthUser.getId()})`);

            await updateDiscordMetadata(discordToken, xauthUser.getNickname(), { linked: 1 });

            const upsertQuery = `
                INSERT INTO linked_roles (discord_id, xauth_id, xauth_username, discord_access_token, discord_refresh_token)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (discord_id)
                DO UPDATE SET
                    xauth_id = EXCLUDED.xauth_id,
                    xauth_username = EXCLUDED.xauth_username,
                    discord_access_token = EXCLUDED.discord_access_token,
                    discord_refresh_token = EXCLUDED.discord_refresh_token;
            `;
            await db.query(upsertQuery, [
                discordUser.id,
                xauthUser.getId(),
                xauthUser.getNickname(),
                discordToken,
                discordRefreshToken,
            ]);
            log('Saved linked account to the database.');

            const successHtml = await getHtml('success.html');
            res.writeHead(200, {'Content-Type': 'text/html'}).end(successHtml);

        } catch (err) {
            error(`Error during XAuthConnect OAuth: ${err}`);
            const errorHtml = await getHtml('error.html');
            const errorMessage = `Error: ${err.message}\n\nStack: ${err.stack}\n\n${err.response ? `Response Body: ${JSON.stringify(err.response.data, null, 2)}` : ''}`.trim();
            res.writeHead(500, {'Content-Type': 'text/html'}).end(errorHtml.replace('{{errorMessage}}', errorMessage));
        }
        return;
    }

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

    const indexHtml = await getHtml('index.html');
    const linkButton = `<a href="/start" class="btn btn-primary m-2">${config.displayName || 'Link Account'}</a>`;

    const renderedHtml = indexHtml.replace('{{link_button}}', linkButton);
    res.writeHead(200, {'Content-Type': 'text/html'}).end(renderedHtml);
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
    server.listen(process.env.PORT, () => {
        log(`Server running at http://localhost:${process.env.PORT}`);
        log(`Use the URL http://localhost:${process.env.PORT}/start to begin.`);
        rl.prompt();
    });
});

process.on('SIGINT', (signal) => graceful(signal, server, db, rl));
process.on('SIGTERM', (signal) => graceful(signal, server, db, rl));
