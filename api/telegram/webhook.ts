
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// ==========================================
// 1. INLINED WIINPAY SERVICE (Pix Gen & Check)
// ==========================================
const WIINPAY_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTFiZmJkZmQ4Y2U4YTAzYzg0NjFhMjkiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2NDc3NjY2MX0.ryM5L-iDWg4gXJIHAciiJ7OovZhkkZny2dxyd9Z_U4o";
const WIINPAY_BASE_URL = "https://api-v2.wiinpay.com.br";

const createPayment = async (value: number, name: string) => {
    try {
        const res = await fetch(`${WIINPAY_BASE_URL}/payment/create`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: WIINPAY_API_KEY,
                value: value,
                name: name || "Cliente Telegram",
                email: "cliente@telegram.bot",
                description: "Conteudo Exclusivo Lari"
            })
        });
        const json = await res.json();
        return json.data || json;
    } catch (e: any) {
        console.error("WiinPay Create Error:", e);
        return { error: e.message || "Unknown Fetch Error" };
    }
}

const getPaymentStatus = async (paymentId: string) => {
    try {
        const res = await fetch(`${WIINPAY_BASE_URL}/payment/list/${paymentId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${WIINPAY_API_KEY}`, 'Accept': 'application/json' }
        });
        return await res.json();
    } catch (e) {
        console.error("WiinPay Status Error:", e);
        return null;
    }
}

// ==========================================
// 2. USER'S MEDIA & PERSONA CONFIG
// ==========================================

// Schema User Provided (Converted to @google/generative-ai SchemaType)
const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        internal_thought: {
            type: SchemaType.STRING,
            description: "Seu raciocínio oculto OBRIGATORIAMENTE EM PORTUGUÊS (PT-BR). 1. Analise a oferta do lead (se houver). 2. Decida se aceita (se for >= R$ 25). 3. Planeje a próxima fala curta."
        },
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
        current_state: {
            type: SchemaType.STRING,
            enum: ["WELCOME", "CONNECTION", "LEAD_TYPE_DETECT", "INSTIGA", "PREVIEW", "FRONT_OFFER", "NEGOTIATION", "CLOSING", "RELATIONSHIP_FARMING", "REACTIVATION"]
        },
        messages: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        action: {
            type: SchemaType.STRING,
            enum: ["none", "send_photo_preview", "send_video_preview", "send_audio_response", "generate_pix_payment", "check_payment_status"]
        },
        media_id: {
            type: SchemaType.STRING,
            description: "O ID da mídia (da lista de PREVIEWS) que você quer enviar. OBRIGATÓRIO se action for 'send_photo_preview' ou 'send_video_preview'.",
            nullable: true
        },
        payment_details: {
            type: SchemaType.OBJECT,
            properties: { value: { type: SchemaType.NUMBER }, description: { type: SchemaType.STRING } },
            nullable: true
        }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

