-- MINDCORD (§ mindcord): dynamically-created voice/video-and-chat rooms, nested inside
-- the MINDVERSE tab alongside "Other Brains" (021_other_brains.sql) and sharing its
-- anonymous identity (other_brains_identities) and RLS/denormalization contract --
-- rows copy display_name/avatar_key at write time so Realtime's unjoined
-- postgres_changes payload is self-contained.
--
-- Rooms are not user-named: each one is tied to a domain from mind_knowledge_library
-- (the same aggregate 021's interest-cluster map reads from), and is created lazily --
-- the first person to join a domain opens a room for it, rather than a room existing
-- up front for every domain. This is Phase 1 (rooms + presence + chat only); voice/video
-- lands in a later migration once the WebRTC signaling piece is built.
--
-- Room capacity: capped at 6 active participants per room (see MINDCORD_ROOM_CAP in
-- pages/api/mindcord/join.js) because Phase 2's WebRTC is planned as a mesh, not an
-- SFU -- each participant holds a direct connection to every other, so quality and
-- CPU degrade past a handful of peers. A domain that fills one room opens a second.
CREATE TABLE IF NOT EXISTS mindcord_rooms (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mindcord_rooms_domain_open ON mindcord_rooms (domain) WHERE status = 'open';

-- left_at IS NULL means "currently in the room". The partial unique index (rather than
-- a plain UNIQUE(room_id, user_id)) is what allows leave-then-rejoin: a user can pick
-- up multiple historical rows for the same room, but only one active row at a time.
CREATE TABLE IF NOT EXISTS mindcord_participants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id uuid REFERENCES mindcord_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_key TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mindcord_participants_active ON mindcord_participants (room_id, user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mindcord_participants_room ON mindcord_participants (room_id) WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS mindcord_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id uuid REFERENCES mindcord_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_key TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mindcord_messages_room_created ON mindcord_messages (room_id, created_at);

-- Same public-read/deny-write RLS shape as 021_other_brains.sql: Realtime needs SELECT
-- to authorize delivery to the anon key shipped in lib/supabaseClient.js; every write
-- still goes through pages/api/mindcord/*.js using lib/db.js's server pool.
ALTER TABLE mindcord_rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON mindcord_rooms;
CREATE POLICY "public read" ON mindcord_rooms FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE mindcord_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON mindcord_participants;
CREATE POLICY "public read" ON mindcord_participants FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE mindcord_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read" ON mindcord_messages;
CREATE POLICY "public read" ON mindcord_messages FOR SELECT TO anon, authenticated USING (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mindcord_rooms;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mindcord_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mindcord_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
