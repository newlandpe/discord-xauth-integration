import { log, error } from './logger.js';

export async function graceful(signal, server, db, rl) {
    log(`Received ${signal}. Shutting down gracefully...`);
    rl.close(); // Close the readline interface

    try {
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err) {
                    error(`Error closing server: ${err}`);
                    return reject(err);
                }
                log('Closed the server.');
                resolve();
            });
        });
        await db.end();
        log('Closed the database connection.');
        process.exit(0);
    } catch (err) {
        error(`Error during graceful shutdown: ${err}`);
        process.exit(1); // Exit with an error code
    }
}
