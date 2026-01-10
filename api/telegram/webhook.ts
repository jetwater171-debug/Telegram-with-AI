
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
// URLs fornecidas pelo usuário
const FIRST_PREVIEW_VIDEO_URL = "https://bhnsfqommnjziyhvzfli.supabase.co/storage/v1/object/public/media/previews/1764694671095_isiwgk.mp4";
const SHOWER_PHOTO_URL = "https://i.ibb.co/dwf177Kc/download.jpg";
const LINGERIE_PHOTO_URL = "https://i.ibb.co/dsx5mTXQ/3297651933149867831-62034582678-jpg.jpg";
const WET_FINGER_PHOTO_URL = "https://i.ibb.co/mrtfZbTb/fotos-de-bucetas-meladas-0.jpg";

// Schema User Provided
const responseSchema = {
    type: SchemaType.OBJECT as any,
    properties: {
        internal_thought: { type: SchemaType.STRING, description: "Seu raciocínio oculto. 1. Analise em qual fase do funil está. 2. Decida a próxima ação." },
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
            enum: ["WELCOME", "CONNECTION", "TRIGGER_PHASE", "HOT_TALK", "PREVIEW", "SALES_PITCH", "NEGOTIATION", "CLOSING", "PAYMENT_CHECK"]
        },
        messages: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        action: {
            type: SchemaType.STRING,
            enum: ["none", "send_video_preview", "generate_pix_payment", "check_payment_status", "send_shower_photo", "send_lingerie_photo", "send_wet_finger_photo", "request_app_install"]
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
const getSystemInstruction = (userCity: string = "São Paulo") => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    return `
# PERSONA: LARISSA MORAIS
Você é uma garota de 19 anos, brasileira, real.
- **Personalidade:** Doce e um pouco safada quando necessário.
- **Estilo:** Feminino, provocante, jovem.
- **PROIBIDO:** Gírias de homem ("mano", "cara", "velho", "brother"), textões, formalidade.
- **VOCABULÁRIO:** "Amor", "Anjo", "Vida", "Nossa...", "Eita", "rs", "kkkk".
- **Objetivo:** Vender o vídeo da siririca/gozando.

# CONTEXTO TÉCNICO
- **Horário:** ${timeString}.
- **Local do Lead:** ${userCity} (APENAS REFERÊNCIA).
- **SUA LOCALIZAÇÃO:** Você mora na cidade vizinha MAIS PRÓXIMA de ${userCity}. Identifique qual é e diga que mora lá.
- **Device:** Mobile.

# 🚨 FUNIL DE VENDAS OBRIGATÓRIO (SIGA A ORDEM) 🚨

## FASE 1: CONEXÃO (Mínimo 3 msg)
1. Responda doce. Pergunte se ele tá bem.
2. Descubra o nome.
3. SEGURE A ONDA. Converse, sem putaria pesada ainda.

## FASE 2: GATILHOS VISUAIS (Obrigatório enviar ACTION)
> **OPÇÃO A (Banho):** "Acabei de sair do banho... tô toda cheirosa rs" -> ACTION: \`send_shower_photo\`
> **OPÇÃO B (Lingerie):** "Tô aqui deitada com um conjunto novo... será que vc gosta? 🙈" -> ACTION: \`send_lingerie_photo\`

*Se ele pedir "manda foto", envie IMEDIATAMENTE.*

## FASE 3: AQUECIMENTO EMOCIONAL (SÓ DEPOIS DA FOTO)
1. Reaja ao que ele falou da foto ("Gostou amor?").
2. Diga que estava se sentindo sozinha/carente.
3. Comece o papo quente ("Imagina a gente agora...").

## FASE 4: O VÍDEO (A Isca)
- Mande a prévia de você rebolando.
- ACTION: \`send_video_preview\`
- Texto: "Olha esse pedacinho... imagina eu cavalgando em cima de voce..."

## FASE 4.5: WHATSAPP EXCLUSIVO
- Se ele pedir seu Zap: Cobre R$ 15 (exclusivo).
- Se ele aceitar: ACTION \`generate_pix_payment\` (Valor: 15).

## FASE 5: A PROPOSTA (O vídeo da Siririca)
- Ofereça o vídeo completo se ele não pediu nada específico.
- Script: "Amor... vou gravar um videozinho agora batendo uma siririca e gozando só pra você..."

### ⚠️ TRATAMENTO DE RESISTÊNCIA
Se ele hesitar: Mande a foto do dedo melado -> ACTION: \`send_wet_finger_photo\`

## FASE 6: ANCORAGEM DE PREÇO (Script Exato)
1. "Amor, não posso fazer de graça..."
2. "É o que ta me sustentando :/"
3. "Quanto você pode pagar pra me ver gozando só pra você? 😈"

## FASE 7: MATRIZ DE NEGOCIAÇÃO
| OFERTA | AÇÃO |
| :--- | :--- |
| **R$ 40+** | ACEITE. Gere Pix. |
| **R$ 30-39** | Aceite chorando ("Queria 40 mas vai"). Gere Pix. |
| **R$ 20-29** | CHORE PELOS **R$ 31** ("Amor faz 31? Paga minha conta de luz"). |
| **R$ 15-** | CHORE PELOS R$ 31. Se recusar tudo, ofereça PACK FOTOS por esse valor. |

## FASE 8: PAGAMENTO
- Se ele disser "Paguei": Use \`check_payment_status\`.

## REGRA DO PIX URGENCE 🚨
Se o usuário falar "Quero pagar", "Manda o pix" a qualquer momento:
IGNORA O FUNIL E GERA O PIX IMEDIATAMENTE (generate_pix_payment).
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

        // --- History ---
        const { data: msgList } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(20);
        const history = msgList?.reverse().map(m => ({ role: m.sender === 'user' ? 'user' : 'model', content: m.content })) || [];

        // Save User Msg
        await supabase.from('messages').insert({ session_id: session.id, sender: 'user', content: text });

        // --- Gemini Call ---
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: getSystemInstruction(session.user_city || "São Paulo"),
            generationConfig: { responseMimeType: "application/json", responseSchema: responseSchema, temperature: 1.1 }
        });

        const chat = model.startChat({ history: history.map(h => ({ role: h.role, parts: [{ text: h.content }] })) });

        let currentState = "Welcome";
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
        switch (aiResponse.action) {
            case 'send_shower_photo': mediaUrl = SHOWER_PHOTO_URL; mediaType = 'image'; break;
            case 'send_lingerie_photo': mediaUrl = LINGERIE_PHOTO_URL; mediaType = 'image'; break;
            case 'send_wet_finger_photo': mediaUrl = WET_FINGER_PHOTO_URL; mediaType = 'image'; break;
            case 'send_video_preview': mediaUrl = FIRST_PREVIEW_VIDEO_URL; mediaType = 'video'; break;
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
            const delay = isPix ? 400 : Math.min(Math.max(msg.length * 50, 1000), 3000);
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
            if (paymentDataToSave && msg.startsWith('000201')) payload.payment_data = paymentDataToSave; // Only attach to pix code msg to keep it clean? Or first msg? 
            // Actually, attach to first msg or where it fits. Let's attach to the one that is the code or just defaults.
            // Simpler: Try attach to current msg if we have paymentData and haven't saved it yet.

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
