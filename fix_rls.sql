-- ============================================
-- CORREÇÃO CRÍTICA DE RLS (PERMISSÕES)
-- Execute este script para corrigir o erro de salvamento
-- ============================================

-- 1. HABILITAR RLS (Garantir que está ativo)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_config ENABLE ROW LEVEL SECURITY;

-- 2. REMOVER POLÍTICAS ANTIGAS (Para evitar conflitos)
DROP POLICY IF EXISTS "Permitir tudo em products para autenticados" ON products;
DROP POLICY IF EXISTS "Permitir tudo em media_library para autenticados" ON media_library;
DROP POLICY IF EXISTS "Permitir tudo em ai_config para autenticados" ON ai_config;
DROP POLICY IF EXISTS "Admin full access products" ON products;
DROP POLICY IF EXISTS "Admin full access media" ON media_library;
DROP POLICY IF EXISTS "Admin full access persona" ON persona_config;
DROP POLICY IF EXISTS "Admin full access ai_config" ON ai_config;
DROP POLICY IF EXISTS "Public read active products" ON products;
DROP POLICY IF EXISTS "Public read media" ON media_library;
DROP POLICY IF EXISTS "Public read persona" ON persona_config;
DROP POLICY IF EXISTS "Public read ai_config" ON ai_config;

-- 3. CRIAR POLÍTICAS PERMISSIVAS PARA ADMIN (AUTENTICADO)
-- Permite SELECT, INSERT, UPDATE, DELETE para usuários logados

CREATE POLICY "Admin All Products" ON products
FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin All Media" ON media_library
FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin All AI Config" ON ai_config
FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin All Persona" ON persona_config
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. CRIAR POLÍTICAS DE LEITURA PÚBLICA (Para o Chat funcionar)
-- Apenas SELECT para usuários anônimos

CREATE POLICY "Public Read Products" ON products
FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "Public Read Media" ON media_library
FOR SELECT TO anon USING (true);

CREATE POLICY "Public Read AI Config" ON ai_config
FOR SELECT TO anon USING (true);

CREATE POLICY "Public Read Persona" ON persona_config
FOR SELECT TO anon USING (true);

-- 5. VERIFICAÇÃO
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('products', 'media_library', 'ai_config', 'persona_config');
