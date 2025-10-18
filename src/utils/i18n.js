import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const locales = {};

// Load translations
function loadTranslations() {
    const localeFiles = ['en.json', 'uk.json']; // Add more languages here
    for (const file of localeFiles) {
        const lang = file.split('.')[0];
        try {
            locales[lang] = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'locales', file), 'utf-8'));
        } catch (err) {
            console.error(`Error loading locale file ${file}:`, err);
            locales[lang] = {}; // Fallback to empty object
        }
    }
}

loadTranslations();

export function t(key, lang = 'en', replacements = {}) {
    const translation = locales[lang]?.[key] || locales['en']?.[key] || key; // Fallback to English, then key itself

    // Apply replacements
    return translation.replace(/\{(\w+)\}/g, (match, p1) => {
        return replacements[p1] !== undefined ? replacements[p1] : match;
    });
}

export { locales };
