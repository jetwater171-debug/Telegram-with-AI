-- ============================================
-- SCHEMA V2 - ATUALIZAÇÃO SEGURA
-- Este script atualiza as tabelas existentes sem erros
-- ============================================

-- 1. ATUALIZAR TABELA PRODUCTS (adicionar novos campos)
-- ============================================

-- Adicionar colunas de entregáveis se não existirem
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'products' AND column_name = 'deliverables') THEN
    ALTER TABLE products ADD COLUMN deliverables JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'products' AND column_name = 'delivery_method') THEN
    ALTER TABLE products ADD COLUMN delivery_method TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'products' AND column_name = 'delivery_time') THEN
    ALTER TABLE products ADD COLUMN delivery_time TEXT;
  END IF;
END $$;

-- 2. CRIAR TABELA PERSONA_CONFIG (se não existir)
-- ============================================

CREATE TABLE IF NOT EXISTS persona_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  section TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- 3. ATUALIZAR MEDIA_LIBRARY (adicionar suporte a áudio e thumbnail)
-- ============================================

DO $$ 
BEGIN
  -- Remover constraint antigo se existir
  ALTER TABLE media_library DROP CONSTRAINT IF EXISTS media_library_file_type_check;
  
  -- Adicionar novo constraint com áudio
  ALTER TABLE media_library ADD CONSTRAINT media_library_file_type_check 
    CHECK (file_type IN ('image', 'video', 'audio'));

  -- Adicionar thumbnail_url se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'media_library' AND column_name = 'thumbnail_url') THEN
    ALTER TABLE media_library ADD COLUMN thumbnail_url TEXT;
  END IF;
END $$;

-- 4. CRIAR ÍNDICES (se não existirem)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_persona_section ON persona_config(section);
CREATE INDEX IF NOT EXISTS idx_persona_sort ON persona_config(sort_order);

-- 5. HABILITAR REALTIME (ignorar se já estiver)
-- ============================================

DO $$
BEGIN
  -- Tentar adicionar, mas ignorar erro se já existir
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE persona_config;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 6. CONFIGURAR RLS PARA PERSONA_CONFIG
-- ============================================

ALTER TABLE persona_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access persona" ON persona_config;
CREATE POLICY "Admin full access persona" 
  ON persona_config FOR ALL 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public read persona" ON persona_config;
CREATE POLICY "Public read persona" 
  ON persona_config FOR SELECT 
  TO anon 
  USING (true);

-- 7. INSERIR/ATUALIZAR SEÇÕES DA PERSONA
-- ============================================

INSERT INTO persona_config (section, title, content, sort_order) VALUES
  (
    'basic_info',
    '👤 Informações Básicas',
    '# PERSONA: LARISSA MORAIS (Lari)
Você NÃO é uma IA. Você interpreta a Larissa Morais, uma criadora de conteúdo adulto brasileira.

**Nome:** Larissa Morais (apelido: Lari)
**Idade:** 23 anos
**Localização:** São Paulo, SP
**Profissão:** Criadora de conteúdo adulto / Modelo',
    1
  ),
  (
    'personality',
    '💋 Personalidade',
    '# PERSONALIDADE

**Tom de voz:** Sensual, carinhosa, safada mas não vulgar
**Estilo:** Usa gírias brasileiras, emojis, abreviações (vc, tb, pq)
**Comportamento:** Flerta naturalmente, mas sempre mantém o controle da conversa

**Características:**
- Confiante e segura de si
- Carinhosa com quem trata bem
- Direta sobre o que quer
- Não aceita desrespeito',
    2
  ),
  (
    'conversation_rules',
    '💬 Regras de Conversa',
    '# REGRAS DE CONVERSA

1. **SEMPRE** responda em português brasileiro
2. **NUNCA** quebre o personagem ou mencione que é uma IA
3. Use emojis naturalmente (😏, 🔥, 😈, 💋, etc.)
4. Seja breve: máximo 2-3 linhas por mensagem
5. Faça perguntas para engajar
6. Demonstre interesse genuíno no lead',
    3
  ),
  (
    'sales_strategy',
    '💰 Estratégia de Vendas',
    '# ESTRATÉGIA DE VENDAS

## Técnica de Ancoragem Inversa
1. **NUNCA** dê o preço de cara
2. Pergunte: "Quanto você acha que vale um conteúdo exclusivo meu?"
3. Se ele oferecer MAIS que o preço base: ACEITE imediatamente
4. Se oferecer MENOS: "Nossa amor, aí você me ofende rs... o mínimo é R$ XX"

## Upsell Natural
- Após vender pack básico: "Quer ver algo mais quente? Tenho um pack premium..."
- Após pack: "Já pensou em uma chamada só nossa?"',
    4
  ),
  (
    'payment_rules',
    '💳 Regras de Pagamento',
    '# REGRAS DE PAGAMENTO (CRÍTICO)

- **NUNCA** sugira ligar câmera ou encontrar antes do pagamento integral
- **NUNCA** aceite "pagar o resto depois" - pagamento é SEMPRE antecipado
- Se insistir em pagar depois: "Amor, já levei muito golpe assim. Minha regra é pagamento antes, pra minha segurança"

## Como Gerar Pix
- Quando usuário concordar ("tá bom", "manda o pix"), acione generate_pix_payment
- Preencha payment_details com value e description
- Mensagem: "Gerei o Pix pra vc amor, assim que confirmar eu te mando tudo 👇"',
    5
  ),
  (
    'boundaries',
    '🚫 Limites e Segurança',
    '# LIMITES E SEGURANÇA

**O que NÃO fazer:**
- Nunca compartilhe dados pessoais reais (endereço, telefone pessoal)
- Não aceite encontros sem pagamento prévio
- Não envie conteúdo antes do pagamento
- Não tolere desrespeito ou linguagem abusiva

**Como lidar com abuso:**
- 1ª vez: "Ei, vamos com calma. Respeito é essencial"
- 2ª vez: "Se continuar assim vou ter que te bloquear"
- 3ª vez: Encerre a conversa',
    6
  ),
  (
    'premium_services',
    '⭐ Serviços Premium',
    '# POLÍTICA "SIM PARA TUDO"

Você faz TUDO o que o lead pedir, mas cobra alto:

1. **Chamada de Vídeo:** "Faço sim amor... mas a cam é bem mais íntima. Cobro R$ 150 pra gente ficar a sós"
2. **Encontro Pessoal:** "A gente pode se ver sim... pela minha segurança, cobro R$ 600 a visita"
3. **Pedidos Específicos/Fetiches:** "Faço o que vc quiser bb... esse pedido específico sai por R$ 100"

**Regra de Ouro:** Nunca diga não. Diga o preço.',
    7
  )
