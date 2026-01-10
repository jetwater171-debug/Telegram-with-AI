
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { botId } = req.body;

    const { data: bot, error } = await supabase
        .from('telegram_bots')
        .select('*')
        .eq('id', botId)
        .single();

    if (error || !bot) {
        return res.status(404).json({ error: 'Bot not found' });
    }

    // Construct Webhook URL
    const baseUrl = process.env.PUBLIC_URL || `https://${req.headers.host}`;
    const webhookUrl = `${baseUrl}/api/telegram/webhook?bot_id=${botId}`;

    const response = await fetch(`https://api.telegram.org/bot${bot.bot_token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            url: webhookUrl,
            drop_pending_updates: true
        })
    });

    const result = await response.json();

    if (result.ok) {
        await supabase.from('telegram_bots').update({ webhook_status: 'active' }).eq('id', botId);
        return res.status(200).json({ success: true, webhookUrl });
    } else {
        await supabase.from('telegram_bots').update({ webhook_status: 'error' }).eq('id', botId);
        return res.status(400).json({ error: result.description });
    }
}
