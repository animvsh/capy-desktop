/**
 * Browser Automation Hook
 * 
 * Provides React-friendly interface to Playwright browser automation.
 * Manages:
 * - Browser initialization
 * - Profile management
 * - LinkedIn/Twitter automation commands
 * - Live view state
 */

import { useState, useEffect, useCallback } from 'react';

// Types (mirror electron preload types)
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
  requiresApproval?: boolean;
}

interface AutomationRun {
  id: string;
  type: string;
  status: string;
  steps: AutomationStep[];
  currentStepIndex: number;
  target?: { name: string; headline?: string; profileUrl: string };
  message?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

interface LinkedInProfile {
  name: string;
  headline?: string;
  company?: string;
  location?: string;
  connectionDegree?: string;
  profileUrl: string;
}

interface UseBrowserAutomationReturn {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  profiles: BrowserProfile[];
  activeProfileId: string | null;
  currentRun: AutomationRun | null;
  isLoggedIn: boolean;

  // Lifecycle
  initialize: () => Promise<void>;
  shutdown: () => Promise<void>;

  // Profile management
  selectProfile: (platform: 'linkedin' | 'twitter') => Promise<BrowserProfile>;
  
  // Login checks
  checkLinkedInLogin: () => Promise<boolean>;
  checkTwitterLogin: () => Promise<boolean>;
  openLoginPage: (platform: 'linkedin' | 'twitter') => Promise<void>;

  // LinkedIn automation
  linkedinConnect: (targetUrl: string, note?: string) => Promise<void>;
  linkedinMessage: (targetUrl: string, message: string) => Promise<void>;
  linkedinExtractProfile: () => Promise<LinkedInProfile | null>;

  // Twitter automation
  twitterFollow: (username: string) => Promise<void>;
  twitterDM: (username: string, message: string) => Promise<void>;

  // Run control
  stopRun: () => Promise<void>;
  approveAction: () => Promise<void>;
  rejectAction: () => Promise<void>;
}

export function useBrowserAutomation(): UseBrowserAutomationReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [currentRun, setCurrentRun] = useState<AutomationRun | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<string | null>(null);

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && !!window.playwright;

