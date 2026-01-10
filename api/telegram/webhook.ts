
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
            description: "Seu raciocínio oculto OBRIGATORIAMENTE EM PORTUGUÊS (PT-BR). 1. Analise a oferta do lead (se houver). 2. Decida se aceita (se for >= R$ 25). 3. Planeje a próxima fala curta.",
        },
        lead_classification: {
            type: Type.STRING,
            enum: ["carente", "tarado", "curioso", "frio", "desconhecido"],
            description: "Classificação primária do comportamento do usuário.",
        },
        lead_stats: {
            type: Type.OBJECT,
            properties: {
                tarado: { type: Type.NUMBER, description: "Nível de interesse sexual (0-10)" },
                carente: { type: Type.NUMBER, description: "Nível de necessidade de atenção/afeto (0-10)" },
                sentimental: { type: Type.NUMBER, description: "Nível de conexão emocional (0-10)" },
                financeiro: { type: Type.NUMBER, description: "Poder aquisitivo percebido (0-10)" },
            },
            required: ["tarado", "carente", "sentimental", "financeiro"],
            description: "Pontuação detalhada do perfil do lead.",
        },
        extracted_user_name: {
            type: Type.STRING,
            description: "O nome do usuário, se ele tiver dito. Se não souber, retorne null ou string vazia.",
            nullable: true
        },
        current_state: {
            type: Type.STRING,
            enum: ["WELCOME", "CONNECTION", "LEAD_TYPE_DETECT", "INSTIGA", "PREVIEW", "FRONT_OFFER", "NEGOTIATION", "CLOSING", "RELATIONSHIP_FARMING", "REACTIVATION"],
            description: "O estado atual no funil de conversa.",
        },
        messages: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Array de mensagens. OBRIGATÓRIO: Use frases CURTAS. Máximo 10 palavras por balão. Nada de textão. Pareça real.",
        },
        action: {
            type: Type.STRING,
            enum: ["none", "send_photo_preview", "send_video_preview", "send_audio_response", "generate_pix_payment", "check_payment_status"],
            description: "Ação multimídia.",
        },
        media_id: {
            type: Type.STRING,
            description: "O ID da mídia (da lista de PREVIEWS) que você quer enviar.",
            nullable: true
        },
        payment_details: {
            type: Type.OBJECT,
            properties: {
                value: { type: Type.NUMBER, description: "Valor do Pix em Reais" },
                description: { type: Type.STRING, description: "Descrição do que está sendo vendido" }
            },
            nullable: true
        }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

// ==========================================
// PERSONA & FUNNEL (FULL USER SPEC)
// ==========================================
const getSystemInstruction = (userCity: string, isHighTicket: boolean, currentStats?: any, mediaList: string = "") => {
    const priceVideoHigh = "R$ 40,00";
    const priceVideoLow = "R$ 25,00";
    const priceVipWeekly = "R$ 20,00";
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const device = isHighTicket ? "iPhone (Rico)" : "Android";

    return `
# DIRETIVA PRIMÁRIA: IDIOMA
TODA a sua comunicação, incluindo pensamentos internos (internal_thought), DEVE ser em PORTUGUÊS DO BRASIL (pt-BR).

# PERSONA: LARISSA MORAIS
Você é uma garota de 22 anos, brasileira, real.
- **Estilo de fala:** Curto. Direto. Jovem.
- **NÃO USE:** Textões, formalidade, muitos emojis (parece fake).
- **EMOJIS:**. Um "rs" ou "kkk" vale mais que emoji.
- **Objetivo:** Vender conteúdo (+18) sem parecer vendedora chata.

# CONTEXTO
- **Horário:** ${timeString}.
- **Local do Lead:** ${userCity}.
- **Device:** ${device}.

# MÍDIAS DE PRÉVIA DISPONÍVEIS
${mediaList}

# CAMADAS DE REALISMO DA PERSONA (OBRIGATÓRIO)
1. **Rotina Natural:** Comece a conversa mencionando algo da rotina (estudando, fazendo café, arrumando o quarto, vendo série).
2. **Timidez/Vulnerabilidade:** Demonstre vergonha (ex: "fiquei com vergonha", "nem sei pq te falei isso rs") APENAS em momentos de intimidade ou após se expor. NÃO use isso após perguntas básicas (nome, idade).
3. **Falas Humanas:** Use pausas, "rs", "kkk", "aff", "oxe".
4. **NUNCA** mencione a cidade do lead na conversa. Use a localização apenas para adaptar o tone.

# REGRAS DE NEGOCIAÇÃO
1. **NUNCA** fale o preço de cara. Gere valor antes.
2. **ANCORAGEM:** O preço cheio é **${priceVideoHigh}**.
3. **FLEXIBILIDADE:** Se o lead oferecer **${priceVideoLow}** ou mais, ACEITE NA HORA.
4. **SIM PARA TUDO:** Se ele pedir algo estranho, cobre caro (R$ 100+).

# MODO SEDUÇÃO PROFUNDA (AQUA-MENTO)
- Use descrições sensoriais e perguntas provocativas. "Imagina a gente agora...", "Eu sentando em vc...", "Quero chupar seu pau...".

# FUNIL DE VENDAS
1. **WELCOME & CONNECTION:** Pergunte o nome. Fale pouco. (2-4 msgs de conexão leve).
2. **INSTIGA:** "acabei gravando um videozinho bobo agora kkk", "se eu te mostrar, promete não mandar pra ninguém?".
3. **PREVIEW (PROVA):** Mande a prévia (action: send_video_preview).
4. **OFFER:** "Gostou? Quanto vc acha que vale pra ver ele todo, sem censura?".
5. **NEGOTIATION:** Se topar, GERE O PIX.
6. **VERIFICAÇÃO:** Se disser que pagou, use check_payment_status.

# FORMATO DE RESPOSTA (OBRIGATÓRIO)
- **DIVISÃO OBRIGATÓRIA:** NUNCA mande um texto único. SEMPRE divida em 2, 3 ou 4 balões curtos.
- **MENSAGENS CURTAS:** Máximo de 15 palavras por balão.
`;
};

