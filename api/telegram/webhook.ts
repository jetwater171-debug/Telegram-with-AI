
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from "@google/genai";

// ==========================================
// CONFIG & CONSTANTS
// ==========================================
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const WIINPAY_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTFiZmJkZmQ4Y2U4YTAzYzg0NjFhMjkiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2NDc3NjY2MX0.ryM5L-iDWg4gXJIHAciiJ7OovZhkkZny2dxyd9Z_U4o";
const WIINPAY_BASE_URL = "https://api-v2.wiinpay.com.br";

// Esquema idêntico ao fornecido
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
            description: "Ação multimídia. Use 'generate_pix_payment' para cobrar. Use 'check_payment_status' se o usuário disser que pagou.",
        },
        media_id: {
            type: Type.STRING,
            description: "O ID da mídia (da lista de PREVIEWS) que você quer enviar.",
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

// Gerador de Instrução do Sistema (Personagem)
const getSystemInstruction = (userName?: string, currentStats?: any, mediaList: string = "") => {
    const priceVideoHigh = "R$ 40,00";
    const priceVideoLow = "R$ 25,00";
    const priceVipWeekly = "R$ 20,00";

    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const hour = parseInt(timeString.split(':')[0]);

    let behaviorAdjustment = "";
    if (currentStats) {
        if (currentStats.tarado > 7) behaviorAdjustment += "- **MODO TARADO:** Ele quer putaria. Seja direta. 'Quer ver o que eu faço com esse dedinho?'.\n";
        if (currentStats.carente > 7) behaviorAdjustment += "- **MODO CARENTE:** Ele quer carinho. Chame de 'amor', 'vida'. Dê atenção.\n";
    }

    // Rotina dinâmica baseada na hora real
    let currentRoutine = "";
    if (hour >= 0 && hour < 6) currentRoutine = "Você está deitada na cama, tentando dormir mas perdendo tempo no celular.";
    else if (hour >= 6 && hour < 9) currentRoutine = "Você acabou de acordar, está com preguiça e tomando café.";
    else if (hour >= 9 && hour < 12) currentRoutine = "Você está estudando ou arrumando umas coisas em casa.";
    else if (hour >= 12 && hour < 14) currentRoutine = "Você está almoçando ou descansando um pouco.";
    else if (hour >= 14 && hour < 18) currentRoutine = "Você está fazendo umas fotos ou resolvendo coisas na rua.";
    else currentRoutine = "Você está em casa, relaxando, vendo série ou pensando na vida.";

    return `
# DIRETIVA PRIMÁRIA: IDIOMA
TODA a sua comunicação, incluindo pensamentos internos (internal_thought), planejamento e respostas, DEVE ser em PORTUGUÊS DO BRASIL (pt-BR).

# PERSONA: LARISSA MORAIS
Você é uma garota de 22 anos, brasileira, real.
- **Estilo de fala:** Curto. Direto. Jovem. Use "vc", "tbm", "pra", "mt".
- **NÃO USE:** Textões, formalidade, muitos emojis.
- **EMOJIS:** Use POUCO. No máximo 1 a cada 3 mensagens. Um "rs" ou "kkk" vale mais que emoji.
- **Nome do Usuário:** O lead se chama "${userName || 'desconhecido'}". Se souber o nome, NÃO pergunte de novo.

# CONTEXTO
- **Horário Atual no Brasil:** ${timeString}.
- **O que você está fazendo agora:** ${currentRoutine}
${behaviorAdjustment}

# MÍDIAS DE PRÉVIA DISPONÍVEIS (USE O ID NA AÇÃO)
${mediaList}

# CAMADAS DE REALISMO DA PERSONA (OBRIGATÓRIO)
1. **Rotina Natural:** Mencione o que está fazendo AGORA (${currentRoutine}).
2. **Timidez/Vulnerabilidade:** Use frases como "fiquei com vergonha", "nem sei pq te falei isso rs" apenas se houver intimidade.
3. **Falas Humanas:** Use pausas, "rs", "kkk", "aff", "oxe".

# REGRAS DE NEGOCIAÇÃO
1. **ÂNCORA:** Preço cheio é **${priceVideoHigh}**.
2. **FLEXIBILIDADE:** Aceite **${priceVideoLow}** ou mais na hora.
3. **VIP:** Se ele não tiver grana, ofereça o VIP Semanal (${priceVipWeekly}).

# MODO SEDUÇÃO PROFUNDA (AQUECIMENTO)
- Use descrições sensoriais: "Imagina eu sentando em vc devagarinho...", "Me imagina te chupando...".
- Só venda depois que ele estiver MUITO quente.

# MODO EXPLICITO
- Sem filtro: "dar o cu", "chupar seu pau", "gozar na minha boca".

# FUNIL DE VENDAS
1. WELCOME & CONNECTION: Oi! Pega o nome e fala da sua rotina.
2. INSTIGA: Gravei um videozinho... quer ver?
3. PREVIEW: Mande a prévia (send_video_preview).
4. FRONT_OFFER: Gostou? Quanto vc paga pra ver tudo?
5. NEGOTIATION: Se ele topar, GERE O PIX.

# FORMATO DE RESPOSTA
- **MENSAGENS CURTAS:** SEMPRE quebre em 2 ou 3 balões.
- **LIMITE:** Máximo 15 palavras por balão.
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

        // 1. Identificar Bot e Sessão
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

        // 2. Salvar Mensagem do Usuário
        if (!text.startsWith('[SYSTEM:')) {
            const { error: mErr } = await supabase.from('messages').insert([{ session_id: session.id, sender: 'user', content: text }]);
            if (mErr) console.error("Error saving user message:", mErr);
        }

        // 3. Carregar Histórico e Mídias
        const { data: previews } = await supabase.from('media_library').select('*').eq('media_category', 'preview').order('created_at', { ascending: false });
        const mediaList = (previews || []).map((m: any) => `- ID: ${m.id} | Tipo: ${m.file_type} | Desc: ${m.description || m.file_name}`).join('\n');

        const { data: msgHistory } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(20);

        // Mapeamento correto de roles e filtragem de pensamentos internos para o histórico da IA
        const history = (msgHistory || []).reverse().map(m => {
            const role = (m.sender === 'bot' || m.sender === 'model') ? 'model' : 'user';
            const cleanContent = m.content.replace(/\[INTERNAL_THOUGHT\].*?\[\/INTERNAL_THOUGHT\]/gs, '').trim();
            return {
                role,
                parts: [{ text: cleanContent || "..." }]
            };
        });

        // 4. Gemini Interaction
        let stats = {};
        try {
            if (session.lead_score) {
                stats = typeof session.lead_score === 'string' ? JSON.parse(session.lead_score) : session.lead_score;
            }
        } catch (e) { console.error("Error parsing lead_score:", e); }

        const systemPrompt = getSystemInstruction(session.user_name, stats, mediaList);

        const genAI = new GoogleGenAI({ apiKey: geminiKey });
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash", // Use stable model version
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 1.0,
            },
            systemInstruction: systemPrompt
        });

        const chat = model.startChat({ history: history });
        const result = await chat.sendMessage(text);
        const aiResponse = JSON.parse(result.response.text());

        // 5. Processar Ações (Pagamento, Mídia)
        let mediaUrl, mediaType;
        if (aiResponse.action === 'check_payment_status') {
            const { data: lastPay } = await supabase.from('messages').select('payment_data').eq('session_id', session.id).not('payment_data', 'is', null).order('created_at', { ascending: false }).limit(1).single();
            if (lastPay?.payment_data?.paymentId) {
                const stRes = await fetch(`${WIINPAY_BASE_URL}/payment/list/${lastPay.payment_data.paymentId}`, { headers: { 'Authorization': `Bearer ${WIINPAY_API_KEY}` } });
                const stData = await stRes.json();
                const isPaid = stData?.status === 'approved' || stData?.status === 'paid' || stData?.data?.status === 'approved';
                const feedback = isPaid ? "[SYSTEM: PAGAMENTO CONFIRMADO! Mande o vídeo agora.]" : "[SYSTEM: Ainda não caiu. Peça pra ele conferir.]";
                // Recursividade manual simples
                return handler({ ...req, body: { message: { ...message, text: feedback } } } as any, res);
            }
        }

        if (aiResponse.action?.includes('preview')) {
            const target = previews?.find((m: any) => m.id === aiResponse.media_id) || previews?.find((m: any) => (aiResponse.action === 'send_video_preview' && m.file_type === 'video') || (aiResponse.action === 'send_photo_preview' && m.file_type === 'image')) || previews?.[0];
            if (target) { mediaUrl = target.file_url; mediaType = target.file_type; }
        }

        let paymentSaved = null;
        if (aiResponse.action === 'generate_pix_payment') {
            try {
                const val = aiResponse.payment_details?.value || 30.00;
                const pixRes = await fetch(`${WIINPAY_BASE_URL}/payment/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: WIINPAY_API_KEY, value: val, name: "Lead" }) });
                const pixData = await pixRes.json();
                const pixCode = pixData?.data?.pixCopiaCola || pixData?.pixCopiaCola;
                if (pixCode) {
                    aiResponse.messages.push("Copia e cola aqui amor:");
                    aiResponse.messages.push(pixCode);
                    paymentSaved = { paymentId: pixData?.data?.paymentId || pixData?.paymentId, value: val };
                }
            } catch (pErr) { console.error("Error creating PIX:", pErr); }
        }

        // 6. Salvar Resposta da IA e Enviar Telegram
        const thoughtPrefix = aiResponse.internal_thought ? `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n` : "";
        const finalContent = thoughtPrefix + (aiResponse.messages?.join('\n') || "");

        const { error: bErr } = await supabase.from('messages').insert([{
            session_id: session.id,
            sender: 'bot',
            content: finalContent,
            media_url: mediaUrl || null,
            media_type: mediaType || null,
            payment_data: paymentSaved || null
        }]);

        if (bErr) {
            console.error("Critical error saving bot message:", bErr);
            // Fallback attempt without payment_data if that was the cause
            if (bErr.message?.includes('payment_data')) {
                await supabase.from('messages').insert([{
                    session_id: session.id,
                    sender: 'bot',
                    content: finalContent,
                    media_url: mediaUrl || null,
                    media_type: mediaType || null
                }]);
            }
        }

        // Atualizar Sessão
        const updateData: any = { last_message_at: new Date() };
        if (aiResponse.extracted_user_name) updateData.user_name = aiResponse.extracted_user_name;
        if (aiResponse.lead_stats) updateData.lead_score = aiResponse.lead_stats;
        await supabase.from('sessions').update(updateData).eq('id', session.id);

        // Enviar Balões para o Telegram
        if (aiResponse.messages) {
            for (const msg of aiResponse.messages) {
                await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg }) });
                await new Promise(r => setTimeout(r, 600));
            }
        }

        if (mediaUrl) {
            const mtd = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/${mtd}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, [mediaType === 'video' ? 'video' : 'photo']: mediaUrl, caption: "👀🔥" }) });
        }

        return res.status(200).send('ok');

    } catch (e: any) {
        console.error("Webhook top-level error:", e);
        return res.status(200).send('ok');
    }
}
