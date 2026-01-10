
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '.env.local');
let envConfig = {};
try {
    const content = fs.readFileSync(envPath, 'utf8');
    envConfig = content.split('\n').reduce((acc, line) => {
        const [key, val] = line.split('=');
        if (key && val) acc[key.trim()] = val.trim();
        return acc;
    }, {});
} catch (e) { console.log("Could not read .env.local"); }

const url = envConfig.VITE_SUPABASE_URL || envConfig.NEXT_PUBLIC_SUPABASE_URL;
const key = envConfig.VITE_SUPABASE_ANON_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function run() {
    console.log("Fetching one row from media_library...");
    const { data: rows, error } = await supabase.from('media_library').select('*').limit(1);

    if (error) {
        console.error("Error:", error.message);
    } else if (rows && rows.length > 0) {
        console.log("Columns found:", Object.keys(rows[0]));
        console.log("Sample Data:", rows[0]);
    } else {
        console.log("Table is empty. Cannot determine columns from data.");
    }
}

run();
