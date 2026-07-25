-- Cross-device focus state: a Pomodoro started on any device is visible to the
-- mobile app so it can block distractions and draw a countdown. Complements --
-- does not replace -- activity_log's focus_session entries (002_tasks.sql /
-- activity/focus.js), which still log completed sessions for streaks. This
-- table only ever holds current/recent state, not history.
CREATE TABLE IF NOT EXISTS focus_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'focus',
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_active ON focus_sessions (user_id) WHERE status = 'active';

ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
