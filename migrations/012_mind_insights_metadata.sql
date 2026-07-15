-- Structured insight payloads (§4i): recommendation rows need a machine-renderable home
-- for the learning-path tree (mind_knowledge 01_learning_path_method.md's `path` JSON),
-- optional cited-number charts, an icon, and a personalized suggestion line — separate
-- from the prose `summary`. §4b already anticipated "a metadata field" for this. Nullable
-- default '{}', used only where a cycle chooses to; prose-only insights ignore it.
-- Additive only, same pattern as 004/006/007/008/009/010/011.
ALTER TABLE mind_insights ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
