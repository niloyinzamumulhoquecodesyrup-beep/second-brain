-- Profile fields for the account settings panel: display name, an inline avatar
-- image (stored the same way mindcord_files are -- bytea in the row, no object
-- storage configured for this app), and a soft-deactivation marker.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
