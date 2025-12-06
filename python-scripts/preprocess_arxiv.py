import json
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client
from tqdm import tqdm
from typing import List, Dict, Any
from datetime import datetime
from config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    EMBEDDING_MODEL,
    EMBEDDING_DIMENSION,
    BATCH_SIZE
)


class ArxivPreprocessor:
    def __init__(self):
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(f"Loading embedding model: {EMBEDDING_MODEL}")
        self.encoder = SentenceTransformer(EMBEDDING_MODEL)

        actual_dim = self.encoder.get_sentence_embedding_dimension()
        if actual_dim != EMBEDDING_DIMENSION:
            print(f"WARNING: Model produces {actual_dim}D vectors, but config expects {EMBEDDING_DIMENSION}D")
            print("Please update EMBEDDING_DIMENSION in .env or change the database schema")

    def load_arxiv_file(self, filepath: str, limit: int = None) -> List[Dict[str, Any]]:
        papers = []
        print(f"Loading arXiv metadata from {filepath}")

        with open(filepath, 'r') as f:
            for i, line in enumerate(tqdm(f, desc="Reading file")):
                if limit and i >= limit:
                    break
                try:
                    paper = json.loads(line)
                    papers.append(paper)
                except json.JSONDecodeError:
                    print(f"Error parsing line {i}")
                    continue

        return papers

    def preprocess_paper(self, paper: Dict[str, Any]) -> Dict[str, Any]:
        categories = paper.get('categories', '').split()

        update_date = None
        if paper.get('update_date'):
            try:
                update_date = datetime.strptime(paper['update_date'], '%Y-%m-%d').date().isoformat()
            except:
                pass

        return {
            'id': paper.get('id', ''),
            'title': paper.get('title', '').strip(),
            'authors': paper.get('authors', '').strip(),
            'authors_parsed': paper.get('authors_parsed', []),
            'abstract': paper.get('abstract', '').strip(),
            'categories': categories,
            'submitter': paper.get('submitter', ''),
            'comments': paper.get('comments', ''),
            'journal_ref': paper.get('journal-ref', ''),
            'doi': paper.get('doi', ''),
            'report_no': paper.get('report-no', ''),
            'license': paper.get('license') if paper.get('license') else '',
            'versions': paper.get('versions', []),
            'update_date': update_date,
            'access_level': 0
        }

    def generate_embeddings(self, papers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        print("Generating embeddings...")
        texts = [
            f"{paper['title']} {paper['abstract']}"
            for paper in papers
        ]

        embeddings = self.encoder.encode(
            texts,
            batch_size=32,
            show_progress_bar=True,
            convert_to_numpy=True
        )

        for paper, embedding in zip(papers, embeddings):
            paper['embedding'] = embedding.tolist()

        return papers

    def upload_to_supabase(self, papers: List[Dict[str, Any]]):
        print(f"Uploading {len(papers)} papers to Supabase...")

        for i in tqdm(range(0, len(papers), BATCH_SIZE), desc="Uploading batches"):
            batch = papers[i:i + BATCH_SIZE]

            try:
                response = self.supabase.table('research_papers').upsert(batch).execute()

                if hasattr(response, 'error') and response.error:
                    print(f"Error in batch {i//BATCH_SIZE}: {response.error}")
            except Exception as e:
                print(f"Exception in batch {i//BATCH_SIZE}: {str(e)}")
                continue

        print("Upload complete!")

    def process_and_upload(self, filepath: str, limit: int = None):
        raw_papers = self.load_arxiv_file(filepath, limit)
        print(f"Loaded {len(raw_papers)} papers")

        processed_papers = [self.preprocess_paper(p) for p in raw_papers]
        print(f"Preprocessed {len(processed_papers)} papers")

        papers_with_embeddings = self.generate_embeddings(processed_papers)

        self.upload_to_supabase(papers_with_embeddings)


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Preprocess arXiv dataset and upload to Supabase')
    parser.add_argument('filepath', type=str, help='Path to arxiv-metadata-oai-snapshot.json')
    parser.add_argument('--limit', type=int, default=None, help='Limit number of papers to process (for testing)')
    parser.add_argument('--start-from', type=int, default=0, help='Skip first N papers')

    args = parser.parse_args()

    preprocessor = ArxivPreprocessor()

    if args.start_from > 0:
        print(f"Skipping first {args.start_from} papers")

    preprocessor.process_and_upload(args.filepath, args.limit)


if __name__ == "__main__":
    main()