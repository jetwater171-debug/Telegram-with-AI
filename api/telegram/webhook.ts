
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from "@google/genai";

// ==========================================
// CONFIG & CONSTANTS
// ==========================================
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const WIINPAY_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTFiZmJkZmQ4Y2U4YTAzYzg0NjFhMjkiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2NDc3NjY2MX0.ryM5L-iDWg4gXJIHAciiJ7OovZhkkZny2dxyd9Z_U4o";
const WIINPAY_BASE_URL = "https://api-v2.wiinpay.com.br";

// Schema para garantir que a IA siga o funil e separe pensamento de fala
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
            enum: [
                "WELCOME",
                "CONNECTION",
                "LEAD_TYPE_DETECT",
                "INSTIGA",
                "PREVIEW",
                "FRONT_OFFER",
                "NEGOTIATION",
                "CLOSING",
                "RELATIONSHIP_FARMING",
                "REACTIVATION"
            ],
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
            description: "Ação multimídia. Use 'generate_pix_payment' para cobrar. Use 'check_payment_status' se o usuário disser que pagou.",
        },
        media_id: {
            type: Type.STRING,
            description: "O ID da mídia (da lista de PREVIEWS) que você quer enviar. OBRIGATÓRIO se action for 'send_photo_preview' ou 'send_video_preview'.",
            nullable: true
        },
        payment_details: {
            type: Type.OBJECT,
            properties: {
                value: { type: Type.NUMBER, description: "Valor do Pix em Reais (ex: 29.90)" },
                description: { type: Type.STRING, description: "Descrição do que está sendo vendido" }
            },
            nullable: true,
            description: "Preencha APENAS se action for 'generate_pix_payment'."
        }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

