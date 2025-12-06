# arXiv RAG System - Python Scripts

## Overview

This directory contains Python scripts for preprocessing the arXiv dataset and implementing the RAG pipeline.

## Setup

### 1. Install Dependencies

```bash
cd python-scripts
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase service role key (for data upload)
- `GEMINI_API_KEY`: Your Google Gemini API key

Optional (if using other LLMs):
- `OPENAI_API_KEY`: For GPT models
- `ANTHROPIC_API_KEY`: For Claude models

### 3. Embedding Model Configuration

The default model is `all-mpnet-base-v2` (768 dimensions), which matches the database schema.

**Important:** If you want to use a different embedding model, you must:
1. Update `EMBEDDING_MODEL` in `.env`
2. Update `EMBEDDING_DIMENSION` to match your model
3. Update the database schema vector dimension

## Usage

### Preprocessing arXiv Data

The 5GB arXiv metadata file should be processed **locally on your machine**, not uploaded to the web interface.

#### Test with Small Subset (Recommended First)

```bash
python preprocess_arxiv.py /path/to/arxiv-metadata-oai-snapshot.json --limit 1000
```

This processes only the first 1,000 papers for testing.

#### Process Full Dataset

```bash
python preprocess_arxiv.py /path/to/arxiv-metadata-oai-snapshot.json
```

**Warning:** Processing 2+ million papers will take several hours and generate significant API costs for embeddings.

#### Resume from Checkpoint

If processing fails midway:

```bash
python preprocess_arxiv.py /path/to/arxiv-metadata-oai-snapshot.json --start-from 50000
```

### Querying the RAG System

#### Basic Query

```bash
python rag_pipeline.py "What are the recent advances in quantum computing?"
```

#### With Category Filter

```bash
python rag_pipeline.py "Explain transformers in deep learning" --categories cs.AI cs.LG
```

#### Using Different LLM Providers

**Gemini (default):**
```bash
python rag_pipeline.py "Your question" --provider gemini
```

**OpenAI GPT-4:**
```bash
python rag_pipeline.py "Your question" --provider openai --model gpt-4
```

**Anthropic Claude:**
```bash
python rag_pipeline.py "Your question" --provider anthropic --model claude-3-sonnet-20240229
```

#### Retrieve More Papers

```bash
python rag_pipeline.py "Your question" --top-k 10
```

## Architecture

### Files

- **config.py**: Configuration and environment variables
- **llm_provider.py**: LLM abstraction layer for easy provider swapping
- **preprocess_arxiv.py**: Data preprocessing and embedding generation
- **rag_pipeline.py**: Complete RAG implementation
- **requirements.txt**: Python dependencies

### Data Flow

1. **Preprocessing** (One-time):
   - Load arXiv JSON → Parse metadata → Generate embeddings → Upload to Supabase

2. **Query** (Runtime):
   - User query → Encode query → Vector search → Retrieve papers → Generate answer with LLM

### RBAC (Role-Based Access Control)

The system enforces access control at the database level:

- **Guest** (level 0): Public papers only
- **Student** (level 1): Most papers
- **Researcher** (level 2): All papers
- **Admin** (level 3): Full system access

Users can only retrieve papers matching their access level.

## Extending to Other Datasets

To add support for other datasets (e.g., Kaggle CSV):

1. Create a new preprocessor class (similar to `ArxivPreprocessor`)
2. Implement dataset-specific parsing logic
3. Use the same `generate_embeddings()` and `upload_to_supabase()` methods
4. Register the new dataset in the `datasets` table

Example structure:

```python
class KagglePreprocessor:
    def load_csv(self, filepath: str):
        # Load CSV

    def preprocess_row(self, row):
        # Map CSV columns to paper schema

    def process_and_upload(self, filepath: str):
        # Similar flow to ArxivPreprocessor
```

## Performance Tips

1. **Batch Processing**: Adjust `BATCH_SIZE` in `.env` (default: 100)
2. **Parallel Processing**: Use multiprocessing for embedding generation
3. **Incremental Updates**: Process new papers only, not the entire dataset
4. **Index Optimization**: The database uses HNSW index for fast vector search

## Troubleshooting

### "Model produces XD vectors, but config expects YD"

Your embedding model dimension doesn't match the database schema. Either:
- Change the model to match the schema (768D)
- Update the database schema to match your model

### "Error uploading batch"

- Check your Supabase service role key has write permissions
- Verify the paper IDs are unique
- Check for malformed data in the batch

### "Rate limit exceeded"

- Reduce batch size
- Add delays between API calls
- Use a paid API tier with higher limits

## Next Steps

After preprocessing data locally, use the web interface for querying the RAG system with a user-friendly UI and built-in authentication.