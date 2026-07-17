-- First-time onboarding: a name/age/persona profile plus up to a handful of pasted
-- sources (old AI chats, docs, kanban boards, journals, calendars) the user brings in
-- from elsewhere. Additive only, same pattern as every migration since 004.
--
-- onboarded_at is the gate: NULL means the account has never completed onboarding, so
-- /mind lands on the onboarding flow instead of the normal tabs (see pages/mind.js).
-- Once set, it is never cleared — onboarding is one-time, not re-triggered by empty data.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS persona TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- Raw pasted material from onboarding's last step. Stored as text in Postgres (this
-- app's only storage — MIND_MODEL_BRIEF §1's "no local storage anywhere" rule applies
-- here same as everywhere else), never on the client beyond the collapsed/folded
-- preview the onboarding UI shows while pasting. `processed` is flipped by a refresh
-- cycle once it has actually read and incorporated the content (mind_knowledge topic
-- "onboarding_import_method") — never processed a second time.
CREATE TABLE IF NOT EXISTS onboarding_imports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_imports_user ON onboarding_imports (user_id, processed);
