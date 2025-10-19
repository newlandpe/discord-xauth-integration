import 'dotenv/config';
import { log, error } from './utils/logger.js';
import { startServer, initializeDatabase, initializeDiscordClient, discordClient, server, db } from '../server.js';
import { AppServices } from './services/app_services.js';

async function runServerAndBot() {
    try {
        await initializeDatabase();
        await initializeDiscordClient(discordClient);
        await startServer(server);
        log('Server and bot started successfully.');

        // Handle graceful shutdown for the background process
        const appServices = new AppServices(db, discordClient, {}); // Config is not directly used here, but passed for consistency
        process.on('SIGINT', (signal) => appServices.shutdownGracefully(signal, server, db, discordClient));
        process.on('SIGTERM', (signal) => appServices.shutdownGracefully(signal, server, db, discordClient));

    } catch (err) {
        error(`Failed to start server or bot: ${err.message}`);
        process.exit(1);
    }
}

runServerAndBot();