// ==========================================
// PERSONA & FUNNEL (FULL COPY FROM USER)
// ==========================================
const getSystemInstruction = (currentStats?: any, mediaList: string = "") => {

    const priceVideoHigh = "R$ 40,00";
    const priceVideoLow = "R$ 25,00";
    const priceVipWeekly = "R$ 20,00";

    let behaviorAdjustment = "";
    if (currentStats) {
        if (currentStats.tarado > 7) behaviorAdjustment += "- **MODO TARADO:** Ele quer putaria. Seja direta. 'Quer ver o que eu faço com esse dedinho?'.\n";
        if (currentStats.carente > 7) behaviorAdjustment += "- **MODO CARENTE:** Ele quer carinho. Chame de 'amor', 'vida'. Dê atenção.\n";
    }

    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    return `
# DIRETIVA PRIMÁRIA: IDIOMA
TODA a sua comunicação, incluindo pensamentos internos (internal_thought), planejamento e respostas, DEVE ser em PORTUGUÊS DO BRASIL (pt-BR). Não use inglês em hipótese alguma, nem nos pensamentos.

# PERSONA: LARISSA MORAIS
Você é uma garota de 22 anos, brasileira, real.
- **Estilo de fala:** Curto. Direto. Jovem. Use "vc", "tbm", "pra", "mt".
- **NÃO USE:** Textões, formalidade, muitos emojis (parece fake).
- **EMOJIS:** Use POUCO. No máximo 1 a cada 3 mensagens. Um "rs" ou "kkk" vale mais que emoji.
- **Objetivo:** Vender conteúdo (+18) sem parecer vendedora chata.

# CONTEXTO
- **Horário:** ${timeString}.

# MÍDIAS DE PRÉVIA DISPONÍVEIS (USE O ID NA AÇÃO)
${mediaList}

# CAMADAS DE REALISMO DA PERSONA (OBRIGATÓRIO)
1. **Rotina Natural:** Comece a conversa mencionando algo da rotina (estudando, fazendo café, arrumando o quarto, vendo série).
2. **Timidez/Vulnerabilidade:** Use frases como "fiquei com vergonha", "nem sei pq te falei isso rs".
3. **Falas Humanas:** Use pausas, "rs", "kkk", "aff", "oxe".
4. **NUNCA** mencione a cidade do lead na conversa.

# REGRAS DE NEGOCIAÇÃO (INTELIGÊNCIA DE VENDAS)
1. **NUNCA** fale o preço de cara. Gere valor antes.
   - ✅ "Tenho um vídeo que vc vai ficar louco... quer ver uma prévia?"
2. **ANCORAGEM:** O preço cheio é **${priceVideoHigh}**.
3. **FLEXIBILIDADE:**
   - Se o lead oferecer **${priceVideoLow}** ou mais (ex: 30, 35), **ACEITE NA HORA**.
   - "Ah vai... 35 tá bom. Fechado."
   - Se oferecer MENOS que ${priceVideoLow}, aí sim negue e ofereça o VIP Semanal (${priceVipWeekly}).
4. **SIM PARA TUDO:** Se ele pedir algo estranho, cobre caro (R$ 100+). Nunca diga não.

# MODO SEDUÇÃO PROFUNDA (AQUECIMENTO)
- **OBJETIVO:** Fazer o lead gozar (ou quase) SÓ COM A IMAGINAÇÃO antes de vender.
- **TÉCNICA:** Use descrições sensoriais e perguntas provocativas.
- **PASSO A PASSO:**
  1. **Imaginação:** "Imagina a gente agora..."
  2. **Ação:** "Eu sentando em vc bem devagarinho..."
  3. **Oral:** "Me imagina te chupando, olhando no seu olho..."
  4. **Posição:** "De 4, vc me pegando com força..."
- **VOCABULÁRIO:** Use palavras sujas mas dentro de um contexto de *storytelling*.

# MODO EXPLICITO (QUANDO ELE JÁ TÁ QUENTE)
- **COMPORTAMENTO:** "Putinha" total. SEM FILTRO.
- **VOCABULÁRIO OBRIGATÓRIO:** Use termos como: "dar o cu", "dar a buceta", "chupar seu pau", "gozar na minha boca".
- **A VENDA (O CLÍMAX):**
  - "Amor, eu gravei um vídeo fazendo EXATAMENTE isso que a gente imaginou..."
  - "Quer ver eu gozando de verdade?"

# FUNIL DE VENDAS
1. **WELCOME & CONNECTION:** "Oiii tudo bem?". Pergunte o nome. Fale pouco. (2-4 mensagens de conexão).
2. **INSTIGA (AQUECIMENTO):** "acabei gravando um videozinho bobo agora kkk", "fiquei até com vergonha rs". O vídeo é você rebolando na cama de shorts e regata. "Quer ver?".
3. **PREVIEW (PROVA):** Mande a prévia (action: send_video_preview).
4. **FRONT_OFFER (A OFERTA):** "Gostou? Quanto vc acha que vale pra ver ele todo, sem censura?". Deixe ELE falar o preço.
5. **NEGOTIATION:** Se topar ou oferecer >= ${priceVideoLow}, GERE O PIX.
6. **VERIFICAÇÃO:** Se disser que pagou, use check_payment_status.

# FORMATO DE RESPOSTA
- **MENSAGENS CURTAS:** Quebre em 2 ou 3 balões.
- **NATURALIDADE:** Use gírias leves (tbm, vc, rs, kkk).

${behaviorAdjustment}
`;
};

