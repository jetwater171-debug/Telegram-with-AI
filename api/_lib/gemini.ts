
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

// Types embedded to ensure serverless function compatibility
export interface AIResponse {
    internal_thought: string;
    lead_classification: string;
    lead_stats?: {
        tarado: number;
        carente: number;
        sentimental: number;
        financeiro: number;
    };
    extracted_user_name?: string | null;
    current_state: string;
    messages: string[];
    action: string;
    media_id?: string; // NOVO: ID da mídia para prévia
    media_url?: string;
    payment_details?: {
        value: number;
        description: string;
    };
}

// Interfaces internas
interface MediaFile {
    id: string;
    created_at: string;
    file_name: string;
    file_url: string;
    file_type: 'image' | 'video' | 'audio';
    media_category: 'preview' | 'full_content';
    is_blurred: boolean;
    description?: string;
    tags?: string[];
}

interface LeadStats {
    tarado: number;
    carente: number;
    sentimental: number;
    financeiro: number;
}

const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        internal_thought: {
            type: SchemaType.STRING,
            description: "Seu raciocínio oculto OBRIGATORIAMENTE EM PORTUGUÊS (PT-BR). 1. Analise a oferta do lead (se houver). 2. Decida se aceita (se for >= R$ 25). 3. Planeje a próxima fala curta.",
        },
        lead_classification: {
            type: SchemaType.STRING,
            enum: ["carente", "tarado", "curioso", "frio", "desconhecido"],
            description: "Classificação primária do comportamento do usuário.",
        },
        lead_stats: {
            type: SchemaType.OBJECT,
            properties: {
                tarado: { type: SchemaType.NUMBER, description: "Nível de interesse sexual (0-10)" },
                carente: { type: SchemaType.NUMBER, description: "Nível de necessidade de atenção/afeto (0-10)" },
                sentimental: { type: SchemaType.NUMBER, description: "Nível de conexão emocional (0-10)" },
                financeiro: { type: SchemaType.NUMBER, description: "Poder aquisitivo percebido (0-10)" },
            },
            required: ["tarado", "carente", "sentimental", "financeiro"],
            description: "Pontuação detalhada do perfil do lead.",
        },
        extracted_user_name: {
            type: SchemaType.STRING,
            description: "O nome do usuário, se ele tiver dito. Se não souber, retorne null ou string vazia.",
            nullable: true
        },
        current_state: {
            type: SchemaType.STRING,
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
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Array de mensagens. OBRIGATÓRIO: Use frases CURTAS. Máximo 10 palavras por balão. Nada de textão. Pareça real.",
        },
        action: {
            type: SchemaType.STRING,
            enum: ["none", "send_photo_preview", "send_video_preview", "send_audio_response", "generate_pix_payment", "check_payment_status"],
            description: "Ação multimídia. Use 'generate_pix_payment' para cobrar. Use 'check_payment_status' se o usuário disser que pagou.",
        },
        media_id: {
            type: SchemaType.STRING,
            description: "O ID da mídia (da lista de PREVIEWS) que você quer enviar. OBRIGATÓRIO se action for 'send_photo_preview' ou 'send_video_preview'.",
            nullable: true
        },
        payment_details: {
            type: SchemaType.OBJECT,
            properties: {
                value: { type: SchemaType.NUMBER, description: "Valor do Pix em Reais (ex: 29.90)" },
                description: { type: SchemaType.STRING, description: "Descrição do que está sendo vendido" }
            },
            nullable: true,
            description: "Preencha APENAS se action for 'generate_pix_payment'."
        }
    },
    required: ["internal_thought", "lead_classification", "lead_stats", "current_state", "messages", "action"],
};

