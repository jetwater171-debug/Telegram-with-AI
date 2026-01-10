
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from "@google/genai";

// ==========================================
// CONFIG & TYPES
// ==========================================
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const WIINPAY_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTFiZmJkZmQ4Y2U4YTAzYzg0NjFhMjkiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2NDc3NjY2MX0.ryM5L-iDWg4gXJIHAciiJ7OovZhkkZny2dxyd9Z_U4o";
const WIINPAY_BASE_URL = "https://api-v2.wiinpay.com.br";

interface LeadStats {
    tarado: number;
    carente: number;
    sentimental: number;
    financeiro: number;
}

// ==========================================
// SYSTEM PROMPT & SCHEMA (INLINED)
// ==========================================
const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        internal_thought: { type: Type.STRING },
        lead_classification: { type: Type.STRING, enum: ["carente", "tarado", "curioso", "frio", "desconhecido"] },
        lead_stats: {
            type: Type.OBJECT,
            properties: {
                tarado: { type: Type.NUMBER }, carente: { type: Type.NUMBER }, sentimental: { type: Type.NUMBER }, financeiro: { type: Type.NUMBER }
            },
            required: ["tarado", "carente", "sentimental", "financeiro"]
        },
        extracted_user_name: { type: Type.STRING, nullable: true },
        current_state: {
            type: Type.STRING,
            enum: ["WELCOME", "CONNECTION", "LEAD_TYPE_DETECT", "INSTIGA", "PREVIEW", "FRONT_OFFER", "NEGOTIATION", "CLOSING", "RELATIONSHIP_FARMING", "REACTIVATION"]
        },
        messages: { type: Type.ARRAY, items: { type: Type.STRING } },
        action: { type: Type.STRING, enum: ["none", "send_photo_preview", "send_video_preview", "send_audio_response", "generate_pix_payment", "check_payment_status"] },
        media_id: { type: Type.STRING, nullable: true },
        payment_details: {
            type: Type.OBJECT,
            properties: { value: { type: Type.NUMBER }, description: { type: Type.STRING } },
            nullable: true
        }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"]
};

// ==========================================
// HELPER SERVICES (INLINED)
// ==========================================
const fetchAvailablePreviews = async (supabase: any) => {
    const { data } = await supabase.from('media_library').select('*').eq('media_category', 'preview').order('created_at', { ascending: false });
    return data || [];
};

const getSystemInstruction = (userCity: string, isiPhone: boolean, currentStats?: any) => {
    const timeString = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const device = isiPhone ? "iPhone (Rico)" : "Android";
    let behavior = "";
    if (currentStats?.tarado > 7) behavior += "- MODO TARADO: Seja direta.\n";
    if (currentStats?.carente > 7) behavior += "- MODO CARENTE: Seja amorosa.\n";

    return `
# INSTRUÇÃO DO SISTEMA
Você é LARISSA MORAIS (22 anos, brasileira).
- Fale Português do Brasil.
- Estilo: Curto, direto, jovem (use "rs", "kkk").
- Objetivo: Vender conteúdo +18 (vídeo R$ 40,00 ou R$ 25,00 min).

# CONTEXTO
- Hora: ${timeString}
- Cidade Lead: ${userCity}
- Aparelho: ${device}
${behavior}

# REGRAS
1. NUNCA fale preço de cara. Gere valor (instigue).
2. Use mídias de prévia se disponível.
3. Se ele pedir desconto, aceite R$ 25,00.
4. FORMATO DE RESPOSTA: Divida em 2 a 4 balões curtos.
`;
};