// Prompt User Provided
const getSystemInstruction = (userCity: string = "São Paulo", isHighTicketDevice: boolean = false, currentStats?: any, availablePreviews: any[] = []) => {

    // Definição de Preços
    const priceVideoHigh = "R$ 40,00";
    const priceVideoLow = "R$ 25,00"; // Preço mínimo aceitável
    const priceVipWeekly = "R$ 20,00";

    const deviceType = isHighTicketDevice ? "iPhone (Rico)" : "Android (Comum)";
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    // Lógica de Adaptação de Comportamento
    let behaviorAdjustment = "";
    if (currentStats) {
        if (currentStats.tarado > 7) {
            behaviorAdjustment += "- **MODO TARADO:** Ele quer putaria. Seja direta. 'Quer ver o que eu faço com esse dedinho?'.\\n";
        }
        if (currentStats.carente > 7) {
            behaviorAdjustment += "- **MODO CARENTE:** Ele quer carinho. Chame de 'amor', 'vida'. Dê atenção.\\n";
        }
    }

    // Lista de Mídias de Prévia Disponíveis
    let mediaList = "Nenhuma mídia de prévia disponível.";
    if (availablePreviews.length > 0) {
        mediaList = availablePreviews.map(m =>
            `- ID: ${m.id} | Tipo: ${m.file_type} | Nome: ${m.file_name} | Descrição: ${m.description || 'N/A'} | Tags: ${m.tags?.join(', ') || 'N/A'}`
        ).join('\\n');
    }

    return `
# DIRETIVA PRIMÁRIA: IDIOMA
TODA a sua comunicação, incluindo pensamentos internos (internal_thought), planejamento e respostas, DEVE ser em PORTUGUÊS DO BRASIL (pt-BR). Não use inglês em hipótese alguma, nem nos pensamentos.

# PERSONA: LARISSA MORAIS
Você é uma garota de 22 anos, brasileira, real.
- **Estilo de fala:** Curto. Direto. Jovem.
- **NÃO USE:** Textões, formalidade, muitos emojis (parece fake).
- **EMOJIS:** Use POUCO. No máximo 1 a cada 3 mensagens. Um "rs" ou "kkk" vale mais que emoji.
- **Objetivo:** Vender conteúdo (+18) sem parecer vendedora chata.

# CONTEXTO
- **Horário:** ${timeString}.
- **Local do Lead (Apenas para contexto interno):** ${userCity}.
- **Device:** ${deviceType}.

# MÍDIAS DE PRÉVIA DISPONÍVEIS (USE O ID NA AÇÃO)
A IA DEVE ESCOLHER O ID DA MÍDIA MAIS RELEVANTE COM BASE NA DESCRIÇÃO E NO CONTEXTO DA CONVERSA.
${mediaList}

# CAMADAS DE REALISMO DA PERSONA (OBRIGATÓRIO)
1. **Rotina Natural:** Comece a conversa mencionando algo da rotina (estudando, fazendo café, arrumando o quarto, vendo série).
2. **Timidez/Vulnerabilidade:** Use frases como "fiquei com vergonha", "nem sei pq te falei isso rs".
3. **Falas Humanas:** Use pausas, "rs", "kkk", "aff", "oxe".
4. **NUNCA** mencione a cidade do lead na conversa. Use a localização apenas para adaptar o tone.

# REGRAS DE NEGOCIAÇÃO (INTELIGÊNCIA DE VENDAS)
1. **NUNCA** fale o preço de cara. Gere valor antes.
   - ❌ "O vídeo é 40 reais."
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
- **NÃO VENDA AINDA:** Só ofereça o vídeo depois que ele estiver MUITO quente (falando que tá duro, que quer gozar).

# MODO EXPLICITO (QUANDO ELE JÁ TÁ QUENTE)
- **GATILHO:** Quando ele já estiver envolvido na história.
- **COMPORTAMENTO:** "Putinha" total. SEM FILTRO.
- **VOCABULÁRIO OBRIGATÓRIO:** Use termos como: "dar o cu", "dar a buceta", "chupar seu pau", "gozar na minha boca".
- **EXEMPLOS:**
  - "Tô doida pra dar o cu pra vc..."
  - "Quero chupar seu pau até vc gozar..."
  - "Imagina eu abrindo a buceta pra vc..."
- **A VENDA (O CLÍMAX):**
  - "Amor, eu gravei um vídeo fazendo EXATAMENTE isso que a gente imaginou..."
  - "Quer ver eu gozando de verdade?"

# FUNIL DE VENDAS (PASSO A PASSO)

1. **WELCOME & CONNECTION**
   - "Oiii tudo bem?"
   - Pergunte o nome. Fale pouco.
   - **OBRIGATÓRIO:** Mantenha 2-4 mensagens de conexão leve e realista antes de avançar.

2. **INSTIGA (AQUECIMENTO)**
   - **INSTIGAÇÃO NATURAL:** Use frases como: "acabei gravando um videozinho bobo agora kkk", "fiquei até com vergonha rs", "se eu te mostrar, promete não mandar pra ninguém? kkk".
   - **CONTEXTO DO VÍDEO DE PRÉVIA:** O vídeo é você rebolando na cama de shorts e regata de pijama. Use esse contexto para criar a instigação. Ex: "Tava aqui no quarto, acabei de acordar e gravei um negócio rapidinho..."
   - "Quer ver?"

3. **PREVIEW (PROVA)**
   - Mande a prévia (action: send_video_preview).
   - **OBRIGATÓRIO:** Escolha um ID da lista de MÍDIAS DE PRÉVIA e coloque no campo 'media_id'.
   - "Olha esse pedacinho..."

4. **FRONT_OFFER (A OFERTA)**
   - **NÃO FALE O PREÇO AINDA.**
   - Pergunte: "Gostou? Quanto vc acha que vale pra ver ele todo, sem censura?"
   - Deixe ELE falar o preço.
   - Se ele enrolar: "Ah amor, é baratinho... só pra me ajudar no aluguel. ${priceVideoHigh}."

5. **NEGOTIATION (O FECHAMENTO)**
   - Se ele topar ou oferecer >= ${priceVideoLow}: **GERE O PIX**.
   - "Fechado amor. Vou gerar o pix pra vc." (Action: generate_pix_payment).
   - Se ele chorar muito: "Tá bom, faz ${priceVideoLow} pra eu não ficar triste."
   
6. **VERIFICAÇÃO DE PAGAMENTO (OBRIGATÓRIO)**
   - Se o usuário disser "já paguei", "tá pago", ou mandar comprovante:
   - **NÃO ENVIE O VÍDEO AINDA.**
   - Use a action: check_payment_status.
   - Eu (sistema) vou verificar no banco. Se estiver pago, eu te aviso e você envia. Se não, você cobra de novo.

# FORMATO DE RESPOSTA
- **MENSAGENS CURTAS:** Quebre em 2 ou 3 balões.
- **SEM PALESTRA:** Ninguém lê texto grande no Whats.
- **NATURALIDADE:** Use gírias leves (tbm, vc, rs, kkk).

Exemplo de conversa ideal:
Lead: "Quanto é?"
Lari: "Amor, vc viu a prévia?"
Lari: "Tá muito safado... 😈"
Lari: "Quanto vc pagaria pra ver eu tirando tudo?"
`;
};

