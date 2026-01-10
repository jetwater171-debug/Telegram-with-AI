
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
// Import common logic from our new unified lib
import { getSystemInstruction, responseSchema, fetchAvailablePreviews } from '../_lib/gemini';
import { WiinPayService } from '../_lib/wiinpayService';

// Helper: Clean JSON
const cleanJson = (text: string) => text.replace(/```json/g, '').replace(/```/g, '').trim();

// ==========================================
// HANDLER & PROCESSOR
// ==========================================
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

        // --- Fetch Previews (Using Unified Lib) ---
        // Note: fetchAvailablePreviews in `api/_lib/gemini.ts` uses the `supabase` instance imported from `api/_lib/supabaseClient.ts`.
        // That instance is initialized with process.env vars, so it should work.
        const availablePreviews = await fetchAvailablePreviews();

        // --- History ---
        const { data: msgList } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(20);
        const history = msgList?.reverse().map(m => ({ role: m.sender === 'user' ? 'user' : 'model', content: m.content })) || [];

        // Save User Msg
        await supabase.from('messages').insert({ session_id: session.id, sender: 'user', content: text });

        // --- Gemini Call ---
        const genAI = new GoogleGenerativeAI(geminiKey);

        let currentStats;
        try { currentStats = JSON.parse(session.lead_score); } catch (e) { }

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            // Using unified system instruction generator
            systemInstruction: getSystemInstruction(session.user_city || "São Paulo", session.device_type === 'iPhone', currentStats),
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: responseSchema as any,
                temperature: 1.2
            }
        });

        // Construct history parts as expected by new SDK
        const chat = model.startChat({ history: history.map(h => ({ role: h.role, parts: [{ text: h.content }] })) });

        let aiResponse: any = null;

        // Retry Loop for JSON Parsing
        try {
            const result = await chat.sendMessage(text);
            aiResponse = JSON.parse(cleanJson(result.response.text()));
        } catch (e) {
            console.error("AI Parse Error", e);
            aiResponse = { messages: ["Amor, não entendi... pode repetir?"], action: 'none' };
        }

        // --- Media Resolution ---
        let mediaUrl = undefined;
        let mediaType = undefined;

        if (aiResponse.action === 'send_photo_preview' || aiResponse.action === 'send_video_preview') {
            let selectedMedia: any | undefined;
            if (aiResponse.media_id) {
                selectedMedia = availablePreviews.find(m => m.id === aiResponse.media_id || m.id.startsWith(aiResponse.media_id));
            }
            if (!selectedMedia) {
                selectedMedia = availablePreviews.find(m =>
                    (aiResponse.action === 'send_video_preview' && m.file_type === 'video') ||
                    (aiResponse.action === 'send_photo_preview' && m.file_type === 'image')
                ) || availablePreviews[0];
            }
            if (selectedMedia) {
                mediaUrl = selectedMedia.file_url;
                mediaType = selectedMedia.file_type;
            }
        }

        // --- Update Session Stats ---
        if (aiResponse.lead_stats) {
            await supabase.from('sessions').update({
                lead_score: JSON.stringify(aiResponse.lead_stats),
                user_name: aiResponse.extracted_user_name
            }).eq('id', session.id);
        }

        // --- Handle Actions (Pix / Check) ---
        let paymentDataToSave = null;

        if (aiResponse.action === 'generate_pix_payment') {
            const price = aiResponse.payment_details?.value || 31.00;
            // Using unified logic from new lib usage? Or local? logic is same.
            // Using logic from webhook previously but leveraging WiinPayService from unified lib now if wished.
            // Let's use the explicit call as before but imported or direct.
            // Since we created api/_lib/wiinpayService.ts, let's use it.

            try {
                const pixData = await WiinPayService.createPayment({
                    value: price,
                    name: session.user_name || "Cliente Telegram",
                    email: "cliente@telegram.bot",
                    description: "Conteudo Exclusivo Lari"
                });

                // Smart Search for Code 000201
                let pixCode = pixData?.pixCopiaCola;
                if (!pixCode && pixData) {
                    const possibleCode = Object.values(pixData).find(val => typeof val === 'string' && val.startsWith('000201'));
                    if (possibleCode) pixCode = possibleCode as string;
                }

                if (pixCode) {
                    aiResponse.messages.push(`Tá aqui seu Pix de R$ ${price.toFixed(2)}:`);
                    aiResponse.messages.push(pixCode);
                    aiResponse.messages.push("Me avisa quando fizer, tá? 👀");
                    paymentDataToSave = { paymentId: pixData.paymentId || 'unknown', pixCopiaCola: pixCode, value: price, status: 'pending' };
                } else {
                    let debugError = "";
                    try { debugError = ` (${JSON.stringify(pixData)})`; } catch (e) { debugError = " (Error parsing)"; }
                    aiResponse.messages.push(`O sistema do banco tá fora do ar amor... tenta já já? ${debugError}`);
                }
            } catch (e) {
                aiResponse.messages.push(`O sistema do banco tá fora do ar amor... tenta já já?`);
            }
        }
        else if (aiResponse.action === 'check_payment_status') {
            const { data: lastMsg } = await supabase.from('messages').select('payment_data').eq('session_id', session.id).not('payment_data', 'is', null).order('created_at', { ascending: false }).limit(1).single();
            let paid = false;

            if (lastMsg?.payment_data?.paymentId) {
                try {
                    const status = await WiinPayService.getPaymentStatus(lastMsg.payment_data.paymentId);
                    if (status && ['approved', 'paid', 'completed'].includes(status.status)) paid = true;
                } catch (e) { }
            }

            if (paid) {
                aiResponse.messages = ["PAGAMENTO CONFIRMADO! 😍", "Tô te mandando o vídeo completo:"];
                // Simulated content delivery
                aiResponse.messages.push("Instala meu app pra gente não perder contato!");
                aiResponse.action = 'request_app_install';
            } else {
                aiResponse.messages = ["Amor... aqui ainda não caiu :/", "Confere se saiu da sua conta?"];
            }
        }

        // --- Send Response to Telegram ---
        // 1. Text Messages
        const finalMessages: string[] = [];
        for (const msg of aiResponse.messages) {
            // Split long messages logic could go here if needed, keeping simple for now based on user request "curtas"
            finalMessages.push(msg);
        }

        for (const msg of finalMessages) {
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg })
            });
            // Typing delay
            const isPix = msg.startsWith('000201');
            const delay = isPix ? 200 : Math.min(Math.max(msg.length * 50, 500), 2000); // Reduced delay
            await new Promise(r => setTimeout(r, delay));
        }

        // 2. Media
        if (mediaUrl) {
            const endpoint = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            const bodyKey = mediaType === 'video' ? 'video' : 'photo';
            await fetch(`${TELEGRAM_API_BASE}${token}/${endpoint}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, [bodyKey]: mediaUrl, caption: "🔥" })
            });
        }

        // --- Save to DB ---
        let firstMsg = true;
        for (const msg of finalMessages) {
            let content = msg;
            if (firstMsg && aiResponse.internal_thought) {
                content = `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n${msg}`;
                firstMsg = false;
            }
            const payload: any = { session_id: session.id, sender: 'bot', content: content };

            try {
                if (paymentDataToSave) { payload.payment_data = paymentDataToSave; paymentDataToSave = null; } // Save once
                await supabase.from('messages').insert(payload);
            } catch (e) {
                delete payload.payment_data;
                await supabase.from('messages').insert(payload);
            }
        }
        if (mediaUrl) {
            await supabase.from('messages').insert({ session_id: session.id, sender: 'bot', content: '[MEDIA]', media_url: mediaUrl, media_type: mediaType });
        }

        return res.status(200).json({ status: 'ok' });

    } catch (error: any) {
        console.error("FATAL HOST ERROR:", error);
        return res.status(200).json({ error: error.message });
    }
}
