-- Guided product tour: a one-time, forced walkthrough (Capture -> Organize -> Distill ->
-- Express -> Mind) shown right after onboarding, before the account sees its own (still
-- empty) Mind Model. Entirely a client-side simulated overlay — no demo notes/tasks are
-- ever written to notes/tasks/packets, so this column is the only new state needed.
-- Additive only, same pattern as every migration since 004.
--
-- tour_completed_at is the gate: NULL means the tour has never been finished, so
-- components/TourProvider.js locks navigation to the current tour step. Once set, it is
-- never cleared — same one-time-not-re-triggered posture as users.onboarded_at.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMPTZ;

-- Grandfather in any account that had already finished onboarding before this column
-- existed — the tour is meant for brand-new signups, not to ambush an established
-- account with a forced walkthrough the next time it opens /mind.
UPDATE users SET tour_completed_at = now() WHERE onboarded_at IS NOT NULL AND tour_completed_at IS NULL;
