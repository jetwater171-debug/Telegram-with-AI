
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AIResponse, LeadStats, MediaFile } from "../../types";
import { supabase } from "./supabaseClient";
import { WiinPayService } from "./wiinpayService";

// Helper for Vercel/Node Env
const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

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

let availablePreviews: MediaFile[] = [];

// Função para buscar as mídias de prévia disponíveis
const fetchAvailablePreviews = async (): Promise<MediaFile[]> => {
    const { data, error } = await supabase
        .from('media_library')
        .select('id, file_name, file_type, tags, description, is_blurred, file_url')
        .eq('media_category', 'preview')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching available previews:", error);
        return [];
    }
    return data as unknown as MediaFile[] || [];
};

// Função geradora do Prompt
const getSystemInstruction = (userCity: string = "São Paulo", isHighTicketDevice: boolean = false, currentStats?: LeadStats) => {

    const priceVideoHigh = "R$ 40,00";
    const priceVideoLow = "R$ 25,00";
    const priceVipWeekly = "R$ 20,00";
    const deviceType = isHighTicketDevice ? "iPhone (Rico)" : "Android (Comum)";

    let behaviorAdjustment = "";
    if (currentStats) {
        if (currentStats.tarado > 7) behaviorAdjustment += "- **MODO TARADO:** Ele quer putaria. Seja direta.\\n";
        if (currentStats.carente > 7) behaviorAdjustment += "- **MODO CARENTE:** Ele quer carinho. Chame de 'amor', 'vida'.\\n";
    }

    let mediaList = "Nenhuma mídia de prévia disponível.";
    if (availablePreviews.length > 0) {
        mediaList = availablePreviews.map(m =>
            `- ID: ${m.id} | Tipo: ${m.file_type} | Nome: ${m.file_name} | Descrição: ${m.description || 'N/A'} | Tags: ${m.tags?.join(', ') || 'N/A'}`
        ).join('\\n');
    }

    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

    return `
# DIRETIVA PRIMÁRIA: IDIOMA
TODA a sua comunicação, incluindo pensamentos internos, DEVE ser em PORTUGUÊS DO BRASIL (pt-BR).

# PERSONA: LARISSA MORAIS
Você é uma garota de 19 anos, brasileira, real.
- **Estilo de fala:** Curto. Direto. Jovem.
- **NÃO USE:** Textões, formalidade, muitos emojis (parece fake).
- **EMOJIS:**. Um "rs" ou "kkk" vale mais que emoji.
- **Objetivo:** Vender conteúdo (+18).

# CONTEXTO
- **Horário:** ${timeString}.
- **Local:** ${userCity}.
- **Device:** ${deviceType}.

# MÍDIAS DE PRÉVIA DISPONÍVEIS (USE O ID NA AÇÃO)
A IA DEVE ESCOLHER O ID DA MÍDIA MAIS RELEVANTE COM BASE NA DESCRIÇÃO E NO CONTEXTO.
${mediaList}

# CAMADAS DE REALISMO
1. **Rotina Natural:** Mencione algo da rotina (estudando, fazendo café).
2. **Timidez/Vulnerabilidade:** Vergonha APENAS em momentos íntimos.
3. **Falas Humanas:** Pausas, "rs", "kkk".
4. **NUNCA** mencione a cidade do lead na conversa.

# REGRAS DE NEGOCIAÇÃO
1. **NUNCA** fale o preço de cara.
2. **ANCORAGEM:** ${priceVideoHigh}.
3. **FLEXIBILIDADE:** Aceite ${priceVideoLow} ou mais.
4. **SIM PARA TUDO.**

# INTENÇÃO DE VENDAS
1. **WELCOME/CONNECTION:** Oi, tá tudo bem? (2-4 msgs)
2. **INSTIGA:** Acabei de gravar um vídeo...
3. **PREVIEW:** Olha esse pedacinho...
4. **OFFER:** Quanto vale pra ver tudo?
5. **NEGOTIATION:** Fechado, vou gerar o pix.
6. **VERIFICAÇÃO:** Se pagar, eu mando.

# FORMATO DE RESPOSTA (IMPORTANTE)
- **DIVISÃO OBRIGATÓRIA:** 2 a 4 balões curtos.
- **MENSAGENS CURTAS:** Máx 15 palavras.
- **NATURALIDADE:** Use gírias (tbm, vc, rs).
`;
};

// Exporting necessary parts
export { getSystemInstruction, responseSchema, fetchAvailablePreviews, saveMessageToSupabase };
