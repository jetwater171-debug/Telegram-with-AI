
-- Enable RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Public Sessions Access" ON sessions;
DROP POLICY IF EXISTS "Public Messages Access" ON messages;

-- Allow Anon (Public) to do EVERYTHING for now (since we don't have auth yet)
CREATE POLICY "Enable All Access for Anon" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable All Access for Anon Messages" ON messages FOR ALL USING (true) WITH CHECK (true);
