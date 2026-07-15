-- "Visit Your Brain," corrected shape (§4f): the brain field renders a registry of
-- sections the refresh cycle itself writes each time — NOT the app's own insight-kind/
-- queue-type taxonomy restated as nodes (that first version was rejected, see §4f).
-- Additive only, same pattern as 004/006/007/008.
--
-- Renderer contract (client reads `metadata` per `renderer`):
--   insight_list      -> metadata.insightKinds: string[] (mind_insights.kind values,
--                        'overview' included if it should appear here)
--   queue / question  -> metadata.questionTypes: string[] | absent (absent = all
--                        pending para_fun_queue rows); optional metadata.excludeTypes
--   activity_digest,
--   feed, reminder    -> metadata.items: [{ text, url?, source_refs? }] — cycle-authored
--                        prose, self-contained (no further join needed to render)
--
-- Same supersede-don't-delete pattern as mind_insights/para_fun_queue: each cycle
-- writes a fresh set and supersedes the prior one, so section history isn't lost.
CREATE TABLE IF NOT EXISTS mind_sections (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  accent TEXT NOT NULL DEFAULT 'emerald' CHECK (accent IN ('rose', 'emerald', 'violet', 'gold', 'mist')),
  renderer TEXT NOT NULL CHECK (renderer IN ('insight_list', 'queue', 'activity_digest', 'feed', 'question', 'reminder')),
  position INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  superseded_by uuid REFERENCES mind_sections(id),
  superseded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mind_sections_user ON mind_sections (user_id);
CREATE INDEX IF NOT EXISTS idx_mind_sections_current ON mind_sections (user_id, superseded_by, position);
