ALTER TABLE kb_chunks
  ALTER COLUMN embedding TYPE vector(1536)
  USING embedding::vector(1536);

CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw_idx
  ON kb_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;
