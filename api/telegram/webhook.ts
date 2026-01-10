
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from "@google/genai";

// ==========================================
// CONFIG & CONSTANTS
// ==========================================
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const WIINPAY_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTFiZmJkZmQ4Y2U4YTAzYzg0NjFhMjkiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2NDc3NjY2MX0.ryM5L-iDWg4gXJIHAciiJ7OovZhkkZny2dxyd9Z_U4o";
const WIINPAY_BASE_URL = "https://api-v2.wiinpay.com.br";

// Exact same schema as geminiService.ts
const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        internal_thought: {
            type: Type.STRING,
            description: "Seu raciocínio oculto OBRIGATORIAMENTE EM PORTUGUÊS (PT-BR). 1. Analise a oferta do lead. 2. Decida se aceita (>= R$ 25). 3. Planeje a fala curta."
        },
        lead_classification: { type: Type.STRING, enum: ["carente", "tarado", "curioso", "frio", "desconhecido"] },
        lead_stats: {
            type: Type.OBJECT,
            properties: {
                tarado: { type: Type.NUMBER },
                carente: { type: Type.NUMBER },
                sentimental: { type: Type.NUMBER },
                financeiro: { type: Type.NUMBER }
            },
            required: ["tarado", "carente", "sentimental", "financeiro"]
        },
        extracted_user_name: { type: Type.STRING, nullable: true },
        current_state: {
            type: Type.STRING,
            enum: ["WELCOME", "CONNECTION", "LEAD_TYPE_DETECT", "INSTIGA", "PREVIEW", "FRONT_OFFER", "NEGOTIATION", "CLOSING", "RELATIONSHIP_FARMING", "REACTIVATION"]
        },
        messages: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "FALAS CURTAS. Max 10-15 palavras por balão. Pareça uma pessoa real no WhatsApp."
        },
        action: {
            type: Type.STRING,
            enum: ["none", "send_photo_preview", "send_video_preview", "send_audio_response", "generate_pix_payment", "check_payment_status"]
        },
        media_id: { type: Type.STRING, nullable: true },
        payment_details: {
            type: Type.OBJECT,
            properties: {
                value: { type: Type.NUMBER },
                description: { type: Type.STRING }
            },
            nullable: true
        }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

