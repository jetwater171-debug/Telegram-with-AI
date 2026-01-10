-- Create table for Telegram Bots
create table if not exists telegram_bots (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  bot_token text not null unique,
  bot_name text,
  webhook_status text default 'pending', -- pending, active, error
  is_active boolean default true,
  config jsonb default '{}'::jsonb -- For future config (welcome msg, etc)
);

-- Enable RLS for security (allowing public insert for now based on current simpler auth model, or restricted)
alter table telegram_bots enable row level security;
create policy "Allow public read/write for demo" on telegram_bots for all using (true) with check (true);

-- Update sessions table to support Telegram
alter table sessions add column if not exists telegram_chat_id text;
alter table sessions add column if not exists bot_id uuid references telegram_bots(id);
-- Add index for fast lookup
create index if not exists idx_sessions_telegram_chat_id on sessions(telegram_chat_id);

-- Add column to messages to track origin (telegram, web, etc) if needed, though 'sender' helps.
-- Adding message_id from telegram to avoid duplicates
alter table messages add column if not exists telegram_message_id text;

-- Function to update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

create trigger update_telegram_bots_updated_at
before update on telegram_bots
for each row
execute procedure update_updated_at_column();
