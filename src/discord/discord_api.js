import axios from 'axios';
import OAuth from 'discord-oauth2';
import { log, error } from '../utils/logger.js';
import { db } from '../db/db.js';
import config from '../config/config.json' with { type: 'json' };
import { t } from '../utils/i18n.js';

const discordOauth = new OAuth();

export async function updateDiscordMetadata(clientId, accessToken, xauthUsername) {
    const url = `https://discord.com/api/v10/users/@me/applications/${clientId}/role-connection`;
    const body = {
        platform_name: 'XAuthConnect',
        platform_username: xauthUsername,
        metadata: {
            linked: 1,
        }
    };

    try {
        await axios.put(url, body, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            }
        });
        log(`Successfully updated Discord linked role metadata for ${xauthUsername}.`);

    } catch (err) {
        error(`Error updating Discord metadata: ${err.response?.data || err.message}`);
    }
}

export async function refreshToken(discord_id, site) {
    const { rows } = await db.query('SELECT discord_refresh_token FROM linked_roles WHERE discord_id = $1 AND site = $2', [discord_id, site]);
    if (!rows.length) {
        throw new Error('No record found for this user.');
    }

    const communityConfig = config[site];
    if (!communityConfig) {
        throw new Error(`Configuration for site '${site}' not found.`);
    }

    try {
        const tokenResponse = await discordOauth.tokenRequest({
            grantType: 'refresh_token',
            refreshToken: rows[0].discord_refresh_token,
            clientId: communityConfig.discord.clientId,
            clientSecret: communityConfig.discord.clientSecret,
            scope: ['identify', 'role_connections.write'],
        });

        await db.query(
            'UPDATE linked_roles SET discord_access_token = $1, discord_refresh_token = $2 WHERE discord_id = $3 AND site = $4',
            [tokenResponse.access_token, tokenResponse.refresh_token, discord_id, site]
        );

        log(`Refreshed token for ${discord_id} on site ${site}.`);
        return tokenResponse.access_token;
    } catch (err) {
        error(`Error refreshing token for ${discord_id} on site ${site}: ${err.message}`);
        if (err.message.includes('invalid_grant')) {
            log(`Removing invalid link for ${discord_id} on site ${site}.`);
            await db.query('DELETE FROM linked_roles WHERE discord_id = $1 AND site = $2', [discord_id, site]);
        }
        return null;
    }
}

