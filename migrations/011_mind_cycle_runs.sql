-- Cycle health & token spend (§4k): a per-refresh-cycle audit row Claude Code writes at
-- the end of each cycle (§6 manual loop), so the dashboard can report honestly whether
-- the last refresh actually did what it claimed — including partial/failed cycles, not
-- just successes. tokens_used is Claude Code's own self-reported estimate. Additive only,
-- same pattern as 004/006/007/008/009.
CREATE TABLE IF NOT EXISTS mind_cycle_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  tokens_used INTEGER,          -- Claude Code's self-reported estimate for the cycle
  sections_written INTEGER,     -- count of mind_sections rows emitted this cycle
  insights_written INTEGER,     -- count of mind_insights rows written this cycle
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'partial', 'error')),
  notes TEXT,                   -- free text, e.g. what failed on a partial/error cycle
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mind_cycle_runs_user ON mind_cycle_runs (user_id, created_at DESC);
