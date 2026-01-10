
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(url!, key!);

async function run() {
    const { data: messages } = await supabase
        .from('messages')
        .select('*') // Select ALL columns to see if there's anything weird
        .order('created_at', { ascending: false })
        .limit(20);

    let output = "";
    if (messages) {
        messages.forEach(m => {
            output += `[${m.created_at}] ${m.sender}: ${m.content.replace(/\n/g, ' ')}\n`;
            // Log if payment_data exists
            if (m.payment_data) output += `   > Payment Data: ${JSON.stringify(m.payment_data)}\n`;
        });
    } else {
        output = "No messages found or error fetching.";
    }
    fs.writeFileSync('debug_messages_plain.txt', output, 'utf8');
    console.log("Done.");
}

run();
