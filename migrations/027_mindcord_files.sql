-- MINDCORD file/photo sharing: chat messages can now carry an attached file instead
-- of text. Binary bytes live in their own table (mindcord_files), kept OUT of the
-- supabase_realtime publication -- Realtime broadcasts the full row on INSERT, and
-- multi-MB payloads would blow past its message-size ceiling and bloat every
-- subscriber's postgres_changes feed for no reason (nobody needs someone else's raw
-- file bytes pushed at them, only the fact that a message references one).
-- mindcord_messages instead gets lightweight pointer/metadata columns, which stay in
-- Realtime's existing publication and are all the client needs to render an
-- attachment chip and fetch the bytes on demand from pages/api/mindcord/files/[id].js.
CREATE TABLE IF NOT EXISTS mindcord_files (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id uuid REFERENCES mindcord_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mindcord_files_room ON mindcord_files (room_id);

ALTER TABLE mindcord_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE mindcord_messages DROP CONSTRAINT IF EXISTS mindcord_messages_body_check;
ALTER TABLE mindcord_messages ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES mindcord_files(id) ON DELETE SET NULL;
ALTER TABLE mindcord_messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE mindcord_messages ADD COLUMN IF NOT EXISTS file_mime TEXT;
ALTER TABLE mindcord_messages ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE mindcord_messages ADD CONSTRAINT mindcord_messages_body_check CHECK (
  (file_id IS NULL AND body IS NOT NULL AND char_length(body) BETWEEN 1 AND 500)
  OR (file_id IS NOT NULL AND body IS NULL)
);

-- mindcord_files is deliberately never added to the anon-key-readable RLS/Realtime
-- surface (unlike rooms/participants/messages in 022_mindcord.sql) -- it's queried
-- only from the server (lib/db.js pool) via pages/api/mindcord/{upload,files/[id]}.js,
-- which enforce room-membership on every read, so default-deny RLS with no policies
-- is intentional here, not an oversight.
ALTER TABLE mindcord_files ENABLE ROW LEVEL SECURITY;