// System Prompt Generator
const getSystemInstruction = (userCity: string = "São Paulo", isHighTicketDevice: boolean = false, currentStats?: LeadStats, availablePreviews: MediaFile[] = []) => {

    // Definição de Preços
    const priceVideoHigh = "R$ 40,00";
    const priceVideoLow = "R$ 25,00"; // Preço mínimo aceitável
    const priceVipWeekly = "R$ 20,00";
    const priceVipLifetime = "R$ 35,00";

    const deviceType = isHighTicketDevice ? "iPhone (Rico)" : "Android (Comum)";
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    // Lógica de Adaptação de Comportamento
    let behaviorAdjustment = "";
    if (currentStats) {
        if (currentStats.tarado > 7) {
            behaviorAdjustment += "- **MODO TARADO:** Ele quer putaria. Seja direta. 'Quer ver o que eu faço com esse dedinho?'.\n";
        }
        if (currentStats.carente > 7) {
            behaviorAdjustment += "- **MODO CARENTE:** Ele quer carinho. Chame de 'amor', 'vida'. Dê atenção.\n";
        }
    }

    // Lista de Mídias de Prévia Disponíveis
    let mediaList = "Nenhuma mídia de prévia disponível.";
    if (availablePreviews.length > 0) {
        mediaList = availablePreviews.map(m =>
            `- ID: ${m.id} | Tipo: ${m.file_type} | Nome: ${m.file_name} | Descrição: ${m.description || 'N/A'} | Tags: ${m.tags?.join(', ') || 'N/A'}`
        ).join('\n');
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

export const processMessage = async (
    sessionId: string,
    userMessage: string,
    userCity: string,
    history: any[]
) => {
    // Lazy load env vars to avoid import-time crashes
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const genAiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials in gemini.ts");
    if (!genAiKey) throw new Error("Missing Gemini Key in gemini.ts");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const genAI = new GoogleGenerativeAI(genAiKey);

    // Fetch Previews (Server Side)
    let availablePreviews: MediaFile[] = [];
    const { data: mediaData, error: mediaError } = await supabase
        .from('media_library')
        .select('id, file_name, file_type, tags, description, is_blurred, file_url')
        .eq('media_category', 'preview')
        .order('created_at', { ascending: false });

    if (!mediaError && mediaData) {
        availablePreviews = mediaData as unknown as MediaFile[];
    }

    // Fetch Session Stats if needed
    let currentStats: LeadStats | undefined;
    // We assume history might contain stats or we could fetch session, but for now we follow simple logic or userCity injection
    // To be more robust, we should fetch the session here like services/geminiService.ts does
    const { data: session } = await supabase
        .from('sessions')
        .select('lead_score, device_type')
        .eq('id', sessionId)
        .single();

    if (session && session.lead_score && typeof session.lead_score === 'string' && session.lead_score.startsWith('{')) {
        try {
            currentStats = JSON.parse(session.lead_score);
        } catch (e) {
            console.warn("Error parsing lead_score in api/_lib:", e);
        }
    }

    const isHighTicket = session?.device_type === 'iPhone';

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: getSystemInstruction(userCity, isHighTicket, currentStats, availablePreviews),
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema as any,
            temperature: 1.2
        }
    });

    const chat = model.startChat({
        history: history.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
        }))
    });

    const result = await chat.sendMessage(userMessage);
    const responseText = result.response.text();

    if (!responseText) throw new Error("Empty response from AI");

    const parsed = JSON.parse(responseText as string) as AIResponse;

    // Resolve media URLs based on action or media_id
    let mediaUrl = undefined;
    let mediaType = undefined;

    if (parsed.action === 'send_photo_preview' || parsed.action === 'send_video_preview') {
        let selectedMedia: MediaFile | undefined;
        if (parsed.media_id) {
            selectedMedia = availablePreviews.find(m => m.id === parsed.media_id || m.id.startsWith(parsed.media_id));
        }

        // Fallback
        if (!selectedMedia) {
            selectedMedia = availablePreviews.find(m =>
                (parsed.action === 'send_video_preview' && m.file_type === 'video') ||
                (parsed.action === 'send_photo_preview' && m.file_type === 'image')
            ) || availablePreviews[0];
        }

        if (selectedMedia) {
            mediaUrl = selectedMedia.file_url;
            mediaType = selectedMedia.file_type;
        }
    }

    // Update session stats if needed
    if (parsed.lead_stats) {
        await supabase.from('sessions').update({
            lead_score: JSON.stringify(parsed.lead_stats),
            user_name: parsed.extracted_user_name
        }).eq('id', sessionId);
    }

    return { ...parsed, finalMediaUrl: mediaUrl, finalMediaType: mediaType };
};
