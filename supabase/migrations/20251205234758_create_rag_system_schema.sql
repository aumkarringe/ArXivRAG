/*
  # RAG System Database Schema for arXiv Papers

  ## 1. New Tables
  
  ### `user_roles`
  - Defines available roles in the system (admin, researcher, student, guest)
  - `id` (uuid, primary key)
  - `name` (text, unique) - role name
  - `description` (text) - role description
  - `access_level` (integer) - numerical hierarchy for access control
  
  ### `user_profiles`
  - Extended user information with role assignment
  - `id` (uuid, primary key, references auth.users)
  - `role_id` (uuid, references user_roles)
  - `organization` (text) - user's organization
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  
  ### `research_papers`
  - Stores arXiv paper metadata
  - `id` (text, primary key) - arXiv ID (e.g., "0704.0001")
  - `title` (text)
  - `authors` (text)
  - `authors_parsed` (jsonb) - structured author data
  - `abstract` (text)
  - `categories` (text[]) - array of categories
  - `submitter` (text)
  - `comments` (text)
  - `journal_ref` (text)
  - `doi` (text)
  - `report_no` (text)
  - `license` (text)
  - `versions` (jsonb) - version history
  - `update_date` (date)
  - `created_at` (timestamptz)
  - `access_level` (integer) - minimum role level required to access
  - `embedding` (vector(768)) - vector embedding for similarity search
  
  ### `query_logs`
  - Logs all queries for analytics and improvement
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `query_text` (text)
  - `retrieved_papers` (text[]) - array of paper IDs
  - `generated_response` (text)
  - `model_used` (text)
  - `created_at` (timestamptz)
  
  ### `datasets`
  - Extensibility: Store metadata about different datasets
  - `id` (uuid, primary key)
  - `name` (text)
  - `type` (text) - 'arxiv', 'kaggle', 'custom'
  - `schema_config` (jsonb) - flexible schema mapping
  - `access_level` (integer)
  - `created_at` (timestamptz)
  
  ## 2. Security
  - Enable RLS on all tables
  - Create policies for role-based access control
  - Users can only query papers at or below their access level
  - Admins can access everything
  
  ## 3. Indexes
  - Vector similarity index using HNSW for fast retrieval
  - GIN index on categories for category filtering
  - B-tree indexes on frequently queried fields
*/

-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text NOT NULL,
  access_level integer UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role_id uuid REFERENCES user_roles ON DELETE SET NULL,
  organization text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create datasets table for extensibility
CREATE TABLE IF NOT EXISTS datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  type text NOT NULL,
  schema_config jsonb DEFAULT '{}'::jsonb,
  access_level integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create research_papers table
CREATE TABLE IF NOT EXISTS research_papers (
  id text PRIMARY KEY,
  title text NOT NULL,
  authors text NOT NULL,
  authors_parsed jsonb DEFAULT '[]'::jsonb,
  abstract text NOT NULL,
  categories text[] DEFAULT ARRAY[]::text[],
  submitter text DEFAULT '',
  comments text DEFAULT '',
  journal_ref text DEFAULT '',
  doi text DEFAULT '',
  report_no text DEFAULT '',
  license text DEFAULT '',
  versions jsonb DEFAULT '[]'::jsonb,
  update_date date,
  created_at timestamptz DEFAULT now(),
  access_level integer DEFAULT 0,
  dataset_id uuid REFERENCES datasets ON DELETE SET NULL,
  embedding vector(768)
);

-- Create query_logs table
CREATE TABLE IF NOT EXISTS query_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  query_text text NOT NULL,
  retrieved_papers text[] DEFAULT ARRAY[]::text[],
  generated_response text DEFAULT '',
  model_used text DEFAULT 'gemini',
  created_at timestamptz DEFAULT now()
);

-- Insert default roles
INSERT INTO user_roles (name, description, access_level)
VALUES 
  ('guest', 'Limited access to public papers only', 0),
  ('student', 'Access to most papers and basic features', 1),
  ('researcher', 'Full access to papers and advanced features', 2),
  ('admin', 'Full system access including user management', 3)
ON CONFLICT (name) DO NOTHING;

-- Insert default dataset
INSERT INTO datasets (name, type, schema_config, access_level)
VALUES (
  'arXiv Papers',
  'arxiv',
  '{"id_field": "id", "title_field": "title", "content_field": "abstract", "embedding_fields": ["title", "abstract"]}'::jsonb,
  0
)
ON CONFLICT (name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_papers_embedding ON research_papers USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_papers_categories ON research_papers USING gin (categories);
CREATE INDEX IF NOT EXISTS idx_papers_access_level ON research_papers (access_level);
CREATE INDEX IF NOT EXISTS idx_papers_update_date ON research_papers (update_date DESC);
CREATE INDEX IF NOT EXISTS idx_query_logs_user ON query_logs (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;

-- Policies for user_roles (read-only for authenticated users)
CREATE POLICY "Anyone can view roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (true);

-- Policies for user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policies for datasets
CREATE POLICY "Authenticated users can view datasets"
  ON datasets FOR SELECT
  TO authenticated
  USING (
    access_level <= (
      SELECT COALESCE(r.access_level, 0)
      FROM user_profiles p
      LEFT JOIN user_roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
    )
  );

-- Policies for research_papers (RBAC based on access_level)
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

-- Policies for query_logs
CREATE POLICY "Users can view own queries"
  ON query_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own queries"
  ON query_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admin policies (users with access_level 3 can do everything)
CREATE POLICY "Admins can manage all papers"
  ON research_papers FOR ALL
  TO authenticated
  USING (
    (
      SELECT COALESCE(r.access_level, 0)
      FROM user_profiles p
      LEFT JOIN user_roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
    ) = 3
  );

CREATE POLICY "Admins can view all query logs"
  ON query_logs FOR SELECT
  TO authenticated
  USING (
    (
      SELECT COALESCE(r.access_level, 0)
      FROM user_profiles p
      LEFT JOIN user_roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
    ) = 3
  );

-- Function to get similar papers using vector search
CREATE OR REPLACE FUNCTION search_similar_papers(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  filter_categories text[] DEFAULT NULL
)
RETURNS TABLE (
  id text,
  title text,
  authors text,
  abstract text,
  categories text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_access_level integer;
BEGIN
  -- Get user's access level
  SELECT COALESCE(r.access_level, 0) INTO user_access_level
  FROM user_profiles p
  LEFT JOIN user_roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
  
  -- Return similar papers
  RETURN QUERY
  SELECT
    rp.id,
    rp.title,
    rp.authors,
    rp.abstract,
    rp.categories,
    1 - (rp.embedding <=> query_embedding) AS similarity
  FROM research_papers rp
  WHERE 
    rp.access_level <= user_access_level
    AND (filter_categories IS NULL OR rp.categories && filter_categories)
    AND 1 - (rp.embedding <=> query_embedding) > match_threshold
  ORDER BY rp.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;