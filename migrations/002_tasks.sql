-- Split "done"-ness out of packets (which should be reusable content fragments,
-- per Forte's actual definition of an intermediate packet) into a proper task layer.
ALTER TABLE packets DROP COLUMN IF EXISTS done;

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_note ON tasks (note_id);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks (user_id, done);
