import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getBotId() {
    console.log("🔍 Fetching Bot ID...");
    const { data, error } = await supabase
        .from('telegram_bots')
        .select('id, bot_name')
        .limit(1);

    if (error) {
        console.error("❌ Error fetching bot:", error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log(`ID: ${data[0].id}`);
        fs.writeFileSync('bot_id.txt', data[0].id);
    } else {
        console.log("❌ No bots found in the database.");
    }
}

getBotId();
