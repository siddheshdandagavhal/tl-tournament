-- Run this in Supabase SQL Editor (left sidebar → SQL Editor → + New query)

CREATE TABLE tl_tournament (
  id INTEGER PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tl_tournament ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON tl_tournament
  FOR ALL USING (true) WITH CHECK (true);