  // Initialize browser
  const initialize = useCallback(async () => {
    if (!isElectron) {
      setError('Browser automation requires the desktop app');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.playwright.initialize();
      if (!result.success) {
        throw new Error(result.error || 'Failed to initialize browser');
      }

      // Load profiles
      const profileList = await window.playwright.getProfiles();
      setProfiles(profileList);
      
      setIsInitialized(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [isElectron]);

  // Shutdown browser
  const shutdown = useCallback(async () => {
    if (!isElectron || !isInitialized) return;

    try {
      await window.playwright.shutdown();
      setIsInitialized(false);
      setActiveProfileId(null);
      setCurrentRun(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [isElectron, isInitialized]);

  // Select/create profile for platform
  const selectProfile = useCallback(async (platform: 'linkedin' | 'twitter'): Promise<BrowserProfile> => {
    if (!isElectron) throw new Error('Not in Electron');

    const result = await window.playwright.getOrCreateProfile(platform);
    if (!result.success || !result.profile) {
      throw new Error(result.error || 'Failed to get profile');
    }

    setActiveProfileId(result.profile.id);
    setIsLoggedIn(result.profile.isLoggedIn);

    // Refresh profiles list
    const profileList = await window.playwright.getProfiles();
    setProfiles(profileList);

    return result.profile;
  }, [isElectron]);

  // Check LinkedIn login
  const checkLinkedInLogin = useCallback(async (): Promise<boolean> => {
    if (!isElectron || !activeProfileId) return false;

    setIsLoading(true);
    try {
      const result = await window.playwright.linkedinCheckLogin(activeProfileId);
      const loggedIn = result.success && result.isLoggedIn === true;
      setIsLoggedIn(loggedIn);
      return loggedIn;
    } finally {
      setIsLoading(false);
    }
  }, [isElectron, activeProfileId]);

  // Check Twitter login
  const checkTwitterLogin = useCallback(async (): Promise<boolean> => {
    if (!isElectron || !activeProfileId) return false;

    setIsLoading(true);
    try {
      const result = await window.playwright.twitterCheckLogin(activeProfileId);
      const loggedIn = result.success && result.isLoggedIn === true;
      setIsLoggedIn(loggedIn);
      return loggedIn;
    } finally {
      setIsLoading(false);
    }
  }, [isElectron, activeProfileId]);

  // Open login page for manual login
  const openLoginPage = useCallback(async (platform: 'linkedin' | 'twitter') => {
    if (!isElectron || !activeProfileId) return;

    const url = platform === 'linkedin' 
      ? 'https://www.linkedin.com/login'
      : 'https://twitter.com/login';

    await window.playwright.navigate(activeProfileId, url);
  }, [isElectron, activeProfileId]);

  // LinkedIn: Send connection request
  const linkedinConnect = useCallback(async (targetUrl: string, note?: string) => {
    if (!isElectron || !activeProfileId) throw new Error('Not ready');

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.playwright.linkedinConnect(activeProfileId, targetUrl, note);
      if (!result.success) {
        throw new Error(result.error || 'Failed to send connection');
      }
      if (result.run) {
        setCurrentRun(result.run);
        if (result.run.status === 'paused') {
          setPendingApproval(result.run.id);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [isElectron, activeProfileId]);

  // LinkedIn: Send message
  const linkedinMessage = useCallback(async (targetUrl: string, message: string) => {
    if (!isElectron || !activeProfileId) throw new Error('Not ready');

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.playwright.linkedinMessage(activeProfileId, targetUrl, message);
      if (!result.success) {
        throw new Error(result.error || 'Failed to send message');
      }
      if (result.run) {
        setCurrentRun(result.run);
        if (result.run.status === 'paused') {
          setPendingApproval(result.run.id);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [isElectron, activeProfileId]);

  // LinkedIn: Extract profile
  const linkedinExtractProfile = useCallback(async (): Promise<LinkedInProfile | null> => {
    if (!isElectron || !activeProfileId) return null;

    try {
      const result = await window.playwright.linkedinExtractProfile(activeProfileId);
      return result.success ? result.profile : null;
    } catch (e) {
      return null;
    }
  }, [isElectron, activeProfileId]);

  // Twitter: Follow user
  const twitterFollow = useCallback(async (username: string) => {
    if (!isElectron || !activeProfileId) throw new Error('Not ready');

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.playwright.twitterFollow(activeProfileId, username);
      if (!result.success) {
        throw new Error(result.error || 'Failed to follow');
      }
      if (result.run) {
        setCurrentRun(result.run);
        if (result.run.status === 'paused') {
          setPendingApproval(result.run.id);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [isElectron, activeProfileId]);

  // Twitter: Send DM
  const twitterDM = useCallback(async (username: string, message: string) => {
    if (!isElectron || !activeProfileId) throw new Error('Not ready');

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.playwright.twitterDM(activeProfileId, username, message);
      if (!result.success) {
        throw new Error(result.error || 'Failed to send DM');
      }
      if (result.run) {
        setCurrentRun(result.run);
        if (result.run.status === 'paused') {
          setPendingApproval(result.run.id);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [isElectron, activeProfileId]);

  // Stop current run
  const stopRun = useCallback(async () => {
    if (!isElectron) return;
    await window.playwright.stopRun();
    setCurrentRun(null);
    setPendingApproval(null);
  }, [isElectron]);

  // Approve pending action
  const approveAction = useCallback(async () => {
    if (!isElectron || !pendingApproval) return;
    await window.playwright.approveAction(pendingApproval);
    setPendingApproval(null);
  }, [isElectron, pendingApproval]);

  // Reject pending action
  const rejectAction = useCallback(async () => {
    if (!isElectron || !pendingApproval) return;
    await window.playwright.rejectAction(pendingApproval);
    setPendingApproval(null);
    setCurrentRun(null);
  }, [isElectron, pendingApproval]);

  // Listen for automation events
  useEffect(() => {
    if (!isElectron) return;

    const unsubscribe = window.playwright.onEvent((event) => {
      switch (event.type) {
        case 'RUN_UPDATE':
          setCurrentRun(event.data.run);
          break;
        case 'NEEDS_APPROVAL':
          setPendingApproval(event.data.runId);
          break;
        case 'RUN_FINISHED':
        case 'STOPPED':
          setCurrentRun(null);
          setPendingApproval(null);
          break;
        case 'browser_error':
          setError(event.data.error);
          break;
      }
    });

    return unsubscribe;
  }, [isElectron]);

  return {
    isInitialized,
    isLoading,
    error,
    profiles,
    activeProfileId,
    currentRun,
    isLoggedIn,
    initialize,
    shutdown,
    selectProfile,
    checkLinkedInLogin,
    checkTwitterLogin,
    openLoginPage,
    linkedinConnect,
    linkedinMessage,
    linkedinExtractProfile,
    twitterFollow,
    twitterDM,
    stopRun,
    approveAction,
    rejectAction,
  };
}

export default useBrowserAutomation;
