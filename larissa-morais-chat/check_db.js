import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env.local
try {
    const envPath = path.resolve(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const env = {};
    envContent.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            env[key] = value;
        }
    });

    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
        console.error("❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
        process.exit(1);
    }

    const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

    async function check() {
        console.log("🔍 Checking Supabase connection...");
        console.log(`URL: ${env.VITE_SUPABASE_URL}`);

        // Check sessions table
        const { data, error } = await supabase.from('sessions').select('count', { count: 'exact', head: true });

        if (error) {
            console.error("\n❌ Error accessing 'sessions' table:");
            console.error(`Message: ${error.message}`);
            console.error(`Code: ${error.code}`);
            console.error(`Hint: ${error.hint || 'No hint'}`);
            console.error(`Details: ${error.details || 'No details'}`);
        } else {
            console.log(`\n✅ 'sessions' table is accessible.`);
        }

        // Check messages table
        const { error: msgError } = await supabase.from('messages').select('count', { count: 'exact', head: true });
        if (msgError) {
            console.error("\n❌ Error accessing 'messages' table:");
            console.error(`Message: ${msgError.message}`);
        } else {
            console.log(`✅ 'messages' table is accessible.`);
        }

        // Try to insert a session
        console.log("\nTrying to insert a test session...");
        const { data: insertData, error: insertError } = await supabase
            .from('sessions')
            .insert([{ user_city: 'Test City', device_type: 'Test Device', status: 'active' }])
            .select()
            .single();

        if (insertError) {
            console.error("❌ Insert failed:", insertError.message);
            console.error("Details:", JSON.stringify(insertError, null, 2));
        } else {
            console.log("✅ Insert successful. New ID:", insertData.id);
            // Clean up
            await supabase.from('sessions').delete().eq('id', insertData.id);
            console.log("✅ Test session cleaned up.");
        }
    }

    check();

} catch (err) {
    console.error("Failed to read .env.local or run script:", err);
}
