-- Lets a task be split into smaller checklist steps from the focus/pomodoro view.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pieces JSONB NOT NULL DEFAULT '[]'::jsonb;
