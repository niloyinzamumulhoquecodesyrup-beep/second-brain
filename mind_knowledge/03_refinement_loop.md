# Refinement loop — how this knowledge base is used and updated each cycle

These docs are seeded into the `mind_knowledge` table and retrieved by Claude Code at the start of
every refresh cycle (§6 of MIND_MODEL_BRIEF.md). Claude Code has NO chat context — this table plus the
brief is its entire memory of how to do this job. Treat it as a RAG store: retrieve before writing any
`user_model` or `recommendation` insight, and write refinements back so the next cycle starts smarter.

## Every cycle, in order

1. **Retrieve**: `SELECT * FROM mind_knowledge ORDER BY scope, topic` — read all `general` rows (method)
   and all `user` rows (what previous cycles learned about this user's specifics).
2. **Apply**: run the meta-map (00) at the tier the data supports; build/extend paths per (01); research
   per (02).
3. **Refine — user scope**: after writing insights, write back what was learned *about applying the
   method to this user*: e.g. "prerequisite sequencing chosen over chaining because of abandonment
   pattern; revisit when follow-through improves", "user corrected inferred goal X", "resource format Y
   was acted on, Z was ignored". These are `scope='user'` rows — update in place (set `updated_at`) or
   supersede, don't accumulate contradictory duplicates.
4. **Refine — general scope**: the method docs themselves may be updated when research during a cycle
   finds something better (a new consensus resource-finding technique, a superseded claim). Edit the
   row's content conservatively, keep the source URLs current, and append a dated changelog line at the
   bottom of the doc. Never delete a doc; supersede if a full rewrite is needed.

## Rules

- The "figure out what to figure out" step is already figured out — it's 00_meta_map. Don't ask the
  user what to model; do ask them to *correct* what was modeled (dashboard).
- Re-derive, don't cache conclusions: user-scope knowledge stores *method calibrations and corrections*,
  not stale summaries of the user. The user is re-read from live data every cycle; only the lessons
  about how to read them persist here.
- Every write to `mind_knowledge` keeps provenance: `source_urls` for general rows, note/insight ids in
  content for user rows.
- Safety rules of §8c apply: `mind_knowledge` is a feature-owned table (writable); `notes`/`tasks`/
  `packets` remain read-only.

## Changelog

- 2026-07-13: initial seed (researched and written via Cowork session; sources embedded per-doc).
