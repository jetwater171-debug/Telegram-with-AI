
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log("Checking 'messages' table structure...");

    // Attempt to select a non-existent column to see error, or select * and check keys of one row
    const { data, error } = await supabase.from('messages').select('*').limit(1);

    if (error) {
        console.error("Error fetching messages:", error);
    } else if (data && data.length > 0) {
        console.log("Existing columns:", Object.keys(data[0]));
        if ('payment_data' in data[0]) {
            console.log("✅ 'payment_data' column EXISTS.");
        } else {
            console.log("❌ 'payment_data' column MISSING.");
        }
    } else {
        console.log("Table allows selection but is empty. Cannot verify columns from data.");
        // Try inserting dummy with payment_data to see if it errors
        const { error: insertError } = await supabase.from('messages').insert({
            session_id: '00000000-0000-0000-0000-000000000000', // likely fails FK but checks column first?
            sender: 'bot',
            content: 'schema_check',
            payment_data: {}
        });

        if (insertError) {
            console.log("Insert attempt error:", insertError.message);
        }
    }
}

checkSchema();
