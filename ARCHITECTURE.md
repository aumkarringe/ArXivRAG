# arXiv RAG System Architecture

## Overview

This document provides a detailed technical overview of the RAG system architecture, data flow, and implementation decisions.

## System Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                          USER LAYER                            │
│  ┌──────────────────┐                                         │
│  │   Web Browser    │                                         │
│  └────────┬─────────┘                                         │
└───────────┼───────────────────────────────────────────────────┘
            │
            │ HTTPS
            │
┌───────────▼───────────────────────────────────────────────────┐
│                     FRONTEND (React)                           │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Auth Component  │  RAG Interface  │  Paper Display      ││
│  └──────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────┐│
│  │          Auth Context (Session Management)                ││
│  └──────────────────────────────────────────────────────────┘│
└───────────┬───────────────────────────────────────────────────┘
            │
            │ REST API / WebSocket
            │
┌───────────▼───────────────────────────────────────────────────┐
│                    SUPABASE BACKEND                            │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                  Supabase Auth                            ││
│  │          (JWT-based authentication)                       ││
│  └──────────────────┬───────────────────────────────────────┘│
│                     │                                          │
│  ┌──────────────────▼───────────────────────────────────────┐│
│  │              Edge Function: query-rag                     ││
│  │  • Validate JWT                                           ││
│  │  • Generate query embedding (placeholder/external API)    ││
│  │  • Call vector search function                            ││
│  │  • Format context from retrieved papers                   ││
│  │  • Call Gemini API for answer generation                  ││
│  │  • Log query to database                                  ││
│  └──────────────────┬───────────────────────────────────────┘│
│                     │                                          │
│  ┌──────────────────▼───────────────────────────────────────┐│
│  │           PostgreSQL + pgvector                           ││
│  │  ┌─────────────────────────────────────────────────────┐ ││
│  │  │  Tables:                                             │ ││
│  │  │  • user_roles (RBAC levels)                         │ ││
│  │  │  • user_profiles (user → role mapping)              │ ││
│  │  │  • research_papers (metadata + vector(768))         │ ││
│  │  │  • query_logs (audit trail)                         │ ││
│  │  │  • datasets (extensibility)                         │ ││
│  │  └─────────────────────────────────────────────────────┘ ││
│  │  ┌─────────────────────────────────────────────────────┐ ││
│  │  │  Functions:                                          │ ││
│  │  │  • search_similar_papers(embedding, k, threshold)   │ ││
│  │  └─────────────────────────────────────────────────────┘ ││
│  │  ┌─────────────────────────────────────────────────────┐ ││
│  │  │  Indexes:                                            │ ││
│  │  │  • HNSW vector index (cosine similarity)            │ ││
│  │  │  • GIN index on categories                          │ ││
│  │  │  • B-tree indexes on access_level, update_date      │ ││
│  │  └─────────────────────────────────────────────────────┘ ││
│  │  ┌─────────────────────────────────────────────────────┐ ││
│  │  │  RLS Policies:                                       │ ││
│  │  │  • Users can only query papers ≤ their access level │ ││
│  │  │  • Admins can access all resources                  │ ││
│  │  └─────────────────────────────────────────────────────┘ ││
│  └──────────────────────────────────────────────────────────┘│
└────────────────────────────┬──────────────────────────────────┘
                             │
                             │ HTTPS API Call
                             │
┌────────────────────────────▼──────────────────────────────────┐
│                     EXTERNAL SERVICES                          │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Gemini API (Google)                                      ││
│  │  • Model: gemini-pro                                      ││
│  │  • Input: Context + Query                                 ││
│  │  • Output: Generated answer                               ││
│  └──────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│                   DATA PREPROCESSING                           │
│                   (Local Python Scripts)                       │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  preprocess_arxiv.py                                      ││
│  │  • Load arXiv JSON (5GB)                                  ││
│  │  • Parse metadata                                         ││
│  │  • Generate embeddings (sentence-transformers)            ││
│  │  • Upload to Supabase in batches                          ││
│  └──────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────┐│
│  │  rag_pipeline.py (Testing)                                ││
│  │  • Query system directly from CLI                         ││
│  │  • Swap LLM providers easily                              ││
│  └──────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Preprocessing Flow (One-time)

