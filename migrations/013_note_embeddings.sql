-- §4h: embeddings + similarity search — the real classification layer. Generated
-- client-side (transformers.js running all-MiniLM-L6-v2 in the browser during a Run
-- now cycle, see pages/mind.js) so no embedding API key ever lives in this app's
-- server code — same "no API key" posture as the rest of the Mind Model. Additive
-- only, same pattern as 004/006/007/008/009/010/011/012.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE notes ADD COLUMN IF NOT EXISTS embedding vector(384);
-- Set once a note's embedding is written; compared against updated_at to find notes
-- that are new or have been edited since their last embed (the delta a cycle embeds).
ALTER TABLE notes ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notes_embedding ON notes USING hnsw (embedding vector_cosine_ops);
