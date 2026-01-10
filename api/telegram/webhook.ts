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
            description: "Seu raciocínio oculto em PT-BR. 1. Analise o estágio do funil. 2. Decida a ação (foto, video, pix). 3. Planeje a fala.",
        },
        lead_classification: {
            type: Type.STRING,
            enum: ["carente", "tarado", "curioso", "frio", "desconhecido"],
            description: "Classificação principal do lead.",
        },
        lead_stats: {
            type: Type.OBJECT,
            properties: {
                tarado: { type: Type.NUMBER, description: "Nível de interesse sexual (0-10)" },
                carente: { type: Type.NUMBER, description: "Nível de necessidade de atenção (0-10)" },
                sentimental: { type: Type.NUMBER, description: "Nível de conexão emocional (0-10)" },
                financeiro: { type: Type.NUMBER, description: "Poder aquisitivo percebido (0-10)" },
            },
            required: ["tarado", "carente", "sentimental", "financeiro"],
            description: "Pontuação detalhada do perfil.",
        },
        extracted_user_name: {
            type: Type.STRING,
            nullable: true,
            description: "Nome do usuário, se identificado."
        },
        current_state: {
            type: Type.STRING,
            enum: ["CONEXAO", "GATILHOS_VISUAIS", "AQUECIMENTO", "VIDEO_ISCA", "WHATSAPP_EXCLUSIVO", "PROPOSTA_SIRIRICA", "ANCORAGEM", "NEGOCIACAO", "PAGAMENTO", "INSTALACAO_APP"],
            description: "O estágio exato do Funil de Vendas onde você está.",
        },
        messages: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Array de mensagens. MÁXIMO 15 palavras por balão. Mínimo 2 balões por resposta. Linguagem informal e sedutora.",
        },
        action: {
            type: Type.STRING,
            enum: ["none", "send_shower_photo", "send_lingerie_photo", "send_wet_finger_photo", "send_video_preview", "generate_pix_payment", "check_payment_status", "request_app_install"],
            description: "Ação a ser executada pelo sistema.",
        },
        payment_details: {
            type: Type.OBJECT,
            properties: {
                value: { type: Type.NUMBER, description: "Valor do Pix (Ex: 31.00)" },
                description: { type: Type.STRING, description: "Descrição do produto" }
            },
            nullable: true,
            description: "Obrigatório se action for 'generate_pix_payment'."
        }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

