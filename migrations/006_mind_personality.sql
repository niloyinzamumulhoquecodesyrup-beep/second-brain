-- Personality model & research layer (§4b): two more mind_insights kinds, both
-- written by Claude Code directly via the Supabase MCP in the manual loop (§6) —
-- no app code generates these. Additive only, same DROP/ADD pattern as 003/005.
ALTER TABLE mind_insights DROP CONSTRAINT IF EXISTS mind_insights_kind_check;
ALTER TABLE mind_insights ADD CONSTRAINT mind_insights_kind_check
  CHECK (kind IN ('interest_cluster', 'open_loop', 'attention_pattern', 'dormant_revival', 'inferred_goal', 'overview', 'user_model', 'recommendation'));