```
arXiv JSON (5GB)
    │
    ▼
[Load & Parse]
    │
    ├─→ id, title, authors, abstract, categories, etc.
    │
    ▼
[Generate Embeddings]
    │
    ├─→ sentence-transformers (all-mpnet-base-v2)
    ├─→ 768-dimensional vectors
    │
    ▼
[Batch Upload]
    │
    └─→ Supabase: research_papers table
```

### 2. Query Flow (Runtime)

```
User Query: "What are recent advances in quantum computing?"
    │
    ▼
[Frontend] Validate auth → Send to Edge Function
    │
    ▼
[Edge Function]
    ├─→ Generate query embedding (768D)
    ├─→ Call search_similar_papers()
    │   │
    │   ▼
    │   [Vector Search]
    │   ├─→ Cosine similarity with HNSW index
    │   ├─→ Filter by access_level (RBAC)
    │   ├─→ Filter by categories (optional)
    │   └─→ Return top-k papers (default: 5)
    │
    ├─→ Format context from retrieved papers
    │   │
    │   └─→ "Paper 1: [title]\n[abstract]\n---\nPaper 2: ..."
    │
    ├─→ Send to Gemini API
    │   │
    │   └─→ Prompt: "Based on context, answer: [query]"
    │
    ├─→ Receive generated answer
    │
    ├─→ Log query to database
    │
    └─→ Return {answer, papers, num_papers}
    │
    ▼
[Frontend] Display answer + paper cards
```

## Role-Based Access Control (RBAC)

### Database-Level Enforcement

```sql
-- RLS Policy Example
CREATE POLICY "Users can view papers based on role"
  ON research_papers FOR SELECT
  TO authenticated
  USING (
    access_level <= (
      SELECT COALESCE(r.access_level, 0)
      FROM user_profiles p
      LEFT JOIN user_roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
    )
  );
```

### Access Level Hierarchy

```
Level 3: Admin      ─────┐
                         │ Can access all papers
Level 2: Researcher ─────┤
                         │
Level 1: Student    ─────┤
                         │
Level 0: Guest      ─────┘
```

Papers are assigned `access_level` values. Users can only retrieve papers where:
```
paper.access_level <= user.role.access_level
```

## Vector Search Optimization

### HNSW Index Configuration

```sql
CREATE INDEX idx_papers_embedding
ON research_papers
USING hnsw (embedding vector_cosine_ops);
```

**Benefits**:
- Sub-linear search time: O(log n) vs O(n) for brute force
- ~10-50ms for 1M vectors
- 95%+ recall with proper tuning

### Search Function

```sql
FUNCTION search_similar_papers(
  query_embedding vector(768),
  match_threshold float,    -- Min similarity (0-1)
  match_count int,           -- Top-k results
  filter_categories text[]   -- Optional filter
)
```

**Returns**: Papers sorted by cosine similarity with RBAC filtering applied automatically.

## LLM Abstraction Layer

### Design Pattern: Strategy Pattern

```python
# Base class
class LLMProvider(ABC):
    @abstractmethod
    def generate(self, prompt: str, context: str) -> str:
        pass

# Concrete implementations
class GeminiProvider(LLMProvider):
    def generate(self, prompt, context):
        # Gemini-specific logic

class OpenAIProvider(LLMProvider):
    def generate(self, prompt, context):
        # OpenAI-specific logic

# Factory for creation
class LLMFactory:
    @staticmethod
    def create_provider(name: str) -> LLMProvider:
        # Return appropriate provider
```

**Adding New Provider**:
1. Extend `LLMProvider`
2. Implement `generate()` method
3. Register in `LLMFactory`

## Extensibility for Multiple Datasets

### Design

The system uses a flexible schema to support different data sources:

```sql
CREATE TABLE datasets (
  id uuid PRIMARY KEY,
  name text,
  type text,  -- 'arxiv', 'kaggle', 'pubmed', etc.
  schema_config jsonb,  -- Field mappings
  access_level integer
);
```

**Example `schema_config`**:
```json
{
  "id_field": "paper_id",
  "title_field": "paper_title",
  "content_field": "abstract",
  "embedding_fields": ["title", "abstract"]
}
```

