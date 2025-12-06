import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, UserProfile, UserRole } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, organization?: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadUserProfile(session.user.id);
        } else {
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*, user_roles(*)')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profileData) {
        setProfile(profileData);
        setRole(profileData.user_roles || null);
      } else {
        const guestRole = await getGuestRole();
        await createDefaultProfile(userId, guestRole?.id);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGuestRole = async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('*')
      .eq('name', 'guest')
      .maybeSingle();
    return data;
  };

  const createDefaultProfile = async (userId: string, roleId: string | undefined) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .insert({
        id: userId,
        role_id: roleId,
        organization: ''
      })
      .select()
      .single();

    if (!error && data) {
      setProfile(data);
      if (roleId) {
        const roleData = await supabase
          .from('user_roles')
          .select('*')
          .eq('id', roleId)
          .maybeSingle();
        setRole(roleData.data);
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, organization = '') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (!error && data.user) {
      const guestRole = await getGuestRole();
      await supabase.from('user_profiles').insert({
        id: data.user.id,
        role_id: guestRole?.id,
        organization
      });
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}