export async function handleDiscordInteraction(interaction) {
    const INTERACTION_RESPONSE_TYPE = {
        PONG: 1,
        CHANNEL_MESSAGE_WITH_SOURCE: 4,
        DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
        DEFERRED_UPDATE_MESSAGE: 6,
        UPDATE_MESSAGE: 7,
        APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
        MODAL: 9,
        PREMIUM_REQUIRED: 10,
    };

    const INTERACTION_TYPE = {
        PING: 1,
        APPLICATION_COMMAND: 2,
        MESSAGE_COMPONENT: 3,
        APPLICATION_COMMAND_AUTOCOMPLETE: 4,
        MODAL_SUBMIT: 5,
    };

    switch (interaction.type) {
        case INTERACTION_TYPE.PING:
            return { type: INTERACTION_RESPONSE_TYPE.PONG };

        case INTERACTION_TYPE.APPLICATION_COMMAND:
            const commandName = interaction.data.name;
            const userId = interaction.member?.user?.id || interaction.user?.id;
            const clientId = interaction.application_id; // The application ID from the interaction

            // Find the site associated with this clientId
            let site = null;
            for (const s in config) {
                if (config[s].discord.clientId === clientId) {
                    site = s;
                    break;
                }
            }

            const lang = interaction.locale?.split('-')[0] || 'en'; // Get language from locale, default to en

            if (!site) {
                error(`Could not find site configuration for clientId: ${clientId}`);
                return { type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: t('CONFIGURATION_ERROR_SITE_NOT_FOUND', lang), flags: 64 } };
            }

            switch (commandName) {
                case 'update':
                    // Defer the response immediately
                    const followUp = async () => {
                        const { rows } = await db.query('SELECT discord_access_token, xauth_username FROM linked_roles WHERE discord_id = $1 AND site = $2', [userId, site]);
                        if (!rows.length) {
                            await axios.post(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
                                content: t('NO_LINKED_ACCOUNT', lang),
                                flags: 64
                            });
                            return;
                        }

                        const { discord_access_token, xauth_username } = rows[0];
                        const communityConfig = config[site];

                        if (!communityConfig) {
                            await axios.post(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
                                content: t('CONFIGURATION_ERROR_SITE_NOT_FOUND', lang),
                                flags: 64
                            });
                            return;
                        }

                        const newAccessToken = await refreshToken(userId, site);

                        if (newAccessToken) {
                            await updateDiscordMetadata(communityConfig.discord.clientId, newAccessToken, xauth_username);
                            await axios.post(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
                                content: t('UPDATE_SUCCESS', lang),
                                flags: 64
                            });
                        } else {
                            await axios.post(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
                                content: t('UPDATE_FAILURE', lang),
                                flags: 64
                            });
                        }
                    };
                    followUp(); // Execute the follow-up asynchronously
                    return { type: INTERACTION_RESPONSE_TYPE.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: 64 } };

                case 'ping':
                    return { type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: t('PONG', lang) } };

                case 'myinfo':
                case 'whois':
                    const targetUserId = commandName === 'whois' && interaction.data.options?.[0]?.value || userId;
                    const { rows: userRows } = await db.query('SELECT xauth_username FROM linked_roles WHERE discord_id = $1 AND site = $2', [targetUserId, site]);

                    let responseContent;
                    if (userRows.length > 0) {
                        responseContent = t('USER_LINKED_TO_XAUTH', lang, { userId: targetUserId, xauthUsername: userRows[0].xauth_username });
                    } else {
                        responseContent = t('USER_NOT_LINKED_FOR_COMMUNITY', lang, { userId: targetUserId });
                    }
                    return { type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: responseContent, flags: 64 } };

                case 'refresh':
                    const userToRefreshId = interaction.data.options?.[0]?.value;
                    if (!userToRefreshId) {
                        return { type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: t('PLEASE_SPECIFY_USER_TO_REFRESH', lang), flags: 64 } };
                    }

                    // Defer the response immediately
                    const refreshFollowUp = async () => {
                        const { rows } = await db.query('SELECT discord_access_token, xauth_username FROM linked_roles WHERE discord_id = $1 AND site = $2', [userToRefreshId, site]);
                        if (!rows.length) {
                            await axios.post(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
                                content: t('NO_LINKED_ACCOUNT_FOR_USER', lang, { userId: userToRefreshId }), flags: 64
                            });
                            return;
                        }

                        const { xauth_username } = rows[0];
                        const communityConfig = config[site];

                        if (!communityConfig) {
                            await axios.post(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
                                content: t('CONFIGURATION_ERROR_SITE_NOT_FOUND', lang), flags: 64
                            });
                            return;
                        }

                        const newAccessToken = await refreshToken(userToRefreshId, site);

                        if (newAccessToken) {
                            await updateDiscordMetadata(communityConfig.discord.clientId, newAccessToken, xauth_username);
                            await axios.post(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
                                content: t('REFRESH_SUCCESS', lang, { userId: userToRefreshId }), flags: 64
                            });
                        } else {
                            await axios.post(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
                                content: t('REFRESH_FAILURE', lang, { userId: userToRefreshId }), flags: 64
                            });
                        }
                    };
                    refreshFollowUp(); // Execute the follow-up asynchronously
                    return { type: INTERACTION_RESPONSE_TYPE.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: 64 } };

                default:
                    return { type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: t('UNKNOWN_COMMAND', lang), flags: 64 } };
            }

        default:
            return { type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: t('UNKNOWN_INTERACTION_TYPE', lang), flags: 64 } };
    }
}