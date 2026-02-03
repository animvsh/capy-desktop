import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isApproved: boolean;
  checkingApproval: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(true);

  // Mutex to prevent concurrent session validation (race condition fix)
  const authLockRef = useRef(false);
  // Track if we've done the initial approval check (to avoid re-showing loading on tab switch)
  const initialCheckDoneRef = useRef(false);

  const checkApprovalStatus = async (email: string, isBackgroundCheck = false) => {
    // Only show loading spinner on initial check, not background re-checks
    // This prevents the entire dashboard from unmounting when switching tabs
    if (!isBackgroundCheck && !initialCheckDoneRef.current) {
      setCheckingApproval(true);
    }
    try {
      const { data, error } = await supabase
        .from("approved_users")
        .select("email")
        .ilike("email", email)
        .maybeSingle();
      
      if (error) {
        if (import.meta.env.DEV) console.error("Error checking approval status:", error);
        setIsApproved(false);
      } else {
        setIsApproved(!!data);
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error("Error checking approval:", e);
      setIsApproved(false);
    } finally {
      setCheckingApproval(false);
      initialCheckDoneRef.current = true;
    }
  };

  useEffect(() => {
    const ensureValidSession = async () => {
      // Mutex: prevent concurrent session validation (race condition fix)
      if (authLockRef.current) return;
      authLockRef.current = true;

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) return;

        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!error && user) return;

        const errorMsg = error?.message ?? "";
        const looksLikeStaleSession =
          errorMsg.includes("Auth session missing") ||
          errorMsg.toLowerCase().includes("invalid") ||
          errorMsg.toLowerCase().includes("expired") ||
          errorMsg.toLowerCase().includes("jwt");

        if (looksLikeStaleSession) {
          const { data: refreshData, error: refreshError } =
            await supabase.auth.refreshSession();

          if (!refreshError && refreshData.session) {
            setSession(refreshData.session);
            setUser(refreshData.session.user);

            if (refreshData.session.user.email) {
              setTimeout(() => {
                // Background check - don't show loading spinner (prevents page remount)
                checkApprovalStatus(refreshData.session.user.email!, true);
              }, 0);
            }

            return;
          }
        }

        // If we can't refresh, force re-login.
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setIsApproved(false);
        setCheckingApproval(false);
      } finally {
        authLockRef.current = false;
      }
    };

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Check approval status when user logs in (using setTimeout to avoid deadlock)
      if (session?.user?.email) {
        setTimeout(() => {
          checkApprovalStatus(session.user.email!);
        }, 0);
      } else {
        setIsApproved(false);
        setCheckingApproval(false);
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      if (session?.user?.email) {
        setTimeout(() => {
          checkApprovalStatus(session.user.email!);
        }, 0);
      } else {
        setCheckingApproval(false);
      }

      // Validate/refresh the session against Supabase (prevents stale JWT usage)
      setTimeout(() => {
        ensureValidSession();
      }, 0);
    });

    const onFocus = () => {
      ensureValidSession();
    };
    window.addEventListener("focus", onFocus);

    // Also run once on mount
    setTimeout(() => {
      ensureValidSession();
    }, 0);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, []);


  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/dashboard`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsApproved(false);
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      isApproved,
      checkingApproval,
      signUp, 
      signIn, 
      signOut,
      resetPassword,
      updatePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}