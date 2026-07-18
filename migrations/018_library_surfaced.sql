-- mind_knowledge_library (015) originally held only findings that also made it into a
-- cycle's Field Investigation Report — anything investigated-but-filtered was written
-- nowhere. The library is meant to be the durable record of everything the brain has
-- learned in the course of research, not just the polished subset shown to the user, so
-- filtered-out findings now get persisted too. `surfaced` distinguishes the two: true for
-- an entry also written to mind_insights (kind='recommendation') this or a prior cycle,
-- false for background research the library alone remembers. Additive only, same pattern
-- as 004/006/007/008/009/010/011/012/013/014/015.
ALTER TABLE mind_knowledge_library ADD COLUMN IF NOT EXISTS surfaced BOOLEAN NOT NULL DEFAULT true;