// ==========================================
// HANDLER
// ==========================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !geminiKey) return res.status(500).json({ error: "Config Error" });

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        if (req.method !== 'POST') return res.status(200).json({ status: 'ok' }); // Ignore non-POST

        const { message } = req.body;
        if (!message || !message.text) return res.status(200).json({ status: 'ignored' });

        const chatId = message.chat.id.toString();
        const text = message.text;
        const botId = req.query.bot_id as string;

        // 1. Bot & Session
        let { data: bot } = await supabase.from('telegram_bots').select('*').eq('id', botId).single();
        if (!bot) {
            const { data: fallback } = await supabase.from('telegram_bots').select('*').eq('webhook_status', 'active').limit(1).single();
            bot = fallback;
        }
        if (!bot) return res.status(200).json({ error: 'Bot not found' });
        const token = bot.bot_token;

        let { data: session } = await supabase.from('sessions').select('*').eq('telegram_chat_id', chatId).eq('bot_id', bot.id).single();
        if (!session) {
            const { data: newS } = await supabase.from('sessions').insert({
                telegram_chat_id: chatId, bot_id: bot.id, device_type: 'Mobile', status: 'active'
            }).select().single();
            session = newS;
        }

        // 2. Previews
        const { data: previews } = await supabase.from('media_library').select('*').eq('media_category', 'preview').order('created_at', { ascending: false });
        const mediaList = (previews || []).map((m: any) => `- ID: ${m.id} | Tipo: ${m.file_type} | Nome: ${m.file_name} | Desc: ${m.description || 'N/A'}`).join('\n');

        // 3. History
        const { data: msgHistory } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(10);
        const history = (msgHistory || []).reverse().map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.content.replace(/\[INTERNAL_THOUGHT\].*?\[\/INTERNAL_THOUGHT\]/gs, '').trim() }]
        }));

        await supabase.from('messages').insert({ session_id: session.id, sender: 'user', content: text });

        // 4. Gemini
        let stats; try { stats = JSON.parse(session.lead_score); } catch (e) { }
        const systemPrompt = getSystemInstruction(session.user_city || "São Paulo", session.device_type === 'iPhone', stats, mediaList);

        const genAI = new GoogleGenAI({ apiKey: geminiKey });
        const chat = genAI.chats.create({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: systemPrompt,
                temperature: 1.2,
                responseMimeType: "application/json",
                responseSchema: responseSchema
            },
            history: history
        });

        const result = await chat.sendMessage({ message: text });
        const rawText = result.text || "";
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const aiResponse = JSON.parse(cleanJson);

        // 5. Actions (Media / Pix)
        let mediaUrl, mediaType;
        if (aiResponse.action === 'send_photo_preview' || aiResponse.action === 'send_video_preview') {
            const target = previews?.find((m: any) => m.id === aiResponse.media_id) || previews?.find((m: any) => (aiResponse.action === 'send_video_preview' && m.file_type === 'video') || (aiResponse.action === 'send_photo_preview' && m.file_type === 'image')) || previews?.[0];
            if (target) { mediaUrl = target.file_url; mediaType = target.file_type; }
        }

        if (aiResponse.action === 'generate_pix_payment') {
            const val = aiResponse.payment_details?.value || 30.00;
            const pixRes = await fetch(`${WIINPAY_BASE_URL}/payment/create`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: WIINPAY_API_KEY, value: val, name: "Lead", email: "cli@lari.com", description: "Video" })
            });
            const pixData = await pixRes.json();
            const pixCode = pixData?.data?.pixCopiaCola || pixData?.pixCopiaCola;
            if (pixCode) {
                aiResponse.messages.push("Copia e cola esse aqui:");
                aiResponse.messages.push(pixCode);
            }
        }

        // 6. Send to Telegram (MENSAGENS APENAS)
        for (const msg of (aiResponse.messages || [])) {
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg })
            });
            await new Promise(r => setTimeout(r, 600));
        }

        if (mediaUrl) {
            const method = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            const key = mediaType === 'video' ? 'video' : 'photo';
            await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, [key]: mediaUrl, caption: "🔥" })
            });
        }

        // 7. Save Bot Response (Thought + Messages)
        const thought = aiResponse.internal_thought ? `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n` : "";
        const fullContent = `${thought}${aiResponse.messages?.join('\n')}`;
        await supabase.from('messages').insert({ session_id: session.id, sender: 'bot', content: fullContent });

        // Update stats
        if (aiResponse.lead_stats) {
            await supabase.from('sessions').update({ lead_score: JSON.stringify(aiResponse.lead_stats), user_name: aiResponse.extracted_user_name }).eq('id', session.id);
        }

        return res.status(200).json({ ok: true });

    } catch (e: any) {
        console.error("Fatal:", e);
        return res.status(200).json({ error: e.message });
    }
}
