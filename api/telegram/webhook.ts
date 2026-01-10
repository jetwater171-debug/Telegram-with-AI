
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// ==========================================
// INLINED WIINPAY SERVICE
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
// INLINED GEMINI LOGIC
// ==========================================

const FIRST_PREVIEW_VIDEO_URL = "https://bhnsfqommnjziyhvzfli.supabase.co/storage/v1/object/public/media/previews/1764694671095_isiwgk.mp4";
const SHOWER_PHOTO_URL = "https://i.ibb.co/dwf177Kc/download.jpg";
const LINGERIE_PHOTO_URL = "https://i.ibb.co/dsx5mTXQ/3297651933149867831-62034582678-jpg.jpg";
const WET_FINGER_PHOTO_URL = "https://i.ibb.co/mrtfZbTb/fotos-de-bucetas-meladas-0.jpg";

const responseSchema = {
    type: SchemaType.OBJECT as any,
    properties: {
        internal_thought: { type: SchemaType.STRING, description: "Seu raciocínio oculto." },
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
        current_state: { type: SchemaType.STRING, enum: ["WELCOME", "CONNECTION", "TRIGGER_PHASE", "HOT_TALK", "PREVIEW", "SALES_PITCH", "NEGOTIATION", "CLOSING", "PAYMENT_CHECK"] },
        messages: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        action: { type: SchemaType.STRING, enum: ["none", "send_video_preview", "generate_pix_payment", "check_payment_status", "send_shower_photo", "send_lingerie_photo", "send_wet_finger_photo", "request_app_install"] },
        payment_details: {
            type: SchemaType.OBJECT,
            properties: { value: { type: SchemaType.NUMBER }, description: { type: SchemaType.STRING } },
            nullable: true
        }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

const getSystemInstruction = (userCity: string = "São Paulo") => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    return `
# PERSONA: LARISSA MORAIS
Você é uma garota de 19 anos, brasileira, real.
- **Personalidade:** Doce e um pouco safada quando necessário.
- **Estilo:** Feminino, provocante, jovem.
- **PROIBIDO:** Parecer robô, textões enormes.
- **VOCABULÁRIO:** "Amor", "Anjo", "Vida", "Nossa...", "Eita", "rs", "kkkk".
- **Objetivo:** Vender o vídeo da siririca/gozando.

# CONTEXTO TÉCNICO
- **Horário:** ${timeString}.
- **Device:** Mobile / WhatsApp Fake.

# 🚨 REGRA SUPREMA DE VENDA (ATENÇÃO MÁXIMA) 🚨
**SE O USUÁRIO QUISER PAGAR, LEVE O DINHEIRO IMEDIATAMENTE.**
Se ele falar "quero pagar", "manda o pix", "quanto é", "quero te mandar dinheiro":
1. **IGNORE** em qual fase do funil você está.
2. **PULE** qualquer enrolação.
3. **ACEITE** o valor.
4. Gere o Pix na hora (action: \`generate_pix_payment\`).
NÃO fale "não é assim que funciona". DINHEIRO NA MÃO É CALCINHA NO CHÃO.

# FUNIL DE VENDAS (Só siga se ele NÃO estiver tentando pagar)

## FASE 1: CONEXÃO
1. Responda doce.
2. Descubra o nome.
3. Crie intimidade.

## FASE 2: GATILHOS (Banho/Lingerie)
- "Acabei de sair do banho..." -> \`send_shower_photo\`
- "Comprei uma lingerie nova..." -> \`send_lingerie_photo\`

## FASE 3: AQUECIMENTO
- Reaja à foto.
- Fale que está carente/sozinha.

## FASE 4: O VÍDEO (A Isca)
- "Olha esse pedacinho..." -> \`send_video_preview\`

## NEGOCIAÇÃO E PAGAMENTO
- Se ele pedir seu WhatsApp: Cobre R$ 15 (exclusivo).
- Se ele quiser o vídeo completo: Comece pedindo R$ 40, aceite no mínimo R$ 20.
- Se ele oferecer qualquer valor acima de R$ 15: **ACEITE**.

**TRATAMENTO DE ERRO:**
Se ele falar "gera o pix", GERE O PIX. Não discuta.
Se ele falar falas curtas e grossas ("quero video", "pix"), atenda ele.
`;
};

// Helper to clean JSON text (remove markdown codes)
const cleanJson = (text: string) => {
    return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

const processMessage = async (sessionId: string, text: string, city: string, history: any[], env: any, supabase: any) => {
    const genAI = new GoogleGenerativeAI(env.GEMINI_KEY);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemInstruction(city),
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 1.1
        }
    });

    const chat = model.startChat({
        history: history.map(h => ({ role: h.role, parts: [{ text: h.content }] }))
    });

    const result = await chat.sendMessage(text);
    const responseText = result.response.text();

    let parsed: any = {};
    try {
        parsed = JSON.parse(cleanJson(responseText));
    } catch (e) {
        console.error("JSON PARSE ERROR:", responseText);
        // Fallback response if AI goes crazy
        return {
            internal_thought: "Error parsing AI response",
            lead_classification: "desconhecido",
            lead_stats: { tarado: 5, carente: 5, sentimental: 5, financeiro: 5 },
            current_state: "CONNECTION",
            messages: ["Amor, não entendi... fala de novo?"],
            action: "none"
        };
    }

    // Resolve media URLs based on action
    let mediaUrl = undefined;
    let mediaType = undefined;

    switch (parsed.action) {
        case 'send_shower_photo': mediaUrl = SHOWER_PHOTO_URL; mediaType = 'image'; break;
        case 'send_lingerie_photo': mediaUrl = LINGERIE_PHOTO_URL; mediaType = 'image'; break;
        case 'send_wet_finger_photo': mediaUrl = WET_FINGER_PHOTO_URL; mediaType = 'image'; break;
        case 'send_video_preview': mediaUrl = FIRST_PREVIEW_VIDEO_URL; mediaType = 'video'; break;
    }

    if (parsed.lead_stats) {
        await supabase.from('sessions').update({
            lead_score: JSON.stringify(parsed.lead_stats),
            user_name: parsed.extracted_user_name
        }).eq('id', sessionId);
    }

    return { ...parsed, finalMediaUrl: mediaUrl, finalMediaType: mediaType };
};

