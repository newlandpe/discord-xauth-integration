import config from './config.json' with { type: 'json' };
import { locales, t } from './src/utils/i18n.js';

// Helper to generate localized fields from the imported locales
function getLocalizations(key, defaultLang = 'en') {
    const localizations = {};
    for (const lang in locales) {
        if (lang !== defaultLang && locales[lang][key]) {
            localizations[lang] = locales[lang][key];
        }
    }
    return localizations;
}

// Get community name from command line arguments
const communityName = process.argv[2];
if (!communityName) {
  console.error('Please provide a community name from config.json as a command line argument. Example: node register.js my_community');
  process.exit(1);
}

const communityConfig = config[communityName];
if (!communityConfig) {
  console.error(`Community "${communityName}" not found in config.json.`);
  process.exit(1);
}

const { clientId, botToken } = communityConfig.discord;

if (!clientId || !botToken) {
    console.error(`"clientId" or "botToken" is missing in the config.json for "${communityName}".`);
    process.exit(1);
}

/**
 * Register the metadata to be stored by Discord.
 */
const url = `https://discord.com/api/v10/applications/${clientId}/role-connections/metadata`;

const body = [
  {
    key: 'linked',
    name: t('METADATA_LINKED_NAME', 'en'),
    name_localizations: getLocalizations('METADATA_LINKED_NAME'),
    description: t('METADATA_LINKED_DESCRIPTION', 'en'),
    description_localizations: getLocalizations('METADATA_LINKATA_LINKED_DESCRIPTION'),
    type: 7, // boolean_eq
  },
];

console.log(`Registering metadata schema for community: ${communityName}...`);

const response = await fetch(url, {
  method: 'PUT',
  body: JSON.stringify(body),
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bot ${botToken}`,
  },
});

if (response.ok) {
  console.log('Successfully registered metadata schema!');
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
} else {
  console.error('Error registering metadata schema:');
  console.error(`[${response.status}] ${response.statusText}`);
  const data = await response.text();
  console.error(data);
  process.exit(1);
}
