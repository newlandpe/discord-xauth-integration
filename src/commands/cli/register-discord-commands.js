export default (appServices) => ({
    command: 'register-discord-commands',
    describe: 'Registers Discord global slash commands.',
    handler: async (argv) => {
        await appServices.registerDiscordCommands();
        process.exit(0); // Ensure the process exits cleanly
    }
});
