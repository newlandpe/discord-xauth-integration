import { initializeDatabase, db } from '../../../server.js';

export default (appServices) => ({
    command: 'refresh-all',
    describe: 'Refreshes metadata for all linked users.',
    handler: async (argv) => {
        await initializeDatabase();
        appServices.db = db; // Assign the initialized db instance
        await appServices.refreshAllUsersMetadata();
        process.exit(0); // Ensure the process exits cleanly
    }
});
