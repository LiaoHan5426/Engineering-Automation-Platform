ALTER TABLE eap.knowledge_chunk ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE eap.knowledge_chunk ALTER COLUMN embedding DROP NOT NULL;