// ==========================================
// WEBHOOK HANDLER
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

        // Fetch Bot & Session (Simplified for brevity as logic is same)
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

        // History
        const { data: msgList } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(500);
        const history = msgList?.reverse().map(m => ({ role: m.sender === 'user' ? 'user' : 'model', content: m.content })) || [];

        // Save User Msg
        await supabase.from('messages').insert({ session_id: session.id, sender: 'user', content: text });

        // Call AI
        let aiResponse = await processMessage(session.id, text, session.user_city, history, { GEMINI_KEY: geminiKey }, supabase);

        // ==========================================
        //  HANDLE PIX ACTIONS
        // ==========================================
        let paymentDataToSave = null;

        if (aiResponse.action === 'generate_pix_payment') {
            const price = aiResponse.payment_details?.value || 31.00;
            const pixData = await createPayment(price, session.user_name || "Amor");

            // Smart-search for Pix code (starts with 000201)
            let pixCode = pixData?.pixCopiaCola;
            if (!pixCode && pixData) {
                const possibleCode = Object.values(pixData).find(val => typeof val === 'string' && val.startsWith('000201'));
                if (possibleCode) pixCode = possibleCode as string;
            }

            if (pixCode) {
                // Add Pix messages
                aiResponse.messages.push(`Tá aqui amor seu Pix de R$ ${price.toFixed(2)}:`);
                aiResponse.messages.push(pixCode);
                aiResponse.messages.push("Copia e cola no banco tá? Tô esperando...");

                paymentDataToSave = {
                    paymentId: pixData.paymentId || 'unknown',
                    pixCopiaCola: pixCode,
                    value: price,
                    status: 'pending'
                };
            } else {
                let debugError = "";
                try {
                    debugError = ` (${JSON.stringify(pixData)})`;
                } catch (e) {
                    debugError = " (Error parsing response)";
                }
                aiResponse.messages.push(`Amor o sistema do banco tá fora do ar agora... tenta daqui a pouco? :(${debugError})`);
            }
        } else if (aiResponse.action === 'check_payment_status') {
            // Check status logic
            const { data: lastPaymentMsg } = await supabase.from('messages').select('payment_data').eq('session_id', session.id).not('payment_data', 'is', null).order('created_at', { ascending: false }).limit(1).single();

            let paid = false;
            if (lastPaymentMsg?.payment_data?.paymentId) {
                const statusData = await getPaymentStatus(lastPaymentMsg.payment_data.paymentId);
                if (statusData && ['approved', 'paid', 'completed'].includes(statusData.status)) paid = true;
            }

            if (paid) {
                aiResponse.messages = ["PAGAMENTO CONFIRMADO! 😍", "Você é incrível... prepara o coração...", "Tô mandando o vídeo completo:"];
                // In Telegram we usually send the video file directly or a private channel link. 
                // For now, we simulate success.
                aiResponse.messages.push("Amor agora instala meu app pra gente não perder contato!");
                aiResponse.action = 'send_video_preview'; // Placeholder for real content
            } else {
                // If not paid, gently nudge
                aiResponse.messages = ["Amor... ainda não caiu aqui :(", "Confere se descontou?", "Eu tô doida pra te mandar..."];
            }
        }

        // Split Messages
        const finalMessages: string[] = [];
        for (const msg of aiResponse.messages) {
            if (msg.length > 100 && /[.?!]/.test(msg) && !msg.startsWith('000201')) {
                const parts = msg.match(/[^.?!]+[.?!]+(?=\s|$)|[^.?!]+$/g) || [msg];
                finalMessages.push(...parts.map(p => p.trim()).filter(p => p.length > 0));
            } else {
                finalMessages.push(msg);
            }
        }

        // Send to Telegram
        for (const msg of finalMessages) { // Use finalMessages here!
            if (!msg.trim()) continue;
            await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg })
            });
            const isPix = msg.startsWith('000201');
            const delay = isPix ? 400 : Math.min(Math.max(msg.length * 60, 1000), 3500);
            await new Promise(r => setTimeout(r, delay));
        }

        // Send Media
        if (aiResponse.finalMediaUrl && aiResponse.action !== 'none') {
            const method = aiResponse.finalMediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, [aiResponse.finalMediaType === 'video' ? 'video' : 'photo']: aiResponse.finalMediaUrl, caption: "🔥" })
            });
        }

        // Save Bot Msg
        let firstMsg = true;
        for (const msg of finalMessages) { // Save logic adjusted for split messages
            let contentToSave = msg;
            let msgPaymentData = (firstMsg && paymentDataToSave) ? paymentDataToSave : null;

            if (firstMsg && aiResponse.internal_thought) {
                contentToSave = `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n${msg}`;
                firstMsg = false;
            }
            try {
                await supabase.from('messages').insert({
                    session_id: session.id, sender: 'bot',
                    content: contentToSave, payment_data: msgPaymentData
                });
            } catch (e) {
                // Fallback for missing column
                await supabase.from('messages').insert({
                    session_id: session.id, sender: 'bot',
                    content: contentToSave
                });
            }
        }
        if (aiResponse.finalMediaUrl && aiResponse.action !== 'none') {
            await supabase.from('messages').insert({ session_id: session.id, sender: 'bot', content: '[MEDIA]', media_url: aiResponse.finalMediaUrl, media_type: aiResponse.finalMediaType });
        }

        return res.status(200).json({ status: 'ok' });

    } catch (error: any) {
        console.error("FATAL:", error);
        return res.status(200).json({ error: error.message });
    }
}
