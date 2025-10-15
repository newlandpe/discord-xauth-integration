import pg from 'pg';
import { log, error } from './logger.js';

const pool = new pg.Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
});

export const db = {
    query: (text, params) => pool.query(text, params),
    end: () => pool.end(),
};

export async function initializeDb() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS linked_roles (
            discord_id VARCHAR(255) NOT NULL,
            site VARCHAR(255) NOT NULL,
            xauth_id VARCHAR(255) NOT NULL,
            xauth_username VARCHAR(255) NOT NULL,
            discord_access_token TEXT NOT NULL,
            discord_refresh_token TEXT NOT NULL,
            PRIMARY KEY (discord_id, site)
        );
    `;
    try {
        await pool.query(createTableQuery);
        log('Database table "linked_roles" is ready.');
    } catch (err) {
        error(`Error initializing database table: ${err}`);
        process.exit(1);
    }
}