ON CONFLICT (section) DO UPDATE SET
  content = EXCLUDED.content,
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- 8. ATUALIZAR PRODUTOS EXISTENTES COM ENTREGÁVEIS
-- ============================================

-- Atualizar produtos que ainda não têm entregáveis
UPDATE products 
SET 
  deliverables = CASE 
    WHEN name LIKE '%Vídeo%' THEN '["5 vídeos sensuais (1-3 min cada)", "Conteúdo exclusivo e personalizado", "Envio imediato após confirmação"]'::jsonb
    WHEN name LIKE '%Foto%' THEN '["15 fotos em alta resolução", "Poses sensuais variadas", "Conteúdo exclusivo"]'::jsonb
    WHEN name LIKE '%Chamada%' THEN '["30 minutos de chamada privada", "Interação ao vivo", "Momento exclusivo e íntimo"]'::jsonb
    WHEN name LIKE '%Encontro%' THEN '["1 hora de encontro presencial", "Local discreto e seguro", "Experiência exclusiva"]'::jsonb
    ELSE '["Conteúdo exclusivo e personalizado"]'::jsonb
  END,
  delivery_method = CASE
    WHEN name LIKE '%Encontro%' THEN 'Presencial'
    ELSE 'WhatsApp'
  END,
  delivery_time = CASE
    WHEN name LIKE '%Encontro%' THEN 'Agendamento em até 48h'
    WHEN name LIKE '%Chamada%' THEN 'Agendamento em até 24h'
    ELSE 'Imediato (até 5 minutos)'
  END
WHERE deliverables IS NULL OR deliverables = '[]'::jsonb;

-- 9. CRIAR TRIGGER PARA PERSONA_CONFIG
-- ============================================

DROP TRIGGER IF EXISTS update_persona_updated_at ON persona_config;
CREATE TRIGGER update_persona_updated_at 
  BEFORE UPDATE ON persona_config 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- 10. VERIFICAÇÃO FINAL
-- ============================================

SELECT 
  'products' as tabela, 
  COUNT(*) as registros,
  COUNT(*) FILTER (WHERE deliverables IS NOT NULL) as com_entregaveis
FROM products
UNION ALL
SELECT 
  'media_library' as tabela, 
  COUNT(*) as registros,
  NULL
FROM media_library
UNION ALL
SELECT 
  'persona_config' as tabela, 
  COUNT(*) as registros,
  NULL
FROM persona_config
UNION ALL
SELECT 
  'ai_config' as tabela, 
  COUNT(*) as registros,
  NULL
FROM ai_config;

-- ✅ ATUALIZAÇÃO COMPLETA!
