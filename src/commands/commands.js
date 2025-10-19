import { log, error } from '../utils/logger.js';
import config from '../../config.json' with { type: 'json' };
import { AppServices } from '../services/app_services.js';

// Import individual command modules
import listCommand from './cli/list.js';
import pruneCommand from './cli/prune.js';
import refreshAllCommand from './cli/refresh-all.js';
import registerDiscordCommandsCommand from './cli/register-discord-commands.js';
import registerMetadataCommand from './cli/register-metadata.js';

function initializeCommands(db) {
    const appServices = new AppServices(db, config);

    return [
        listCommand(appServices),
        pruneCommand(appServices),
        refreshAllCommand(appServices),
        registerDiscordCommandsCommand(appServices),
        registerMetadataCommand(appServices),
    ];
}

export { initializeCommands };