### Adding a New Dataset

1. **Create Preprocessor**:
   ```python
   class KagglePreprocessor(BasePreprocessor):
       def load_data(self, filepath):
           # Dataset-specific loading

       def preprocess_row(self, row):
           # Map to unified schema
   ```

2. **Register in Database**:
   ```sql
   INSERT INTO datasets (name, type, schema_config)
   VALUES ('Kaggle Papers', 'kaggle', '...');
   ```

3. **Process and Upload**:
   ```python
   preprocessor = KagglePreprocessor()
   preprocessor.process_and_upload('data.csv')
   ```

4. **Query**: No changes needed! The RAG pipeline works identically.

## Security Considerations

### 1. Authentication
- JWT tokens with expiration
- Secure session management
- Password hashing by Supabase Auth

### 2. Authorization
- Row Level Security (RLS) on all tables
- Database-level enforcement (not application-level)
- Principle of least privilege

### 3. API Security
- Edge Functions require valid JWT
- Rate limiting (Supabase built-in)
- CORS headers properly configured

### 4. Data Protection
- No PII in vector embeddings
- Query logs for audit trails
- Environment variables for API keys

## Performance Optimization

### Database
- HNSW index for fast vector search
- GIN index for category filtering
- B-tree indexes on frequently queried fields
- Connection pooling by Supabase

### Application
- Batch uploads (configurable batch size)
- Parallel processing for embeddings
- Incremental updates (process only new papers)
- Client-side caching of user profile

### LLM
- Stream responses for better UX (future enhancement)
- Cache frequent queries (future enhancement)
- Fallback to cheaper models if quota exceeded

## Scalability

### Current Capacity
- **Papers**: 10M+ (pgvector scales well)
- **Users**: 100K+ (Supabase limit)
- **Concurrent Queries**: 1000+ (Edge Functions auto-scale)

### Scaling Strategies

**Vertical**:
- Upgrade Supabase plan for more compute
- Increase connection pool size

**Horizontal**:
- Shard by category (cs.*, math.*, physics.*)
- Separate read replicas for queries
- CDN for static assets

**If Hitting Limits**:
- Migrate to dedicated Milvus cluster
- Use Redis for caching
- Implement queue system for batch queries

## Monitoring & Analytics

### Query Logs Table

```sql
CREATE TABLE query_logs (
  user_id uuid,
  query_text text,
  retrieved_papers text[],
  generated_response text,
  model_used text,
  created_at timestamptz
);
```

**Insights**:
- Most common query patterns
- Average similarity scores
- Popular paper categories
- Model performance comparison

## Development Workflow

### Local Development
```bash
npm run dev          # Frontend
python rag_pipeline.py "test query"  # Backend testing
```

### Testing
- Unit tests for preprocessing logic
- Integration tests for RAG pipeline
- E2E tests for authentication flow

### Deployment
```bash
npm run build       # Frontend
# Backend automatically deployed (Supabase)
```

## Technology Choices

### Why Supabase over Milvus?

**Supabase (Chosen)**:
- Built-in auth and RBAC
- PostgreSQL (ACID compliance)
- Single backend for metadata + vectors
- Easier to get started

**Milvus**:
- Faster for 100M+ vectors
- Better for specialized vector workloads
- Requires separate metadata store
- More operational complexity

**Recommendation**: Start with Supabase, migrate to Milvus only if scaling beyond 10M papers.

### Why sentence-transformers?

- State-of-the-art semantic search
- Pre-trained models available
- Easy to fine-tune on domain data
- Efficient batching

### Why Gemini?

- Competitive quality with GPT-4
- Lower cost
- Good rate limits on free tier
- Easy to swap via abstraction layer

## Future Architecture Enhancements

1. **Hybrid Search**: Combine keyword (BM25) + semantic search
2. **Re-ranking**: Two-stage retrieval for better precision
3. **Multi-modal**: Support PDFs, images, code
4. **Streaming**: Stream LLM responses for better UX
5. **Caching**: Redis for frequent queries
6. **Analytics Dashboard**: Visualize usage patterns
7. **A/B Testing**: Compare different LLMs/embeddings
8. **Fine-tuning**: Domain-specific embedding models