-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Drop existing tables to reset (WARNING: This deletes all data)
drop table if exists messages;
drop table if exists sessions;

-- Create Sessions Table
create table sessions (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_name text,
  user_city text,
  device_type text,
  lead_score text,
  status text default 'active',
  last_message_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create Messages Table
create table messages (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references sessions(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  sender text not null,
  content text,
  media_url text,
  media_type text,
  is_internal_thought boolean default false
);

-- Enable RLS (Row Level Security)
alter table sessions enable row level security;
alter table messages enable row level security;

-- Create Policies for Anonymous Access (Public)
-- Allow anyone to insert/select/update sessions (for this demo)
create policy "Public Access Sessions" on sessions
  for all using (true) with check (true);

create policy "Public Access Messages" on messages
  for all using (true) with check (true);

-- Enable Realtime
alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table messages;
