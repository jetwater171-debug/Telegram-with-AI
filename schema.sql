-- Tabela de Sessões (Conversas)
create table sessions (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_name text,
  user_city text,
  device_type text,
  lead_score text, -- 'cold', 'warm', 'hot'
  status text default 'active', -- 'active', 'paused' (quando admin assume)
  last_message_at timestamp with time zone default timezone('utc'::text, now())
);

-- Tabela de Mensagens
create table messages (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references sessions(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  sender text not null, -- 'user', 'bot', 'admin'
  content text,
  media_url text,
  media_type text, -- 'image', 'video', 'audio'
  is_internal_thought boolean default false -- se for pensamento da IA
);

-- Habilitar Realtime para essas tabelas
alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table messages;
