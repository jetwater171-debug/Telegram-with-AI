
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// ==========================================
// INLINED GEMINI LOGIC (NO IMPORTS)
// ==========================================

const FIRST_PREVIEW_VIDEO_URL = "https://bhnsfqommnjziyhvzfli.supabase.co/storage/v1/object/public/media/previews/1764694671095_isiwgk.mp4";
const SHOWER_PHOTO_URL = "https://i.ibb.co/dwf177Kc/download.jpg";
const LINGERIE_PHOTO_URL = "https://i.ibb.co/dsx5mTXQ/3297651933149867831-62034582678-jpg.jpg";
const WET_FINGER_PHOTO_URL = "https://i.ibb.co/mrtfZbTb/fotos-de-bucetas-meladas-0.jpg";

const responseSchema = {
    type: SchemaType.OBJECT as any,
    properties: {
        internal_thought: { type: SchemaType.STRING, description: "Seu raciocínio oculto." },
        lead_classification: { type: SchemaType.STRING, enum: ["carente", "tarado", "curioso", "frio", "desconhecido"] },
        lead_stats: {
            type: SchemaType.OBJECT,
            properties: {
                tarado: { type: SchemaType.NUMBER },
                carente: { type: SchemaType.NUMBER },
                sentimental: { type: SchemaType.NUMBER },
                financeiro: { type: SchemaType.NUMBER },
            },
            required: ["tarado", "carente", "sentimental", "financeiro"],
        },
        extracted_user_name: { type: SchemaType.STRING, nullable: true },
        current_state: { type: SchemaType.STRING, enum: ["WELCOME", "CONNECTION", "TRIGGER_PHASE", "HOT_TALK", "PREVIEW", "SALES_PITCH", "NEGOTIATION", "CLOSING", "PAYMENT_CHECK"] },
        messages: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        action: { type: SchemaType.STRING, enum: ["none", "send_video_preview", "generate_pix_payment", "check_payment_status", "send_shower_photo", "send_lingerie_photo", "send_wet_finger_photo", "request_app_install"] },
        payment_details: {
            type: SchemaType.OBJECT,
            properties: { value: { type: SchemaType.NUMBER }, description: { type: SchemaType.STRING } },
            nullable: true
        }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

const getSystemInstruction = (userCity: string = "São Paulo") => {
    return `# PERSONA: LARISSA MORAIS
Você é uma garota de 19 anos, brasileira, real. 
Objetivo: Vender o vídeo da siririca/gozando.
Localização: Vc mora em SP ou RJ.
Horário: ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.

# FUNIL DE VENDAS
1. CONEXÃO: Seja doce, descubra o nome. (3 trocas de msg)
2. GATILHOS (Action necessária):
   - Opção A (Banho): "Acabei de sair do banho..." -> send_shower_photo
   - Opção B (Lingerie): "Tô com um conjunto novo..." -> send_lingerie_photo
3. AQUECIMENTO: Reaja a foto, demonstre carência/solidão.
4. O VÍDEO (Isca): "Olha esse pedacinho..." -> send_video_preview
5. NEGOCIAÇÃO:
   - Se pedir ZAP: R$ 15 (exclusivo).
   - Se enrolar: Foto dedo melado -> send_wet_finger_photo
   - PREÇO: Comece alto, mas aceite R$ 31 (conta de luz). Mínimo R$ 20.
`;
};

const processMessage = async (sessionId: string, text: string, city: string, history: any[], env: any, supabase: any) => {
    const genAI = new GoogleGenerativeAI(env.GEMINI_KEY);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemInstruction(city),
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 1.1
        }
    });

    const chat = model.startChat({
        history: history.map(h => ({ role: h.role, parts: [{ text: h.content }] }))
    });

    const result = await chat.sendMessage(text);
    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    let mediaUrl = undefined;
    let mediaType = undefined;

    switch (parsed.action) {
        case 'send_shower_photo': mediaUrl = SHOWER_PHOTO_URL; mediaType = 'image'; break;
        case 'send_lingerie_photo': mediaUrl = LINGERIE_PHOTO_URL; mediaType = 'image'; break;
        case 'send_wet_finger_photo': mediaUrl = WET_FINGER_PHOTO_URL; mediaType = 'image'; break;
        case 'send_video_preview': mediaUrl = FIRST_PREVIEW_VIDEO_URL; mediaType = 'video'; break;
    }

    if (parsed.lead_stats) {
        await supabase.from('sessions').update({
            lead_score: JSON.stringify(parsed.lead_stats),
            user_name: parsed.extracted_user_name
        }).eq('id', sessionId);
    }

    return { ...parsed, finalMediaUrl: mediaUrl, finalMediaType: mediaType };
};

