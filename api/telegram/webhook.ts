
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";
// Import common logic
import { getSystemInstruction, responseSchema, fetchAvailablePreviews } from '../_lib/gemini';
import { WiinPayService } from '../_lib/wiinpayService';

// Helper: Clean JSON
const cleanJson = (text: string) => text.replace(/```json/g, '').replace(/```/g, '').trim();

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        if (!supabaseUrl || !supabaseKey || !geminiKey) return res.status(500).json({ error: "Config Error" });

        const supabase = createClient(supabaseUrl, supabaseKey);
        const { message } = req.body;
        if (!message || !message.text) return res.status(200).json({ status: 'ignored' });

        const chatId = message.chat.id.toString();
        const text = message.text;
        const botId = req.query.bot_id as string;

        // --- Fetch Bot & Session ---
        let { data: bot } = await supabase.from('telegram_bots').select('*').eq('id', botId).single();
        if (!bot) {
            const { data: fallback } = await supabase.from('telegram_bots').select('*').eq('webhook_status', 'active').limit(1).single();
            if (fallback) bot = fallback;
        }
        if (!bot) return res.status(404).json({ error: 'Bot not found' });
        const token = bot.bot_token;

        let { data: session } = await supabase.from('sessions').select('*').eq('telegram_chat_id', chatId).eq('bot_id', bot.id).single();
        if (!session) {
            const { data: newS } = await supabase.from('sessions').insert({
                telegram_chat_id: chatId, bot_id: bot.id, device_type: 'Mobile'
            }).select().single();
            session = newS;
        }

        const availablePreviews = await fetchAvailablePreviews();

        // --- History ---
        const { data: msgList } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(20);
        const history = msgList?.reverse().map(m => ({ role: m.sender === 'user' ? 'user' : 'model', content: m.content })) || [];

        await supabase.from('messages').insert({ session_id: session.id, sender: 'user', content: text });

        // --- Gemini Call (New SDK) ---
        const genAI = new GoogleGenAI({ apiKey: geminiKey });

        let currentStats;
        try { currentStats = JSON.parse(session.lead_score); } catch (e) { }

        const systemInstruction = getSystemInstruction(session.user_city || "São Paulo", session.device_type === 'iPhone', currentStats);

        // Map history to new SDK format if needed, or simple string prompt
        // New SDK chats.create uses 'messages' with 'content'

        // Actually, simple prompt is easier with generateContent, but for chat we use chats.create
        // Check docs: genAI.chats.create({ model: ..., messages: ... })
        // history is: [{ role: 'user', content: '...' }, ...]

        // Construct keys properly
        const historyformatted = history.map(h => ({
            role: h.role,
            parts: [{ text: h.content }]
        }));

        const chat = genAI.chats.create({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: systemInstruction,
                temperature: 1.2,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
            history: historyformatted
        });

        let aiResponse: any = null;

        try {
            const result = await chat.sendMessage({ message: text });
            // New SDK returns result.response.text() directly? check user code.
            // User code: result.text
            const rawText = result.text || "";
            aiResponse = JSON.parse(cleanJson(rawText));
        } catch (e: any) {
            console.error("DEBUG AI FAIL:", e);
            // DEBUG REPORTING TO USER
            const errorMsg = `[DEBUG ERROR]: ${e.message || e.toString()}`;
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: errorMsg })
            });

            aiResponse = { messages: ["Amor, tive um pesadelo... (Erro interno)"], action: 'none' };
        }

        // --- Same Processing Logic as Before ---
        // ... (Copying Media/Pix logic to keep it robust)

        // --- Media Resolution ---
        let mediaUrl = undefined;
        let mediaType = undefined;
        if (aiResponse.action === 'send_photo_preview' || aiResponse.action === 'send_video_preview') {
            let selectedMedia: any | undefined;
            if (aiResponse.media_id) selectedMedia = availablePreviews.find(m => m.id === aiResponse.media_id || m.id.startsWith(aiResponse.media_id));
            if (!selectedMedia) selectedMedia = availablePreviews.find(m => (aiResponse.action === 'send_video_preview' && m.file_type === 'video') || (aiResponse.action === 'send_photo_preview' && m.file_type === 'image')) || availablePreviews[0];
            if (selectedMedia) { mediaUrl = selectedMedia.file_url; mediaType = selectedMedia.file_type; }
        }

        // --- Update Session ---
        if (aiResponse.lead_stats) {
            await supabase.from('sessions').update({ lead_score: JSON.stringify(aiResponse.lead_stats), user_name: aiResponse.extracted_user_name }).eq('id', session.id);
        }

        // --- Pix ---
        let paymentDataToSave = null;
        if (aiResponse.action === 'generate_pix_payment') {
            try {
                const pixData = await WiinPayService.createPayment({
                    value: aiResponse.payment_details?.value || 31.00,
                    name: "Cliente Lari", email: "cli@lari.com", description: "Video"
                });
                let pixCode = pixData?.pixCopiaCola || Object.values(pixData).find(val => typeof val === 'string' && val.startsWith('000201'));
                if (pixCode) {
                    aiResponse.messages.push("Aqui o Pix amor (copia e cola):"); aiResponse.messages.push(pixCode as string);
                    paymentDataToSave = { paymentId: pixData.paymentId, pixCopiaCola: pixCode, value: aiResponse.payment_details?.value, status: 'pending' };
                } else aiResponse.messages.push("Oxe, o banco não gerou... tenta dnv?");
            } catch (e) { aiResponse.messages.push("Oxe, o banco não gerou... tenta dnv?"); }
        } else if (aiResponse.action === 'check_payment_status') {
            // ... simplified check ...
            aiResponse.messages.push("Vou ver aqui peraí...");
        }

        // --- Send to Telegram ---
        const finalMessages = aiResponse.messages || [];
        for (const msg of finalMessages) {
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg }) });
            await new Promise(r => setTimeout(r, 800));
        }

        if (mediaUrl) {
            const endpoint = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            const bodyKey = mediaType === 'video' ? 'video' : 'photo';
            await fetch(`${TELEGRAM_API_BASE}${token}/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, [bodyKey]: mediaUrl, caption: "🔥" }) });
        }

        // Save DB
        // ... (Simplified save)
        await supabase.from('messages').insert({ session_id: session.id, sender: 'bot', content: JSON.stringify(finalMessages) });

        return res.status(200).json({ status: 'ok' });

    } catch (error: any) {
        console.error("FATAL HOST ERROR:", error);
        // DEBUG REPORTING TO USER
        return res.status(200).json({ error: error.message });
    }
}
