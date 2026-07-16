-- Dynamic knowledge-galaxy taxonomy (mind_knowledge topic "topic_map_method"). The
-- map rendered by components/KnowledgeGalaxy.js used to be a hardcoded tree in that
-- file; this table lets a refresh cycle grow it with real judgment (new field shows
-- up in the data -> insert the node(s) that field actually warrants), the same
-- self-directed posture 00_meta_map.md established for user_model. Additive only,
-- same pattern as 004/006/007/008/009/010/011/012/013.
--
-- A tree is edited node-by-node, not versioned as a whole set like mind_sections: a
-- cycle upserts by (user_id, slug), and retires a node via active=false rather than
-- deleting it or superseding the whole tree — same supersede-don't-destroy posture,
-- applied per-row instead of per-snapshot. Exactly one root row per account
-- (parent_slug NULL) must exist; cycles must never touch it.
CREATE TABLE IF NOT EXISTS mind_topics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  parent_slug TEXT,
  name TEXT NOT NULL,
  cluster TEXT NOT NULL,
  goal_name TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_mind_topics_user ON mind_topics (user_id, active);
CREATE INDEX IF NOT EXISTS idx_mind_topics_parent ON mind_topics (user_id, parent_slug);
