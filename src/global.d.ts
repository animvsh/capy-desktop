// Global type declarations for CapyDesktopApp

// Browser automation event types
interface BrowserEvent {
  type: 'BROWSER_FRAME' | 'RUN_UPDATE' | 'NEEDS_APPROVAL' | 'STEP_COMPLETED' | 'RUN_FINISHED' | 'ERROR';
  data: any;
}

// Extend Window interface for Electron IPC
interface Window {
  playwright?: {
    // Lifecycle
    launch: () => Promise<boolean>;
    close: () => Promise<void>;
    getStatus: () => Promise<{ isOpen: boolean }>;
    
    // Navigation
    navigate: (url: string) => Promise<void>;
    screenshot: () => Promise<string>;
    
    // Profile Management
    getProfiles: () => Promise<BrowserProfile[]>;
    createProfile: (name: string, platform: 'linkedin' | 'twitter' | 'generic') => Promise<BrowserProfile>;
    selectProfile: (profileId: string) => Promise<void>;
    getActiveProfile: () => Promise<BrowserProfile | null>;
    
    // Login Management
    checkLoginStatus: (platform: 'linkedin' | 'twitter') => Promise<{ isLoggedIn: boolean; username?: string }>;
    openLoginPage: (platform: 'linkedin' | 'twitter') => Promise<void>;
    
    // Live View / Streaming
    startLiveView: () => Promise<void>;
    stopLiveView: () => Promise<void>;
    startStreaming: (profileId: string, fps: number) => Promise<void>;
    stopStreaming: () => Promise<void>;
    
    // LinkedIn Actions
    linkedinConnect: (profileUrl: string, note?: string) => Promise<void>;
    linkedinMessage: (profileUrl: string, message: string) => Promise<void>;
    linkedInConnect: (profileUrl: string, note?: string) => Promise<AutomationRun>;
    linkedInMessage: (profileUrl: string, message: string) => Promise<AutomationRun>;
    
    // Twitter Actions
    twitterFollow: (username: string) => Promise<void>;
    twitterDM: (username: string, message: string) => Promise<void>;
    
    // Run Management
    getCurrentRun: () => Promise<AutomationRun | null>;
    approveStep: (runId: string, stepId: string) => Promise<void>;
    rejectStep: (runId: string, stepId: string) => Promise<void>;
    approveAction: (runId: string) => Promise<void>;
    rejectAction: (runId: string) => Promise<void>;
    pauseRun: (runId: string) => Promise<void>;
    resumeRun: (runId: string) => Promise<void>;
    stopRun: (runId?: string) => Promise<void>;
    
    // Event Listeners
    onEvent: (callback: (event: BrowserEvent) => void) => () => void;
    onLiveViewFrame: (callback: (frame: string) => void) => () => void;
    onRunProgress: (callback: (run: AutomationRun) => void) => () => void;
    onApprovalRequired: (callback: (request: ApprovalRequest) => void) => () => void;
  };
  
  store?: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    delete: (key: string) => Promise<void>;
    clear: () => Promise<void>;
  };
}

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
    location?: string;
    profileUrl: string;
  };
  message?: string;
  error?: string;
}

interface ApprovalRequest {
  runId: string;
  stepId: string;
  stepName: string;
  description: string;
  data?: Record<string, any>;
}

export {};
