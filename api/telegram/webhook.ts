
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

const getSystemInstruction = (currentStats?: any, mediaList: string = "") => {
    const priceVideoHigh = "R$ 40,00";
    const priceVideoLow = "R$ 25,00";
    const priceVipWeekly = "R$ 20,00";
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    let behaviorAdjustment = "";
    if (currentStats) {
        if (currentStats.tarado > 7) behaviorAdjustment += "- **MODO TARADO:** Ele quer putaria. Seja direta.\n";
        if (currentStats.carente > 7) behaviorAdjustment += "- **MODO CARENTE:** Ele quer carinho. Chame de 'amor', 'vida'.\n";
    }

    return `
# DIRETIVA PRIMÁRIA: IDIOMA
TODA a sua comunicação, incluindo pensamentos internos (internal_thought), planejamento e respostas, DEVE ser em PORTUGUÊS DO BRASIL (pt-BR).

# PERSONA: LARISSA MORAIS
Você é uma garota de 22 anos, brasileira, real.
- **Estilo de fala:** Curto. Direto. Jovem. Use "vc", "tbm", "pra", "mt".
- **Whats Style:** Use frases curtas. No máximo 1 emoji por balão. "rs", "kkk" são suas marcas.
- **Objetivo:** Vender conteúdo (+18) sem parecer vendedora.

# CONTEXTO
- **Horário:** ${timeString}.
${behaviorAdjustment}

# MÍDIAS DISPONÍVEIS
${mediaList}

# REGRAS (OBRIGATÓRIO)
1. **Rotina:** Comece mencionando algo da sua rotina real.
2. **Timidez:** Demonstre vergonha "rs" APENAS se o clima esquentar.
3. **Preço:** NUNCA fale o preço logo de cara. Âncora: ${priceVideoHigh}. Aceite: ${priceVideoLow}.
4. **Sedução:** Use imaginação ("imagina eu sentando..."). Vá para o explicito ("dar o cu", "chupar seu pau") quando ele estiver quente.

# FUNIL
1. WELCOME/CONNECTION: Oi amor! Pega o nome dele. (2-4 msgs iniciais).
2. INSTIGA: Gravei um vídeo... to com vergonha rs. Quer ver?
3. PREVIEW: Mande a prévia (action: send_video_preview).
4. OFFER: Gostou? Quanto vc paga pra ver tudo?
5. NEGOTIATION: Se ele oferecer >= ${priceVideoLow}, GERE O PIX.
6. VERIFICAÇÃO: Se ele disser que pagou, use check_payment_status.

# FORMATO DE RESPOSTA
- **OBRIGATÓRIO:** Divida em 2 ou 3 balões CURTOS.
- Max 15 palavras por balão.
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
        const text = message.text;

        // 1. Bot & Session
        let { data: bot } = await supabase.from('telegram_bots').select('*').eq('id', botId).single();
        if (!bot) {
            const { data: fb } = await supabase.from('telegram_bots').select('*').eq('webhook_status', 'active').limit(1).single();
            bot = fb;
        }
        if (!bot) return res.status(200).send('ok');
        const token = bot.bot_token;

        let { data: session } = await supabase.from('sessions').select('*').eq('telegram_chat_id', chatId).eq('bot_id', bot.id).single();
        if (!session) {
            const { data: newS } = await supabase.from('sessions').insert([{
                telegram_chat_id: chatId, bot_id: bot.id, device_type: 'Mobile', status: 'active'
            }]).select().single();
            session = newS;
        }

        // 2. Save User Message (IF NOT SYSTEM FEEDBACK)
        if (!text.startsWith('[SYSTEM:')) {
            await supabase.from('messages').insert([{ session_id: session.id, sender: 'user', content: text }]);
        }

        // 3. Prepare AI Context
        const { data: previews } = await supabase.from('media_library').select('*').eq('media_category', 'preview').order('created_at', { ascending: false });
        const mediaList = (previews || []).map((m: any) => `- ID: ${m.id} | Tipo: ${m.file_type} | Desc: ${m.description || m.file_name}`).join('\n');

        const { data: msgHistory } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(20);
        const history = (msgHistory || []).reverse().map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.content.replace(/\[INTERNAL_THOUGHT\].*?\[\/INTERNAL_THOUGHT\]/gs, '').trim() }]
        }));

        // 4. Gemini Call
        let stats; try { stats = JSON.parse(session.lead_score); } catch (e) { }
        const systemPrompt = getSystemInstruction(stats, mediaList);

        const genAI = new GoogleGenAI({ apiKey: geminiKey });
        const chat = genAI.chats.create({
            model: "gemini-2.5-flash",
            config: { systemInstruction: systemPrompt, temperature: 1.3, responseMimeType: "application/json", responseSchema: responseSchema },
            history: history
        });

        const result = await chat.sendMessage({ message: text });
        const aiResponse = JSON.parse(result.text.replace(/```json/g, '').replace(/```/g, '').trim());

        // 5. Action Processing
        let mediaUrl, mediaType;

        if (aiResponse.action === 'check_payment_status') {
            const { data: lastPay } = await supabase.from('messages').select('payment_data').eq('session_id', session.id).not('payment_data', 'is', null).order('created_at', { ascending: false }).limit(1).single();
            if (lastPay?.payment_data?.paymentId) {
                const stRes = await fetch(`${WIINPAY_BASE_URL}/payment/list/${lastPay.payment_data.paymentId}`, { headers: { 'Authorization': `Bearer ${WIINPAY_API_KEY}` } });
                const stData = await stRes.json();
                const isPaid = stData?.status === 'approved' || stData?.status === 'paid' || stData?.data?.status === 'approved';
                const feedback = isPaid ? "[SYSTEM: PAGAMENTO CONFIRMADO! Mande o vídeo agora.]" : "[SYSTEM: Ainda não caiu. Peça pra ele conferir.]";
                return handler({ ...req, body: { message: { ...message, text: feedback } } } as any, res);
            } else {
                return handler({ ...req, body: { message: { ...message, text: "[SYSTEM: Nenhuma cobrança encontrada. Gere o Pix antes.]" } } } as any, res);
            }
        }

        if (aiResponse.action?.includes('preview')) {
            const target = previews?.find((m: any) => m.id === aiResponse.media_id) || previews?.find((m: any) => (aiResponse.action === 'send_video_preview' && m.file_type === 'video') || (aiResponse.action === 'send_photo_preview' && m.file_type === 'image')) || previews?.[0];
            if (target) { mediaUrl = target.file_url; mediaType = target.file_type; }
        }

        let paymentSaved = null;
        if (aiResponse.action === 'generate_pix_payment') {
            const val = aiResponse.payment_details?.value || 30.00;
            const pixRes = await fetch(`${WIINPAY_BASE_URL}/payment/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: WIINPAY_API_KEY, value: val, name: "Lead", email: "cli@lari.com" }) });
            const pixData = await pixRes.json();
            const pixCode = pixData?.data?.pixCopiaCola || pixData?.pixCopiaCola;
            if (pixCode) {
                aiResponse.messages.push("Copia e cola aqui:");
                aiResponse.messages.push(pixCode);
                paymentSaved = { paymentId: pixData?.data?.paymentId || pixData?.paymentId, value: val, status: 'pending' };
            }
        }

        // 6. Send to Telegram
        const messagesToSend = aiResponse.messages || [];
        for (const msg of messagesToSend) {
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg }) });
            await new Promise(r => setTimeout(r, 600));
        }

        if (mediaUrl) {
            const method = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            const key = mediaType === 'video' ? 'video' : 'photo';
            await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, [key]: mediaUrl, caption: "🔥" }) });
        }

        // 7. FATAL FIX: Save BOT responses to DB (WITH CORRECT FIELDS)
        const thoughtPrefix = aiResponse.internal_thought ? `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n` : "";
        const finalContent = thoughtPrefix + messagesToSend.join('\n');

        await supabase.from('messages').insert([{
            session_id: session.id,
            sender: 'bot',
            content: finalContent,
            media_url: mediaUrl || null,
            media_type: mediaType || null,
            payment_data: paymentSaved || null
        }]);

        // 8. Update Session Dashboard Stats
        const updateData: any = {};
        if (aiResponse.extracted_user_name) updateData.user_name = aiResponse.extracted_user_name;
        if (aiResponse.lead_stats) updateData.lead_score = JSON.stringify(aiResponse.lead_stats);
        updateData.last_message_at = new Date();

        await supabase.from('sessions').update(updateData).eq('id', session.id);

        return res.status(200).send('ok');

    } catch (e: any) {
        console.error("WEBHOOK ERROR:", e);
        return res.status(200).send('ok');
    }
}
