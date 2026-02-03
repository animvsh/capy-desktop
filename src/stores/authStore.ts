import { create } from 'zustand';
import { Session, User, AuthError } from '@supabase/supabase-js';
import { 
  supabase, 
  signInWithEmail, 
  signUpWithEmail, 
  signInWithGoogle, 
  signOut as supabaseSignOut,
  resetPassword as supabaseResetPassword 
} from '../lib/supabase';

interface AuthState {
  // State
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  user: null,
  session: null,
  isLoading: true,
  isInitialized: false,
  error: null,

  // Initialize auth state and set up listeners
  initialize: async () => {
    try {
      // Get initial session
      const { data: { session } } = await supabase.auth.getSession();
      
      set({
        session,
        user: session?.user ?? null,
        isLoading: false,
        isInitialized: true,
      });

      // Listen for auth state changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        
        set({
          session,
          user: session?.user ?? null,
          isLoading: false,
        });

        // Handle token refresh
        if (event === 'TOKEN_REFRESHED') {
          console.log('Token refreshed successfully');
        }

        // Handle sign out
        if (event === 'SIGNED_OUT') {
          set({ user: null, session: null });
        }
      });
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      set({
        isLoading: false,
        isInitialized: true,
        error: 'Failed to initialize authentication',
      });
    }
  },

  // Email/password login
  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const { data, error } = await signInWithEmail(email, password);
      
      if (error) {
        set({ isLoading: false, error: error.message });
        return { success: false, error: error.message };
      }

      set({
        user: data.user,
        session: data.session,
        isLoading: false,
        error: null,
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  // Email/password signup
  signup: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const { data, error } = await signUpWithEmail(email, password);
      
      if (error) {
        set({ isLoading: false, error: error.message });
        return { success: false, error: error.message };
      }

      // If email confirmation is required, user won't be set yet
      if (data.user && !data.session) {
        set({ isLoading: false });
        return { 
          success: true, 
          error: 'Please check your email to confirm your account' 
        };
      }

      set({
        user: data.user,
        session: data.session,
        isLoading: false,
        error: null,
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed';
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  // Google OAuth login
  loginWithGoogle: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const { error } = await signInWithGoogle();
      
      if (error) {
        set({ isLoading: false, error: error.message });
        return { success: false, error: error.message };
      }

      // OAuth redirects, so we don't set loading false here
      // The auth state change listener will handle the session
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google login failed';
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  // Sign out
  logout: async () => {
    set({ isLoading: true });
    
    try {
      await supabaseSignOut();
      set({
        user: null,
        session: null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local state even if server logout fails
      set({
        user: null,
        session: null,
        isLoading: false,
      });
    }
  },

  // Password reset
  resetPassword: async (email: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const { error } = await supabaseResetPassword(email);
      
      if (error) {
        set({ isLoading: false, error: error.message });
        return { success: false, error: error.message };
      }

      set({ isLoading: false });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password reset failed';
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Set session (for external updates)
  setSession: (session: Session | null) => {
    set({
      session,
      user: session?.user ?? null,
    });
  },
}));

export default useAuthStore;
