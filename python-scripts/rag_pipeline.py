from sentence_transformers import SentenceTransformer
from supabase import create_client, Client
from typing import List, Dict, Any, Optional
from llm_provider import LLMFactory, LLMProvider
from config import SUPABASE_URL, SUPABASE_KEY, EMBEDDING_MODEL
import numpy as np


class RAGPipeline:
    def __init__(
        self,
        llm_provider: str = "gemini",
        llm_model: Optional[str] = None,
        top_k: int = 5,
        similarity_threshold: float = 0.5
    ):
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        self.encoder = SentenceTransformer(EMBEDDING_MODEL)

        llm_kwargs = {"model_name": llm_model} if llm_model else {}
        self.llm: LLMProvider = LLMFactory.create_provider(llm_provider, **llm_kwargs)

        self.top_k = top_k
        self.similarity_threshold = similarity_threshold
        self.llm_provider_name = llm_provider

    def encode_query(self, query: str) -> List[float]:
        embedding = self.encoder.encode(query, convert_to_numpy=True)
        return embedding.tolist()

    def retrieve_papers(
        self,
        query_embedding: List[float],
        categories: Optional[List[str]] = None,
        user_token: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        if user_token:
            self.supabase.auth.set_session(user_token, "")

        try:
            response = self.supabase.rpc(
                'search_similar_papers',
                {
                    'query_embedding': query_embedding,
                    'match_threshold': self.similarity_threshold,
                    'match_count': self.top_k,
                    'filter_categories': categories
                }
            ).execute()

            return response.data if response.data else []

        except Exception as e:
            print(f"Error retrieving papers: {str(e)}")
            return []

    def format_context(self, papers: List[Dict[str, Any]]) -> str:
        if not papers:
            return "No relevant papers found."

        context_parts = []
        for i, paper in enumerate(papers, 1):
            context_parts.append(
                f"Paper {i}:\n"
                f"Title: {paper['title']}\n"
                f"Authors: {paper['authors']}\n"
                f"Abstract: {paper['abstract']}\n"
                f"Categories: {', '.join(paper['categories']) if paper['categories'] else 'N/A'}\n"
                f"Similarity: {paper.get('similarity', 0):.3f}\n"
            )

        return "\n---\n".join(context_parts)

    def generate_answer(self, query: str, context: str) -> str:
        try:
            answer = self.llm.generate(query, context)
            return answer
        except Exception as e:
            return f"Error generating answer: {str(e)}"

    def log_query(
        self,
        user_id: str,
        query: str,
        retrieved_papers: List[str],
        response: str
    ):
        try:
            self.supabase.table('query_logs').insert({
                'user_id': user_id,
                'query_text': query,
                'retrieved_papers': retrieved_papers,
                'generated_response': response,
                'model_used': self.llm_provider_name
            }).execute()
        except Exception as e:
            print(f"Error logging query: {str(e)}")

    def query(
        self,
        query_text: str,
        categories: Optional[List[str]] = None,
        user_token: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        print(f"Processing query: {query_text}")

        query_embedding = self.encode_query(query_text)

        retrieved_papers = self.retrieve_papers(
            query_embedding,
            categories=categories,
            user_token=user_token
        )

        print(f"Retrieved {len(retrieved_papers)} papers")

        context = self.format_context(retrieved_papers)

        answer = self.generate_answer(query_text, context)

        if user_id:
            paper_ids = [p['id'] for p in retrieved_papers]
            self.log_query(user_id, query_text, paper_ids, answer)

        return {
            'answer': answer,
            'retrieved_papers': retrieved_papers,
            'num_papers': len(retrieved_papers)
        }


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Query the RAG system')
    parser.add_argument('query', type=str, help='Your research question')
    parser.add_argument('--provider', type=str, default='gemini', choices=['gemini', 'openai', 'anthropic'])
    parser.add_argument('--model', type=str, default=None, help='Specific model name')
    parser.add_argument('--categories', type=str, nargs='+', help='Filter by categories')
    parser.add_argument('--top-k', type=int, default=5, help='Number of papers to retrieve')

    args = parser.parse_args()

    rag = RAGPipeline(
        llm_provider=args.provider,
        llm_model=args.model,
        top_k=args.top_k
    )

    result = rag.query(
        query_text=args.query,
        categories=args.categories
    )

    print("\n" + "="*80)
    print("ANSWER:")
    print("="*80)
    print(result['answer'])
    print("\n" + "="*80)
    print(f"Based on {result['num_papers']} papers")
    print("="*80)


if __name__ == "__main__":
    main()