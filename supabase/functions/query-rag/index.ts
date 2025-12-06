import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface QueryRequest {
  query: string;
  categories?: string[];
  top_k?: number;
  similarity_threshold?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const requestData: QueryRequest = await req.json();

    if (!requestData.query) {
      return new Response(
        JSON.stringify({ error: "Query text is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "LLM API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const queryEmbedding = await generateEmbedding(requestData.query);

    const { data: papers, error: searchError } = await supabaseClient.rpc(
      "search_similar_papers",
      {
        query_embedding: queryEmbedding,
        match_threshold: requestData.similarity_threshold ?? 0.5,
        match_count: requestData.top_k ?? 5,
        filter_categories: requestData.categories ?? null,
      }
    );

    if (searchError) {
      console.error("Search error:", searchError);
      return new Response(
        JSON.stringify({ error: "Error searching papers", details: searchError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const context = formatContext(papers || []);

    const answer = await generateAnswer(
      requestData.query,
      context,
      geminiApiKey
    );

    const paperIds = papers?.map((p: { id: string }) => p.id) || [];
    await supabaseClient.table("query_logs").insert({
      user_id: user.id,
      query_text: requestData.query,
      retrieved_papers: paperIds,
      generated_response: answer,
      model_used: "gemini",
    });

    return new Response(
      JSON.stringify({
        answer,
        papers: papers || [],
        num_papers: papers?.length || 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function generateEmbedding(text: string): Promise<number[]> {
  const embeddingApiUrl = Deno.env.get("EMBEDDING_API_URL");
  
  if (embeddingApiUrl) {
    const response = await fetch(embeddingApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    
    const data = await response.json();
    return data.embedding;
  }
  
  return Array(768).fill(0).map(() => Math.random() * 2 - 1);
}

function formatContext(papers: any[]): string {
  if (papers.length === 0) {
    return "No relevant papers found.";
  }

  return papers
    .map(
      (paper, i) =>
        `Paper ${i + 1}:\n` +
        `Title: ${paper.title}\n` +
        `Authors: ${paper.authors}\n` +
        `Abstract: ${paper.abstract}\n` +
        `Categories: ${paper.categories?.join(", ") || "N/A"}\n` +
        `Similarity: ${paper.similarity?.toFixed(3) || "N/A"}\n`
    )
    .join("\n---\n");
}

async function generateAnswer(
  query: string,
  context: string,
  apiKey: string
): Promise<string> {
  const prompt = `Based on the following research papers context, answer the question.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nProvide a comprehensive answer citing relevant papers from the context.`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" +
      apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    }
  );

  const data = await response.json();
  
  if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  
  throw new Error("Failed to generate answer from Gemini");
}
