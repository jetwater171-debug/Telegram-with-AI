
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
        internal_thought: { type: Type.STRING },
        lead_classification: { type: Type.STRING, enum: ["carente", "tarado", "curioso", "frio", "desconhecido"] },
        lead_stats: {
            type: Type.OBJECT,
            properties: { tarado: { type: Type.NUMBER }, carente: { type: Type.NUMBER }, sentimental: { type: Type.NUMBER }, financeiro: { type: Type.NUMBER } },
            required: ["tarado", "carente", "sentimental", "financeiro"]
        },
        extracted_user_name: { type: Type.STRING, nullable: true },
        current_state: { type: Type.STRING, enum: ["WELCOME", "CONNECTION", "LEAD_TYPE_DETECT", "INSTIGA", "PREVIEW", "FRONT_OFFER", "NEGOTIATION", "CLOSING", "RELATIONSHIP_FARMING", "REACTIVATION"] },
        messages: { type: Type.ARRAY, items: { type: Type.STRING } },
        action: { type: Type.STRING, enum: ["none", "send_photo_preview", "send_video_preview", "send_audio_response", "generate_pix_payment", "check_payment_status"] },
        media_id: { type: Type.STRING, nullable: true },
        payment_details: { type: Type.OBJECT, properties: { value: { type: Type.NUMBER }, description: { type: Type.STRING } }, nullable: true }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

