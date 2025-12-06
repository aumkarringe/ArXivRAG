import { useState } from 'react';
import { Search, LogOut, User, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, ResearchPaper, QueryResponse } from '../lib/supabase';

export function RAGInterface() {
  const { user, role, signOut } = useAuth();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [error, setError] = useState('');

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResponse(null);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        setError('Authentication required');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/query-rag`;

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          top_k: 5,
          similarity_threshold: 0.5,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to query');
      }

      const data: QueryResponse = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 rounded-lg p-2">
                <Search className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">arXiv RAG System</h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">{user?.email}</span>
                </div>
                {role && (
                  <span className="text-xs text-gray-500 capitalize">
                    Role: {role.name}
                  </span>
                )}
              </div>
              <button
                onClick={() => signOut()}
                className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Ask a Research Question
          </h2>

          <form onSubmit={handleQuery} className="space-y-4">
            <div>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="E.g., What are recent advances in quantum computing? Explain transformers in NLP..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Search Papers</span>
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {response && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Answer</h3>
              <div className="prose prose-blue max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {response.answer}
                </p>
              </div>
            </div>

            {response.papers.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Retrieved Papers ({response.num_papers})
                </h3>
                <div className="space-y-4">
                  {response.papers.map((paper, index) => (
                    <PaperCard key={paper.id} paper={paper} index={index} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function PaperCard({ paper, index }: { paper: ResearchPaper; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded">
              #{index + 1}
            </span>
            {paper.similarity !== undefined && (
              <span className="text-xs text-gray-500">
                Similarity: {(paper.similarity * 100).toFixed(1)}%
              </span>
            )}
          </div>

          <h4 className="font-semibold text-gray-900 mb-2">{paper.title}</h4>

          <p className="text-sm text-gray-600 mb-2">{paper.authors}</p>

          {paper.categories && paper.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {paper.categories.slice(0, 3).map((cat) => (
                <span
                  key={cat}
                  className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}

          <p className="text-sm text-gray-700 line-clamp-3">
            {expanded ? paper.abstract : `${paper.abstract.slice(0, 200)}...`}
          </p>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-600 hover:text-blue-700 mt-2"
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>

          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 ml-4"
            >
              View DOI
            </a>
          )}
        </div>
      </div>
    </div>
  );
}