
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(url!, key!);

async function run() {
    let output = "";

    // Check sessions table
    const { data: sessionCols, error: sErr } = await supabase.rpc('get_table_columns', { table_name: 'sessions' });
    // Note: get_table_columns might not exist. I'll use a simpler way by selecting 1 row.

    const { data: sData } = await supabase.from('sessions').select('*').limit(1);
    output += "Sessions columns: " + Object.keys(sData?.[0] || {}).join(', ') + "\n";

    const { data: mData } = await supabase.from('messages').select('*').limit(1);
    output += "Messages columns: " + Object.keys(mData?.[0] || {}).join(', ') + "\n";

    fs.writeFileSync('table_columns.txt', output, 'utf8');
}

run();
