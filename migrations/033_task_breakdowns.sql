-- Logs each AI task-breakdown request (POST /api/tasks/breakdown). Doubles as the
-- source of truth for the per-account daily quota (5/day) -- counting rows here
-- instead of an in-memory limiter (lib/rateLimit.js) so the quota survives
-- serverless cold starts/restarts and is consistent across instances.
CREATE TABLE IF NOT EXISTS task_breakdowns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  task_text TEXT NOT NULL,
  subtasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quota check filters by user_id and a created_at floor, so this composite index
-- covers it directly.
CREATE INDEX IF NOT EXISTS idx_task_breakdowns_user_created ON task_breakdowns (user_id, created_at DESC);

ALTER TABLE task_breakdowns ENABLE ROW LEVEL SECURITY;