const getSystemInstruction = (userName?: string, currentStats?: any, mediaList: string = "") => {
    const now = new Date();
    const options: any = { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo', hour12: false };
    const timeString = now.toLocaleTimeString('pt-BR', options);

    const hour = parseInt(timeString.split(':')[0]);
    let routineContext = "";
    if (hour >= 0 && hour <= 6) routineContext = "Você está deitada na cama, perdendo o sono e mexendo no celular. NÃO diga que está na academia ou na aula.";
    else if (hour >= 7 && hour <= 12) routineContext = "Você acabou de acordar ou está tomando café.";
    else if (hour >= 18) routineContext = "Você está relaxando em casa ou vendo série.";
    else routineContext = "Você está na correria do dia a dia.";

    return `
# INSTRUÇÕES CRÍTICAS
- **IDIOMA:** PORTUGUÊS (PT-BR).
- **MEMÓRIA DE NOME:** O nome do usuário é "${userName || 'desconhecido'}". Se você já souber o nome, NÃO pergunte de novo. Use o nome dele para criar intimidade (chame de Leo se for Leonardo).
- **HORA:** Agora são ${timeString}. ${routineContext}

# PERSONA: LARISSA MORAIS
- Brasileira, 22 anos. Jovem e real.
- Fala curta, estilo WhatsApp. Use "vc", "td bem", "tbm", "pra", "mt", "rs", "kkk".
- **FORMATO:** SEMPRE divida em 2 ou 3 balões curtos (max 15 palavras cada).

# FUNIL
1. CONNECTION: Pegue o nome (se não souber). Fale o que tá fazendo.
2. INSTIGA: "gravei um videozinho agr... rs".
3. PREVIEW: Mande a prévia (send_video_preview).
4. VENDEDORA: Âncora R$ 40, aceite R$ 25.

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
        let text = message.text;

        // 1. Session Setup
        let { data: bot } = await supabase.from('telegram_bots').select('*').eq('id', botId).single();
        if (!bot) {
            const { data: fb } = await supabase.from('telegram_bots').select('*').eq('webhook_status', 'active').limit(1).single();
            bot = fb;
        }
        if (!bot) return res.status(200).send('ok');
        const token = bot.bot_token;

        let { data: session } = await supabase.from('sessions').select('*').eq('telegram_chat_id', chatId).eq('bot_id', bot.id).single();
        if (!session) {
            const { data: newS } = await supabase.from('sessions').insert([{ telegram_chat_id: chatId, bot_id: bot.id, device_type: 'Mobile', status: 'active' }]).select().single();
            session = newS;
        }

        // 2. Initial Message Save
        if (!text.startsWith('[SYSTEM:')) {
            await supabase.from('messages').insert([{ session_id: session.id, sender: 'user', content: text }]);
        }

        // 3. AI Processing Loop (Internal recursion fix)
        let aiResponse;
        let loopCount = 0;
        const genAI = new GoogleGenAI({ apiKey: geminiKey });

        while (loopCount < 2) {
            const { data: msgHistory } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(20);
            const history = (msgHistory || []).reverse().map(m => ({
                role: m.sender === 'user' ? 'user' : 'model',
                parts: [{ text: m.content.replace(/\[INTERNAL_THOUGHT\].*?\[\/INTERNAL_THOUGHT\]/gs, '').trim() }]
            }));

            const { data: previews } = await supabase.from('media_library').select('*').eq('media_category', 'preview');
            const mediaList = (previews || []).map((m: any) => `- ID: ${m.id} | Desc: ${m.description || m.file_name}`).join('\n');

            let stats; try { stats = JSON.parse(session.lead_score); } catch (e) { }
            const systemPrompt = getSystemInstruction(session.user_name, stats, mediaList);

            const chat = genAI.chats.create({
                model: "gemini-2.5-flash",
                config: { systemInstruction: systemPrompt, temperature: 1.3, responseMimeType: "application/json", responseSchema: responseSchema },
                history: history
            });

            const result = await chat.sendMessage({ message: text });
            aiResponse = JSON.parse(result.text.replace(/```json/g, '').replace(/```/g, '').trim());

            if (aiResponse.action === 'check_payment_status') {
                const { data: lastPay } = await supabase.from('messages').select('payment_data').eq('session_id', session.id).not('payment_data', 'is', null).order('created_at', { ascending: false }).limit(1).single();
                if (lastPay?.payment_data?.paymentId) {
                    const stRes = await fetch(`${WIINPAY_BASE_URL}/payment/list/${lastPay.payment_data.paymentId}`, { headers: { 'Authorization': `Bearer ${WIINPAY_API_KEY}` } });
                    const stData = await stRes.json();
                    const isPaid = stData?.status === 'approved' || stData?.status === 'paid' || stData?.data?.status === 'approved';
                    text = isPaid ? "[SYSTEM: PAGAMENTO CONFIRMADO!]" : "[SYSTEM: Ainda não caiu.]";
                    loopCount++;
                    continue;
                }
            }
            break;
        }

        // 4. Action Processing (Media/Pix)
        let mediaUrl, mediaType, paymentSaved;

        if (aiResponse.action?.includes('preview')) {
            const target = (previews as any)?.find((m: any) => m.id === aiResponse.media_id) || (previews as any)?.find((m: any) => (aiResponse.action === 'send_video_preview' && m.file_type === 'video') || (aiResponse.action === 'send_photo_preview' && m.file_type === 'image')) || (previews as any)?.[0];
            if (target) { mediaUrl = target.file_url; mediaType = target.file_type; }
        }

        if (aiResponse.action === 'generate_pix_payment') {
            const val = aiResponse.payment_details?.value || 30.00;
            const pixRes = await fetch(`${WIINPAY_BASE_URL}/payment/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: WIINPAY_API_KEY, value: val, name: "Lead", email: "cli@lari.com" }) });
            const pixData = await pixRes.json();
            const pixCode = pixData?.data?.pixCopiaCola || pixData?.pixCopiaCola;
            if (pixCode) {
                aiResponse.messages.push("Copia e cola aqui amor:");
                aiResponse.messages.push(pixCode);
                paymentSaved = { paymentId: pixData?.data?.paymentId || pixData?.paymentId, value: val };
            }
        }

        // 5. Final Save and Send
        const msgs = aiResponse.messages || [];
        const thoughtPrefix = aiResponse.internal_thought ? `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n` : "";

        // Save BOT as a SINGLE interaction for history stability
        const { error: dbError } = await supabase.from('messages').insert([{
            session_id: session.id,
            sender: 'bot',
            content: thoughtPrefix + msgs.join('\n'),
            media_url: mediaUrl || null,
            media_type: mediaType || null,
            payment_data: paymentSaved || null
        }]);

        if (dbError) {
            // Send Error notice to Telegram if DB fails
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: `⚠️ DB SAVE ERROR: ${dbError.message}` }) });
        }

        // Update Session
        const up: any = { last_message_at: new Date() };
        if (aiResponse.extracted_user_name) up.user_name = aiResponse.extracted_user_name;
        if (aiResponse.lead_stats) up.lead_score = JSON.stringify(aiResponse.lead_stats);
        await supabase.from('sessions').update(up).eq('id', session.id);

        // Send to Telegram
        for (const msg of msgs) {
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg }) });
            await new Promise(r => setTimeout(r, 600));
        }

        if (mediaUrl) {
            const mtd = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            const k = mediaType === 'video' ? 'video' : 'photo';
            await fetch(`${TELEGRAM_API_BASE}${token}/${mtd}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, [k]: mediaUrl, caption: "👀�" }) });
        }

        return res.status(200).send('ok');

    } catch (e: any) {
        return res.status(200).send('ok');
    }
}
