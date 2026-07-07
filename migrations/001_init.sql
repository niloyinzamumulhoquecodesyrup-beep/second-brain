-- Second Brain schema: single-tenant capable, PARA-organized, with note-to-note links.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT,
  para TEXT NOT NULL DEFAULT 'resource' CHECK (para IN ('project','area','resource','archive')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  tags TEXT[] DEFAULT '{}',
  source_url TEXT,
  executive_summary TEXT,
  distilled BOOLEAN DEFAULT false,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes (user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_para ON notes (para);
CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_notes_content_trgm ON notes USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));

-- Note-to-note links, parsed from [[Title]] references in note content. Powers backlinks / the connection graph.
CREATE TABLE IF NOT EXISTS note_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  to_note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (from_note_id, to_note_id)
);

CREATE INDEX IF NOT EXISTS idx_note_links_from ON note_links (from_note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_to ON note_links (to_note_id);

CREATE TABLE IF NOT EXISTS packets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  title TEXT,
  content TEXT,
  done BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packets_user ON packets (user_id);
CREATE INDEX IF NOT EXISTS idx_packets_note ON packets (note_id);
