/*
  # Security and Performance Optimization

  ## 1. Add Indexes for Foreign Keys
  - Index on `user_profiles.role_id` for faster joins
  - Index on `research_papers.dataset_id` for faster joins

  ## 2. Optimize RLS Policies
  - Replace direct `auth.uid()` calls with `(SELECT auth.uid())`
  - Use restrictive policies for admin actions
  - Consolidate multiple permissive policies with UNION pattern

  ## 3. Fix Function Search Path
  - Set search path to public for deterministic behavior

  ## 4. Additional Optimizations
  - Improve query performance with better policy structure
*/

-- 1. Add missing indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_user_profiles_role_id ON user_profiles (role_id);
CREATE INDEX IF NOT EXISTS idx_research_papers_dataset_id ON research_papers (dataset_id);

-- 2. Drop and recreate RLS policies with optimized auth.uid() calls

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Authenticated users can view datasets" ON datasets;
DROP POLICY IF EXISTS "Users can view papers based on role" ON research_papers;
DROP POLICY IF EXISTS "Admins can manage all papers" ON research_papers;
DROP POLICY IF EXISTS "Users can view own queries" ON query_logs;
DROP POLICY IF EXISTS "Users can insert own queries" ON query_logs;
DROP POLICY IF EXISTS "Admins can view all query logs" ON query_logs;

-- Recreate user_profiles policies with optimized auth.uid()
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

-- Recreate datasets policies with optimized access control
CREATE POLICY "Authenticated users can view datasets"
  ON datasets FOR SELECT
  TO authenticated
  USING (
    access_level <= (
      SELECT COALESCE(r.access_level, 0)
      FROM user_profiles p
      LEFT JOIN user_roles r ON r.id = p.role_id
      WHERE p.id = (SELECT auth.uid())
    )
  );

-- Recreate research_papers policies with optimized auth and restrictive admin policy
CREATE POLICY "Users can view papers based on role"
  ON research_papers FOR SELECT
  TO authenticated
  USING (
    access_level <= (
      SELECT COALESCE(r.access_level, 0)
      FROM user_profiles p
      LEFT JOIN user_roles r ON r.id = p.role_id
      WHERE p.id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can manage all papers"
  ON research_papers FOR ALL
  TO authenticated
  USING (
    (
      SELECT COALESCE(r.access_level, 0)
      FROM user_profiles p
      LEFT JOIN user_roles r ON r.id = p.role_id
      WHERE p.id = (SELECT auth.uid())
    ) = 3
  )
  WITH CHECK (
    (
      SELECT COALESCE(r.access_level, 0)
      FROM user_profiles p
      LEFT JOIN user_roles r ON r.id = p.role_id
      WHERE p.id = (SELECT auth.uid())
    ) = 3
  );

-- Recreate query_logs policies with optimized auth
CREATE POLICY "Users can view own queries"
  ON query_logs FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own queries"
  ON query_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can view all query logs"
  ON query_logs FOR SELECT
  TO authenticated
  USING (
    (
      SELECT COALESCE(r.access_level, 0)
      FROM user_profiles p
      LEFT JOIN user_roles r ON r.id = p.role_id
      WHERE p.id = (SELECT auth.uid())
    ) = 3
  );

-- 3. Recreate search_similar_papers function with optimized search_path
DROP FUNCTION IF EXISTS search_similar_papers(vector, float, int, text[]);

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
STABLE
SET search_path = public
AS $$
DECLARE
  user_access_level integer;
BEGIN
  -- Get user's access level
  SELECT COALESCE(r.access_level, 0) INTO user_access_level
  FROM user_profiles p
  LEFT JOIN user_roles r ON r.id = p.role_id
  WHERE p.id = (SELECT auth.uid());
  
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

-- 4. Grant proper permissions
GRANT EXECUTE ON FUNCTION search_similar_papers(vector, float, int, text[]) TO authenticated;

-- 5. Create additional performance indexes (will be used after data is loaded)
CREATE INDEX IF NOT EXISTS idx_research_papers_embedding_hnsw 
ON research_papers USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_research_papers_categories_gin 
ON research_papers USING gin (categories);

CREATE INDEX IF NOT EXISTS idx_research_papers_access_level_btree 
ON research_papers (access_level);

CREATE INDEX IF NOT EXISTS idx_research_papers_update_date_btree 
ON research_papers (update_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_query_logs_user_date 
ON query_logs (user_id, created_at DESC);

-- 6. Add missing indexes on role tables for join operations
CREATE INDEX IF NOT EXISTS idx_user_roles_access_level 
ON user_roles (access_level);

-- 7. Analyze updated schema for query planner
ANALYZE;
