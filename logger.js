const chalk = {
    red: '\x1b[31m',
    reset: '\x1b[0m'
};

function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`);
}

function error(message) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ${chalk.red}[ERROR] ${message}${chalk.reset}`);
}

export { log, error };
