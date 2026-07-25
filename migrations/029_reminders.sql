-- Reminders & Alerts (see REMINDERS_PLAN.md). Gentle, personalized nudges -- a single
-- reminders table covers mechanical triggers (task due, routine time) and
-- cycle-authored candidates (routine_suggestion, interest_event) alike, plus a small
-- notification_prefs table for quiet hours and the cycle's own volume-control knob.
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,

  -- what this reminder points at (all optional; at least one set, or none for a
  -- fully custom/cycle-authored one)
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  routine_id uuid REFERENCES planner_routines(id) ON DELETE CASCADE,
  block_id   uuid REFERENCES planner_blocks(id) ON DELETE CASCADE,
  -- a routine_suggestion nudge doesn't duplicate the suggestion payload -- it just
  -- points at the existing planner_prompts row and reuses that accept/dismiss flow
  prompt_id  uuid REFERENCES planner_prompts(id) ON DELETE CASCADE,

  -- gentle, human copy shown in the nudge (never auto-"OVERDUE"). Composed once at
  -- creation time rather than re-derived on read.
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,      -- e.g. { source_url, event_date } for interest_event
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,  -- traceability for cycle-authored candidates

  -- when to fire. one-off uses fire_at; recurring uses rule + time_min.
  fire_at TIMESTAMPTZ,                 -- absolute one-shot
  recur_days INTEGER[],                -- 0=Mon..6=Sun, null = not recurring
  time_min INTEGER CHECK (time_min IS NULL OR (time_min >= 0 AND time_min < 1440)),

  -- lead offset so "remind me 10 min before a routine" works off routine.start_min
  lead_min INTEGER NOT NULL DEFAULT 0,

  kind TEXT NOT NULL DEFAULT 'custom'
       CHECK (kind IN ('task','routine','block','custom','routine_suggestion','interest_event')),
  origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('system','cycle','user')),
  status TEXT NOT NULL DEFAULT 'active'
       CHECK (status IN ('active','done','dismissed')),

  -- snoozing is orthogonal to status -- status stays 'active' while snoozed, and
  -- "done today" for a recurring reminder is just snooze_until = start of tomorrow.
  snooze_until TIMESTAMPTZ,
  last_fired_at TIMESTAMPTZ,           -- reserved for future recurring analytics; not load-bearing in v1
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders (fire_at) WHERE status='active';

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quiet_start_min INTEGER NOT NULL DEFAULT 1320,  -- 22:00
  quiet_end_min   INTEGER NOT NULL DEFAULT 480,   -- 08:00
  daily_surface_cap INTEGER NOT NULL DEFAULT 30,  -- percent; the cycle's own soft targeting heuristic
  web_push_enabled BOOLEAN NOT NULL DEFAULT false
  -- no push_subscription column -- push_subscriptions (004_mind_model.sql) already
  -- exists as its own table for that, unused until Phase B
);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
