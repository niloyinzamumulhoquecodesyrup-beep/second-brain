-- Enable uuid generation for primary keys (if available on your Postgres)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT,
  content TEXT,
  para TEXT DEFAULT 'resource', -- one of project,area,resource,archive
  tags TEXT[],
  distilled BOOLEAN DEFAULT false,
  executive_summary TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes (created_at);
CREATE INDEX IF NOT EXISTS idx_notes_para ON notes (para);

CREATE TABLE IF NOT EXISTS packets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  created_at TIMESTAMP DEFAULT now()
);
