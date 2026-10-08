CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS kb_documents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  content_hash text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, content_hash)
);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  chunk_index integer NOT NULL,
  content_hash text NOT NULL,
  text text NOT NULL,
  embedding vector(1536),
  page integer,
  section text,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
  UNIQUE (document_id, chunk_index),
  UNIQUE (document_id, content_hash)
);

CREATE INDEX IF NOT EXISTS kb_chunks_document_user_idx ON kb_chunks (user_id, document_id);
CREATE INDEX IF NOT EXISTS kb_chunks_search_vector_idx ON kb_chunks USING gin (search_vector);
