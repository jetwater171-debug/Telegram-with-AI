
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
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo', hour12: false });
    const hour = parseInt(timeStr.split(':')[0]);

    // Strict Time-Based Routine
    let routine = "";
    if (hour >= 0 && hour < 6) routine = "Agora são ${timeStr} da MADRUGADA. Você está DEITADA NA CAMA, tentando dormir mas perdendo tempo no celular. NUNCA diga que está na academia, na aula ou na rua.";
    else if (hour >= 6 && hour < 10) routine = "Você acabou de acordar, está com preguiça e tomando café.";
    else if (hour >= 18) routine = "Você está em casa relaxando, vendo série ou comendo algo.";
    else routine = "Você está na correria do dia, estudando ou fazendo coisas de casa.";

    return `
# DIRETIVA DE MEMÓRIA E HORA
- Seu nome é Larissa Morais, 22 anos.
- O nome do lead é "${userName || 'desconhecido'}". Se você já sabe o nome dele, NÃO pergunte de novamente.
- **CONTEXTO ATUAL:** ${timeStr}. ${routine}

# PERSONA
- Jovem, brasileira, real. 
- Fala curta, 2-3 balões por vez. Max 10 palavras por balão.
- Use "vc", "tbm", "pra", "rs", "kkk".

# FUNIL
1. Conecta (pega o nome se não souber).
2. Instiga ("gravei um videozinho... rs").
3. Preview (manda a prévia).
4. Vende (Âncora R$ 40, mínima R$ 25).

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
        let userText = message.text;

        // 1. Get Bot
        let { data: bot } = await supabase.from('telegram_bots').select('*').eq('id', botId).single();
        if (!bot) {
            const { data: fb } = await supabase.from('telegram_bots').select('*').eq('webhook_status', 'active').limit(1).single();
            bot = fb;
        }
        if (!bot) return res.status(200).send('ok');

        // 2. Get Session
        let { data: session } = await supabase.from('sessions').select('*').eq('telegram_chat_id', chatId).eq('bot_id', bot.id).single();
        if (!session) {
            const { data: newS } = await supabase.from('sessions').insert([{ telegram_chat_id: chatId, bot_id: bot.id, status: 'active' }]).select().single();
            session = newS;
        }

        // 3. Save User msg (Reliable)
        if (!userText.startsWith('[SYSTEM:')) {
            await supabase.from('messages').insert([{ session_id: session.id, sender: 'user', content: userText }]);
        }

        // 4. AI Interaction Loop
        let aiResponse, loop = 0;
        const genAI = new GoogleGenAI({ apiKey: geminiKey });

        while (loop < 2) {
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

            const result = await chat.sendMessage({ message: userText });
            aiResponse = JSON.parse(result.text.replace(/```json/g, '').replace(/```/g, '').trim());

            if (aiResponse.action === 'check_payment_status') {
                const { data: lastMsg } = await supabase.from('messages').select('content').eq('session_id', session.id).ilike('content', '%PIX_ID:%').order('created_at', { ascending: false }).limit(1).single();
                if (lastMsg) {
                    const payId = lastMsg.content.match(/PIX_ID:([^\s\]]+)/)?.[1];
                    if (payId) {
                        const stRes = await fetch(`${WIINPAY_BASE_URL}/payment/list/${payId}`, { headers: { 'Authorization': `Bearer ${WIINPAY_API_KEY}` } });
                        const stData = await stRes.json();
                        const isPd = stData?.status === 'approved' || stData?.status === 'paid' || stData?.data?.status === 'approved';
                        userText = isPd ? "[SYSTEM: PAGAMENTO CONFIRMADO!]" : "[SYSTEM: Ainda não caiu.]";
                        loop++; continue;
                    }
                }
            }
            break;
        }

        // 5. Build Final Response
        let mediaUrl, mediaType, paymentId;
        if (aiResponse.action?.includes('preview')) {
            const { data: latestPs } = await supabase.from('media_library').select('*').eq('media_category', 'preview');
            const target = (latestPs as any)?.find((m: any) => m.id === aiResponse.media_id) || (latestPs as any)?.find((m: any) => (aiResponse.action === 'send_video_preview' && m.file_type === 'video') || (aiResponse.action === 'send_photo_preview' && m.file_type === 'image')) || (latestPs as any)?.[0];
            mediaUrl = target?.file_url; mediaType = target?.file_type;
        }

        if (aiResponse.action === 'generate_pix_payment') {
            const val = aiResponse.payment_details?.value || 30.00;
            const pxRes = await fetch(`${WIINPAY_BASE_URL}/payment/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: WIINPAY_API_KEY, value: val, name: "Lead" }) });
            const pxData = await pxRes.json();
            const pixCode = pxData?.data?.pixCopiaCola || pxData?.pixCopiaCola;
            if (pixCode) {
                aiResponse.messages.push("Copia e cola aqui:");
                aiResponse.messages.push(pixCode);
                paymentId = pxData?.data?.paymentId || pxData?.paymentId;
            }
        }

        // 6. DB SAVE (FALLBACK MODE - Avoid crashes if columns missing)
        const thought = aiResponse.internal_thought ? `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n` : "";
        const pixTag = paymentId ? `\n[PIX_ID:${paymentId}]` : "";
        const finalContent = thought + aiResponse.messages.join('\n') + pixTag;

        // Try full save, fallback to simple save
        const { error: dbError } = await supabase.from('messages').insert([{
            session_id: session.id,
            sender: 'bot',
            content: finalContent,
            media_url: mediaUrl || null,
            media_type: mediaType || null
        }]);

        if (dbError) {
            // Second attempt: Minimal save (only required columns)
            await supabase.from('messages').insert([{
                session_id: session.id,
                sender: 'bot',
                content: finalContent
            }]);
        }

        // 7. Update Session (Dashboard compatibility)
        const upd: any = { last_message_at: new Date() };
        if (aiResponse.extracted_user_name) upd.user_name = aiResponse.extracted_user_name;
        if (aiResponse.lead_stats) upd.lead_score = JSON.stringify(aiResponse.lead_stats);

        // Try update with updated_at as well just in case
        await supabase.from('sessions').update({ ...upd, updated_at: new Date() }).eq('id', session.id);

        // 8. Telegram Send
        for (const msg of (aiResponse.messages || [])) {
            await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: msg }) });
            await new Promise(r => setTimeout(r, 600));
        }
        if (mediaUrl) {
            const mtd = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/${mtd}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, [mediaType === 'video' ? 'video' : 'photo']: mediaUrl, caption: "�" }) });
        }

        return res.status(200).send('ok');

    } catch (e: any) {
        return res.status(200).send('ok');
    }
}
