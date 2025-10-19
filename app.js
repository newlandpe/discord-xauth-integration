import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { log, error } from './src/utils/logger.js';
import { initializeCommands } from './src/commands/commands.js';
import { fork } from 'child_process';
import fs from 'fs';
import { initializeDatabase, db } from './server.js';

const PID_FILE = './server.pid';

async function main() {
    // Initializations are now handled by server_runner.js or specific commands

    await initializeDatabase();

    // Pass null for discordClient, server, db as they are not globally initialized here anymore
    const commands = initializeCommands(db);

    let y = yargs(hideBin(process.argv));

    for (const command of commands) {
        y = y.command(command);
    }

    y.command('start-server', 'Starts the HTTP server and Discord bot in the background.', {}, async () => {
        if (fs.existsSync(PID_FILE)) {
            log('Server is already running.');
            return;
        }

        const child = fork('./src/server_runner.js', [], {
            detached: true,
            stdio: 'ignore'
        });
        fs.writeFileSync(PID_FILE, child.pid.toString());
        log(`Server started in background with PID: ${child.pid}`);
        child.unref(); // Allow the parent to exit independently of the child
        process.exit(0);
    });

    y.command('stop-server', 'Stops the background HTTP server and Discord bot.', {}, () => {
        if (!fs.existsSync(PID_FILE)) {
            log('No server is running.');
            process.exit(0);
        }

        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'), 10);
        try {
            // Check if the process exists before attempting to kill it
            process.kill(pid, 0);
            log(`Attempting to stop server with PID ${pid}.`);
            process.kill(-pid, 'SIGTERM');
            fs.unlinkSync(PID_FILE);
            log(`Server with PID ${pid} stopped.`);
            process.exit(0);
        } catch (err) {
            if (err.code === 'ESRCH') { // Process not found
                fs.unlinkSync(PID_FILE);
                log(`Server with PID ${pid} was not running. Stale PID file removed.`);
                process.exit(0);
            } else {
                error(`Failed to stop server with PID ${pid}: ${err.message}`);
                process.exit(1);
            }
        }
    });

    // If no arguments are provided (only 'node' and 'app.js'), show help and exit.
    if (process.argv.length <= 2) {
        y.showHelp();
        process.exit(0);
    }

    y.help()
        .fail((msg, err, yargs) => {
            if (err) {
                error(`Yargs command failed: ${err.message}`);
            } else {
                error(`Yargs command failed: ${msg}`);
            }
            process.exit(1);
        })
        .argv;
}

main();