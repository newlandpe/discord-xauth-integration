export default (appServices) => ({
    command: 'register-metadata',
    describe: 'Registers the Discord role connection metadata schema.',
    handler: async (argv) => {
        await appServices.registerMetadata();
        process.exit(0); // Ensure the process exits cleanly
    }
});
