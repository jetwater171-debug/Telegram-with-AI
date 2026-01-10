
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from "@google/genai";

// ==========================================
// CONFIG & CONSTANTS
// ==========================================
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const WIINPAY_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTFiZmJkZmQ4Y2U4YTAzYzg0NjFhMjkiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2NDc3NjY2MX0.ryM5L-iDWg4gXJIHAciiJ7OovZhkkZny2dxyd9Z_U4o";
const WIINPAY_BASE_URL = "https://api-v2.wiinpay.com.br";

const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        internal_thought: {
            type: Type.STRING,
            description: "Seu raciocínio oculto OBRIGATORIAMENTE EM PORTUGUÊS (PT-BR)."
        },
        lead_classification: { type: Type.STRING, enum: ["carente", "tarado", "curioso", "frio", "desconhecido"] },
        lead_stats: {
            type: Type.OBJECT,
            properties: { tarado: { type: Type.NUMBER }, carente: { type: Type.NUMBER }, sentimental: { type: Type.NUMBER }, financeiro: { type: Type.NUMBER } },
            required: ["tarado", "carente", "sentimental", "financeiro"]
        },
        extracted_user_name: { type: Type.STRING, nullable: true },
        current_state: { type: Type.STRING, enum: ["WELCOME", "CONNECTION", "LEAD_TYPE_DETECT", "INSTIGA", "PREVIEW", "FRONT_OFFER", "NEGOTIATION", "CLOSING", "RELATIONSHIP_FARMING", "REACTIVATION"] },
        messages: { type: Type.ARRAY, items: { type: Type.STRING }, description: "FALAS CURTAS. Pareça real." },
        action: { type: Type.STRING, enum: ["none", "send_photo_preview", "send_video_preview", "send_audio_response", "generate_pix_payment", "check_payment_status"] },
        media_id: { type: Type.STRING, nullable: true },
        payment_details: { type: Type.OBJECT, properties: { value: { type: Type.NUMBER }, description: { type: Type.STRING } }, nullable: true }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

