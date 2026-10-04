-- EAP initial knowledge-base schema.
-- Requires PostgreSQL with the pgvector extension installed on the server.

CREATE SCHEMA IF NOT EXISTS eap;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS eap.knowledge_base (
    id              uuid PRIMARY KEY,
    name            varchar(200) NOT NULL,
    description     text,
    visibility      varchar(32) NOT NULL DEFAULT 'private',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eap.knowledge_document (
    id              uuid PRIMARY KEY,
    knowledge_base_id uuid NOT NULL REFERENCES eap.knowledge_base(id) ON DELETE CASCADE,
    object_key      varchar(1000) NOT NULL,
    source_path     varchar(2000),
    content_sha256  char(64) NOT NULL,
    media_type      varchar(255),
    version         integer NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (knowledge_base_id, object_key, version)
);

CREATE TABLE IF NOT EXISTS eap.knowledge_chunk (
    id              uuid PRIMARY KEY,
    document_id     uuid NOT NULL REFERENCES eap.knowledge_document(id) ON DELETE CASCADE,
    chunk_index     integer NOT NULL,
    content         text NOT NULL,
    token_count     integer,
    embedding_model varchar(255) NOT NULL,
    embedding_version integer NOT NULL DEFAULT 1,
    embedding       vector(1024) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (document_id, chunk_index, embedding_model, embedding_version)
);

CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_hnsw
    ON eap.knowledge_chunk USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS knowledge_document_base_idx
    ON eap.knowledge_document (knowledge_base_id);