const WiinPay = {
    async createPayment(params: any) {
        try {
            const res = await fetch(`${WIINPAY_BASE_URL}/payment/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: WIINPAY_API_KEY, ...params })
            });
            const json = await res.json();
            return json.data || json;
        } catch (e) { return null; }
    },
    async getStatus(id: string) {
        try {
            const res = await fetch(`${WIINPAY_BASE_URL}/payment/list/${id}`, {
                method: 'GET', headers: { 'Authorization': `Bearer ${WIINPAY_API_KEY}` }
            });
            return await res.json();
        } catch (e) { return null; }
    }
};

// ==========================================
// MAIN HANDLER
// ==========================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !geminiKey) return res.status(500).json({ error: "Missing Env Vars" });

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

        const { message } = req.body;
        if (!message || !message.text) return res.status(200).json({ status: 'ignored' });

        const chatId = message.chat.id.toString();
        const text = message.text;
        const botId = req.query.bot_id as string;

        // 1. Validate Bot
        let { data: bot } = await supabase.from('telegram_bots').select('*').eq('id', botId).single();
        if (!bot) {
            const { data: fallback } = await supabase.from('telegram_bots').select('*').eq('webhook_status', 'active').limit(1).single();
            bot = fallback;
        }
        if (!bot) return res.status(404).json({ error: 'Bot not found' });
        const token = bot.bot_token;

        // 2. Load/Create Session
        let { data: session } = await supabase.from('sessions').select('*').eq('telegram_chat_id', chatId).eq('bot_id', bot.id).single();
        if (!session) {
            const { data: newS } = await supabase.from('sessions').insert({
                telegram_chat_id: chatId, bot_id: bot.id, device_type: 'Mobile', status: 'active'
            }).select().single();
            session = newS;
        }

        // 3. Save User Message
        await supabase.from('messages').insert({ session_id: session.id, sender: 'user', content: text });

        // 4. Prepare Context
        const availablePreviews = await fetchAvailablePreviews(supabase);
        const { data: historyData } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(15);

        // Correct History Order (Oldest -> Newest)
        const history = (historyData || []).reverse().map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));

        let currentStats;
        try { currentStats = JSON.parse(session.lead_score); } catch (e) { }

        const systemPrompt = getSystemInstruction(session.user_city || "SP", false, currentStats);

        // Append Media List to System Prompt (Simplification)
        const mediaText = availablePreviews.map((m: any) => `ID: ${m.id} (${m.file_type}) - ${m.description || m.file_name}`).join('\n');
        const fullPrompt = `${systemPrompt}\n\n# TABELA DE MÍDIAS DISPONÍVEIS:\n${mediaText}`;

        // 5. Generate Response (Gemini 2.5)
        const genAI = new GoogleGenAI({ apiKey: geminiKey });
        const chat = genAI.chats.create({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: fullPrompt,
                temperature: 1.2,
                responseMimeType: "application/json",
                responseSchema: responseSchema
            },
            history: history
        });

        let aiResponse: any;
        try {
            const result = await chat.sendMessage({ message: text });
            const raw = result.text || "{}";
            const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
            aiResponse = JSON.parse(clean);
        } catch (e: any) {
            console.error("AI Error:", e);
            // Fallback
            aiResponse = { messages: [`(DEBUG: Erro na IA: ${e.message})`], action: 'none' };
        }

        // 6. Process Logic (Media/Pix)
        let mediaUrl, mediaType;
        if (aiResponse.action?.includes('preview')) {
            const targetId = aiResponse.media_id;
            const media = availablePreviews.find((m: any) => m.id === targetId) || availablePreviews[0];
            if (media) { mediaUrl = media.file_url; mediaType = media.file_type; }
        }

        if (aiResponse.action === 'generate_pix_payment') {
            const payment = await WiinPay.createPayment({
                value: aiResponse.payment_details?.value || 29.90, name: "Lead", email: "lead@msg.com", description: "Lari Pack"
            });
            if (payment?.pixCopiaCola) {
                aiResponse.messages.push("Copia e cola seu pix:");
                aiResponse.messages.push(payment.pixCopiaCola);
                // Save payment data logic here if needed
            }
        }

        // 7. Send to Telegram
        for (const msg of (aiResponse.messages || [])) {
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg })
            });
            await new Promise(r => setTimeout(r, 600)); // Delay
        }

        if (mediaUrl) {
            const method = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            const key = mediaType === 'video' ? 'video' : 'photo';
            await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, [key]: mediaUrl, caption: '🔥' })
            });
        }

        // 8. Save Bot Response
        const contentSaved = `${aiResponse.internal_thought || ''}\n${aiResponse.messages?.join('\n')}`;
        await supabase.from('messages').insert({ session_id: session.id, sender: 'bot', content: contentSaved });

        return res.status(200).json({ ok: true });

    } catch (err: any) {
        console.error("Critical Webhook Error:", err);
        return res.status(200).json({ error: err.message }); // Return 200 to stop logic retry storms if possible
    }
}
