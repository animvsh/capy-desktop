import React, { useState, useEffect } from 'react';
import { Layout, ViewMode } from './components/Layout';
import { NavItem } from './components/Sidebar';
import { Chat, Message } from './components/Chat';
import { LiveControl, Step, ExtractedData, PolicyStatus } from './components/LiveControl';
import { AuthGuard } from './components/Auth';
import { useAuthStore } from './stores/authStore';
import { generateId } from './lib/utils';

// Demo data
const demoSteps: Step[] = [
  { id: '1', label: 'Open LinkedIn profile', status: 'completed', duration: 1200 },
  { id: '2', label: 'Extract contact info', status: 'completed', duration: 800 },
  { id: '3', label: 'Generate personalized message', status: 'running' },
  { id: '4', label: 'Review & send connection request', status: 'pending' },
];

const demoExtractedData: ExtractedData = {
  name: 'Sarah Chen',
  company: 'Stripe',
  role: 'Head of Product',
  email: 'sarah.chen@stripe.com',
};

const demoPolicyStatus: PolicyStatus = {
  dailyLimit: 50,
  dailyUsed: 23,
  windowActive: true,
  risks: [],
};

// Main app content (protected by auth)
function AppContent() {
  const [activeNav, setActiveNav] = useState<NavItem>('chat');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hi! I\'m ready to help you with lead outreach. What would you like to do today?',
      timestamp: new Date(Date.now() - 60000),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [isRunning, setIsRunning] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const handleSendMessage = (content: string) => {
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Simulate AI response
    setIsTyping(true);
    setTimeout(() => {
      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: 'I\'ll start working on that right away. You can watch the progress in the live control pane on the right.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handlePause = () => setIsPaused(true);
  const handleResume = () => setIsPaused(false);
  const handleStop = () => {
    setIsRunning(false);
    setIsPaused(false);
  };
  const handleTakeOver = () => {
    console.log('Taking over control...');
  };

  // Render different content based on active nav
  const renderContent = () => {
    switch (activeNav) {
      case 'chat':
        return null; // Uses chatPane and controlPane
      case 'runs':
        return (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-500">Runs view coming soon...</p>
          </div>
        );
      case 'campaigns':
        return (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-500">Campaigns view coming soon...</p>
          </div>
        );
      case 'browser':
        return (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-500">Browser view coming soon...</p>
          </div>
        );
      case 'leads':
        return (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-500">Leads view coming soon...</p>
          </div>
        );
      case 'inbox':
        return (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-500">Inbox view coming soon...</p>
          </div>
        );
      case 'templates':
        return (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-500">Templates view coming soon...</p>
          </div>
        );
      case 'logs':
        return (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-500">Logs view coming soon...</p>
          </div>
        );
      case 'settings':
        return (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-500">Settings view coming soon...</p>
          </div>
        );
      default:
        return null;
    }
  };

  const showSplitView = activeNav === 'chat';

  return (
    <Layout
      activeNav={activeNav}
      onNavigate={setActiveNav}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      chatPane={
        showSplitView ? (
          <Chat
            messages={messages}
            onSendMessage={handleSendMessage}
            isTyping={isTyping}
          />
        ) : undefined
      }
      controlPane={
        showSplitView ? (
          <LiveControl
            url="https://linkedin.com/in/sarah-chen"
            pageTitle="Sarah Chen | LinkedIn"
            steps={demoSteps}
            currentStepId="3"
            extractedData={demoExtractedData}
            draftMessage="Hi Sarah, I noticed your work on Stripe's API platform is impressive. I'd love to connect and discuss..."
            policyStatus={demoPolicyStatus}
            isRunning={isRunning}
            isPaused={isPaused}
            onPause={handlePause}
            onResume={handleResume}
            onStop={handleStop}
            onTakeOver={handleTakeOver}
          />
        ) : undefined
      }
    >
      {!showSplitView && renderContent()}
    </Layout>
  );
}

// Root App component with auth guard
export default function App() {
  const initialize = useAuthStore((state) => state.initialize);

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <AuthGuard>
      <AppContent />
    </AuthGuard>
  );
}