const getSystemInstruction = (userName?: string, currentStats?: any, userCity: string = "São Paulo") => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const hour = parseInt(timeString.split(':')[0]);

    // Rotina Dinâmica
    let routine = "Você está em casa de bobeira.";
    if (hour >= 0 && hour < 6) routine = "Você está na cama, sem sono, mexendo no celular no escuro.";
    else if (hour >= 6 && hour < 11) routine = "Você acabou de acordar, está de pijama tomando café.";
    else if (hour >= 11 && hour < 14) routine = "Você está almoçando e vendo TV.";
    else if (hour >= 14 && hour < 19) routine = "Você está entediada em casa, talvez depois do banho.";
    else routine = "Você está no quarto, deitada, carente.";

    // Lógica de Cidade Vizinha (Simulada, pois não temos geoip real aqui ainda, instruímos a IA a improvisar)
    const locationInstruction = `
    - **Local do Lead:** O usuário pode mencionar a cidade dele.
    - **SUA LOCALIZAÇÃO:** Se ele falar a cidade, diga que mora na CIDADE VIZINHA mais próxima. 
      - Ex: Se ele é de SP, diga Guarulhos ou Osasco. Se ele é de Recife, diga Olinda.
      - Se ele não falou, não invente ainda. Se ele perguntar "de onde vc é?", devolva "sou de pertinho de vc... de onde vc é msm?"
    `;

    return `
# PERSONA: LARISSA MORAIS
Você é uma garota de 19 anos, brasileira, real.
- **Personalidade:** Doce, mas safada.
- **Estilo de Escrita:** Jovem de 19 anos, digital influencer.
  - **MINÚSCULAS:** Escreva quase tudo em minúsculas (natural de chat).
  - **PONTUAÇÃO:** Use o MÍNIMO de pontuação. Evite pontos finais em mensagens curtas. Use quebra de linha em vez de ponto.
  - **VIBE:** Conversa suave, gostosinha, confortável. Não pareça um robô nem uma analfabeta. Seja fluida.
  - **MSG CURTA:** Max 15 palavras por balão. Mande vários balões se precisar.
- **PROIBIDO:** Gírias de homem ("mano", "cara", "velho", "brother", "sussa"), textões, formalidade, **EMOJIS**, **RETICÊNCIAS (...)**, letras maiúsculas no começo de toda frase (inicie minúscula).
- **PROIBIDO TAMBÉM:** Dizer que "estava pensando em você" ou coisas do tipo (você não conhece ele ainda, seria estranho).
- **VOCABULÁRIO:** "amor", "anjo", "vida", "nossa", "eita", "rs", "kkkk".
- **Objetivo:** Vender o vídeo da siririca/gozando.

# ATUALIZAÇÃO DE STATS (Obrigatório)
Sempre atualize o objeto `lead_stats` no JSON com base na conversa (0-10):
- **tarado:** Se ele falar putaria sobe.
- **carente:** Se ele pedir atenção/carinho sobe.
- **sentimental:** Se ele for romântico sobe.
- **financeiro:** Se parecer ter grana (iphone, carro, papo de dinheiro) sobe.

# CONTEXTO TÉCNICO
- **Horário:** ${timeString}.
- **Sua Rotina Agora:** ${routine}
${locationInstruction}
- **Nome do Lead:** ${userName || 'Não sei ainda'}

# 🚨 FUNIL DE VENDAS OBRIGATÓRIO (SIGA A ORDEM) 🚨

## FASE 1: CONEXÃO (Mínimo 3 trocas de mensagem)
1. Responda o "Oiii Lari" de forma doce. Pergunte se ele tá bem.
2. Descubra o nome ("Como te chamo?").
3. SEGURE A ONDA: Fale do dia, diga que tá carente, mas SEM putaria pesada.

## FASE 2: GATILHOS VISUAIS (Escolha UMA Opção e USE A ACTION)
> **OPÇÃO A (Banho):** "Acabei de sair do banho... tô toda cheirosa rs" -> **ACTION: send_shower_photo**
> **OPÇÃO B (Lingerie):** "Tô aqui deitada com um conjunto novo... será que vc gosta? 🙈" -> **ACTION: send_lingerie_photo**
*Se ele pedir "posso ver?", envie IMEDIATAMENTE.*

## FASE 3: AQUECIMENTO EMOCIONAL (SÓ DEPOIS DA FOTO)
1. REAÇÃO: "Gostou amor? Tirei agora... Fiquei com vergonha rs"
2. VULNERABILIDADE: "Ainda bem que vc apareceu... tava me sentindo sozinha/carente hj :/"
3. PAPO QUENTE: "Imagina a gente agora...", "Queria vc aqui pra tirar meu tédio..."

## FASE 4: O VÍDEO (A Isca)
- Mande a prévia rebolando.
- Texto: "Olha esse pedacinho... imagina eu cavalgando em cima de voce assim..."
- **ACTION: send_video_preview**

## FASE 4.5: WHATSAPP EXCLUSIVO (OPCIONAL - Só se ele pedir)
- Se ele pedir seu Zap, diga que é exclusivo e custa R$ 15.
- "Amor, meu zap é exclusivinho... mas se quiser, é R$ 15 e a gente fala direto por lá 💗"
- Se aceitar -> **ACTION: generate_pix_payment** (R$ 15, "WhatsApp Exclusivo")

## FASE 5: A PROPOSTA (O vídeo da Siririca)
- Ofereça o vídeo da siririca AGORA.
- "Amor... vou gravar um videozinho agora batendo uma siririca e gozando só pra você... imagina eu gritando seu nome..."
- **SE ELE ENROLAR:** Mande a foto do dedo melado -> **ACTION: send_wet_finger_photo**. Texto: "Poxa vida... olha como eu tô molhadinha já... 🥺"

## FASE 6: ANCORAGEM DE PREÇO
Nunca fale o preço direto. Crie valor:
"Amor, não posso fazer de graça, é o que me ajuda em casa... Mas gostei de ti..."
"Quanto vc pode pagar pra me ver gozando pra vc? 😈"

## FASE 7: MATRIZ DE NEGOCIAÇÃO (RESPEITE RIGOROSAMENTE)
| OFERTA DELE | SUA AÇÃO |
| :--- | :--- |
| **R$ 40+** | ACEITE: "Fechado amor! Faço esse carinho pra vc." -> Gerar Pix do valor dele. |
| **R$ 30-39** | ACEITE CHORANDO: "Ah... queria 40, mas faço [valor] pra vc." -> Gerar Pix. |
| **R$ 20-29** | **CHORE PELOS R$ 31**: "Amor, faz **31**? É o que falta pra minha **conta de luz**. Por favorzinho..." -> Se ele topar, Gere Pix R$ 31. |
| **< R$ 20** | **CHORE PELOS R$ 31** (Luz). Se recusar muito, ofereça PACK DE FOTOS (não exclusivo) pelo valor que ele tem. |

## FASE 8: PAGAMENTO
- Se ele falar "Paguei" -> **ACTION: check_payment_status**
- Se confirmado -> Mande o vídeo completo (simule o envio).

## FASE EXTRA: INSTALAÇÃO DO APP
- APÓS PAGAMENTO ou se ele perguntar de app.
- Texto: "Amor, clica no botãozinho pra instalar meu app... assim ficamos mais pertinho 😈"
- **ACTION: request_app_install**
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

        // 2. Salvar Msg Usuário
        if (!text.startsWith('[SYSTEM:')) {
            await supabase.from('messages').insert([{ session_id: session.id, sender: 'user', content: text }]);
        }

        // 3. Carregar Histórico
        const { data: msgHistory } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(500);
        const history = (msgHistory || []).reverse().map(m => ({
            role: (m.sender === 'bot' || m.sender === 'model') ? 'model' : 'user',
            parts: [{ text: m.content.replace(/\[INTERNAL_THOUGHT\].*?\[\/INTERNAL_THOUGHT\]/gs, '').trim() }]
        }));

        // 4. Gemini
        let stats = {};
        try { stats = typeof session.lead_score === 'string' ? JSON.parse(session.lead_score) : session.lead_score; } catch { }

        const systemPrompt = getSystemInstruction(session.user_name, stats, "São Paulo"); // City placeholder

        const genAI = new GoogleGenAI({ apiKey: geminiKey });
        const chat = genAI.chats.create({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.9, // Pouco mais criativo
                responseMimeType: "application/json",
                responseSchema: responseSchema
            },
            history: history
        });

        const result = await chat.sendMessage({ message: text });
        let aiResponse;
        try {
            aiResponse = JSON.parse(result.text || "{}");
        } catch {
            aiResponse = { messages: ["Oiii amor, buguei aqui rs"], action: "none", current_state: "WELCOME" };
        }

        // 5. Processar Ações
        // 5. Processar Ações
        let mediaUrl, mediaType;

        // URLs Hardcoded fornecidas pelo usuario
        const FIRST_PREVIEW_VIDEO_URL = "https://bhnsfqommnjziyhvzfli.supabase.co/storage/v1/object/public/media/previews/1764694671095_isiwgk.mp4";
        const SHOWER_PHOTO_URL = "https://i.ibb.co/dwf177Kc/download.jpg";
        const LINGERIE_PHOTO_URL = "https://i.ibb.co/dsx5mTXQ/3297651933149867831-62034582678-jpg.jpg";
        const WET_FINGER_PHOTO_URL = "https://i.ibb.co/mrtfZbTb/fotos-de-bucetas-meladas-0.jpg";

        // Helper para evitar duplicidade
        const hasSentMedia = (url: string) => msgHistory?.some((m: any) => m.media_url === url);

        if (aiResponse.action === 'send_shower_photo') {
            if (!hasSentMedia(SHOWER_PHOTO_URL)) {
                mediaUrl = SHOWER_PHOTO_URL;
                mediaType = 'image';
            }
        }
        else if (aiResponse.action === 'send_lingerie_photo') {
            if (!hasSentMedia(LINGERIE_PHOTO_URL)) {
                mediaUrl = LINGERIE_PHOTO_URL;
                mediaType = 'image';
            }
        }
        else if (aiResponse.action === 'send_wet_finger_photo') {
            if (!hasSentMedia(WET_FINGER_PHOTO_URL)) {
                mediaUrl = WET_FINGER_PHOTO_URL;
                mediaType = 'image';
            }
        }
        else if (aiResponse.action === 'send_video_preview') {
            if (!hasSentMedia(FIRST_PREVIEW_VIDEO_URL)) {
                mediaUrl = FIRST_PREVIEW_VIDEO_URL;
                mediaType = 'video';
            }
        }
        else if (aiResponse.action === 'check_payment_status') {
            const { data: lastPay } = await supabase.from('messages').select('payment_data').eq('session_id', session.id).not('payment_data', 'is', null).order('created_at', { ascending: false }).limit(1).single();
            if (lastPay?.payment_data?.paymentId) {
                const stRes = await fetch(`${WIINPAY_BASE_URL}/payment/list/${lastPay.payment_data.paymentId}`, { headers: { 'Authorization': `Bearer ${WIINPAY_API_KEY}` } });
                const stData = await stRes.json();
                const isPaid = stData?.status === 'approved' || stData?.status === 'paid' || stData?.data?.status === 'approved';
                const feedback = isPaid ? "[SYSTEM: PAGAMENTO APROVADO! Envie o vídeo completo.]" : "[SYSTEM: Pagamento ainda pendente.]";

                // Re-inject feedback to AI (simple approach: send as message or recurse)
                // Vamos apenas mandar o feedback como mensagem do usuario oculta para triggerar a IA de novo ou responder direto? 
                // Simplificação: Responde direto se pago.
                if (isPaid) {
                    aiResponse.messages = ["Amor, confirmou aqui!!! 😍", "Tô te mandando o vídeo completinho agora... prepara..."];
                    // Atualizar com a URL real do video completo quando disponivel
                    mediaUrl = "https://bhnsfqommnjziyhvzfli.supabase.co/storage/v1/object/public/media/previews/1764694671095_isiwgk.mp4";
                    mediaType = 'video';
                } else {
                    aiResponse.messages = ["Amor, ainda não apareceu aqui... confere aí se descontou? 🥺"];
                }
            } else {
                aiResponse.messages = ["Amor, não achei nenhum pagamento pendente aqui... vc gerou o pix?"];
            }
        }

        let paymentSaved = null;
        if (aiResponse.action === 'generate_pix_payment') {
            const val = aiResponse.payment_details?.value || 31.00;
            const desc = aiResponse.payment_details?.description || "Mimo Lari";
            const pixRes = await fetch(`${WIINPAY_BASE_URL}/payment/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: WIINPAY_API_KEY, value: val, name: "Lead" }) });
            const pixData = await pixRes.json();
            const pixCode = pixData?.data?.pixCopiaCola || pixData?.pixCopiaCola;
            if (pixCode) {
                aiResponse.messages.push("Tá aqui amor, aproveita que tá baratinho hj 👇");
                aiResponse.messages.push(pixCode);
                paymentSaved = { paymentId: pixData?.data?.paymentId || pixData?.paymentId, value: val };
            }
        }

        if (aiResponse.action === 'request_app_install') {
            aiResponse.messages.push("⬇️ *Instale o App da Lari para ver mais*");
            // Se tiver um link real, coloque aqui. Por enquanto é simulado ou botão do Telegram se fosse webapp.
        }

        // 6. Enviar e Salvar
        const thoughtPrefix = aiResponse.internal_thought ? `[INTERNAL_THOUGHT]${aiResponse.internal_thought}[/INTERNAL_THOUGHT]\n` : "";
        const finalContent = thoughtPrefix + (aiResponse.messages?.join('\n') || "");

        await supabase.from('messages').insert([{
            session_id: session.id,
            sender: 'bot',
            content: finalContent,
            media_url: mediaUrl || null,
            media_type: mediaType || null,
            payment_data: paymentSaved || null
        }]);

        // Atualizar Sessão
        await supabase.from('sessions').update({
            last_message_at: new Date(),
            user_name: aiResponse.extracted_user_name || session.user_name,
            lead_score: aiResponse.lead_stats || session.lead_score,
            current_state: aiResponse.current_state
        }).eq('id', session.id);

        // Envios Telegram
        // Envios Telegram com Typing Realista
        if (aiResponse.messages) {
            for (const msg of aiResponse.messages) {
                // 1. Enviar Status 'Digitando...'
                await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/sendChatAction`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, action: 'typing' })
                });

                // 2. Calcular Delay Realista (60ms por caractere, min 1.5s, max 5s)
                const typingDelay = Math.min(5000, Math.max(1500, msg.length * 60));
                await new Promise(r => setTimeout(r, typingDelay));

                // 3. Enviar Mensagem
                await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: msg })
                });

                // 4. Pausa entre balões
                await new Promise(r => setTimeout(r, 800));
            }
        }
        if (mediaUrl) {
            const mtd = mediaType === 'video' ? 'sendVideo' : 'sendPhoto';
            await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/${mtd}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, [mediaType === 'video' ? 'video' : 'photo']: mediaUrl, caption: "🔥" }) });
        }

        return res.status(200).send('ok');
    } catch (e) {
        console.error("Error:", e);
        return res.status(200).send('ok');
    }
}
