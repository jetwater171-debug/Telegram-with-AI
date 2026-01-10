export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
  audioUrl?: string;
  audioMimeType?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  isBlur?: boolean; // Para prévias de conteúdo "pago"
  paymentData?: {
    pixCopiaCola: string;
    qrCode: string;
    value: number;
    paymentId: string;
  };
}

export interface User {
  name: string;
  avatar: string;
  status: string;
}

export interface LeadStats {
  tarado: number; // 0-10
  carente: number; // 0-10
  sentimental: number; // 0-10
  financeiro: number; // 0-10 (Poder aquisitivo percebido)
}

// Tipo interno para a resposta JSON estruturada do Gemini
export interface AIResponse {
  internal_thought: string; // O Chain of Thought oculto
  lead_classification: 'carente' | 'tarado' | 'curioso' | 'frio' | 'desconhecido'; // Mantido para compatibilidade simples
  lead_stats?: LeadStats; // Novo perfilamento avançado
  extracted_user_name?: string | null; // Nome extraído do usuário
  current_state: 'WELCOME' | 'CONNECTION' | 'PROFILE_SCAN' | 'LEAD_TYPE_DETECT' | 'INSTIGA' | 'PREVIEW' | 'FRONT_OFFER' | 'OBJECTION_HANDLING' | 'DOWNSELL' | 'UPSELL' | 'RELATIONSHIP_FARMING' | 'REACTIVATION' | 'OBJECTION';
  messages: string[]; // Array de mensagens para enviar em sequência (balões separados)
  action: 'none' | 'send_photo_preview' | 'send_video_preview' | 'send_audio_response' | 'generate_pix_payment' | 'check_payment_status' | 'send_shower_photo' | 'send_lingerie_photo' | 'send_wet_finger_photo' | 'request_app_install';
  media_url?: string;
  payment_details?: {
    value: number;
    description: string;
  };
}

// Product Management Types
export interface Product {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  description?: string;
  category: 'pack' | 'video_call' | 'meeting' | 'custom';
  base_price: number;
  downsell_price?: number;
  upsell_price?: number;
  deliverables?: string[]; // O que o cliente recebe
  delivery_method?: string; // Como entrega (WhatsApp, Telegram, etc.)
  delivery_time?: string; // Quando entrega (Imediato, 24h, etc.)
  is_active: boolean;
  sort_order: number;
}

export interface MediaFile {
  id: string;
  created_at: string;
  file_name: string;
  file_url: string;
  file_type: 'image' | 'video' | 'audio';
  media_category: 'preview' | 'full_content';
  is_blurred: boolean;
  product_id?: string;
  tags?: string[];
  thumbnail_url?: string;
}

export interface PersonaConfig {
  id: string;
  updated_at: string;
  section: string; // 'basic_info', 'personality', etc.
  title: string; // Título amigável para UI
  content: string;
  sort_order: number;
}

export interface AIConfig {
  id: string;
  updated_at: string;
  config_key: string;
  config_value: string;
  description?: string;
}