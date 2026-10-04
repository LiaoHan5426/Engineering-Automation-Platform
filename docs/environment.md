# Development environment

## Available local services

The current local development profile provides:

| Service | Purpose | Required configuration |
|---|---|---|
| PostgreSQL | Task state, Expert manifests, knowledge metadata, rules, audit records, vector index | JDBC URL, username, password, schema, vector extension |
| RustFS | S3-compatible object storage for uploaded documents, artifacts, and evidence | endpoint, access key, secret key, bucket, region/path style |

Do not commit the database password or RustFS credentials. Store them in a local environment file or secret manager.

## PostgreSQL vector preparation

The target schema is `eap`. The backend startup/migration should verify the schema exists and enable the vector extension through a controlled migration, for example:

```sql
CREATE SCHEMA IF NOT EXISTS eap;
CREATE EXTENSION IF NOT EXISTS vector;
```

### First embedding decision

The first local model is **BAAI/bge-m3**, with dimension **1024**. It is a good default for this repository because the expected knowledge base contains Chinese and English engineering documents, and the same dimension can be used for one stable pgvector index. The local runtime is **LM Studio**, which exposes an OpenAI-compatible local API.

### LM Studio setup

1. In LM Studio, download and load a BGE-M3 embedding model.
2. Start the local server, normally at `http://127.0.0.1:1234`.
3. Confirm the model's API identifier in the LM Studio server model list.

The backend calls the OpenAI-compatible endpoint:

```http
POST http://127.0.0.1:1234/v1/embeddings
Content-Type: application/json

{"model":"<lm-studio-bge-m3-id>","input":["Capability validation requires independent evidence."]}
```

The backend must verify that the response contains 1024 values per embedding before writing to PostgreSQL. LM Studio supports local REST and OpenAI-compatible endpoints, including embeddings. [LM Studio server](https://lmstudio.ai/docs/developer/core/server), [LM Studio REST endpoints](https://lmstudio.ai/docs/developer/rest/endpoints)

```text
EAP_EMBEDDING_PROVIDER=lm-studio
EAP_EMBEDDING_MODEL=text-embedding-bge-m3
EAP_EMBEDDING_DIMENSIONS=1024
EAP_EMBEDDING_ENDPOINT=http://127.0.0.1:1234/v1
```

Cloud embeddings remain a configuration option:

```text
EAP_EMBEDDING_PROVIDER=cloud
EAP_EMBEDDING_MODEL=<cloud-model>
EAP_EMBEDDING_API_KEY=<local-secret>
EAP_EMBEDDING_ENDPOINT=<provider-endpoint>
```

The database column is `vector(1024)`. A future model with a different dimension must use a new embedding version/table or a deliberate re-embedding migration; silently changing the dimension is forbidden.

## RustFS preparation

The local RustFS bucket is `eap` and versioning is enabled. Use a non-admin access key restricted to this bucket. The application should store object keys and metadata in PostgreSQL, not binary content in database rows.

Every uploaded document must persist the RustFS object version ID together with the object key, SHA-256, media type, parser status, and embedding version. A new object version creates a new immutable knowledge-document version; it must not silently overwrite an already indexed document.

## Required application configuration

```text
EAP_DB_URL=jdbc:postgresql://localhost:54321/postgres?currentSchema=eap
EAP_DB_USERNAME=postgres
EAP_DB_PASSWORD=<local-secret>
EAP_DB_SCHEMA=eap

EAP_STORAGE_ENDPOINT=http://localhost:9000
EAP_STORAGE_ACCESS_KEY=<rustfs-access-key>
EAP_STORAGE_SECRET_KEY=<rustfs-secret-key>
EAP_STORAGE_BUCKET=eap
EAP_STORAGE_REGION=us-east-1
EAP_STORAGE_PATH_STYLE=true
```

## Still required before knowledge-base features

1. **Embedding runtime:** install and expose the local BGE-M3 model, then define batch size, timeout, and retry policy.
2. **Vector policy:** define chunk size, overlap, supported file types, checksum, embedding version, and re-index behavior.
3. **Migrations:** choose Flyway or Liquibase and make schema/vector/index changes repeatable.
4. **Secrets:** define local `.env` handling and production secret injection; never use a committed password.
5. **Authentication:** even a local system needs an owner/user identity before Expert, knowledge-base, and approval permissions are implemented.

## Not required for the first local phase

- Redis or Kafka: use PostgreSQL task state and an in-process worker initially; add a queue only when concurrency or durability requires it.
- Elasticsearch/OpenSearch: PostgreSQL plus pgvector is sufficient for the first knowledge-base search path.
- Kubernetes: a single Java process, PostgreSQL, and RustFS are enough for local development.
- LLM provider: deterministic capabilities can be implemented without one; add provider credentials only when escalation is enabled.

## Toolchain prerequisites

- JDK 25
- Maven 3.9+
- Git and ripgrep
- Node.js compatible with Vite+
- pnpm 12.x and Vite+
- Rust toolchain only when `apps/desktop` Tauri development starts

## Database initialization

Apply `backend/db/migration/V1__knowledge_base.sql` with the selected migration tool. It creates `eap`, enables `vector`, and creates the initial knowledge-base/document/chunk tables and HNSW cosine index.
