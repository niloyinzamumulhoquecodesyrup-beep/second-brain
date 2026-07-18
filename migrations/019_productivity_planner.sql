-- Productivity support tab: a day/week planner the refresh cycle co-authors.
-- Three layers, additive only, same pattern as 004..018:
--
--   planner_routines  -> the recurring skeleton ("sleep at 23:00 daily", "gym Mon/Wed/Fri").
--                        Materialized virtually into any day's view client-side; a row here
--                        is only ever created by an explicit user action (typing one in, or
--                        accepting a cycle/starter suggestion chip).
--   planner_blocks    -> concrete entries pinned to one calendar date. status='suggested'
--                        rows are cycle-authored ghosts sitting at a proposed time — inert
--                        until the user accepts (status -> 'active'), retimes, or dismisses
--                        them. A block with routine_id set is a materialized instance of a
--                        routine for that date (created when the user moves/completes/skips
--                        that day's occurrence), and overrides the virtual one.
--   planner_prompts   -> the cycle's conversational side: questions ("which days do you
--                        swim?") and routine suggestions offered as chips. The user's
--                        answers persist here for the NEXT cycle to read and turn into
--                        concrete suggestions — the app itself never invents schedule
--                        content, mirroring the para_fun_queue tap-to-confirm rule.
--
-- Hard rule carried over from para_fun_queue: a cycle writes only 'suggested' blocks and
-- 'pending' prompts; rows with status 'active'/'done'/'skipped' belong to the user and a
-- cycle must never create or edit them.

CREATE TABLE IF NOT EXISTS planner_routines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('sleep', 'work', 'study', 'exercise', 'meals', 'leisure', 'other')),
  -- days of week the routine applies to, 0 = Monday .. 6 = Sunday
  days INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  start_min INTEGER NOT NULL CHECK (start_min >= 0 AND start_min < 1440),
  duration_min INTEGER NOT NULL CHECK (duration_min > 0 AND duration_min <= 1440),
  active BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'cycle', 'starter')),
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_routines_user ON planner_routines (user_id, active);

CREATE TABLE IF NOT EXISTS planner_blocks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('sleep', 'work', 'study', 'exercise', 'meals', 'leisure', 'other')),
  start_min INTEGER NOT NULL CHECK (start_min >= 0 AND start_min < 1440),
  -- duration may cross midnight (sleep 23:00 + 480min); the block belongs to plan_date
  duration_min INTEGER NOT NULL CHECK (duration_min > 0 AND duration_min <= 1440),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('suggested', 'active', 'done', 'skipped', 'dismissed')),
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'cycle', 'routine')),
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  routine_id uuid REFERENCES planner_routines(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_planner_blocks_user_date ON planner_blocks (user_id, plan_date);

CREATE TABLE IF NOT EXISTS planner_prompts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  prompt_type TEXT NOT NULL CHECK (prompt_type IN ('question', 'routine_suggestion')),
  question_text TEXT NOT NULL,
  -- question: quick-reply options, e.g. ["Mon + Thu", "Weekends", "Not right now"]
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- routine_suggestion payload: { title, category, days, start_min, duration_min }
  suggestion JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'dismissed')),
  answer JSONB,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  answered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_planner_prompts_user ON planner_prompts (user_id, status);
