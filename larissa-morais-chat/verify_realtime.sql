-- ============================================
-- VERIFICAÇÃO E CONFIGURAÇÃO DO SUPABASE REALTIME
-- Execute este script no SQL Editor do Supabase
-- ============================================

-- 1. VERIFICAR SE REALTIME ESTÁ HABILITADO
SELECT schemaname, tablename, 
       CASE 
           WHEN tablename = ANY(
               SELECT tablename 
               FROM pg_publication_tables 
               WHERE pubname = 'supabase_realtime'
           ) THEN 'ENABLED ✅'
           ELSE 'DISABLED ❌'
       END as realtime_status
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('sessions', 'messages')
ORDER BY tablename;

-- 2. HABILITAR REALTIME PARA AS TABELAS (se não estiver)
-- Remover primeiro para evitar erro se já existir (ignorar erro se não existir)
DO $$
BEGIN
    -- Tentar remover se já existir (ignora erro se não existir)
    BEGIN
        ALTER PUBLICATION supabase_realtime DROP TABLE sessions;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Ignora erro se não existir
    END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime DROP TABLE messages;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Ignora erro se não existir
    END;
END $$;

-- Adicionar novamente
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- 3. VERIFICAR RLS (Row Level Security) E POLÍTICAS
SELECT 
    tablename,
    CASE WHEN rowsecurity THEN 'ENABLED ✅' ELSE 'DISABLED ❌' END as rls_status
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('sessions', 'messages');

-- 4. VERIFICAR POLÍTICAS EXISTENTES
SELECT 
    schemaname,
    tablename,
    policyname,
    CASE 
        WHEN cmd = '*' THEN 'ALL'
        ELSE cmd 
    END as operation,
    CASE 
        WHEN roles = '{public}' THEN 'public (anon + auth)'
        WHEN roles = '{anon}' THEN 'anon only'
        WHEN roles = '{authenticated}' THEN 'authenticated only'
        ELSE roles::text
    END as allowed_roles
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('sessions', 'messages')
ORDER BY tablename, policyname;

-- 5. GARANTIR QUE AS POLÍTICAS PERMITEM LEITURA ANÔNIMA (importante para Realtime)
-- Se não houver política pública, o Realtime não funcionará para usuários anônimos

-- Verificar se as políticas existem
DO $$
BEGIN
    -- Se a política não existe, cria
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'sessions' 
        AND policyname = 'Public Access Sessions'
    ) THEN
        EXECUTE 'CREATE POLICY "Public Access Sessions" ON sessions FOR ALL USING (true) WITH CHECK (true)';
        RAISE NOTICE 'Política "Public Access Sessions" criada ✅';
    ELSE
        RAISE NOTICE 'Política "Public Access Sessions" já existe ✅';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'messages' 
        AND policyname = 'Public Access Messages'
    ) THEN
        EXECUTE 'CREATE POLICY "Public Access Messages" ON messages FOR ALL USING (true) WITH CHECK (true)';
        RAISE NOTICE 'Política "Public Access Messages" criada ✅';
    ELSE
        RAISE NOTICE 'Política "Public Access Messages" já existe ✅';
    END IF;
END $$;

-- 6. VERIFICAÇÃO FINAL
SELECT 
    '✅ CONFIGURAÇÃO COMPLETA' as status,
    (SELECT COUNT(*) FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename IN ('sessions', 'messages')) as tables_with_realtime,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename IN ('sessions', 'messages')) as total_policies;