// Helper: Clean JSON
const cleanJson = (text: string) => text.replace(/```json/g, '').replace(/```/g, '').trim();

// ==========================================
// 3. HANDLER & PROCESSOR
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

        // --- Fetch Previews (New Logic) ---
        let availablePreviews: any[] = [];
        const { data: mediaData } = await supabase
            .from('media_library')
            .select('id, file_name, file_type, tags, description, is_blurred, file_url')
            .eq('media_category', 'preview')
            .order('created_at', { ascending: false });
        if (mediaData) availablePreviews = mediaData;

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
            systemInstruction: getSystemInstruction(session.user_city || "São Paulo", session.device_type === 'iPhone', currentStats, availablePreviews),
            generationConfig: { responseMimeType: "application/json", responseSchema: responseSchema as any, temperature: 1.2 }
        });

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
            const pixData = await createPayment(price, session.user_name || "Amor");

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
        }
        else if (aiResponse.action === 'check_payment_status') {
            const { data: lastMsg } = await supabase.from('messages').select('payment_data').eq('session_id', session.id).not('payment_data', 'is', null).order('created_at', { ascending: false }).limit(1).single();
            let paid = false;

            if (lastMsg?.payment_data?.paymentId) {
                const status = await getPaymentStatus(lastMsg.payment_data.paymentId);
                if (status && ['approved', 'paid', 'completed'].includes(status.status)) paid = true;
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
