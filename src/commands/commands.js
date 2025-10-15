import { log, error } from '../utils/logger.js';
import { db } from '../db/db.js';
import axios from 'axios';
import config from '../config/config.json' with { type: 'json' };
import { refreshToken, updateDiscordMetadata } from '../discord/discord_api.js';
import { graceful } from '../utils/utils.js';
import { t } from '../utils/i18n.js';

// Helper to generate localized descriptions
function getLocalizedDescriptions(keyPrefix) {
    return {
        'en-US': t(keyPrefix, 'en'),
        'uk': t(keyPrefix, 'uk'),
    };
}

const commands = {
    help: {
        description: 'Displays this help message.',
        execute: () => {
            log('Available commands:');
            for (const command in commands) {
                log(`  ${command}: ${commands[command].description}`);
            }
        }
    },
    list: {
        description: 'Lists all linked users from the database.',
        execute: async () => {
            try {
                const { rows } = await db.query('SELECT * FROM linked_roles');
                if (rows.length === 0) {
                    log('No linked users found.');
                    return;
                }

                log('Linked users:');
                rows.forEach(row => {
                    log(`  - Discord ID: ${row.discord_id}, Site: ${row.site}, XAuth Username: ${row.xauth_username}`);
                });
            } catch (err) {
                error(`Error fetching linked users: ${err}`);
            }
        }
    },
    prune: {
        description: 'Removes users from the database who are no longer in the Discord server.',
        execute: async () => {
            log('Starting prune...');
            try {
                const { rows } = await db.query('SELECT * FROM linked_roles');
                if (rows.length === 0) {
                    log('No linked users found to prune.');
                    return;
                }

                for (const row of rows) {
                    const { discord_id, site } = row;
                    const communityConfig = config[site];

                    if (!communityConfig || !communityConfig.discord.guildId || !communityConfig.discord.botToken) {
                        error(`Prune failed for site ${site}: Missing guildId or botToken in config.json`);
                        continue;
                    }

                    const url = `https://discord.com/api/v10/guilds/${communityConfig.discord.guildId}/members/${discord_id}`;

                    try {
                        await axios.get(url, {
                            headers: {
                                'Authorization': `Bot ${communityConfig.discord.botToken}`
                            }
                        });
                    } catch (err) {
                        if (err.response && err.response.status === 404) {
                            log(`User ${discord_id} not found in guild for site ${site}. Removing from database.`);
                            await db.query('DELETE FROM linked_roles WHERE discord_id = $1 AND site = $2', [discord_id, site]);
                        } else {
                            error(`Error checking user ${discord_id} for site ${site}: ${err.message}`);
                        }
                    }
                }
                log('Prune finished.');
            } catch (err) {
                error(`Error during prune: ${err}`);
            }
        }
    },
    'refresh-all': {
        description: 'Refreshes metadata for all linked users.',
        execute: async () => {
            log('Starting refresh-all...');
            try {
                const { rows } = await db.query('SELECT * FROM linked_roles');
                if (rows.length === 0) {
                    log('No linked users found to refresh.');
                    return;
                }

                for (const row of rows) {
                    const { discord_id, site, xauth_username } = row;
                    const communityConfig = config[site];

                    if (!communityConfig) {
                        error(`Refresh failed for site ${site}: Configuration not found.`);
                        continue;
                    }

                    const newAccessToken = await refreshToken(discord_id, site);

                    if (newAccessToken) {
                        await updateDiscordMetadata(communityConfig.discord.clientId, newAccessToken, xauth_username);
                    } else {
                        error(`Skipping metadata update for ${discord_id} on site ${site} due to token refresh failure.`);
                    }
                }
                log('Refresh-all finished.');
            } catch (err) {
                error(`Error during refresh-all: ${err}`);
            }
        }
    },
    'register-discord-commands': {
        description: 'Registers Discord global slash commands.',
        execute: async () => {
            log('Registering Discord global slash commands...');
            for (const site in config) {
                const communityConfig = config[site];
                const clientId = communityConfig.discord.clientId;
                const botToken = communityConfig.discord.botToken;

                if (!clientId || !botToken) {
                    error(`Skipping command registration for site ${site}: Missing clientId or botToken.`);
                    continue;
                }

                const commands = [
                    {
                        name: 'update',
                        description: t('COMMAND_UPDATE_DESCRIPTION'),
                        description_localizations: getLocalizedDescriptions('COMMAND_UPDATE_DESCRIPTION'),
                        type: 1 // CHAT_INPUT
                    },
                    {
                        name: 'ping',
                        description: t('COMMAND_PING_DESCRIPTION'),
                        description_localizations: getLocalizedDescriptions('COMMAND_PING_DESCRIPTION'),
                        type: 1 // CHAT_INPUT
                    },
                    {
                        name: 'whois',
                        description: t('COMMAND_WHOIS_DESCRIPTION'),
                        description_localizations: getLocalizedDescriptions('COMMAND_WHOIS_DESCRIPTION'),
                        type: 1, // CHAT_INPUT
                        options: [
                            {
                                name: 'user',
                                description: t('COMMAND_WHOIS_OPTION_USER_DESCRIPTION'),
                                description_localizations: getLocalizedDescriptions('COMMAND_WHOIS_OPTION_USER_DESCRIPTION'),
                                type: 6, // USER type
                                required: false
                            }
                        ]
                    },
                    {
                        name: 'myinfo',
                        description: t('COMMAND_MYINFO_DESCRIPTION'),
                        description_localizations: getLocalizedDescriptions('COMMAND_MYINFO_DESCRIPTION'),
                        type: 1 // CHAT_INPUT
                    },
                    {
                        name: 'refresh',
                        description: t('COMMAND_REFRESH_DESCRIPTION'),
                        description_localizations: getLocalizedDescriptions('COMMAND_REFRESH_DESCRIPTION'),
                        type: 1, // CHAT_INPUT
                        options: [
                            {
                                name: 'user',
                                description: t('COMMAND_REFRESH_OPTION_USER_DESCRIPTION'),
                                description_localizations: getLocalizedDescriptions('COMMAND_REFRESH_OPTION_USER_DESCRIPTION'),
                                type: 6, // USER type
                                required: true
                            }
                        ]
                    }
                ];

                try {
                    await axios.put(
                        `https://discord.com/api/v10/applications/${clientId}/commands`,
                        commands,
                        {
                            headers: {
                                'Authorization': `Bot ${botToken}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    log(`Successfully registered commands for site ${site}.`);
                } catch (err) {
                    error(`Error registering commands for site ${site}: ${err.response?.data?.message || err.message}`);
                }
            }
            log('Finished Discord command registration.');
        }
    },
    quit: {
        description: 'Shuts down the bot gracefully.',
        execute: async (commandArgs, server, db, rl) => {
            await graceful('quit', server, db, rl);
        }
    },

};

async function handleCommand(command, server, db, rl) {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
        return;
    }

    const [commandName, ...args] = trimmedCommand.split(' ');

    if (commands[commandName]) {
        await commands[commandName].execute(args, server, db, rl);
    } else {
        log(`Unknown command: ${commandName}. Type 'help' for a list of commands.`);
    }
}

export { handleCommand };
