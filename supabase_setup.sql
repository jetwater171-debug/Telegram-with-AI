-- Tabela de Prévias (Vídeos Grátis/Teasers)
CREATE TABLE IF NOT EXISTS previews (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL, -- 'banho', 'siririca', 'tio', 'outros'
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Tabela de Entregáveis (Vídeos Pagos)
CREATE TABLE IF NOT EXISTS deliverables (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Políticas de Segurança (RLS) para Previews
ALTER TABLE previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública de previews"
ON previews FOR SELECT
TO anon
USING (true);

CREATE POLICY "Permitir tudo para autenticados em previews"
ON previews FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Políticas de Segurança (RLS) para Deliverables
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública de deliverables"
ON deliverables FOR SELECT
TO anon
USING (true);

CREATE POLICY "Permitir tudo para autenticados em deliverables"
ON deliverables FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
