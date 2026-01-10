
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { processMessage } from './_lib/gemini';

// Mock Supabase to ensure we see errors
const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const logs: string[] = [];
    const log = (msg: string, data?: any) => {
        const line = `[${new Date().toISOString()}] ${msg} ${data ? JSON.stringify(data) : ''}`;
        logs.push(line);
        console.log(line);
    };

    try {
        log("🚀 Starting Test Webhook...");

        const botId = req.query.botId as string;
        const text = (req.query.message as string) || "Oi, teste de diagnostico";

        if (!botId) throw new Error("Missing botId query param");

        log(`Parameters: BotID=${botId}, Message="${text}"`);

        // 1. Fetch Bot
        log("1. Fetching Bot from DB...");
        const { data: bot, error: botError } = await supabase
            .from('telegram_bots')
            .select('*')
            .eq('id', botId)
            .single();

        if (botError || !bot) {
            log("❌ Bot Error:", botError);
            throw new Error(`Bot not found: ${botError?.message}`);
        }
        log("✅ Bot Found:", bot.bot_name);

        // 2. Fetch Session
        const chatId = "TEST_USER_123";
        log("2. Fetching/Creating Session for Test User...");

        let { data: session } = await supabase
            .from('sessions')
            .select('*')
            .eq('telegram_chat_id', chatId)
            .eq('bot_id', bot.id)
            .single();

        if (!session) {
            log("   Creating new session...");
            const { data: newSession, error: createError } = await supabase
                .from('sessions')
                .insert({
                    telegram_chat_id: chatId,
                    bot_id: bot.id,
                    user_city: 'Test City',
                    device_type: 'Test Browser'
                })
                .select()
                .single();

            if (createError) throw new Error("Session create failed: " + createError.message);
            session = newSession;
        }
        log("✅ Session Ready:", session.id);

        // 3. AI Processing
        log("3. Calling AI processMessage...");
        const history = [{ role: 'user', content: "Oi" }]; // Mock history

        const aiResponse = await processMessage(session.id, text, 'Test City', history);
        log("✅ AI Responded:", aiResponse);

        return res.status(200).json({
            success: true,
            logs: logs,
            aiResult: aiResponse
        });

    } catch (error: any) {
        log("🔥 FATAL ERROR:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack,
            logs: logs
        });
    }
}
