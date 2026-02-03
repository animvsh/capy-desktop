/// <reference types="vite/client" />

// ============================================
// WINDOW TYPE DECLARATIONS
// ============================================

interface BrowserProfile {
  id: string;
  name: string;
  platform: 'linkedin' | 'twitter' | 'generic';
  userDataDir: string;
  isLoggedIn: boolean;
  lastUsed: number;
}

interface AutomationStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
  description?: string;
  requiresApproval?: boolean;
}

interface AutomationRun {
  id: string;
  type: 'linkedin_connect' | 'linkedin_message' | 'twitter_follow' | 'twitter_dm';
  status: 'idle' | 'running' | 'paused' | 'complete' | 'stopped' | 'failed';
  steps: AutomationStep[];
  currentStepIndex: number;
  target?: {
    name: string;
    headline?: string;
    company?: string;
    profileUrl: string;
  };
  message?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

interface AutomationEvent {
  type: string;
  timestamp: number;
  data: Record<string, any>;
}

interface PlaywrightAPI {
  // Lifecycle
  initialize: () => Promise<{ success: boolean; error?: string }>;
  shutdown: () => Promise<{ success: boolean; error?: string }>;

  // Profile Management
  getProfiles: () => Promise<BrowserProfile[]>;
  createProfile: (platform: 'linkedin' | 'twitter' | 'generic', name?: string) => Promise<{ success: boolean; profile?: BrowserProfile; error?: string }>;
  getOrCreateProfile: (platform: 'linkedin' | 'twitter' | 'generic') => Promise<{ success: boolean; profile?: BrowserProfile; error?: string }>;

  // Live View
  startStreaming: (profileId: string, fps?: number) => Promise<{ success: boolean; error?: string }>;
  stopStreaming: () => Promise<{ success: boolean }>;
  captureFrame: (profileId: string) => Promise<{ success: boolean; frame?: string; error?: string }>;

  // LinkedIn Automation
  linkedinCheckLogin: (profileId: string) => Promise<{ success: boolean; isLoggedIn?: boolean; error?: string }>;
  linkedinNavigate: (profileId: string, url?: string) => Promise<{ success: boolean; error?: string }>;
  linkedinExtractProfile: (profileId: string) => Promise<{ success: boolean; profile?: any; error?: string }>;
  linkedinConnect: (profileId: string, targetUrl: string, note?: string) => Promise<{ success: boolean; run?: AutomationRun; error?: string }>;
  linkedinMessage: (profileId: string, targetUrl: string, message: string) => Promise<{ success: boolean; run?: AutomationRun; error?: string }>;

  // Twitter Automation
  twitterCheckLogin: (profileId: string) => Promise<{ success: boolean; isLoggedIn?: boolean; error?: string }>;
  twitterFollow: (profileId: string, username: string) => Promise<{ success: boolean; run?: AutomationRun; error?: string }>;
  twitterDM: (profileId: string, username: string, message: string) => Promise<{ success: boolean; run?: AutomationRun; error?: string }>;

  // Run Control
  approveAction: (runId: string) => Promise<{ success: boolean; error?: string }>;
  rejectAction: (runId: string) => Promise<{ success: boolean; error?: string }>;
  stopRun: () => Promise<{ success: boolean; error?: string }>;
  getCurrentRun: () => Promise<AutomationRun | null>;

  // Generic Navigation
  navigate: (profileId: string, url: string) => Promise<{ success: boolean; error?: string }>;
  click: (profileId: string, selector: string) => Promise<{ success: boolean; error?: string }>;
  type: (profileId: string, selector: string, text: string) => Promise<{ success: boolean; error?: string }>;
  getState: (profileId: string) => Promise<{ success: boolean; state?: { url: string; title: string }; error?: string }>;

  // Event Listeners
  onEvent: (callback: (event: AutomationEvent) => void) => () => void;
}

interface ElectronBrowserAPI {
  platform: NodeJS.Platform;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
}

// Augment the Window interface globally
interface Window {
  playwright?: PlaywrightAPI;
  electronBrowser?: any;
  electron?: ElectronBrowserAPI;
}