const getSystemInstruction = (userName?: string, currentStats?: any, mediaList: string = "") => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo', hour12: false });
    const hour = parseInt(timeStr.split(':')[0]);

    let routine = "";
    if (hour >= 0 && hour < 6) routine = "Agora são ${timeStr} da MADRUGADA. Você está DEITADA NA CAMA, tentando dormir. NÃO diga que está na academia.";
    else if (hour >= 6 && hour < 10) routine = "Você acabou de acordar e está tomando café.";
    else if (hour >= 18) routine = "Você está em casa relaxando.";
    else routine = "Você está na correria do dia.";

    return `
# DIRETIVA PRIMÁRIA
- Nome do lead: "${userName || 'desconhecido'}". Se souber o nome, NÃO pergunte de novo.
- **HORA:** ${timeStr}. ${routine}

# PERSONA: LARISSA MORAIS (22 ANOS)
- Brasileira, fala curta, jovem (vc, tbm, rs, kkk).
- MODO SEDUÇÃO: Use imaginação. MODO EXPLICITO: Sem filtro ("dar o cu", etc).
- DIVIDA em 2-3 balões CURTOS.

# MÍDIAS DISPONÍVEIS
${mediaList}
`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !geminiKey) return res.status(200).send('ok');
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        if (req.method !== 'POST') return res.status(200).send('ok');
        const { message } = req.body;
        if (!message?.text) return res.status(200).send('ok');

        const chatId = message.chat.id.toString();
        const botId = req.query.bot_id as string;
        let userText = message.text;

        // 1. Setup
        let { data: bot } = await supabase.from('telegram_bots').select('*').eq('id', botId).single();
        if (!bot) {
            const { data: fb } = await supabase.from('telegram_bots').select('*').eq('webhook_status', 'active').limit(1).single();
            bot = fb;
        }
        if (!bot) return res.status(200).send('ok');

        let { data: session } = await supabase.from('sessions').select('*').eq('telegram_chat_id', chatId).eq('bot_id', bot.id).single();
        if (!session) {
            const { data: ns } = await supabase.from('sessions').insert([{ telegram_chat_id: chatId, bot_id: bot.id, status: 'active' }]).select().single();
            session = ns;
        }

        // 2. Save User msg (Reliable)
        if (!userText.startsWith('[SYSTEM:')) {
            const { error: ue } = await supabase.from('messages').insert([{ session_id: session.id, sender: 'user', content: userText }]);
            if (ue) await supabase.from('messages').insert([{ session_id: session.id, sender: 'user', content: userText }]); // Minimal retry
        }

        // 3. AI Loop
        let aiResponse, loop = 0;
        let previews: any[] = []; // FIXED SCOPE: Outside loop
        const genAI = new GoogleGenAI({ apiKey: geminiKey });

        while (loop < 2) {
            const { data: h } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(20);
            const history = (h || []).reverse().map(m => ({
                role: m.sender === 'user' ? 'user' : 'model',
                parts: [{ text: m.content.replace(/\[INTERNAL_THOUGHT\].*?\[\/INTERNAL_THOUGHT\]/gs, '').trim() }]
            }));

            const { data: p } = await supabase.from('media_library').select('*').eq('media_category', 'preview');
            previews = p || []; // Save to outer scope
            const mediaList = previews.map(m => `- ID: ${m.id} | Desc: ${m.description || m.file_name}`).join('\\n');

            let stats; try { stats = JSON.parse(String(session.lead_score)); } catch (e) { }
            const prompt = getSystemInstruction(session.user_name, stats, mediaList);

            const chat = genAI.chats.create({
                model: "gemini-2.5-flash",
                config: { systemInstruction: prompt, temperature: 1.2, responseMimeType: "application/json", responseSchema: responseSchema },
                history: history
            });

            const result = await chat.sendMessage({ message: userText });
            aiResponse = JSON.parse(result.text.replace(/```json/g, '').replace(/```/g, '').trim());

            if (aiResponse.action === 'check_payment_status') {
                const { data: lastPay } = await supabase.from('messages').select('payment_data').eq('session_id', session.id).not('payment_data', 'is', null).order('created_at', { ascending: false }).limit(1).single();
                if (lastPay?.payment_data?.paymentId) {
                    const stRes = await fetch(`${WIINPAY_BASE_URL}/payment/list/${lastPay.payment_data.paymentId}`, { headers: { 'Authorization': `Bearer ${WIINPAY_API_KEY}` } });
                    const stData = await stRes.json();
                    const isPaid = stData?.status === 'approved' || stData?.status === 'paid' || stData?.data?.status === 'approved';
                    userText = "SYSTEM: " + (isPaid ? "PAGAMENTO CONFIRMADO!" : "Ainda não caiu.");
                    loop++; continue;
                }
            }
            break;
        }

        // 4. Action Logic
        let mediaUrl, mediaType, paymentSaved;
        if (aiResponse.action?.includes('preview')) {
            const target = previews.find(m => m.id === aiResponse.media_id) || previews.find(m => (aiResponse.action === 'send_video_preview' && m.file_type === 'video') || (aiResponse.action === 'send_photo_preview' && m.file_type === 'image')) || previews[0];
            if (target) { mediaUrl = target.file_url; mediaType = target.file_type; }
        }

        if (aiResponse.action === 'generate_pix_payment') {
            const val = aiResponse.payment_details?.value || 30.00;
            const pxRes = await fetch(`${WIINPAY_BASE_URL}/payment/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: WIINPAY_API_KEY, value: val, name: "Lead" }) });
            const pxData = await pxRes.json();
            const pixCode = pxData?.data?.pixCopiaCola || pxData?.pixCopiaCola;
            if (pixCode) {
                aiResponse.messages.push("Copia e cola aqui amor:");
                aiResponse.messages.push(pixCode);
                paymentSaved = { paymentId: pxData?.data?.paymentId || pxData?.paymentId, value: val };
            }
        }

        // 5. Final Send and Save
        const finalMsgs = aiResponse.messages || [];
        const thought = aiResponse.internal_thought ? `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n` : "";
        const finalContent = thought + finalMsgs.join('\n');

        // Update Dashboard
        const up: any = { last_message_at: new Date(), updated_at: new Date() };
        if (aiResponse.extracted_user_name) up.user_name = aiResponse.extracted_user_name;
        if (aiResponse.lead_stats) up.lead_score = JSON.stringify(aiResponse.lead_stats);
        await supabase.from('sessions').update(up).eq('id', session.id);

        // Send to Telegram
        for (const msg of finalMsgs) {
            await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg }) });
            await new Promise(r => setTimeout(r, 400));
        }
        if (mediaUrl) {
            const mtd = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/${mtd}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, [mediaType === 'video' ? 'video' : 'photo']: mediaUrl, caption: "👀🔥" }) });
        }

        // SAVE TO DB (LAST)
        const { error: de } = await supabase.from('messages').insert([{ session_id: session.id, sender: 'bot', content: finalContent, media_url: mediaUrl, media_type: mediaType, payment_data: paymentSaved }]);
        if (de) await supabase.from('messages').insert([{ session_id: session.id, sender: 'bot', content: finalContent }]);

        return res.status(200).send('ok');

    } catch (e: any) {
        return res.status(200).send('ok');
    }
}
