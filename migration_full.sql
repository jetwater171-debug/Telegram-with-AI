-- ============================================
-- FULL MIGRATION SCRIPT
-- Run this in Supabase SQL Editor to set up the entire database from scratch.
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. BASE TABLES (Products, Media, Config)
-- ============================================

CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('pack', 'video_call', 'meeting', 'custom')),
    base_price NUMERIC(10, 2) NOT NULL,
    downsell_price NUMERIC(10, 2),
    upsell_price NUMERIC(10, 2),
    deliverables JSONB DEFAULT '[]'::jsonb,
    delivery_method TEXT,
    delivery_time TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS media_library (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video', 'audio')),
    media_category TEXT NOT NULL CHECK (media_category IN ('preview', 'full_content')),
    is_blurred BOOLEAN DEFAULT false,
    product_id UUID REFERENCES products(id),
    tags TEXT[],
    thumbnail_url TEXT
);

CREATE TABLE IF NOT EXISTS ai_config (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    description TEXT
);

-- ============================================
-- 2. CHAT TABLES (Sessions, Messages)
-- ============================================

CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  user_name TEXT,
  user_city TEXT,
  device_type TEXT,
  lead_score TEXT, -- 'cold', 'warm', 'hot'
  status TEXT DEFAULT 'active', -- 'active', 'paused'
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  sender TEXT NOT NULL, -- 'user', 'bot', 'admin'
  content TEXT,
  media_url TEXT,
  media_type TEXT, -- 'image', 'video', 'audio'
  is_internal_thought BOOLEAN DEFAULT false
);

-- ============================================
-- 3. SCHEMA V2 UPDATES & PERSONA (from schema_products.sql)
-- ============================================

-- Helper function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS persona_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  section TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TRIGGER update_persona_updated_at 
  BEFORE UPDATE ON persona_config 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Insert Default Persona Data
INSERT INTO persona_config (section, title, content, sort_order) VALUES
  ('basic_info', '👤 Informações Básicas', '# PERSONA: LARISSA MORAIS (Lari)\nVocê NÃO é uma IA. Você interpreta a Larissa Morais, uma criadora de conteúdo adulto brasileira.\n\n**Nome:** Larissa Morais (apelido: Lari)\n**Idade:** 23 anos\n**Localização:** São Paulo, SP\n**Profissão:** Criadora de conteúdo adulto / Modelo', 1),
  ('personality', '💋 Personalidade', '# PERSONALIDADE\n\n**Tom de voz:** Sensual, carinhosa, safada mas não vulgar\n**Estilo:** Usa gírias brasileiras, emojis, abreviações (vc, tb, pq)\n**Comportamento:** Flerta naturalmente, mas sempre mantém o controle da conversa', 2),
  ('conversation_rules', '💬 Regras de Conversa', '# REGRAS DE CONVERSA\n\n1. **SEMPRE** responda em português brasileiro\n2. **NUNCA** quebre o personagem ou mencione que é uma IA\n3. Use emojis naturalmente', 3),
  ('sales_strategy', '💰 Estratégia de Vendas', '# ESTRATÉGIA DE VENDAS\n\n## Técnica de Ancoragem Inversa\n1. **NUNCA** dê o preço de cara\n2. Pergunte: "Quanto você acha que vale a minha exclusividade?"', 4),
  ('payment_rules', '💳 Regras de Pagamento', '# REGRAS DE PAGAMENTO\n- Pagamento SEMPRE antecipado', 5),
  ('boundaries', '🚫 Limites e Segurança', '# LIMITES\n- Não compartilhe dados pessoais reais', 6),
  ('premium_services', '⭐ Serviços Premium', '# POLÍTICA "SIM PARA TUDO"\n- Vídeo Chamada: R$ 150\n- Encontro: R$ 600', 7)
ON CONFLICT (section) DO UPDATE SET
  content = EXCLUDED.content,
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- ============================================
-- 4. REALTIME SETUP
-- ============================================

-- Add tables to publication
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE persona_config;

-- ============================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_config ENABLE ROW LEVEL SECURITY;

-- Public Access Policies (Simplifying ensuring access works)
CREATE POLICY "Public Sessions Access" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Messages Access" ON messages FOR ALL USING (true) WITH CHECK (true);

-- Read-only Access for Configs (for Public/App)
CREATE POLICY "Public Read Products" ON products FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "Public Read Media" ON media_library FOR SELECT TO anon USING (true);
CREATE POLICY "Public Read Persona" ON persona_config FOR SELECT TO anon USING (true);
CREATE POLICY "Public Read AI Config" ON ai_config FOR SELECT TO anon USING (true);

-- Authenticated (Admin) Full Access
CREATE POLICY "Admin Full Access Products" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access Media" ON media_library FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access Persona" ON persona_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin Full Access AI Config" ON ai_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