// ==========================================
// WEBHOOK HANDLER
// ==========================================

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    // Use a try-catch for the WHOLE execution
    try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

        if (!supabaseUrl || !supabaseKey || !geminiKey) {
            console.error("Missing credentials");
            return res.status(500).json({ error: "Server Configuration Error" });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const { message } = req.body;
        if (!message || !message.text) return res.status(200).json({ status: 'ignored' });

        const chatId = message.chat.id.toString();
        const text = message.text;

        const botId = req.query.bot_id as string;

        // Fetch Bot
        let { data: bot } = await supabase.from('telegram_bots').select('*').eq('id', botId).single();
        if (!bot) {
            const { data: fallback } = await supabase.from('telegram_bots').select('*').eq('webhook_status', 'active').limit(1).single();
            if (fallback) bot = fallback;
        }
        if (!bot) return res.status(404).json({ error: 'Bot not found' });

        const token = bot.bot_token;

        // Session
        let { data: session } = await supabase.from('sessions').select('*').eq('telegram_chat_id', chatId).eq('bot_id', bot.id).single();
        if (!session) {
            const { data: newS } = await supabase.from('sessions').insert({
                telegram_chat_id: chatId, bot_id: bot.id, user_city: 'Unknown', device_type: 'Mobile'
            }).select().single();
            session = newS;
        }

        // History
        const { data: msgList } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(500);
        const history = msgList?.reverse().map(m => ({ role: m.sender === 'user' ? 'user' : 'model', content: m.content })) || [];

        // Save User Msg
        await supabase.from('messages').insert({ session_id: session.id, sender: 'user', content: text });

        // Call AI
        const aiResponse = await processMessage(session.id, text, session.user_city, history, { GEMINI_KEY: geminiKey }, supabase);

        // Send Replies
        for (const msg of aiResponse.messages) {
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg })
            });
            await new Promise(r => setTimeout(r, 800)); // slight delay
        }

        // Send Media
        if (aiResponse.finalMediaUrl) {
            const method = aiResponse.finalMediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, [aiResponse.finalMediaType === 'video' ? 'video' : 'photo']: aiResponse.finalMediaUrl, caption: "🔥" })
            });
        }

        // Save Bot Msg
        let firstMsg = true;
        for (const msg of aiResponse.messages) {
            let contentToSave = msg;
            if (firstMsg && aiResponse.internal_thought) {
                contentToSave = `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n${msg}`;
                firstMsg = false;
            }
            await supabase.from('messages').insert({ session_id: session.id, sender: 'bot', content: contentToSave });
        }
        if (aiResponse.finalMediaUrl) {
            await supabase.from('messages').insert({ session_id: session.id, sender: 'bot', content: '[MEDIA]', media_url: aiResponse.finalMediaUrl, media_type: aiResponse.finalMediaType });
        }

        return res.status(200).json({ status: 'ok' });

    } catch (error: any) {
        console.error("FATAL HANDLER ERROR:", error);
        return res.status(200).json({ error: error.message }); // Return 200 to satisfy Telegram retries
    }
}
