-- "Other Brains" (§ other_brains): a small cross-account space distinct from every
-- other table in this app, which are all scoped to a single user_id. Four tables:
--
--   other_brains_identities  -- one anonymous handle + avatar per account, chosen once
--   other_brains_messages    -- a shared live chat
--   other_brains_suggestions -- a shared suggestion board
--   other_brains_books       -- "what are you studying now", one row per account, upserted
--
-- Anonymity contract: no query anywhere in the app may join users.email into any
-- other_brains_* response. messages/suggestions/books denormalize display_name and
-- avatar_key onto the row itself at insert time (copied from the identity row by the
-- API, never trusted from the request body) rather than joining
-- other_brains_identities at read time -- Supabase Realtime's postgres_changes
-- payload is the raw row with no join, so a row has to be self-contained for the
-- browser to render a live INSERT/UPDATE event. There's no rename/re-roll feature, so
-- this copy never drifts from the identity row that produced it.
--
-- RLS: this is the first feature in the app to ship a Supabase key to the browser
-- (for Realtime). 020_rls_lockdown.sql already locked every pre-existing table down
-- to deny-all for anon/authenticated. Here, only messages/suggestions/books get an
-- explicit public SELECT policy (Realtime needs it to authorize delivery) -- no
-- INSERT/UPDATE/DELETE policy is ever granted, so the anon key can only read; all
-- writes still go through the API routes using the server's table-owner pool.
-- other_brains_identities gets RLS enabled with no policy at all (deny-all) since the
-- client never reads it directly.
CREATE TABLE IF NOT EXISTS other_brains_identities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 24),
  avatar_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS other_brains_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_key TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_other_brains_messages_created ON other_brains_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS other_brains_suggestions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_key TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_other_brains_suggestions_created ON other_brains_suggestions (created_at DESC);

CREATE TABLE IF NOT EXISTS other_brains_books (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_key TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 280),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_other_brains_books_updated ON other_brains_books (updated_at DESC);

ALTER TABLE other_brains_identities ENABLE ROW LEVEL SECURITY;

ALTER TABLE other_brains_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON other_brains_messages;
CREATE POLICY "public read" ON other_brains_messages FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE other_brains_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON other_brains_suggestions;
CREATE POLICY "public read" ON other_brains_suggestions FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE other_brains_books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON other_brains_books;
CREATE POLICY "public read" ON other_brains_books FOR SELECT TO anon, authenticated USING (true);

-- Registers the three tables for Realtime's logical-replication delivery. The
-- publication itself already exists by default on every Supabase project.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE other_brains_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE other_brains_suggestions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE other_brains_books;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
