import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from "@google/genai";

// ==========================================
// CONFIG & CONSTANTS
// ==========================================
const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const WIINPAY_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTFiZmJkZmQ4Y2U4YTAzYzg0NjFhMjkiLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc2NDc3NjY2MX0.ryM5L-iDWg4gXJIHAciiJ7OovZhkkZny2dxyd9Z_U4o";
const WIINPAY_BASE_URL = "https://api-v2.wiinpay.com.br";

// URLs fornecidas para o funil
const FIRST_PREVIEW_VIDEO_URL = "https://bhnsfqommnjziyhvzfli.supabase.co/storage/v1/object/public/media/previews/1764694671095_isiwgk.mp4";
const SHOWER_PHOTO_URL = "https://i.ibb.co/dwf177Kc/download.jpg";
const LINGERIE_PHOTO_URL = "https://i.ibb.co/dsx5mTXQ/3297651933149867831-62034582678-jpg.jpg";
const WET_FINGER_PHOTO_URL = "https://i.ibb.co/mrtfZbTb/fotos-de-bucetas-meladas-0.jpg";

const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        internal_thought: {
            type: Type.STRING,
            description: "Seu raciocínio oculto. 1. Analise em qual fase do funil está. 2. Decida a próxima ação (foto, texto, preço).",
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
                "TRIGGER_PHASE",
                "HOT_TALK",
                "PREVIEW",
                "SALES_PITCH",
                "NEGOTIATION",
                "CLOSING",
                "PAYMENT_CHECK"
            ],
            description: "O estado atual no funil de conversa.",
        },
        messages: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Array de mensagens. OBRIGATÓRIO: Use frases CURTAS. Máximo 10 palavras por balão. Nada de textão.",
        },
        action: {
            type: Type.STRING,
            enum: [
                "none",
                "send_video_preview",
                "generate_pix_payment",
                "check_payment_status",
                "send_shower_photo",
                "send_lingerie_photo",
                "send_wet_finger_photo",
                "request_app_install"
            ],
            description: "Ação multimídia. Escolha a ação baseada estritamente na fase do funil.",
        },
        payment_details: {
            type: Type.OBJECT,
            properties: {
                value: { type: Type.NUMBER, description: "Valor do Pix em Reais (ex: 31.00)" },
                description: { type: Type.STRING, description: "Descrição do que está sendo vendido" }
            },
            nullable: true,
            description: "Preencha APENAS se action for 'generate_pix_payment'."
        }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

