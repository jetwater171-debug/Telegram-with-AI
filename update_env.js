
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env.local');

try {
    let content = fs.readFileSync(envPath, 'utf8');

    const newUrl = 'https://nklplwksyyevslkmmzft.supabase.co';
    const newKey = 'sb_publishable_yfeX_vjpvXohivWWQAuylA_epHOPEEG';

    // Replace URL
    content = content.replace(/VITE_SUPABASE_URL=.*/g, `VITE_SUPABASE_URL=${newUrl}`);

    // Replace Key
    content = content.replace(/VITE_SUPABASE_ANON_KEY=.*/g, `VITE_SUPABASE_ANON_KEY=${newKey}`);

    fs.writeFileSync(envPath, content);
    console.log('Updated .env.local');
} catch (e) {
    console.error("Error updating env:", e);
}
