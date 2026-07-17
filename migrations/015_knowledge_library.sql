-- Knowledge library (§4n): the durable, cumulative record of everything a refresh
-- cycle's field investigation has learned — distinct from mind_insights, which is a
-- per-kind snapshot superseded wholesale each cycle. An entry here is upserted by
-- (user_id, domain, title): a cycle that re-encounters something already known bumps
-- cycle_count/last_reinforced_at rather than duplicating or overwriting the row, so
-- the library only ever grows, never resets. Additive only, same pattern as
-- 004/006/007/008/009/010/011/012/013/014.
CREATE TABLE IF NOT EXISTS mind_knowledge_library (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,                  -- e.g. "Philosophy", "Neurobiology" — sections the library page
  entry_type TEXT NOT NULL CHECK (entry_type IN ('concept', 'roadmap', 'fact', 'method')),
  title TEXT NOT NULL,                   -- e.g. "Epistemology"
  summary TEXT NOT NULL,                 -- one short line — the visual (metadata) carries the rest
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, -- concept{definition,branch,philosophers[],related[]} | path | chart
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_learned_at TIMESTAMPTZ DEFAULT now(),
  last_reinforced_at TIMESTAMPTZ DEFAULT now(),
  cycle_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, domain, title)
);

CREATE INDEX IF NOT EXISTS idx_mind_knowledge_library_user ON mind_knowledge_library (user_id, domain);
