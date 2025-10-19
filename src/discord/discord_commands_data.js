import { t, locales } from '../utils/i18n.js';

// Helper to generate localized fields from all loaded locales
export function getLocalizations(key, defaultLang = 'en') {
    const localizations = {};
    for (const lang in locales) {
        if (lang !== defaultLang && locales[lang][key]) {
            localizations[lang] = locales[lang][key];
        }
    }
    return localizations;
}

export const discordSlashCommands = [
    {
        name: 'update',
        description: t('COMMAND_UPDATE_DESCRIPTION', 'en'),
        description_localizations: getLocalizations('COMMAND_UPDATE_DESCRIPTION'),
        type: 1 // CHAT_INPUT
    },
    {
        name: 'ping',
        description: t('COMMAND_PING_DESCRIPTION', 'en'),
        description_localizations: getLocalizations('COMMAND_PING_DESCRIPTION'),
        type: 1 // CHAT_INPUT
    },
    {
        name: 'whois',
        description: t('COMMAND_WHOIS_DESCRIPTION', 'en'),
        description_localizations: getLocalizations('COMMAND_WHOIS_DESCRIPTION'),
        type: 1, // CHAT_INPUT
        options: [
            {
                name: 'user',
                description: t('COMMAND_WHOIS_OPTION_USER_DESCRIPTION', 'en'),
                description_localizations: getLocalizations('COMMAND_WHOIS_OPTION_USER_DESCRIPTION'),
                type: 6, // USER type
                required: false
            }
        ]
    },
    {
        name: 'myinfo',
        description: t('COMMAND_MYINFO_DESCRIPTION', 'en'),
        description_localizations: getLocalizations('COMMAND_MYINFO_DESCRIPTION'),
        type: 1 // CHAT_INPUT
    },
    {
        name: 'refresh',
        description: t('COMMAND_REFRESH_DESCRIPTION', 'en'),
        description_localizations: getLocalizations('COMMAND_REFRESH_DESCRIPTION'),
        type: 1, // CHAT_INPUT
        options: [
            {
                name: 'user',
                description: t('COMMAND_REFRESH_OPTION_USER_DESCRIPTION', 'en'),
                description_localizations: getLocalizations('COMMAND_REFRESH_OPTION_USER_DESCRIPTION'),
                type: 6, // USER type
                required: true
            }
        ]
    },
    {
        name: 'setpresence',
        description: 'Sets the bot\'s presence (activity and status).',
        description_localizations: getLocalizations('COMMAND_SETPRESENCE_DESCRIPTION'),
        type: 1, // CHAT_INPUT
        options: [
            {
                name: 'name',
                description: 'Activity name (e.g., "Playing a game")',
                description_localizations: getLocalizations('COMMAND_SETPRESENCE_OPTION_NAME_DESCRIPTION'),
                type: 3, // STRING
                required: true
            },
            {
                name: 'type',
                description: 'Activity type (0=Playing, 1=Streaming, 2=Listening, 3=Watching, 5=Competing)',
                description_localizations: getLocalizations('COMMAND_SETPRESENCE_OPTION_TYPE_DESCRIPTION'),
                type: 4, // INTEGER
                required: true,
                choices: [
                    { name: 'Playing', value: 0 },
                    { name: 'Streaming', value: 1 },
                    { name: 'Listening', value: 2 },
                    { name: 'Watching', value: 3 },
                    { name: 'Competing', value: 5 }
                ]
            },
            {
                name: 'status',
                description: 'Bot status ("online", "idle", "dnd", "offline")',
                description_localizations: getLocalizations('COMMAND_SETPRESENCE_OPTION_STATUS_DESCRIPTION'),
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Online', value: 'online' },
                    { name: 'Idle', value: 'idle' },
                    { name: 'Do Not Disturb', value: 'dnd' },
                    { name: 'Offline', value: 'offline' }
                ]
            }
        ],
        default_member_permissions: '0' // No specific permissions required by default
    }
];
