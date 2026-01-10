
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.use((req, res, next) => {
    console.log(`📨 [${req.method}] ${req.path}`);
    next();
});

// Routes
app.post('/api/telegram/webhook', async (req, res) => {
    console.log("📩 Webhook received:", req.body);
    console.log("   Query Params:", req.query);
    try {
        console.log("   Importing webhook handler...");
        const { default: webhookHandler } = await import('./api/telegram/webhook');
        console.log("   Invoking handler...");
        await webhookHandler(req as any, res as any);
    } catch (e: any) {
        console.error(e);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

app.post('/api/setup-webhook', async (req, res) => {
    console.log("⚙️ Setup Webhook request");
    try {
        const { default: setupHandler } = await import('./api/setup-webhook');
        await setupHandler(req as any, res as any);
    } catch (e: any) {
        console.error(e);
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, async () => {
    console.log(`🚀 Local Backend running at http://localhost:${PORT}`);

    const tunnelUrl = process.env.PUBLIC_URL;
    if (tunnelUrl) {
        console.log(`� Auto-configuring webhooks for: ${tunnelUrl}`);
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

            const { data: bots } = await supabase.from('telegram_bots').select('*');

            if (bots && bots.length > 0) {
                for (const bot of bots) {
                    const webhookUrl = `${tunnelUrl}/api/telegram/webhook?bot_id=${bot.id}`;
                    console.log(`   Build Webhook URL: ${webhookUrl}`);

                    try {
                        const res = await fetch(`https://api.telegram.org/bot${bot.bot_token}/setWebhook`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true })
                        });
                        const data = await res.json();
                        if (data.ok) {
                            console.log(`   ✅ Webhook set for ${bot.bot_name}`);
                            await supabase.from('telegram_bots').update({ webhook_status: 'active' }).eq('id', bot.id);
                        } else {
                            console.error(`   ❌ Failed to set webhook for ${bot.bot_name}:`, data.description);
                        }
                    } catch (err: any) {
                        console.error(`   ❌ Network error setting webhook for ${bot.bot_name}:`, err.message);
                    }
                }
            } else {
                console.log("   ⚠️ No bots found in database.");
            }
        } catch (e: any) {
            console.error("   ❌ Error during auto-setup:", e);
        }
    } else {
        console.log(`�👉 Waiting for tunnel URL... (Monitor this terminal)`);
    }
});