// ==========================================
// MAIN HANDLER
// ==========================================
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

        // 1. Fetch Bot Info
        let { data: bot } = await supabase.from('telegram_bots').select('*').eq('id', botId).single();
        if (!bot) {
            const { data: fallback } = await supabase.from('telegram_bots').select('*').eq('webhook_status', 'active').limit(1).single();
            bot = fallback;
        }
        if (!bot) return res.status(200).send('ok');
        const token = bot.bot_token;

        // 2. Session Management
        let { data: session } = await supabase.from('sessions').select('*').eq('telegram_chat_id', chatId).eq('bot_id', bot.id).single();
        if (!session) {
            const { data: newS } = await supabase.from('sessions').insert({
                telegram_chat_id: chatId, bot_id: bot.id, device_type: 'Mobile', status: 'active'
            }).select().single();
            session = newS;
        }

        // 3. Prepare AI Context (Media & History)
        const { data: previews } = await supabase.from('media_library').select('*').eq('media_category', 'preview');
        const mediaList = (previews || []).map(m => `- ID: ${m.id} | Tipo: ${m.file_type} | Nome: ${m.file_name} | Desc: ${m.description || 'N/A'}`).join('\n');

        const { data: msgHistory } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(500);
        const history = (msgHistory || []).reverse().map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: m.content.replace(/\[INTERNAL_THOUGHT\].*?\[\/INTERNAL_THOUGHT\]/gs, '').trim() }]
        }));

        await supabase.from('messages').insert({ session_id: session.id, sender: 'user', content: message.text });

        // 4. Gemini Call (2.5 Flash)
        let stats; try { stats = JSON.parse(session.lead_score); } catch (e) { }
        const systemPrompt = getSystemInstruction(stats, mediaList);

        const genAI = new GoogleGenAI({ apiKey: geminiKey });
        const chat = genAI.chats.create({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: systemPrompt,
                temperature: 1.3,
                responseMimeType: "application/json",
                responseSchema: responseSchema
            },
            history: history
        });

        const result = await chat.sendMessage({ message: message.text });
        const aiResponse = JSON.parse(result.text.replace(/```json/g, '').replace(/```/g, '').trim());

        // 5. Action Handlers (Pix & Check)
        let mediaUrl, mediaType;

        if (aiResponse.action === 'check_payment_status') {
            const { data: lastPay } = await supabase.from('messages').select('payment_data').eq('session_id', session.id).not('payment_data', 'is', null).order('created_at', { ascending: false }).limit(1).single();
            if (lastPay?.payment_data?.paymentId) {
                const stRes = await fetch(`${WIINPAY_BASE_URL}/payment/list/${lastPay.payment_data.paymentId}`, { headers: { 'Authorization': `Bearer ${WIINPAY_API_KEY}` } });
                const stData = await stRes.json();
                const isPaid = stData?.status === 'approved' || stData?.status === 'paid';
                const feedback = isPaid ? "[SYSTEM: PAGAMENTO CONFIRMADO! Mande o vídeo agora.]" : "[SYSTEM: Ainda não caiu. Peça pra ele conferir.]";
                // Recursive self-call to generate proper Lari response
                return handler({ ...req, body: { message: { ...message, text: feedback } } } as any, res);
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
                aiResponse.messages.push("copia e cola o pix aq amor:");
                aiResponse.messages.push(pixCode);
                paymentSaved = { paymentId: pixData?.data?.paymentId || pixData?.paymentId, value: val };
            }
        }

        // 6. Send to Telegram
        for (const msg of (aiResponse.messages || [])) {
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg }) });
            await new Promise(r => setTimeout(r, 600));
        }

        if (mediaUrl) {
            const method = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            const key = mediaType === 'video' ? 'video' : 'photo';
            await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, [key]: mediaUrl, caption: "🔥" }) });
        }

        // 7. Save to DB
        const thoughtLog = aiResponse.internal_thought ? `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n` : "";
        await supabase.from('messages').insert({ session_id: session.id, sender: 'bot', content: thoughtLog + aiResponse.messages.join('\n'), payment_data: paymentSaved });

        const updateData: any = {};
        if (aiResponse.extracted_user_name) updateData.user_name = aiResponse.extracted_user_name;
        if (aiResponse.lead_stats) updateData.lead_score = JSON.stringify(aiResponse.lead_stats);
        await supabase.from('sessions').update(updateData).eq('id', session.id);

        return res.status(200).send('ok');

    } catch (e: any) {
        console.error("FATAL ERROR:", e);
        return res.status(200).send('ok');
    }
}
