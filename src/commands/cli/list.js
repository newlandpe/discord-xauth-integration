import { initializeDatabase, db } from '../../../server.js';

export default (appServices) => ({
    command: 'list',
    describe: 'Lists all linked users from the database.',
    handler: async () => {
        await initializeDatabase();
        appServices.db = db; // Assign the initialized db instance
        await appServices.listLinkedUsers();
        await db.end(); // Close the database connection
        process.exit(0); // Ensure the process exits cleanly
    }
});
