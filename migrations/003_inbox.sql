-- Add the Inbox as PARA's unofficial "folder 0": a friction-free default capture
-- destination, processed into Projects/Areas/Resources/Archives during a weekly review.
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_para_check;
ALTER TABLE notes ADD CONSTRAINT notes_para_check
  CHECK (para IN ('inbox', 'project', 'area', 'resource', 'archive'));
ALTER TABLE notes ALTER COLUMN para SET DEFAULT 'inbox';
