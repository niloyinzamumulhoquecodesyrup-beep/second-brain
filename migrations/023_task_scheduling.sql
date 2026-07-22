-- Lets a task carry an optional time-of-day, alongside its existing due_date, so
-- it can sit in the Today card list's drag-to-reorder + auto-balance flow next to
-- routine instances (which already have start_min/duration_min).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_min INTEGER CHECK (start_min IS NULL OR (start_min >= 0 AND start_min < 1440));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_min INTEGER CHECK (duration_min IS NULL OR (duration_min > 0 AND duration_min <= 1440));