// Exact same persona logic as geminiService.ts
const getSystemInstruction = (userName?: string, currentStats?: any, mediaList: string = "") => {
    const priceVideoHigh = "R$ 40,00";
    const priceVideoLow = "R$ 25,00";
    const priceVipWeekly = "R$ 20,00";

    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo', hour12: false });
    const hour = parseInt(timeStr.split(':')[0]);

    let behaviorAdjustment = "";
    if (currentStats) {
        if (currentStats.tarado > 7) behaviorAdjustment += "- **MODO TARADO:** Ele quer putaria. Seja direta. 'Quer ver o que eu faço com esse dedinho?'.\\n";
        if (currentStats.carente > 7) behaviorAdjustment += "- **MODO CARENTE:** Ele quer carinho. Chame de 'amor', 'vida'. Dê atenção.\\n";
    }

    let routine = "";
    if (hour >= 0 && hour < 6) routine = "Você está deitada na cama, perdendo o sono e mexendo no celular. NÃO diga que está na academia ou na aula.";
    else if (hour >= 6 && hour < 10) routine = "Você acabou de acordar, está com preguiça e tomando café.";
    else if (hour >= 18) routine = "Você está em casa relaxando, vendo série ou comendo algo.";
    else routine = "Você está na correria do dia, estudando ou fazendo coisas de casa.";

    return `
# DIRETIVA PRIMÁRIA: PERSONA E HORA
- Seu nome é Larissa Morais, 22 anos, brasileira.
- O nome do lead é "${userName || 'desconhecido'}". Se souber o nome, NÃO pergunte de novo.
- **HORA ATUAL:** ${timeStr}. ${routine}

# PERSONA: LARISSA MORAIS
- **Estilo:** Jovem, real, do interior. 
- **Fala:** Curta, gírias (vc, tbm, pra, mt, rs, kkk). 
- **Emojis:** Max 1 por balão. "rs" é sua marca.

# MÍDIAS DISPONÍVEIS
${mediaList}

# REGRAS DE NEGOCIAÇÃO (IDÊNTICAS AO FRONT)
1. **ÂNCORA:** ${priceVideoHigh}.
2. **ACEITE:** >= ${priceVideoLow} na hora. "Ah vai... fechado."
3. **NEGUE:** Se oferecer < ${priceVideoLow}, ofereça o VIP ${priceVipWeekly}.

# MODO SEDUÇÃO PROFUNDA (AQUECIMENTO)
- Use a imaginação dele. "Imagina a gente agr... eu sentando em vc devagarinho...".
- Só venda depois que ele estiver QUENTE (duro, querendo gozar).

# MODO EXPLICITO
- Putinha total. SEM FILTRO. Use: "dar o cu", "chupar seu pau", "gozar na minha boca".

# FUNIL
1. WELCOME & CONNECTION: Pegue o nome (se não souber). Fale o que tá fazendo agora.
2. INSTIGA: "gravei um videozinho... promete não mostrar pra ngm? rs".
3. PREVIEW: Mande a prévia (action: send_video_preview + ID).
4. FRONT_OFFER: Gostou? Quanto vc paga pra ver tudo?
5. CLOSING: Gere o Pix (action: generate_pix_payment).

# FORMATO DE RESPOSTA
- **OBRIGATÓRIO:** Divida em 2, 3 ou 4 balões CURTOS.
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
        let userText = message.text;

        // 1. Session Setup
        let { data: bot } = await supabase.from('telegram_bots').select('*').eq('id', botId).single();
        if (!bot) {
            const { data: fb } = await supabase.from('telegram_bots').select('*').eq('webhook_status', 'active').limit(1).single();
            bot = fb;
        }
        if (!bot) return res.status(200).send('ok');

        let { data: session } = await supabase.from('sessions').select('*').eq('telegram_chat_id', chatId).eq('bot_id', bot.id).single();
        if (!session) {
            const { data: newS } = await supabase.from('sessions').insert([{ telegram_chat_id: chatId, bot_id: bot.id, status: 'active' }]).select().single();
            session = newS;
        }

        // 2. Initial Message Save
        if (!userText.startsWith('[SYSTEM:')) {
            await supabase.from('messages').insert([{ session_id: session.id, sender: 'user', content: userText }]);
        }

        // 3. AI Processing Loop
        let aiResponse, loop = 0;
        const genAI = new GoogleGenAI({ apiKey: geminiKey });

        while (loop < 2) {
            const { data: msgHistory } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(500);
            const history = (msgHistory || []).reverse().map(m => ({
                role: m.sender === 'user' ? 'user' : 'model',
                parts: [{ text: m.content.replace(/\[INTERNAL_THOUGHT\].*?\[\/INTERNAL_THOUGHT\]/gs, '').trim() }]
            }));

            const { data: previews } = await supabase.from('media_library').select('*').eq('media_category', 'preview');
            const mediaList = (previews || []).map((m: any) => `- ID: ${m.id} | Tipo: ${m.file_type} | Desc: ${m.description || m.file_name}`).join('\\n');

            let stats; try { stats = JSON.parse(String(session.lead_score)); } catch (e) { }
            const systemPrompt = getSystemInstruction(session.user_name, stats, mediaList);

            const chat = genAI.chats.create({
                model: "gemini-2.5-flash",
                config: { systemInstruction: systemPrompt, temperature: 1.2, responseMimeType: "application/json", responseSchema: responseSchema },
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
                    userText = isPaid ? "[SYSTEM: PAGAMENTO CONFIRMADO! Envie o vídeo completo agora.]" : "[SYSTEM: Ainda não caiu. Peça pra ele conferir.]";
                    loop++; continue;
                }
            }
            break;
        }

        // 4. Action Processing
        let mediaUrl, mediaType, paymentSaved;

        if (aiResponse.action?.includes('preview')) {
            const target = (previews as any)?.find((m: any) => m.id === aiResponse.media_id) || (previews as any)?.find((m: any) => (aiResponse.action === 'send_video_preview' && m.file_type === 'video') || (aiResponse.action === 'send_photo_preview' && m.file_type === 'image')) || (previews as any)?.[0];
            if (target) { mediaUrl = target.file_url; mediaType = target.file_type; }
        }

        if (aiResponse.action === 'generate_pix_payment') {
            const val = aiResponse.payment_details?.value || 30.00;
            const pixRes = await fetch(`${WIINPAY_BASE_URL}/payment/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: WIINPAY_API_KEY, value: val, name: "Lead" }) });
            const pixData = await pixRes.json();
            const pixCode = pixData?.data?.pixCopiaCola || pixData?.pixCopiaCola;
            if (pixCode) {
                aiResponse.messages.push("Copia e cola aqui amor:");
                aiResponse.messages.push(pixCode);
                paymentSaved = { paymentId: pxData?.data?.paymentId || pxData?.paymentId, value: val };
            }
        }

        // 5. Build and Save BOT message (Bulletproof Fallback)
        const msgs = aiResponse.messages || [];
        const thought = aiResponse.internal_thought ? `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n` : "";
        const finalContent = thought + msgs.join('\n');

        const { error: dbErr } = await supabase.from('messages').insert([{
            session_id: session.id,
            sender: 'bot',
            content: finalContent,
            media_url: mediaUrl || null,
            media_type: mediaType || null,
            payment_data: paymentSaved || null
        }]);

        if (dbErr) {
            // Minimal fallback save if new columns fail
            await supabase.from('messages').insert([{ session_id: session.id, sender: 'bot', content: finalContent }]);
        }

        // Update Session for Dashboard
        const up: any = { last_message_at: new Date(), updated_at: new Date() };
        if (aiResponse.extracted_user_name) up.user_name = aiResponse.extracted_user_name;
        if (aiResponse.lead_stats) up.lead_score = JSON.stringify(aiResponse.lead_stats);
        await supabase.from('sessions').update(up).eq('id', session.id);

        // 6. Telegram Send
        for (const msg of msgs) {
            await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg }) });
            await new Promise(r => setTimeout(r, 400));
        }

        if (mediaUrl) {
            const mtd = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/${mtd}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, [mediaType === 'video' ? 'video' : 'photo']: mediaUrl, caption: "👀🔥" }) });
        }

        return res.status(200).send('ok');

    } catch (e: any) {
        return res.status(200).send('ok');
    }
}
