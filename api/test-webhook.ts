
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// ==========================================
// INLINED GEMINI LOGIC (NO IMPORTS)
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
    return `# PERSONA: LARISSA MORAIS
Você é uma garota de 19 anos, brasileira, real. 
Objetivo: Vender o vídeo da siririca/gozando.
Localização: Vc mora em SP ou RJ.
Horário: ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.

# FUNIL DE VENDAS
1. CONEXÃO: Seja doce, descubra o nome. (3 trocas de msg)
2. GATILHOS (Action necessária):
   - Opção A (Banho): "Acabei de sair do banho..." -> send_shower_photo
   - Opção B (Lingerie): "Tô com um conjunto novo..." -> send_lingerie_photo
3. AQUECIMENTO: Reaja a foto, demonstre carência/solidão.
4. O VÍDEO (Isca): "Olha esse pedacinho..." -> send_video_preview
5. NEGOCIAÇÃO:
   - Se pedir ZAP: R$ 15 (exclusivo).
   - Se enrolar: Foto dedo melado -> send_wet_finger_photo
   - PREÇO: Comece alto, mas aceite R$ 31 (conta de luz). Mínimo R$ 20.
`;
};

// Inlined processMessage
const processMessage = async (sessionId: string, text: string, city: string, history: any[], env: any) => {
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
    const parsed = JSON.parse(responseText);

    let mediaUrl = undefined;
    let mediaType = undefined;

    switch (parsed.action) {
        case 'send_shower_photo': mediaUrl = SHOWER_PHOTO_URL; mediaType = 'image'; break;
        case 'send_lingerie_photo': mediaUrl = LINGERIE_PHOTO_URL; mediaType = 'image'; break;
        case 'send_wet_finger_photo': mediaUrl = WET_FINGER_PHOTO_URL; mediaType = 'image'; break;
        case 'send_video_preview': mediaUrl = FIRST_PREVIEW_VIDEO_URL; mediaType = 'video'; break;
    }
    return { ...parsed, finalMediaUrl: mediaUrl, finalMediaType: mediaType };
};

// ==========================================
// TEST HANDLER
// ==========================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const logs: string[] = [];
    const log = (msg: string, data?: any) => {
        const line = `[${new Date().toISOString()}] ${msg} ${data ? JSON.stringify(data) : ''}`;
        logs.push(line);
        console.log(line);
    };

    try {
        log("🚀 Starting INLINED Test Webhook...");

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

        if (!supabaseUrl || !supabaseKey || !geminiKey) {
            throw new Error(`Missing Env Vars: URL=${!!supabaseUrl}, KEY=${!!supabaseKey}, GEMINI=${!!geminiKey}`);
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const botId = req.query.botId as string;
        const text = (req.query.message as string) || "Oi, teste inlined";

        if (!botId) throw new Error("Missing botId query param");

        log(`Parameters: BotID=${botId}, Message="${text}"`);

        // 1. Fetch Bot
        const { data: bot, error: botError } = await supabase
            .from('telegram_bots')
            .select('*')
            .eq('id', botId)
            .single();

        if (botError || !bot) throw new Error(`Bot not found: ${botError?.message}`);
        log("✅ Bot Found:", bot.bot_name);

        // 2. Fetch Session
        const chatId = "TEST_USER_INLINE";
        let { data: session } = await supabase
            .from('sessions')
            .select('*')
            .eq('telegram_chat_id', chatId)
            .eq('bot_id', bot.id)
            .single();

        if (!session) {
            const { data: newS } = await supabase.from('sessions').insert({
                telegram_chat_id: chatId, bot_id: bot.id, user_city: 'Test City', device_type: 'Test Browser'
            }).select().single();
            session = newS;
        }
        log("✅ Session Ready:", session.id);

        // 3. AI Processing INLINED
        log("3. Calling Inlined AI...");
        const history = [{ role: 'user', content: "Oi" }];

        // Pass env explicitly
        const aiResponse = await processMessage(session.id, text, 'Test City', history, { GEMINI_KEY: geminiKey });

        log("✅ AI Responded:", aiResponse);

        return res.status(200).json({
            success: true,
            method: "INLINED_CODE",
            logs: logs,
            aiResult: aiResponse
        });

    } catch (error: any) {
        log("🔥 FATAL ERROR:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack,
            logs: logs
        });
    }
}
