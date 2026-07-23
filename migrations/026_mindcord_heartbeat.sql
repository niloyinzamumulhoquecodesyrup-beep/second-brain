-- Mindcord Phase 2: without this, a participant who closes their tab/app without
-- triggering beforeunload (crash, force-quit, a backgrounded mobile tab the OS kills,
-- a dropped network) stays marked "joined" forever -- left_at never gets set because
-- nothing ever calls POST /api/mindcord/leave for them. last_seen_at is refreshed by a
-- client heartbeat (see pages/api/mindcord/heartbeat.js) every ~20s while the room view
-- is mounted; reads that care about "who's actually here" (pages/api/mindcord/rooms.js,
-- join.js, participants.js) lazily expire (left_at = now()) any active row whose
-- heartbeat has gone stale before answering.
ALTER TABLE mindcord_participants ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_mindcord_participants_stale ON mindcord_participants (last_seen_at) WHERE left_at IS NULL;
