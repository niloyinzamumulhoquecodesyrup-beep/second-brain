-- "PARA method made fun" (§4d): one-question-at-a-time queue that advances a note
-- through Capture -> Organize -> Distill -> Express. Populated by Claude Code during
-- the refresh loop (same as mind_insights), answered via the app's own write paths.
-- Hard invariant: nothing is ever written to notes/tasks/packets except through the
-- user tapping an answer — this table is the airlock, never a side channel.
CREATE TABLE IF NOT EXISTS para_fun_queue (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE, -- null for a new_capture_proposal
  question_type TEXT NOT NULL, -- open text, not an enum: Claude Code can introduce new ones
  question_text TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  assumed_answer JSONB,
  section TEXT NOT NULL,
  priority_rank INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'skipped', 'superseded')),
  answer JSONB,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb, -- required: every assumed_answer must be traceable
  created_at TIMESTAMPTZ DEFAULT now(),
  answered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_para_fun_queue_user ON para_fun_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_para_fun_queue_status ON para_fun_queue (user_id, status, priority_rank);
CREATE INDEX IF NOT EXISTS idx_para_fun_queue_note ON para_fun_queue (note_id);
