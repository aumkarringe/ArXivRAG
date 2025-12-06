import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface UserProfile {
  id: string;
  role_id: string;
  organization: string;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  name: string;
  description: string;
  access_level: number;
}

export interface ResearchPaper {
  id: string;
  title: string;
  authors: string;
  abstract: string;
  categories: string[];
  journal_ref?: string;
  doi?: string;
  similarity?: number;
}

export interface QueryResponse {
  answer: string;
  papers: ResearchPaper[];
  num_papers: number;
}