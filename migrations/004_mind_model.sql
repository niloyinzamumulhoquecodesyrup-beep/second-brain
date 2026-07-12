-- Mind Model v1: activity capture + synthesized insights. Additive only — no existing
-- table/column is touched. See MIND_MODEL_BRIEF.md for full design context.

-- Raw browser activity from the extension (§3). One row per continuous focused-tab session.
CREATE TABLE IF NOT EXISTS device_activity (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_activity_user ON device_activity (user_id);
CREATE INDEX IF NOT EXISTS idx_device_activity_started_at ON device_activity (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_activity_domain ON device_activity (domain);

-- In-app behavioral events, populated as a side effect of normal use (note/task/packet/focus
-- routes) — see build step 2. event_type is intentionally unconstrained text since the set of
-- event kinds is expected to grow as more routes are instrumented.
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_id uuid,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_event_type ON activity_log (event_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);

-- Output of the daily synthesis job (§4). source_refs is required, not optional: every insight
-- must be traceable back to the notes/activity that produced it (mirror, not oracle — §1).
-- superseded_by lets history stay intact instead of being overwritten in place.
CREATE TABLE IF NOT EXISTS mind_insights (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('interest_cluster', 'open_loop', 'attention_pattern', 'dormant_revival', 'inferred_goal')),
  summary TEXT NOT NULL,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  superseded_by uuid REFERENCES mind_insights(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mind_insights_user ON mind_insights (user_id);
CREATE INDEX IF NOT EXISTS idx_mind_insights_kind ON mind_insights (kind);
CREATE INDEX IF NOT EXISTS idx_mind_insights_created_at ON mind_insights (created_at DESC);
-- Fast lookup of the current (non-superseded) insight per kind — what the dashboard (§8) reads.
CREATE INDEX IF NOT EXISTS idx_mind_insights_current ON mind_insights (user_id, kind) WHERE superseded_by IS NULL;

-- Web Push subscriptions (§5), keyed by the browser-issued endpoint URL.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);