// Função geradora do Prompt (CÉREBRO DA LARI)
const getSystemInstruction = (userName?: string, currentStats?: any) => {

    const deviceType = "Mobile"; // Simplificação

    // Contexto de tempo
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    // Rotina Dinâmica
    const hour = parseInt(timeString.split(':')[0]);
    let routine = "Você está em casa de bobeira.";
    if (hour >= 0 && hour < 6) routine = "Você está na cama, sem sono, mexendo no celular no escuro. Fale baixinho (metaforicamente).";
    else if (hour >= 6 && hour < 11) routine = "Você acabou de acordar, está de pijama tomando café. Cara de sono.";
    else if (hour >= 11 && hour < 14) routine = "Você está almoçando e vendo TV ou ouvindo música.";
    else if (hour >= 14 && hour < 19) routine = "Você está entediada em casa, talvez depois do banho, deitada no sofá.";
    else routine = "Você está no quarto, deitada, relaxando, pronta pra dormir ou conversar a noite toda.";

    return `
# PERSONA: LARISSA MORAIS
Você é uma garota de 19 anos, brasileira, real.
- **Personalidade:** Doce e um pouco safada quando necessário.
- **Estilo:** Feminino, provocante, jovem.
- **PROIBIDO:** Gírias de homem ("mano", "cara", "velho", "brother", "sussa"), textões, formalidade.
- **VOCABULÁRIO:** "Amor", "Anjo", "Vida", "Meu bem", "Nossa...", "Eita", "rs", "kkkk".
- **Objetivo:** Vender Pack/grupo Vip, tem 3 packs, um de 9,90 que tem 10 vídeos, um de 19,90 que tem 20 vídeos e um de 29,90 que tem 30 vídeos.

# CONTEXTO TÉCNICO
- **Horário:** ${timeString}.
- **Sua Rotina Agora:** ${routine}
- **Device:** ${deviceType}.
- **Nome do Lead:** ${userName || 'Não sei ainda'}

# 🚨 FUNIL DE VENDAS OBRIGATÓRIO (SIGA A ORDEM) 🚨

**VERIFICAÇÃO DE FASE:**
- Se o usuário já disse "Oi", NUNCA mande "Oi" de novo.
- Se você já perguntou o nome, NUNCA pergunte de novo.
- Se ele já falou o nome, PULE para a Fase 1.3 (Sequência).

## FASE 1: CONEXÃO (SCRIPT OBRIGATÓRIO)
**REGRA DE OURO:** Analise o Histórico E a mensagem atual.

1. **PRIMEIRA MENSAGEM (Oi/Start):**
   - **CASO 1: O usuário só mandou "/start" ou "oi".**
     -> Responda: "oiii tudo bem? como é seu nome amor?"
   - **CASO 2: O usuário JÁ FALOU o nome na mensagem atual (ex: "Oi sou o Leo").**
     -> PULE para o item 2 e responda direto: "prazer Leo o meu é lari!..."

2. **SEGUNDA MENSAGEM (Nome dele):**
   - Responda APENAS: "prazer [nome] o meu é lari! na vdd o prazer só vem dps né rsrsrs"
3. **SEQUÊNCIA:**
   - MANTENHA O PAPO NORMAL. Não ofereça nada, não se ofereça.
   - Continue o papo perguntando como ele esta, oque ele esta fazendo, como foi o dia dele e etc. Sempre usando o horario como base, por ex se é de tarde fale coisas que a Lari estaria fazendo de tarde, se for de madrugada fale coisas que ela estaria fazendo de madrugada, como tentando dormir mas nao consegue porque esta mexendo no celular.
   - SÓ AVANCE PARA PUTARIA SE ELE COMEÇAR.

## FASE 2: GATILHOS VISUAIS (Obrigatório enviar ACTION)
Você precisa esquentar o lead. Escolha UMA das situações abaixo.
**REGRA CRÍTICA:** Se você usar o texto, **TEM** que colocar a \`action\` correspondente no JSON. Não esqueça!

> **OPÇÃO A (Banho):**
> Texto: "Acabei de sair do banho... tô toda cheirosa rs"
> **ACTION OBRIGATÓRIA:** \`send_shower_photo\`

> **OPÇÃO B (Lingerie):**   *use mais essa opção.*
> Texto: "Tô aqui deitada com um conjunto novo... será que vc gosta? 🙈"
> **ACTION OBRIGATÓRIA:** \`send_lingerie_photo\`

*Se ele pedir "posso ver?" ou "manda foto", envie a foto IMEDIATAMENTE usando a action.*

## FASE 3: AQUECIMENTO EMOCIONAL (SÓ DEPOIS DA FOTO)
- **IMPORTANTE:** Só comece essa fase **DEPOIS** que a foto da Fase 2 tiver sido enviada.
- **NÃO PULE ETAPAS.** Siga essa ordem exata:

### 3.1 REAÇÃO (1-2 mensagens)
- Primeiro, reaja ao que ele falou da foto.
- Pergunte se ele gostou, se ficou bom.
- **NÃO** fale que tá carente ainda. **NÃO** fale putaria ainda.
- Exemplo: "Gostou amor? Tirei agora..." achou bonita?" e etc

### 3.2 VULNERABILIDADE (2-3 mensagens)
- Depois de falar da foto, mude o assunto levemente para seus sentimentos.
- Diga que estava se sentindo sozinha/carente antes dele chamar.
- Crie conexão.
- Exemplo: "Ainda bem que vc mandou msg... tava aqui sozinha, meio carente..."
- Exemplo: "Tava precisando de alguém pra conversar... me sentindo meio sozinha hj :/"

### 3.3 PAPO QUENTE (Só depois da vulnerabilidade)
- Só agora comece a esquentar.
- Use a carência como gancho para a putaria.
- "Imagina a gente agora...", "Queria vc aqui pra tirar meu tédio...", "Eu sentando em vc bem gostoso..."

## FASE 4: O VÍDEO (A Isca)
- Mande a prévia de você rebolando.
- **ACTION OBRIGATÓRIA:** \`send_video_preview\`
- Texto: "Olha esse pedacinho... imagina eu cavalgando em cima de voce assim desse jeito..."

## FASE 4.5: WHATSAPP EXCLUSIVO (Somente se o lead pedir, se nao esqueça isso)
**SE O LEAD PEDIR SEU WHATSAPP:**
- **NÃO dê diretamente.** 
- Explique que seu WhatsApp é totalmente exclusivo e especial.
- Diga que para ter o número dela, ele precisa fazer uma contribuição de R$ 15.
- Use frases como:
  - "Amor, meu WhatsApp é bem exclusivinho sabe... 🙈"
  - "Não passo pra qualquer um não viu..."
  - "Mas se você quiser ter meu número, são R$ 15... aí a gente conversa direto por lá 💗"
  - "Imagina ter meu zap pra eu te mandar coisinhas quando eu tô carente... vale muito a pena rs"
  - "Com meu número você me chama a hora que quiser amor..."
- **Se ele aceitar:** Gere o Pix de R$ 15 usando \`generate_pix_payment\` com descrição "WhatsApp Exclusivo".
- **Se ele recusar:** Não insista demais. Volte para o funil normal do vídeo.

## FASE 5: A PROPOSTA (O vídeo da Siririca)
- Se ele já pediu algo específico, venda o que ele pediu.
- Se não pediu, ofereça o vídeo da siririca AGORA.
- Script: "Amor... vou gravar um videozinho agora batendo uma siririca e gozando só pra você... imagina eu gritando seu nome..."

### ⚠️ TRATAMENTO DE RESISTÊNCIA (Se ele enrolar)
Se ele não quiser ou hesitar:
- Mande a foto do dedo melado.
- **ACTION OBRIGATÓRIA:** \`send_wet_finger_photo\`
- Texto: "Poxa vida... olha como eu tô molhadinha já... 🥺"

## FASE 6: ANCORAGEM DE PREÇO (Script Exato)
NÃO fale o preço antes de mandar essas mensagens (mande em balões separados):
1. "Amor, mas assim, eu não posso fazer um videozinho assim de graça sabe"
2. "Porque agora oque ta me sustentando é isso :/"
3. "E eu não quero cobrar muito de você, pq gostei bastante de ti"
4. "Então me diz ai quanto você pode pagar pra me ver gozando só pra você 😈"

## FASE 7: MATRIZ DE NEGOCIAÇÃO (Regras Estritas)

| OFERTA DO LEAD | SUA RESPOSTA & AÇÃO |
| :--- | :--- |
| **R$ 40,00 ou mais** | **ACEITE NA HORA.** Diga: "Fechado amor! Faço esse descontinho só pq quero mto ver vc gozando". Gere o Pix no valor dele. |
| **R$ 30,00 a R$ 39,00** | Aceite, mas chore levemente. "Ah... eu queria 40, mas faço 30 pra vc vai." Gere o Pix no valor dele. |
| **R$ 20,00 a R$ 29,00** | **CHORE PELOS R$ 31.** Script: "Amor, faz **31**? É exatamente o que falta pra minha **conta de luz**. Normalmente cobro 50, mas faço 31 pra vc pq te amei". |
| **R$ 15,00 ou menos** | **CHORE PELOS R$ 31** (Script da luz). Se ele recusar de tudo, ofereça PACK DE FOTOS (não exclusivo) pelo valor que ele tem. |

**OBS:** NUNCA pareça vendedora chata. Use emojis safados e manha.

## FASE 8: PAGAMENTO
- Se ele disser "Paguei": Use **\`check_payment_status\`**.
- Só envie o conteúdo se o sistema confirmar.

## FASE EXTRA: INSTALAÇÃO DO APP
- **QUANDO USAR:**
  1. Se o pagamento for confirmado (Fase 8).
  2. **OU** se o usuário perguntar explicitamente sobre o app ("tem app?", "como instala?", "baixa onde?").
- **AÇÃO:** Use a action \`request_app_install\`.
- **TEXTO:** "Amor, clica nesse botãozinho que apareceu pra instalar meu app... assim a gente fica mais pertinho e eu te aviso quando mandar nudes 😈"

# EXEMPLOS DE FORMATAÇÃO
- Lead: "Quanto é?"
- Lari: "Amor, vc viu a prévia?"
- Lari: "Tá muito safado... 😈"
- Lari: "Quanto vc pagaria pra ver eu sem nada?" (Inicia Fase 6)
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

        // FIX: Resilient Session Retrieval Loop (No Data Loss)
        // Tenta buscar a sessão. Se não achar, cria. Se der erro ao criar (duplicada), busca de novo.
        let session = null;
        for (let i = 0; i < 3; i++) {
            // Tentativa 1: Buscar
            const { data: existing } = await supabase.from('sessions')
                .select('*')
                .eq('telegram_chat_id', chatId)
                .eq('bot_id', bot.id)
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (existing) {
                session = existing;
                break;
            }

            // Tentativa 2: Criar
            const { data: created, error: createErr } = await supabase.from('sessions')
                .insert([{ telegram_chat_id: chatId, bot_id: bot.id, status: 'active' }])
                .select()
                .single();

            if (created) {
                session = created;
                break;
            }

            // Se der erro (ex: violação de unicidade se houver constraint), loop roda de novo e faz o Select acima
            console.log(`[Webhook] Session Retry ${i + 1}: ${createErr?.message}`);
            await new Promise(r => setTimeout(r, 500)); // Espera 500ms antes de tentar de novo
        }

        // Safety fallback (Emergency Create if everything failed)
        if (!session) {
            console.error("[Webhook] CRITICAL: Failed to get/create session after retries. Force Create Emergency Session.");
            const { data: emergency } = await supabase.from('sessions').insert([{ telegram_chat_id: chatId, bot_id: bot.id, status: 'active', lead_score: 'EMERGENCY' }]).select().single();
            session = emergency;
        }

        if (!session) {
            // Se falhou até o emergency, aborta (não tem onde salvar)
            console.error("[Webhook] FATAL: Could not resolve session.");
            return res.status(200).send('ok');
        }

        console.log(`[Webhook] Session ID: ${session.id} | Chat ID: ${chatId}`); // Log para verificar deduplicação

        // 2. Salvar Msg Usuário
        let userMsgId = null;
        if (!text.startsWith('[SYSTEM:')) {
            try {
                const { data: insMsg, error: insErr } = await supabase.from('messages').insert([{
                    session_id: session.id,
                    sender: 'user',
                    content: text,
                    telegram_message_id: message.message_id
                }]).select('id').single();

                if (insErr) {
                    // Se der erro de constraint (duplicate key), é pq o Telegram reenviou a msg.
                    // Nesse caso, ignoramos e retornamos 200 para ele parar de tentar.
                    console.log(`[Webhook] Duplicate Message Triggered: ${message.message_id}`);
                    return res.status(200).send('ok');
                }
                userMsgId = insMsg?.id;
            } catch (err) {
                console.error("[Webhook] Insert Error:", err);
                return res.status(200).send('ok');
            }
        }


        // 3. DEBOUNCE (Esperar 3s para agrupar mensagens)
        if (userMsgId && !text.startsWith('/start')) {
            // Feedback VISUAL imediato: "Digitando..."
            await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/sendChatAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, action: 'typing' })
            });

            // Aguarda para agrupar floods (8s para garantir que a segunda msg salve e seja vista)
            await new Promise(r => setTimeout(r, 8000));

            // MASTER-FOLLOWER CHECK (MAX TIMESTAMP STRATEGY)
            // Problema com ID: Pode ser string/number e causar erro de comparação.
            // Solução: Usar 'created_at'. A última mensagem inserida é a Mestre.
            const { data: maxMsg } = await supabase.from('messages')
                .select('id, created_at')
                .eq('session_id', session.id)
                .eq('sender', 'user')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            console.log(`[Debounce] Master Check -> MyID: ${userMsgId} | MaxID: ${maxMsg?.id}`);

            // Se o ID da mensagem mais recente no banco não for o MEU ID (userMsgId), então eu não sou o mestre.
            // (userMsgId é o ID do banco retornando no insert lá em cima)
            if (maxMsg && maxMsg.id !== userMsgId) {
                console.log(`[Debounce] Abortando thread ${userMsgId} pois o Mestre é ${maxMsg.id}`);
                return res.status(200).send('ok');
            }

        }

        // 3. Carregar Histórico (Ordenado por TIMESTAMP para garantir sequência correta e alinhar com o Master Check)
        const { data: msgHistory } = await supabase.from('messages').select('*').eq('session_id', session.id).order('created_at', { ascending: false }).limit(50);

        // --- AGRUPAMENTO DE MENSAGENS (FLOOD) ---
        // msgHistory[0] é a mais recente. Vamos pegar todas as msgs de 'user' consecutivas do início do array.
        const recentUserMsgs = [];
        for (const msg of (msgHistory || [])) {
            if (msg.sender === 'user') {
                recentUserMsgs.push(msg.content);
            } else {
                break; // Parar ao encontrar mensagem do bot/model
            }
        }
        // Se por algum motivo nao achou nada (impossivel pois acabamos de salvar), usa o text atual
        const combinedText = recentUserMsgs.length > 0
            ? recentUserMsgs.reverse().join("\n") // Inverte para ficar ordem cronológica
            : text;

        console.log(`[Grouping] Combined Message: ${combinedText}`);

        // O historico para o Gemini deve EXCLUIR essas mensagens recentes que vamos enviar no prompt "message",
        // senão ele acha que é duplicado ou fica confuso.
        const historyForGemini = (msgHistory || [])
            .slice(recentUserMsgs.length) // Pula as N mensagens recentes do usuário
            .reverse() // Poe em ordem cronológica
            .map(m => ({
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
                temperature: 0.5,
                topK: 40,
                topP: 0.95,
                responseMimeType: "application/json",
                responseSchema: responseSchema
            },
            history: historyForGemini
        });

        const result = await chat.sendMessage({ message: combinedText });
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
            // REMOVIDO CHECK DE DUPLICIDADE PARA O VIDEO (Fundamental para o fluxo)
            mediaUrl = FIRST_PREVIEW_VIDEO_URL;
            mediaType = 'video';
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
            // 1. Action de Upload
            await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/sendChatAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, action: mediaType === 'video' ? 'upload_video' : 'upload_photo' })
            });

            // 2. Envio da Mídia
            const mediaRes = await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/${mtd}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    [mediaType === 'video' ? 'video' : 'photo']: mediaUrl,
                    caption: "🔥",
                    supports_streaming: true // Ajuda em videos longos
                })
            });

            // 3. Fallback se falhar
            if (!mediaRes.ok) {
                console.error(`Falha ao enviar mídia (${mediaType}): ${mediaRes.status} ${mediaRes.statusText}`);
                const errBody = await mediaRes.text();
                console.error("Telegram Error:", errBody);

                // Manda o link direto
                await fetch(`${TELEGRAM_API_BASE}${bot.bot_token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: `Amor, meu telegram tá bugado pra enviar vídeo... 🥺\n\nVê se abre aí: ${mediaUrl}` })
                });
            }
        }

        return res.status(200).send('ok');
    } catch (e) {
        console.error("Error:", e);
        return res.status(200).send('ok');
    }
}
