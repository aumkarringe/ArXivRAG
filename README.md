# arXiv RAG System

A production-ready Retrieval-Augmented Generation (RAG) system for research paper queries with role-based access control, built with Supabase, React, and Gemini LLM.

## Features

- **Vector Search**: Fast similarity search using Supabase pgvector with HNSW indexing
- **Multiple LLM Support**: Easily swap between Gemini, OpenAI GPT, and Anthropic Claude
- **Role-Based Access Control (RBAC)**: Four-tier access system (Guest, Student, Researcher, Admin)
- **Modern UI**: Clean, responsive interface built with React and Tailwind CSS
- **Extensible Architecture**: Designed to handle multiple datasets beyond arXiv
- **User Authentication**: Secure authentication with Supabase Auth
- **Query Logging**: Track all queries for analytics and system improvement

## Architecture

### Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + pgvector + Edge Functions)
- **LLMs**: Gemini (default), OpenAI GPT, Anthropic Claude
- **Embeddings**: sentence-transformers (Python)
- **Vector Database**: pgvector extension in PostgreSQL

### System Components

```
┌─────────────────┐
│   React Web UI  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Supabase Auth   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│  Edge Function  │─────▶│   Gemini API     │
└────────┬────────┘      └──────────────────┘
         │
         ▼
┌─────────────────┐
│ PostgreSQL +    │
│ pgvector (768D) │
└─────────────────┘
         ▲
         │
┌─────────────────┐
│ Python Scripts  │
│ (Preprocessing) │
└─────────────────┘
```

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Python 3.8+
- Supabase account
- Gemini API key (or OpenAI/Anthropic)

### 2. Clone and Install

```bash
npm install
```

### 3. Environment Setup

The `.env` file should already contain your Supabase credentials. If not, add:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run the Application

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 5. Create an Account

1. Open the application
2. Click "Sign Up"
3. Create an account (starts as Guest role)
4. Start querying!

## Data Pipeline

### Processing arXiv Dataset

The 5GB arXiv metadata file must be processed locally. See `python-scripts/README.md` for detailed instructions.

**Quick Start:**

```bash
cd python-scripts
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials

python preprocess_arxiv.py /path/to/arxiv-metadata-oai-snapshot.json --limit 1000
```

### Data Flow

1. **Load JSON** → Parse arXiv metadata
2. **Generate Embeddings** → Use sentence-transformers (768D vectors)
3. **Upload to Supabase** → Store in `research_papers` table with vector embeddings
4. **Query** → User query → Encode → Vector search → Retrieve papers → Generate answer

## Role-Based Access Control

### Access Levels

| Role       | Access Level | Permissions                           |
|------------|--------------|---------------------------------------|
| Guest      | 0            | Public papers only                    |
| Student    | 1            | Most papers, basic features           |
| Researcher | 2            | All papers, advanced features         |
| Admin      | 3            | Full system access, user management   |

### How It Works

- Access control is enforced at the database level via Row Level Security (RLS)
- Users can only retrieve papers where `paper.access_level <= user.role.access_level`
- Papers are assigned access levels during preprocessing (default: 0 = public)

## LLM Provider Swapping

The system supports multiple LLM providers through an abstraction layer.

### Python Scripts

```python
from rag_pipeline import RAGPipeline

rag = RAGPipeline(llm_provider="gemini")
rag = RAGPipeline(llm_provider="openai", llm_model="gpt-4")
rag = RAGPipeline(llm_provider="anthropic", llm_model="claude-3-sonnet-20240229")

result = rag.query("What are recent advances in quantum computing?")
```

### Supported Providers

- **Gemini** (default): `gemini-pro`
- **OpenAI**: `gpt-4`, `gpt-3.5-turbo`, etc.
- **Anthropic**: `claude-3-sonnet-20240229`, `claude-3-opus-20240229`, etc.

To add a new provider, extend the `LLMProvider` abstract class in `llm_provider.py`.

## Extending to Other Datasets

The system is designed to be dataset-agnostic. To add a new dataset:

### 1. Register the Dataset

```sql
INSERT INTO datasets (name, type, schema_config, access_level)
VALUES (
  'Kaggle Papers',
  'kaggle',
  '{"id_field": "paper_id", "title_field": "title", "content_field": "abstract"}'::jsonb,
  0
);
```

### 2. Create a Preprocessor

```python
class KagglePreprocessor:
    def load_csv(self, filepath: str):
        return pd.read_csv(filepath)

    def preprocess_row(self, row):
        return {
            'id': row['paper_id'],
            'title': row['title'],
            'abstract': row['abstract'],
            # ... map other fields
        }

    def process_and_upload(self, filepath: str):
        df = self.load_csv(filepath)
        papers = [self.preprocess_row(row) for _, row in df.iterrows()]
        papers_with_embeddings = self.generate_embeddings(papers)
        self.upload_to_supabase(papers_with_embeddings)
```

