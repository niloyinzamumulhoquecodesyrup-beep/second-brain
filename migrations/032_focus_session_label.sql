-- A routine-based (or otherwise task-less) focus session has no foreign key
-- that survives to another device -- routines are identified client-side by
-- entry.routine_id/entry.id, which don't map onto a single stable table the
-- way task_id maps onto tasks. Storing the item's title directly is simpler
-- than modeling that, and it's exactly (and only) what a mirrored session on
-- another device needs to render the right label instead of a generic one.
ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS label text;
