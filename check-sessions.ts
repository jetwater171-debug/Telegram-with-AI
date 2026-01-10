
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
);

(async () => {
    const { data, error } = await supabase.from('sessions').select('*');
    if (error) console.error("Error fetching sessions:", error);
    else console.log("Sessions found:", data?.length, data);
})();
