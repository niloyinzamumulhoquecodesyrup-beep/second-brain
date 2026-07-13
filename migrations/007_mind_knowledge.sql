-- RAG-style methodology store (§4c). Claude Code has no memory between refresh
-- cycles — this table plus MIND_MODEL_BRIEF.md is its entire "how to do this job"
-- knowledge, retrieved at the start of every cycle and refined at the end of it.
CREATE TABLE IF NOT EXISTS mind_knowledge (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('general', 'user')),
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mind_knowledge_user ON mind_knowledge (user_id);
CREATE INDEX IF NOT EXISTS idx_mind_knowledge_scope_topic ON mind_knowledge (scope, topic);
