
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking messages table structure...');
    const { data, error } = await supabase.from('messages').select('*').limit(1);

    if (error) {
        console.error('Error fetching messages:', error);
    } else {
        console.log('Sample message columns:', Object.keys(data[0] || {}));
    }

    console.log('\nChecking sessions table structure...');
    const { data: sData, error: sError } = await supabase.from('sessions').select('*').limit(1);
    if (sError) {
        console.error('Error fetching sessions:', sError);
    } else {
        console.log('Sample session columns:', Object.keys(sData[0] || {}));
    }
}

checkSchema();
