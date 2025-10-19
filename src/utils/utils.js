import { log, error } from './logger.js';

export async function graceful(signal, server, db, discordClient, rl) {
    log(`Received ${signal} signal. Shutting down gracefully...`);
    if (server) {
        await new Promise(resolve => server.close(resolve));
        log('HTTP server closed.');
    }
    if (db && db.end) {
        await db.end();
        log('Database connection closed.');
    }
    if (discordClient && discordClient.isReady()) {
        discordClient.destroy();
        log('Disconnected Discord client.');
    }
    if (rl) {
        rl.close();
        log('Readline interface closed.');
    }
    log('Application shut down.');
    process.exit(0);
}
