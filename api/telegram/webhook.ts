import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { processMessage } from '../_lib/gemini';

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Initialize Supabase Client inside handler to ensure env vars are loaded
    const supabase = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!
    );

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message } = req.body;
    if (!message || !message.text) {
        return res.status(200).json({ status: 'ignored' });
    }

    const chatId = message.chat.id.toString();
    const text = message.text;
    const username = message.from.first_name;

    // 1. Identify Bot Token (passed in query or determined by URL if using paths, 
    // but for simplicity we assume one main bot or we look up by some header. 
    // However, telegram webhooks are usually specific.
    // We will assume the bot token is provided in the query param ?token=... set during webhook setup
    // OR we look for the bot in our DB that corresponds to this webhook. 
    // A common pattern is /api/telegram/webhook?bot_id=XYZ

    const botId = req.query.bot_id as string;
    console.log(`🔍 Webhook called for Bot ID: "${botId || 'undefined'}"`);

    // Removed strict check for botId to allow fallback to first active bot

    // 2. Get Bot Config
    let { data: bot, error: botError } = await supabase
        .from('telegram_bots')
        .select('*')
        .eq('id', botId)
        .single();

    console.log(`   DB Result for bot:`, { bot, error: botError });

    // Fallback: If not found by ID, try to find the first active bot
    if (botError || !bot) {
        console.warn(`⚠️ Bot not found by ID ${botId}. Trying fallback...`);
        const { data: fallbackBot } = await supabase
            .from('telegram_bots')
            .select('*')
            .eq('webhook_status', 'active')
            .limit(1)
            .single();

        if (fallbackBot) {
            console.log(`✅ Fallback found: ${fallbackBot.bot_name}`);
            bot = fallbackBot;
            botError = null;
        }
    }

    if (!bot) {
        console.error("❌ Bot not found in DB (even after fallback)");
        return res.status(404).json({ error: 'Bot not found', details: botError });
    }

    const token = bot.bot_token;

    // 3. Get or Create Session
    let { data: session } = await supabase
        .from('sessions')
        .select('*')
        .eq('telegram_chat_id', chatId)
        .eq('bot_id', bot.id)
        .single();

    if (!session) {
        const { data: newSession, error: createError } = await supabase
            .from('sessions')
            .insert({
                telegram_chat_id: chatId,
                bot_id: bot.id,
                user_city: 'Unknown', // Could infer from IP if Telegram sent it, but it doesn't usually
                device_type: 'Mobile'
            })
            .select()
            .single();

        if (createError) {
            console.error(createError);
            return res.status(500).json({ error: 'Session creation failed' });
        }
        session = newSession;
    }

    // 4. Load History
    const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false })
        .limit(500);

    // Reverse to chronological order for AI
    const history = messages?.reverse().map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        content: m.content
    })) || [];

    // 5. Send User Message to DB
    await supabase.from('messages').insert({
        session_id: session.id,
        sender: 'user',
        content: text
    });

    // 6. Process with AI
    try {
        const aiResponse = await processMessage(session.id, text, session.user_city, history);

        // 7. Send Replies to Telegram
        for (const msg of aiResponse.messages) {
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: msg
                })
            });
            // Small delay between messages
            await new Promise(r => setTimeout(r, 1000));
        }

        // 8. Send Media if any
        if (aiResponse.finalMediaUrl) {
            const method = aiResponse.finalMediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            console.log(`🎥 Sending media: ${method} | URL: ${aiResponse.finalMediaUrl}`);

            const mediaRes = await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    [aiResponse.finalMediaType === 'video' ? 'video' : 'photo']: aiResponse.finalMediaUrl,
                    caption: "🔥"
                })
            });
            const mediaResult = await mediaRes.json();
            console.log(`   Media API Response:`, JSON.stringify(mediaResult, null, 2));
        } else {
            console.log("   No media to send. Action was:", aiResponse.action);
        }

        // 9. Save AI Response to DB (Bot)
        // We should save each message, simplifying here to save the block or last one
        // 9. Save AI Response to DB (Bot)
        // Embed internal_thought in the first message for Admin Dashboard visibility
        let firstMsg = true;
        for (const msg of aiResponse.messages) {
            let contentToSave = msg;

            if (firstMsg && aiResponse.internal_thought) {
                contentToSave = `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n${msg}`;
                firstMsg = false;
            }

            await supabase.from('messages').insert({
                session_id: session.id,
                sender: 'bot',
                content: contentToSave,
                media_url: null
            });
        }
        if (aiResponse.finalMediaUrl) {
            await supabase.from('messages').insert({
                session_id: session.id,
                sender: 'bot',
                content: '[MEDIA]',
                media_url: aiResponse.finalMediaUrl,
                media_type: aiResponse.finalMediaType
            });
        }

        return res.status(200).json({ status: 'ok' });

    } catch (error: any) {
        console.error("AI Error:", error);

        await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: "Amor, minha internet tá meio ruim... já te respondo tá? ❤️"
            })
        });

        // DEBUG: Return full error details
        return res.status(200).json({
            error: 'AI processing failed',
            message: error.message,
            stack: error.stack
        });
    }
}
