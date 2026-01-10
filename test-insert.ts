
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(url!, key!);

async function run() {
    // Try to insert a dummy message and see the error
    const { data: session } = await supabase.from('sessions').select('id').limit(1).single();
    if (!session) {
        fs.writeFileSync('schema_error.txt', "No session found to test insert.", 'utf8');
        return;
    }

    const { error } = await supabase.from('messages').insert([{
        session_id: session.id,
        sender: 'bot',
        content: 'Test message',
        media_url: null,
        media_type: null,
        payment_data: { test: true }
    }]);

    if (error) {
        fs.writeFileSync('schema_error.txt', JSON.stringify(error, null, 2), 'utf8');
    } else {
        fs.writeFileSync('schema_error.txt', "Insert successful! No schema error detected for these columns.", 'utf8');
    }
}

run();
