import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppProvider } from '@/contexts/AppContext';
import { ChatSidebar } from './ChatSidebar';
import { MainContent } from './MainContent';

/**
 * NewAppLayout - Main layout wrapper for the new chat-first interface
 *
 * Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                         Capy App                                 │
 * ├───────────────────┬─────────────────────────────────────────────┤
 * │                   │  [Dashboard] [Conversations] [LinkedIn]      │
 * │   Capy Chat       │  [Contacts] [Meetings] [Settings] [Admin]    │
 * │   Sidebar         ├─────────────────────────────────────────────┤
 * │                   │                                              │
 * │  - Always visible │         Active Panel Content                 │
 * │  - Context aware  │                                              │
 * │  - Collapsible    │                                              │
 * └───────────────────┴─────────────────────────────────────────────┘
 */
export function NewAppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Auth guard - redirect to auth page if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Show loading spinner while checking auth OR while redirecting
  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AppProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        {/* Chat Sidebar - Left side, always visible */}
        <ChatSidebar />

        {/* Main Content - Right side with tabs */}
        <MainContent />
      </div>
    </AppProvider>
  );
}

export default NewAppLayout;
