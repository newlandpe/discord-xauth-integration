import { initializeDatabase, db } from '../../../server.js';

export default (appServices) => ({
    command: 'prune',
    describe: 'Prunes users who are no longer in the Discord guild.',
    handler: async (argv) => {
        await initializeDatabase();
        appServices.db = db; // Assign the initialized db instance
        await appServices.pruneUsers();
        process.exit(0); // Ensure the process exits cleanly
    }
});
