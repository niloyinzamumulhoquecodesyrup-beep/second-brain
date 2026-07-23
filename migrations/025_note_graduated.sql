-- A distilled note can "graduate": done with the CODE loop, pulled out of the PARA
-- cube's faces entirely. Kept separate from `para`/archive because archive means
-- "shelved, might come back"; graduated means "finished, on purpose."
ALTER TABLE notes ADD COLUMN IF NOT EXISTS graduated BOOLEAN DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notes_graduated ON notes (user_id, graduated);
