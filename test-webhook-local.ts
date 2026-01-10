
import { createClient } from '@supabase/supabase-js';

async function testWebhook() {
    console.log("Simulating Webhook POST to localhost:3000...");

    // 1. Get a bot ID to use (this is a bit hacky, we need a valid ID)
    // We'll trust the user has one, or we can fetch it if we had supabase admin keys here.
    // For now, let's just use a dummy ID or try to fetch from public endpoint if possible? 
    // No, let's just hit the endpoint and see if it logs "Webhook received".

    // We need a valid bot_id in the query param for the handler to work fully, 
    // but even without it, the server should log "Webhook received".

    const body = {
        message: {
            chat: { id: 123456789 },
            text: "oi amor",
            from: { first_name: "TestUser" }
        }
    };

    // We saw the bot ID in the logs earlier! 
    // cec448d5-fdb9-476e-906e-1b9bb88e561a
    const botId = "cec448d5-fdb9-476e-906e-1b9bb88e561a";

    try {
        const res = await fetch(`http://localhost:3000/api/telegram/webhook?bot_id=${botId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        console.log(`Status: ${res.status}`);
        const data = await res.json();
        console.log("Response:", data);
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

testWebhook();
