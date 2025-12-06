# Quick Start Guide

Get your arXiv RAG system running in 10 minutes!

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] Python 3.8+ installed
- [ ] Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))
- [ ] arXiv metadata file downloaded (or use a subset for testing)

## Step 1: Setup Frontend (2 minutes)

```bash
npm install
npm run dev
```

Open `http://localhost:5173` - you should see the login screen.

## Step 2: Create an Account (1 minute)

1. Click "Sign Up"
2. Enter email and password
3. Click "Sign Up"
4. You're now logged in as a Guest (access level 0)

## Step 3: Download arXiv Metadata (5 minutes)

**Option A: Test Dataset (Recommended for first try)**

Download just 1000 papers for testing:
```bash
curl -o test-papers.json "https://arxiv.org/papers/1706.03762" # Example
# OR use the provided test data
```

**Option B: Full Dataset (for production)**

Download the full 5GB file:
```bash
curl -o arxiv-metadata.json https://www.kaggle.com/datasets/Cornell-University/arxiv
```

**Where to put the file**: Save it anywhere on your local machine (e.g., `~/Downloads/arxiv-metadata.json`)

## Step 4: Setup Python Environment (2 minutes)

```bash
cd python-scripts
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` with your credentials:
```env
SUPABASE_URL=https://kbacjxhcrervkwdpomci.supabase.co
SUPABASE_KEY=your-service-role-key  # Get from Supabase dashboard
GEMINI_API_KEY=your-gemini-api-key
```

**Where to get Supabase keys**:
1. Go to your Supabase project dashboard
2. Click "Settings" → "API"
3. Copy "URL" and "service_role key"

## Step 5: Process Papers (10 minutes for 1000 papers)

**Test with 1000 papers first:**
```bash
python preprocess_arxiv.py ~/Downloads/arxiv-metadata.json --limit 1000
```

You'll see:
```
Loading arXiv metadata...
Loaded 1000 papers
Generating embeddings...
100%|████████| 1000/1000
Uploading to Supabase...
Upload complete!
```

## Step 6: Query the System (immediate)

### Option A: Web Interface

1. Go back to `http://localhost:5173`
2. Enter a query: "What are transformers in NLP?"
3. Click "Search Papers"
4. See results!

### Option B: Command Line

```bash
python rag_pipeline.py "What are transformers in NLP?"
```

## Troubleshooting

### "No papers found"

**Cause**: No papers in database yet.

**Fix**: Complete Step 5 (process papers).

### "Error: GEMINI_API_KEY not found"

**Cause**: API key not configured.

**Fix**:
```bash
cd python-scripts
echo "GEMINI_API_KEY=your-key-here" >> .env
```

### "Authentication required"

**Cause**: Not logged in.

**Fix**: Create an account in the web interface (Step 2).

### Python import errors

**Cause**: Dependencies not installed.

**Fix**:
```bash
cd python-scripts
pip install -r requirements.txt
```

## Next Steps

### 1. Process More Papers

```bash
python preprocess_arxiv.py ~/Downloads/arxiv-metadata.json --limit 10000
```

### 2. Test Different LLMs

```bash
python rag_pipeline.py "Your question" --provider openai --model gpt-4
```

### 3. Filter by Category

```bash
python rag_pipeline.py "Your question" --categories cs.AI cs.LG
```

### 4. Upgrade Your Role

By default, you're a Guest (level 0). To upgrade:

```sql
-- In Supabase SQL Editor
UPDATE user_profiles
SET role_id = (SELECT id FROM user_roles WHERE name = 'researcher')
WHERE id = 'your-user-id';
```

Get your user ID from:
- Web interface (shown in header)
- Supabase Dashboard → Auth → Users

## Common Workflows

### Daily Research Workflow

1. Log in to web interface
2. Enter research question
3. Review retrieved papers
4. Click "View DOI" to read full papers
5. Refine query based on results

### Batch Processing New Papers

```bash
python preprocess_arxiv.py new-papers.json --start-from 0
```

### Testing Different Embedding Models

Edit `python-scripts/.env`:
```env
EMBEDDING_MODEL=all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
```

Then update database schema to use 384D vectors.

## Production Deployment

### Frontend
```bash
npm run build
# Upload dist/ to Vercel, Netlify, or your host
```

### Environment Variables
Set these in your hosting provider:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Database
Already hosted on Supabase - no additional setup needed!

## Performance Tips

### Speed Up Preprocessing

**Use GPU** (if available):
```python
encoder = SentenceTransformer(EMBEDDING_MODEL, device='cuda')
```

**Parallel Processing**:
```python
from multiprocessing import Pool
# Process batches in parallel
```

### Optimize Queries

**Reduce top-k** for faster results:
```json
{
  "query": "...",
  "top_k": 3  // Instead of 5
}
```

**Increase threshold** for more relevant results:
```json
{
  "query": "...",
  "similarity_threshold": 0.7  // Instead of 0.5
}
```

## Resources

- [Full Documentation](README.md)
- [Architecture Details](ARCHITECTURE.md)
- [Python Scripts Guide](python-scripts/README.md)
- [Supabase Docs](https://supabase.com/docs)
- [Gemini API Docs](https://ai.google.dev/docs)

## Getting Help

1. Check [Troubleshooting](#troubleshooting) section above
2. Review error messages carefully
3. Check Supabase logs in dashboard
4. Verify API keys are correct

## What's Next?

- [ ] Process full arXiv dataset (2M+ papers)
- [ ] Add more datasets (PubMed, bioRxiv, etc.)
- [ ] Implement paper recommendations
- [ ] Build admin dashboard
- [ ] Add citation graph visualization
- [ ] Export results to PDF

## Success Indicators

You know it's working when:
- ✅ Login/signup flow works
- ✅ Papers visible in database
- ✅ Queries return relevant papers
- ✅ LLM generates coherent answers
- ✅ Access control enforced properly

Congratulations! You now have a production-ready RAG system for research papers.