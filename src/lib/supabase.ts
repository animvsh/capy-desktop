import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lnfkmfjlbisdikwmjxdy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuZmttZmpsYmlzZGlrd21qeGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NTUwMTQsImV4cCI6MjA4MTMzMTAxNH0.Esh7mTTb4kn8UAfPAYR03WhccSo1An7jOdSuQ9ka-LU';

// Custom storage adapter for Electron using electron-store
// Falls back to localStorage for web/dev mode
const createElectronStorage = () => {
  // Check if we're in Electron environment
  const isElectron = typeof window !== 'undefined' && window.electronAPI;

  if (isElectron && window.electronAPI?.store) {
    return {
      getItem: async (key: string): Promise<string | null> => {
        try {
          return await window.electronAPI!.store.get(key) || null;
        } catch {
          return null;
        }
      },
      setItem: async (key: string, value: string): Promise<void> => {
        try {
          await window.electronAPI!.store.set(key, value);
        } catch (error) {
          console.error('Failed to store auth data:', error);
        }
      },
      removeItem: async (key: string): Promise<void> => {
        try {
          await window.electronAPI!.store.delete(key);
        } catch (error) {
          console.error('Failed to remove auth data:', error);
        }
      },
    };
  }

  // Fallback to localStorage for development/web
  return {
    getItem: async (key: string): Promise<string | null> => {
      return localStorage.getItem(key);
    },
    setItem: async (key: string, value: string): Promise<void> => {
      localStorage.setItem(key, value);
    },
    removeItem: async (key: string): Promise<void> => {
      localStorage.removeItem(key);
    },
  };
};

// Create Supabase client with custom storage
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: createElectronStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Helper to get current session
export const getSession = async (): Promise<Session | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// Helper to get current user
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Auth methods
export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
};

export const signUpWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
};

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: typeof window !== 'undefined' 
        ? `${window.location.origin}/auth/callback`
        : undefined,
    },
  });
  return { data, error };
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: typeof window !== 'undefined'
      ? `${window.location.origin}/auth/reset-password`
      : undefined,
  });
  return { data, error };
};

export default supabase;
