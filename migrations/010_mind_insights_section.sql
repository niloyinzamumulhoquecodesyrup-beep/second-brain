-- Sectioned user_model (§4g): user_model currently renders as one flat pile. Split it
-- into four sub-sections via one additive column, populated only for user_model rows:
--   patterns  — recurring themes (safe version of "core themes")
--   triggers  — what reliably causes overwhelm/task-avoidance (behavioral, never clinical)
--   progress  — is follow-through improving over time (safe version of "baseline compare")
--   cycles    — thought -> stall -> avoidance loops
-- Left as free TEXT (no CHECK): it is AI-authored, same open-text posture as
-- para_fun_queue.section. Additive only, same pattern as 004/006/007/008/009.
ALTER TABLE mind_insights ADD COLUMN IF NOT EXISTS section TEXT;