### 3. Use the Same Pipeline

The RAG pipeline works identically regardless of the source dataset.

## Database Schema

### Key Tables

- **user_roles**: Defines access levels (guest, student, researcher, admin)
- **user_profiles**: User information with role assignment
- **research_papers**: Paper metadata with vector embeddings (768D)
- **query_logs**: Query history for analytics
- **datasets**: Metadata about different data sources

### Vector Search Function

```sql
SELECT * FROM search_similar_papers(
  query_embedding := '[0.1, 0.2, ...]',
  match_threshold := 0.5,
  match_count := 5,
  filter_categories := ARRAY['cs.AI', 'cs.LG']
);
```

## API Endpoints

### Edge Function: `query-rag`

**Endpoint**: `POST /functions/v1/query-rag`

**Headers**:
- `Authorization: Bearer <token>`
- `Content-Type: application/json`

**Request**:
```json
{
  "query": "What are recent advances in quantum computing?",
  "categories": ["quant-ph"],
  "top_k": 5,
  "similarity_threshold": 0.5
}
```

**Response**:
```json
{
  "answer": "Based on the retrieved papers...",
  "papers": [
    {
      "id": "2301.12345",
      "title": "Quantum Computing Advances",
      "authors": "Smith et al.",
      "abstract": "...",
      "categories": ["quant-ph"],
      "similarity": 0.89
    }
  ],
  "num_papers": 5
}
```

## Configuration

### Embedding Model

Default: `all-mpnet-base-v2` (768 dimensions)

To use a different model:
1. Update `EMBEDDING_MODEL` in `python-scripts/.env`
2. Update `EMBEDDING_DIMENSION` to match
3. Update database schema if dimension changes

### Performance Tuning

- **Batch Size**: Adjust `BATCH_SIZE` in `.env` (default: 100)
- **Top-K Results**: Change `top_k` parameter in queries (default: 5)
- **Similarity Threshold**: Adjust `similarity_threshold` (default: 0.5)
- **HNSW Index**: Already configured for optimal performance

## Deployment

### Frontend

```bash
npm run build
# Deploy the `dist` folder to your hosting provider
```

### Backend

Supabase handles all backend infrastructure:
- Database (PostgreSQL + pgvector)
- Authentication
- Edge Functions
- API Gateway

## Troubleshooting

### "No papers found"

- Ensure you've preprocessed and uploaded papers to the database
- Check that your user role has sufficient access level
- Verify the similarity threshold isn't too high

### "Authentication required"

- Make sure you're signed in
- Check that your session hasn't expired
- Verify Supabase credentials in `.env`

### Embedding dimension mismatch

- Ensure your embedding model produces 768D vectors
- If using a different model, update the database schema
- Check `EMBEDDING_DIMENSION` in config

## Development

### Project Structure

```
.
├── src/
│   ├── components/         # React components
│   ├── contexts/          # Auth context
│   ├── lib/               # Supabase client
│   └── App.tsx            # Main app
├── python-scripts/         # Data preprocessing
│   ├── config.py          # Configuration
│   ├── llm_provider.py    # LLM abstraction
│   ├── preprocess_arxiv.py
│   └── rag_pipeline.py
└── supabase/
    └── migrations/        # Database migrations

```

### Adding Features

1. **New LLM Provider**: Extend `LLMProvider` class
2. **New Dataset**: Create preprocessor, register in `datasets` table
3. **New Query Filters**: Update edge function and frontend
4. **Admin Dashboard**: Create admin routes with role checking

## Performance

- **Vector Search**: ~10-50ms for 1M vectors with HNSW
- **LLM Generation**: 1-3 seconds (Gemini)
- **Total Query Time**: 2-5 seconds end-to-end

## Security

- Row Level Security (RLS) enforced on all tables
- JWT-based authentication
- API keys stored securely in environment variables
- No direct database access from frontend
- All queries logged for audit trails

## License

MIT

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review `python-scripts/README.md` for preprocessing issues
3. Check Supabase documentation for database/auth issues

## Future Enhancements

- [ ] Multi-modal support (images, PDFs)
- [ ] Advanced filtering (date range, citation count)
- [ ] Citation graph visualization
- [ ] Paper recommendations
- [ ] Export results to PDF/CSV
- [ ] Real-time collaboration
- [ ] Custom embedding models
- [ ] Hybrid search (keyword + semantic)