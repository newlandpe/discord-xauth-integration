import { log, error } from '../utils/logger.js';
import { t, locales } from '../utils/i18n.js';
import { refreshToken, updateDiscordMetadata } from '../discord/discord_api.js';
import axios from 'axios';
import config from '../../config.json' with { type: 'json' };
import { discordSlashCommands, getLocalizations } from '../discord/discord_commands_data.js';

export class AppServices {
    constructor(dbInstance, config, discordClientInstance = null) {
        this.db = dbInstance;
        this.discordClient = discordClientInstance;
        this.config = config;
    }

    async listLinkedUsers() {
        try {
            const { rows } = await this.db.query('SELECT * FROM linked_roles');
            if (rows.length === 0) {
                log('No linked users found.');
                return;
            }

            log('Linked users:');
            rows.forEach(row => {
                log(`  - Discord ID: ${row.discord_id}, XAuth Username: ${row.xauth_username}`);
            });
        } catch (err) {
            error(`Error fetching linked users: ${err}`);
            throw err; // Re-throw to be caught by centralized error handler
        }
    }

    async pruneUsers() {
        log('Starting prune...');

        if (!this.config.discord.guildId || !this.config.discord.botToken) {
            error('Prune failed: Missing guildId or botToken in config.json');
            throw new Error('Missing guildId or botToken');
        }

        try {
            const { rows } = await this.db.query('SELECT * FROM linked_roles');
            if (rows.length === 0) {
                log('No linked users found to prune.');
                return;
            }

            for (const row of rows) {
                const { discord_id } = row;
                const url = `https://discord.com/api/v10/guilds/${this.config.discord.guildId}/members/${discord_id}`;

                try {
                    await axios.get(url, {
                        headers: {
                            'Authorization': `Bot ${this.config.discord.botToken}`
                        }
                    });
                } catch (err) {
                    if (err.response && err.response.status === 404) {
                        log(`User ${discord_id} not found in guild. Removing from database.`);
                        await this.db.query('DELETE FROM linked_roles WHERE discord_id = $1', [discord_id]);
                    } else {
                        error(`Error checking user ${discord_id}: ${err.message}`);
                    }
                }
            }
            log('Prune finished.');
        } catch (err) {
            error(`Error during prune: ${err}`);
            throw err;
        }
    }

    async refreshAllUsersMetadata() {
        log('Starting refresh-all...');
        try {
            const { rows } = await this.db.query('SELECT * FROM linked_roles');
            if (rows.length === 0) {
                log('No linked users found to refresh.');
                return;
            }

            for (const row of rows) {
                const { discord_id, xauth_username } = row;
                const newAccessToken = await refreshToken(discord_id);

                if (newAccessToken) {
                    await updateDiscordMetadata(newAccessToken, xauth_username, { linked: 1 });
                } else {
                    error(`Skipping metadata update for ${discord_id} due to token refresh failure.`);
                }
            }
            log('Refresh-all finished.');
        } catch (err) {
            error(`Error during refresh-all: ${err}`);
            throw err;
        }
    }

    async registerDiscordCommands() {
        log('Registering Discord global slash commands...');

        const clientId = this.config.discord.clientId;
        const botToken = this.config.discord.botToken;

        if (!clientId || !botToken) {
            error('Missing clientId or botToken in config.json.');
            throw new Error('Missing clientId or botToken');
        }

        try {
            await axios.put(
                `https://discord.com/api/v10/applications/${clientId}/commands`,
                discordSlashCommands,
                {
                    headers: {
                        'Authorization': `Bot ${botToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            log(`Successfully registered commands.`);
        } catch (err) {
            error(`Error registering commands: ${err.response?.data?.message || err.message}`);
            throw err;
        }
        log('Finished Discord command registration.');
    }

    async registerMetadata() {
        log('Registering metadata schema with Discord...');
        const { clientId, botToken } = this.config.discord;

        if (!clientId || !botToken) {
            error('Missing clientId or botToken in config.json.');
            throw new Error('Missing clientId or botToken');
        }

        const url = `https://discord.com/api/v10/applications/${clientId}/role-connections/metadata`;
        const body = [
          {
            key: 'linked',
            name: t('METADATA_LINKED_NAME', 'en'),
            name_localizations: getLocalizations('METADATA_LINKED_NAME'),
            description: t('METADATA_LINKED_DESCRIPTION', 'en'),
            description_localizations: getLocalizations('METADATA_LINKED_DESCRIPTION'),
            type: 7, // boolean_eq
          },
        ];

        try {
            const response = await axios.put(url, body, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bot ${botToken}`,
                },
            });
            log('Successfully registered metadata schema!');
        } catch (err) {
            error('Error registering metadata schema:');
            error(`[${err.response?.status}] ${err.response?.statusText}`);
            error(err.response?.data);
            throw err;
        }
    }

    async setBotPresence(name, type, status) {
        if (![0, 1, 2, 3, 5].includes(type)) {
            throw new Error('Invalid activity type. Must be 0, 1, 2, 3, or 5.');
        }

        if (!['online', 'idle', 'dnd', 'offline'].includes(status)) {
            throw new Error('Invalid status. Must be "online", "idle", "dnd", or "offline".');
        }

        try {
            await this.discordClient.user.setPresence({
                activities: [{
                    name: name,
                    type: type
                }],
                status: status
            });
            log(`Bot presence set to: ${name} (Type: ${type}, Status: ${status})`);
        } catch (err) {
            error(`Error setting bot presence: ${err.message}`);
            throw err;
        }
    }

    async shutdownGracefully(signal, server, dbInstance, discordClientInstance) {
        // Assuming graceful is imported or passed
        // For now, just re-implementing the core logic
        log(`Received ${signal} signal. Shutting down gracefully...`);
        if (server) {
            await new Promise(resolve => server.close(resolve));
            log('HTTP server closed.');
        }
        if (dbInstance && dbInstance.end) {
            await dbInstance.end();
            log('Database connection closed.');
            dbInstance = null; // Nullify to prevent further calls
        }
        if (discordClientInstance && discordClientInstance.isReady()) {
            await discordClientInstance.user.setPresence({
                activities: [],
                status: 'offline'
            });
            discordClientInstance.destroy();
            log('Discord client disconnected and presence cleared.');
        }
        log('Application shut down.');
        process.exit(0);
    }
}
