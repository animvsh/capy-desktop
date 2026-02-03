/**
 * useBrowserAutomation Hook
 * 
 * Provides React interface to Playwright-based browser automation.
 * Features:
 * - Profile management (LinkedIn/Twitter/Generic)
 * - Live view streaming
 * - LinkedIn automation (connect, message, extract)
 * - Twitter automation (follow, DM)
 * - Human-in-the-loop approval
 * - Natural language command processing
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================
// TYPES
// ============================================

export interface BrowserProfile {
  id: string;
  name: string;
  platform: 'linkedin' | 'twitter' | 'generic';
  userDataDir: string;
  isLoggedIn: boolean;
  lastUsed: number;
}

export interface AutomationStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
  description?: string;
  requiresApproval?: boolean;
}

export interface AutomationRun {
  id: string;
  type: 'linkedin_connect' | 'linkedin_message' | 'twitter_follow' | 'twitter_dm';
  status: 'idle' | 'running' | 'paused' | 'complete' | 'stopped' | 'failed';
  steps: AutomationStep[];
  currentStepIndex: number;
  target?: LinkedInProfile;
  message?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface LinkedInProfile {
  name: string;
  headline?: string;
  company?: string;
  location?: string;
  connectionDegree?: string;
  profileUrl: string;
  avatarUrl?: string;
}

export interface AutomationEvent {
  type: string;
  timestamp: number;
  data: Record<string, any>;
}

export interface BrowserState {
  url: string;
  title: string;
}

export interface ApprovalRequest {
  runId: string;
  action: string;
  preview: {
    target: string;
    content: string;
  };
}

// ============================================
// NATURAL LANGUAGE COMMAND DETECTION
// ============================================

export interface DetectedBrowserCommand {
  type: 'linkedin_connect' | 'linkedin_message' | 'twitter_follow' | 'twitter_dm' | 'navigate' | 'unknown';
  platform: 'linkedin' | 'twitter' | 'generic';
  target?: string; // username, URL, or name
  message?: string;
  confidence: number;
}

export function detectBrowserCommand(input: string): DetectedBrowserCommand | null {
  const lower = input.toLowerCase().trim();
  
  // Early return for empty input
  if (!lower) return null;
  
  // LinkedIn connection patterns
  const linkedinConnectPatterns = [
    /connect\s+(?:with\s+)?(.+?)(?:\s+on\s+linkedin)?$/i,
    /send\s+(?:a\s+)?connection\s+(?:request\s+)?to\s+(.+)/i,
    /linkedin\s+connect\s+(?:with\s+)?(.+)/i,
    /add\s+(.+?)(?:\s+on\s+linkedin)/i,
  ];
  
  for (const pattern of linkedinConnectPatterns) {
    const match = input.match(pattern);
    if (match && (lower.includes('linkedin') || lower.includes('connect'))) {
      const target = match[1]?.trim();
      // Skip if target is empty or just "on linkedin"
      if (!target || target.toLowerCase() === 'on linkedin' || target.length < 2) {
        continue;
      }
      return {
        type: 'linkedin_connect',
        platform: 'linkedin',
        target,
        confidence: 0.9,
      };
    }
  }
  
  // LinkedIn message patterns
  const linkedinMessagePatterns = [
    /message\s+(.+?)\s+(?:on\s+linkedin\s+)?(?:saying|with|:)\s*["""]?(.+)["""]?/i,
    /send\s+(?:a\s+)?message\s+to\s+(.+?)\s+(?:on\s+linkedin\s+)?(?:saying|:)\s*["""]?(.+)["""]?/i,
    /dm\s+(.+?)\s+on\s+linkedin\s*["""]?(.+)?["""]?/i,
  ];
  
  for (const pattern of linkedinMessagePatterns) {
    const match = input.match(pattern);
    if (match && lower.includes('linkedin')) {
      const target = match[1]?.trim();
      const message = match[2]?.trim()?.replace(/^["'"]|["'"]$/g, ''); // Remove surrounding quotes
      
      // Skip if target is empty
      if (!target || target.length < 2) {
        continue;
      }
      
      return {
        type: 'linkedin_message',
        platform: 'linkedin',
        target,
        message,
        confidence: 0.85,
      };
    }
  }
  
  // Twitter follow patterns - more robust with better username extraction
  // Must start with "follow" or "twitter follow" - anchored patterns
  const twitterFollowPatterns = [
    // "follow @user on twitter" or "follow @user on x"
    /^follow\s+@?([a-zA-Z0-9_]{1,15})(?:\s+on\s+(?:twitter|x))?$/i,
    // "twitter follow @user"
    /^twitter\s+follow\s+@?([a-zA-Z0-9_]{1,15})$/i,
    // "follow @user" (without platform)
    /^follow\s+@([a-zA-Z0-9_]{1,15})$/i,
  ];
  
  for (const pattern of twitterFollowPatterns) {
    const match = input.trim().match(pattern);
    if (match) {
      const target = match[1]?.trim()?.replace('@', '');
      // Validate target exists and looks like a username
      if (!target || target.length < 1 || target.length > 15) {
        continue;
      }
      // Skip if target contains invalid characters or looks like "on twitter"
      if (/^on\s/i.test(target) || /\s/.test(target)) {
        continue;
      }
      return {
        type: 'twitter_follow',
        platform: 'twitter',
        target,
        confidence: 0.9,
      };
    }
  }
  
  // Also support natural "follow X on twitter" where X can have spaces (person names)
  // But validate it doesn't match "follow on twitter" (empty target)
  const twitterFollowLoosePattern = /^follow\s+(.+?)\s+on\s+(?:twitter|x)$/i;
  const looseMatch = input.trim().match(twitterFollowLoosePattern);
  if (looseMatch) {
    let target = looseMatch[1]?.trim()?.replace(/^@/, '');
    if (target && target.length >= 1 && !/^on$/i.test(target)) {
      return {
        type: 'twitter_follow',
        platform: 'twitter',
        target,
        confidence: 0.85,
      };
    }
  }
  
  // Twitter DM patterns - more robust
  const twitterDMPatterns = [
    // "dm @user on twitter saying message" or "dm @user on x saying message"
    /^dm\s+@?([a-zA-Z0-9_]{1,15})\s+(?:on\s+(?:twitter|x)\s+)?(?:saying|with|:)\s*["""]?(.+?)["""]?$/i,
    // "send a dm to @user on twitter saying message"
    /^send\s+(?:a\s+)?dm\s+to\s+@?([a-zA-Z0-9_]{1,15})\s+(?:on\s+(?:twitter|x)\s+)?(?:saying|with|:)\s*["""]?(.+?)["""]?$/i,
    // "message @user on twitter saying message"
    /^message\s+@?([a-zA-Z0-9_]{1,15})\s+on\s+(?:twitter|x)\s+(?:saying|with|:)\s*["""]?(.+?)["""]?$/i,
    // "message @user on twitter" followed by quoted/unquoted message
    /^message\s+@?([a-zA-Z0-9_]{1,15})\s+on\s+(?:twitter|x)\s+["""](.+)["""]$/i,
  ];
  
  for (const pattern of twitterDMPatterns) {
    const match = input.trim().match(pattern);
    if (match) {
      const target = match[1]?.trim()?.replace('@', '');
      const message = match[2]?.trim()?.replace(/^["'"""]|["'"""]$/g, ''); // Remove surrounding quotes
      
      // Validate target
      if (!target || target.length < 1) {
        continue;
      }
      // Validate message exists
      if (!message || message.length < 1) {
        continue;
      }
      
      return {
        type: 'twitter_dm',
        platform: 'twitter',
        target,
        message,
        confidence: 0.9,
      };
    }
  }
  
  // Generic navigation
  const navigatePatterns = [
    /(?:go\s+to|open|navigate\s+to|browse\s+to)\s+(.+)/i,
    /visit\s+(.+)/i,
  ];
  
  for (const pattern of navigatePatterns) {
    const match = input.match(pattern);
    if (match) {
      const target = match[1].trim();
      // Determine platform from URL
      let platform: 'linkedin' | 'twitter' | 'generic' = 'generic';
      if (target.includes('linkedin')) platform = 'linkedin';
      if (target.includes('twitter') || target.includes('x.com')) platform = 'twitter';
      
      return {
        type: 'navigate',
        platform,
        target,
        confidence: 0.8,
      };
    }
  }
  
  return null;
}

// ============================================
// HOOK
// ============================================

export function useBrowserAutomation() {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [currentRun, setCurrentRun] = useState<AutomationRun | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [browserState, setBrowserState] = useState<BrowserState | null>(null);
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Refs
  const eventListenerRef = useRef<(() => void) | null>(null);

  // Get electron IPC
  const electron = typeof window !== 'undefined' ? (window as any).electron : null;

  // ============================================
  // EVENT HANDLING
  // ============================================

  useEffect(() => {
    if (!electron) return;

    // Listen for automation events from main process
    const cleanup = electron.on('automation:event', (event: AutomationEvent) => {
      setEvents(prev => [...prev.slice(-99), event]); // Keep last 100 events

      switch (event.type) {
        case 'BROWSER_FRAME':
          setLiveFrame(event.data.frameData);
          setBrowserState({
            url: event.data.url,
            title: event.data.title,
          });
          break;

        case 'RUN_UPDATE':
          setCurrentRun(event.data.run);
          break;

        case 'NEEDS_APPROVAL':
          setPendingApproval({
            runId: event.data.runId,
            action: event.data.action,
            preview: event.data.preview,
          });
          break;

        case 'RUN_FINISHED':
          setPendingApproval(null);
          break;

        case 'STOP_ACKNOWLEDGED':
          setPendingApproval(null);
          break;

        case 'browser_error':
          setError(event.data.error);
          break;
      }
    });

    eventListenerRef.current = cleanup;

    return () => {
      if (eventListenerRef.current) {
        eventListenerRef.current();
      }
    };
  }, [electron]);

  // ============================================
  // LIFECYCLE
  // ============================================

  const initialize = useCallback(async () => {
    if (!electron || isInitialized) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await electron.invoke('playwright:initialize');
      if (result.success) {
        setIsInitialized(true);
        // Load profiles
        const loadedProfiles = await electron.invoke('playwright:get-profiles');
        setProfiles(loadedProfiles);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [electron, isInitialized]);

  const shutdown = useCallback(async () => {
    if (!electron) return;

    try {
      await electron.invoke('playwright:shutdown');
      setIsInitialized(false);
      setLiveFrame(null);
      setBrowserState(null);
      setCurrentRun(null);
      setPendingApproval(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [electron]);

  // ============================================
  // PROFILE MANAGEMENT
  // ============================================

  const createProfile = useCallback(async (platform: 'linkedin' | 'twitter' | 'generic', name?: string) => {
    if (!electron) return null;

    setIsLoading(true);
    try {
      const result = await electron.invoke('playwright:create-profile', platform, name);
      if (result.success) {
        setProfiles(prev => [...prev, result.profile]);
        return result.profile;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [electron]);

  const getOrCreateProfile = useCallback(async (platform: 'linkedin' | 'twitter' | 'generic') => {
    if (!electron) return null;

    setIsLoading(true);
    try {
      const result = await electron.invoke('playwright:get-or-create-profile', platform);
      if (result.success) {
        // Update profiles if new one was created
        const existing = profiles.find(p => p.id === result.profile.id);
        if (!existing) {
          setProfiles(prev => [...prev, result.profile]);
        }
        setActiveProfileId(result.profile.id);
        return result.profile;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [electron, profiles]);

  // ============================================
  // LIVE VIEW
  // ============================================

  const startStreaming = useCallback(async (profileId: string, fps: number = 2) => {
    if (!electron) return;

    try {
      await electron.invoke('playwright:start-streaming', profileId, fps);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [electron]);

  const stopStreaming = useCallback(async () => {
    if (!electron) return;

    try {
      await electron.invoke('playwright:stop-streaming');
      setLiveFrame(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [electron]);

  const captureFrame = useCallback(async (profileId: string) => {
    if (!electron) return null;

    try {
      const result = await electron.invoke('playwright:capture-frame', profileId);
      if (result.success) {
        return result.frame;
      }
      return null;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [electron]);

  // ============================================
  // LINKEDIN AUTOMATION
  // ============================================

  const checkLinkedInLogin = useCallback(async (profileId?: string) => {
    if (!electron) return false;
    const id = profileId || activeProfileId;
    if (!id) return false;

    try {
      const result = await electron.invoke('playwright:linkedin-check-login', id);
      const loggedIn = result.success ? result.isLoggedIn : false;
      setIsLoggedIn(loggedIn);
      return loggedIn;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, [electron, activeProfileId]);

  const linkedInConnect = useCallback(async (targetUrl: string, note?: string) => {
    if (!electron) return null;

    setIsLoading(true);
    setError(null);

    try {
      // Get or create LinkedIn profile
      const profile = await getOrCreateProfile('linkedin');
      if (!profile) return null;

      // Check login
      const isLoggedIn = await checkLinkedInLogin(profile.id);
      if (!isLoggedIn) {
        // Navigate to LinkedIn so user can log in
        await electron.invoke('playwright:linkedin-navigate', profile.id);
        setError('Please log in to LinkedIn first');
        return null;
      }

      // Start the connection flow
      const result = await electron.invoke('playwright:linkedin-connect', profile.id, targetUrl, note);
      if (result.success) {
        setCurrentRun(result.run);
        return result.run;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [electron, getOrCreateProfile, checkLinkedInLogin]);

  const linkedInMessage = useCallback(async (targetUrl: string, message: string) => {
    if (!electron) return null;

    setIsLoading(true);
    setError(null);

    try {
      const profile = await getOrCreateProfile('linkedin');
      if (!profile) return null;

      const isLoggedIn = await checkLinkedInLogin(profile.id);
      if (!isLoggedIn) {
        await electron.invoke('playwright:linkedin-navigate', profile.id);
        setError('Please log in to LinkedIn first');
        return null;
      }

      const result = await electron.invoke('playwright:linkedin-message', profile.id, targetUrl, message);
      if (result.success) {
        setCurrentRun(result.run);
        return result.run;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [electron, getOrCreateProfile, checkLinkedInLogin]);

  // ============================================
  // TWITTER AUTOMATION
  // ============================================

  const checkTwitterLogin = useCallback(async (profileId?: string) => {
    if (!electron) return false;
    const id = profileId || activeProfileId;
    if (!id) return false;

    try {
      const result = await electron.invoke('playwright:twitter-check-login', id);
      const loggedIn = result.success ? result.isLoggedIn : false;
      setIsLoggedIn(loggedIn);
      return loggedIn;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, [electron, activeProfileId]);

  // ============================================
  // PROFILE SELECTION & LOGIN
  // ============================================

  const selectProfile = useCallback(async (platform: 'linkedin' | 'twitter' | 'generic') => {
    if (!electron) return null;

    setIsLoading(true);
    try {
      const result = await electron.invoke('playwright:get-or-create-profile', platform);
      if (result.success) {
        setActiveProfileId(result.profile.id);
        setIsLoggedIn(result.profile.isLoggedIn);
        
        // Start streaming for live view
        await electron.invoke('playwright:start-streaming', result.profile.id);
        
        return result.profile;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [electron]);

  const openLoginPage = useCallback(async (platform: 'linkedin' | 'twitter') => {
    if (!electron) return;
    
    // Get or create profile first, then use its ID
    const profile = await getOrCreateProfile(platform);
    if (!profile) return;
    
    const profileId = profile.id;

    setIsLoading(true);
    try {
      if (platform === 'linkedin') {
        await electron.invoke('playwright:linkedin-navigate', profileId);
      } else {
        await electron.invoke('playwright:navigate', profileId, 'https://twitter.com/login');
        await electron.invoke('playwright:start-streaming', profileId);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [electron, getOrCreateProfile]);

  const twitterFollow = useCallback(async (username: string) => {
    if (!electron) return null;

    setIsLoading(true);
    setError(null);

    try {
      const profile = await getOrCreateProfile('twitter');
      if (!profile) return null;

      const isLoggedIn = await checkTwitterLogin(profile.id);
      if (!isLoggedIn) {
        await electron.invoke('playwright:navigate', profile.id, 'https://twitter.com');
        setError('Please log in to Twitter first');
        return null;
      }

      const result = await electron.invoke('playwright:twitter-follow', profile.id, username);
      if (result.success) {
        setCurrentRun(result.run);
        return result.run;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [electron, getOrCreateProfile, checkTwitterLogin]);

  const twitterDM = useCallback(async (username: string, message: string) => {
    if (!electron) return null;

    setIsLoading(true);
    setError(null);

    try {
      const profile = await getOrCreateProfile('twitter');
      if (!profile) return null;

      const isLoggedIn = await checkTwitterLogin(profile.id);
      if (!isLoggedIn) {
        await electron.invoke('playwright:navigate', profile.id, 'https://twitter.com');
        setError('Please log in to Twitter first');
        return null;
      }

      const result = await electron.invoke('playwright:twitter-dm', profile.id, username, message);
      if (result.success) {
        setCurrentRun(result.run);
        return result.run;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [electron, getOrCreateProfile, checkTwitterLogin]);

  // ============================================
  // RUN CONTROL
  // ============================================

  const approveAction = useCallback(async () => {
    if (!electron || !pendingApproval) return;

    try {
      await electron.invoke('playwright:approve-action', pendingApproval.runId);
      setPendingApproval(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [electron, pendingApproval]);

  const rejectAction = useCallback(async () => {
    if (!electron || !pendingApproval) return;

    try {
      await electron.invoke('playwright:reject-action', pendingApproval.runId);
      setPendingApproval(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [electron, pendingApproval]);

  const stopRun = useCallback(async () => {
    if (!electron) return;

    try {
      await electron.invoke('playwright:stop-run');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [electron]);

  // ============================================
  // GENERIC NAVIGATION
  // ============================================

  const navigate = useCallback(async (url: string, platform: 'linkedin' | 'twitter' | 'generic' = 'generic') => {
    if (!electron) return;

    setIsLoading(true);
    try {
      const profile = await getOrCreateProfile(platform);
      if (!profile) return;

      await electron.invoke('playwright:navigate', profile.id, url);
      
      // Start streaming to show live view
      await startStreaming(profile.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [electron, getOrCreateProfile, startStreaming]);

  // ============================================
  // NATURAL LANGUAGE COMMAND EXECUTION
  // ============================================

  const executeCommand = useCallback(async (input: string): Promise<{ success: boolean; message: string }> => {
    const command = detectBrowserCommand(input);
    
    if (!command) {
      return { success: false, message: 'Could not understand the command' };
    }

    if (!isInitialized) {
      await initialize();
    }

    // Helper to get current error state (avoids stale closure)
    const getErrorMessage = (fallback: string) => {
      // Access error through a fresh reference if available
      return fallback;
    };

    // Helper to construct LinkedIn profile URL from a name
    // Note: LinkedIn profile slugs are typically lowercase, hyphenated, and ASCII
    // For non-ASCII names, we encode them but LinkedIn may not resolve correctly
    const toLinkedInSlug = (name: string): string => {
      // Normalize Unicode characters (e.g., é -> e for better URL compatibility)
      const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      // Convert to lowercase, replace spaces with hyphens, remove special chars
      const slug = normalized.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      return slug;
    };

    switch (command.type) {
      case 'linkedin_connect': {
        if (!command.target) {
          return { success: false, message: 'Please specify who to connect with' };
        }
        // If target is a name, we'd need to search first
        // For now, assume it's a URL or construct one
        const connectUrl = command.target.startsWith('http') 
          ? command.target 
          : `https://www.linkedin.com/in/${toLinkedInSlug(command.target)}`;
        try {
          const connectRun = await linkedInConnect(connectUrl);
          return connectRun 
            ? { success: true, message: `Started connection request to ${command.target}` }
            : { success: false, message: 'Failed to start connection' };
        } catch (err) {
          return { success: false, message: (err as Error).message || 'Failed to start connection' };
        }
      }

      case 'linkedin_message': {
        if (!command.target) {
          return { success: false, message: 'Please specify who to message' };
        }
        if (!command.message) {
          return { success: false, message: 'Please specify what message to send' };
        }
        const messageUrl = command.target.startsWith('http')
          ? command.target
          : `https://www.linkedin.com/in/${toLinkedInSlug(command.target)}`;
        try {
          const messageRun = await linkedInMessage(messageUrl, command.message);
          return messageRun
            ? { success: true, message: `Started messaging ${command.target}` }
            : { success: false, message: 'Failed to start message' };
        } catch (err) {
          return { success: false, message: (err as Error).message || 'Failed to start message' };
        }
      }

      case 'twitter_follow': {
        if (!command.target) {
          return { success: false, message: 'Please specify who to follow' };
        }
        try {
          const followRun = await twitterFollow(command.target);
          return followRun
            ? { success: true, message: `Started following @${command.target}` }
            : { success: false, message: 'Failed to start follow' };
        } catch (err) {
          return { success: false, message: (err as Error).message || 'Failed to start follow' };
        }
      }

      case 'twitter_dm': {
        if (!command.target) {
          return { success: false, message: 'Please specify who to DM' };
        }
        if (!command.message) {
          return { success: false, message: 'Please specify what message to send' };
        }
        try {
          const dmRun = await twitterDM(command.target, command.message);
          return dmRun
            ? { success: true, message: `Started DM to @${command.target}` }
            : { success: false, message: 'Failed to start DM' };
        } catch (err) {
          return { success: false, message: (err as Error).message || 'Failed to start DM' };
        }
      }

      case 'navigate': {
        if (!command.target) {
          return { success: false, message: 'Please specify where to navigate' };
        }
        const navUrl = command.target.startsWith('http') ? command.target : `https://${command.target}`;
        try {
          await navigate(navUrl, command.platform);
          return { success: true, message: `Navigating to ${command.target}` };
        } catch (err) {
          return { success: false, message: (err as Error).message || 'Failed to navigate' };
        }
      }

      default:
        return { success: false, message: 'Unknown command type' };
    }
  }, [isInitialized, initialize, linkedInConnect, linkedInMessage, twitterFollow, twitterDM, navigate]);

  // ============================================
  // RETURN
  // ============================================

  return {
    // State
    isInitialized,
    isLoading,
    isLoggedIn,
    profiles,
    activeProfileId,
    currentRun,
    pendingApproval,
    liveFrame,
    browserState,
    events,
    error,

    // Lifecycle
    initialize,
    shutdown,

    // Profile management
    createProfile,
    getOrCreateProfile,
    selectProfile,
    openLoginPage,

    // Live view
    startStreaming,
    stopStreaming,
    captureFrame,

    // LinkedIn
    checkLinkedInLogin,
    linkedInConnect,
    linkedInMessage,

    // Twitter
    checkTwitterLogin,
    twitterFollow,
    twitterDM,

    // Run control
    approveAction,
    rejectAction,
    stopRun,

    // Navigation
    navigate,

    // Natural language
    detectBrowserCommand,
    executeCommand,
  };
}

export default useBrowserAutomation;
