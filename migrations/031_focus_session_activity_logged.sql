-- Lets POST /api/activity/focus be called more than once for the same
-- focus_sessions row (e.g. web and a future Android client both reporting the
-- same completion) without double-counting streaks. The UPDATE ... WHERE
-- activity_logged = false in that route is the check-and-set: only the call
-- that flips it wins, so the activity_log insert only ever happens once per
-- session_id.
ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS activity_logged boolean NOT NULL DEFAULT false;
