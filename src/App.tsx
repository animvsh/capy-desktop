import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageLoader } from "@/components/PageLoader";

// Feature flag for new layout
// Set to true to use the new chat-first interface at /app
// The old dashboard remains available at /dashboard
const USE_NEW_LAYOUT = true;

// Auth pages
const Auth = lazy(() => import("./pages/Auth"));

// New layout (chat sidebar + tabbed panels) - this is the main app
const NewAppLayout = lazy(() => import("./components/layout/NewAppLayout"));

// Support pages
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const BookingPage = lazy(() => import("./pages/BookingPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on rate limit or payment errors
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          if (message.includes("429") || message.includes("402")) {
            return false;
          }
        }
        return failureCount < 3;
      },
      staleTime: 30000,
      refetchOnWindowFocus: false, // Prevent refetch when switching tabs (causes scroll reset)
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Landing redirects to app - NewAppLayout handles auth gating */}
                <Route path="/" element={<Navigate to="/app" replace />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                {/* Main app route - chat sidebar + tabbed panels */}
                <Route path="/app" element={<NewAppLayout />} />
                <Route path="/dashboard" element={<NewAppLayout />} />
                
                {/* Booking page for external users */}
                <Route path="/book/:slug" element={<BookingPage />} />
                
                {/* Legacy routes redirect to app */}
                <Route path="/leads" element={<Navigate to="/app" replace />} />
                <Route path="/conversations/:id" element={<Navigate to="/app" replace />} />
                <Route path="/settings" element={<Navigate to="/app" replace />} />
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </HashRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
