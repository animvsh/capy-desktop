/**
 * useChatAssistant Hook - Local command processing for chat
 *
 * Handles navigation and search commands locally without backend calls.
 * Examples:
 * - "Show me my conversations" → navigates to Conversations panel
 * - "Go to settings" → navigates to Settings panel
 * - "Find emails from John" → searches emails and navigates
 * - "What am I looking at?" → describes current context
 * - "Connect with John on LinkedIn" → browser automation
 * - "Follow @username on Twitter" → browser automation
 */

import { useCallback, useState } from 'react';
import { useApp, PanelType } from '@/contexts/AppContext';
import { useToast } from './use-toast';
import { detectBrowserCommand, useBrowserAutomation } from './useBrowserAutomation';

// ============================================
// TYPES
// ============================================

interface CommandResult {
  handled: boolean;
  message?: string;
}

// ============================================
// COMMAND PATTERNS
// ============================================

// Navigation patterns
const NAVIGATION_PATTERNS: { pattern: RegExp; panel: PanelType }[] = [
  { pattern: /\b(go\s+to|show|open|view)\s+(my\s+)?(dashboard|home|stats)/i, panel: 'dashboard' },
  { pattern: /\b(go\s+to|show|open|view)\s+(my\s+)?(conversations?|emails?|inbox|messages?)/i, panel: 'conversations' },
  { pattern: /\b(go\s+to|show|open|view)\s+(my\s+)?(linkedin|li\b)/i, panel: 'linkedin' },
  { pattern: /\b(go\s+to|show|open|view)\s+(my\s+)?(contacts?|people)/i, panel: 'contacts' },
  { pattern: /\b(go\s+to|show|open|view)\s+(my\s+)?(meetings?|calendar|schedule)/i, panel: 'meetings' },
  { pattern: /\b(go\s+to|show|open|view)\s+(my\s+)?settings/i, panel: 'settings' },
  { pattern: /\b(go\s+to|show|open|view)\s+(my\s+)?admin/i, panel: 'admin' },
];

// Search patterns for emails/conversations
const EMAIL_SEARCH_PATTERNS = [
  /\bfind\s+(emails?|conversations?|messages?)\s+(from|about|with)\s+(.+)/i,
  /\b(search|look\s+for)\s+(emails?|conversations?|messages?)\s+(from|about|with)\s+(.+)/i,
  /\bpull\s+up\s+(the\s+)?(conversation|email|message)\s+(from|with|about)\s+(.+)/i,
  /\b(emails?|conversations?)\s+(from|with|about)\s+(.+)/i,
];

// Context query patterns
const CONTEXT_PATTERNS = [
  /\bwhat\s+(am\s+i|are\s+we)\s+(looking|viewing)\s+at/i,
  /\bwhat\s+is\s+this/i,
  /\btell\s+me\s+about\s+(this|the\s+current)/i,
  /\bdescribe\s+(this|what\s+i'm\s+viewing)/i,
];

// Setup prompts
const SETUP_PATTERNS = [
  /\b(help\s+me\s+)?(set\s*up|connect|configure)\s+(my\s+)?email/i,
  /\bhow\s+do\s+i\s+(connect|set\s*up)\s+(my\s+)?email/i,
  /\b(connect|link)\s+(gmail|outlook|email)/i,
];

// Calendar/Meeting patterns
const CALENDAR_PATTERNS = [
  /\b(show|view|open)\s+(my\s+)?(calendar|schedule|meetings?)/i,
  /\bwhat('s|\s+is)\s+(on\s+)?(my\s+)?(calendar|schedule|agenda)/i,
  /\bwhat\s+meetings?\s+do\s+i\s+have/i,
  /\bschedule\s+a\s+(meeting|call)/i,
  /\bbook\s+a\s+(meeting|call|time)/i,
  /\bcreate\s+a\s+(meeting|event)/i,
];

// Booking link patterns
const BOOKING_LINK_PATTERNS = [
  /\b(get|show|copy|share)\s+(my\s+)?booking\s+(link|url)/i,
  /\b(get|show|copy|share)\s+(my\s+)?scheduling\s+(link|url)/i,
  /\bhow\s+(do\s+)?(people|someone)\s+book\s+(time|meeting)/i,
  /\blet\s+(people|someone)\s+schedule\s+with\s+me/i,
];

// Browser automation patterns - used to detect if this is a browser command
const BROWSER_AUTOMATION_PATTERNS = [
  // LinkedIn
  /\bconnect\s+(?:with\s+)?(.+?)(?:\s+on\s+linkedin)?$/i,
  /\bsend\s+(?:a\s+)?connection\s+(?:request\s+)?to\s+/i,
  /\blinkedin\s+connect/i,
  /\badd\s+(.+?)\s+on\s+linkedin/i,
  /\bmessage\s+(.+?)\s+on\s+linkedin/i,
  /\bsend\s+(?:a\s+)?message\s+to\s+(.+?)\s+on\s+linkedin/i,
  // Twitter
  /\bfollow\s+@?(.+?)(?:\s+on\s+twitter|\s+on\s+x)?$/i,
  /\btwitter\s+follow/i,
  /\bdm\s+@?(.+?)\s+(?:on\s+twitter)?/i,
  /\bsend\s+(?:a\s+)?dm\s+to\s+@?(.+)/i,
  // Generic browser
  /\b(?:go\s+to|open|navigate\s+to|browse\s+to|visit)\s+(https?:\/\/[^\s]+)/i,
  /\bopen\s+browser/i,
  /\bstart\s+browser\s+automation/i,
  /\bshow\s+(?:me\s+)?(?:the\s+)?browser/i,
];

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useChatAssistant() {
  const { toast } = useToast();
  const {
    activePanel,
    setActivePanel,
    selectedItem,
    composioConfigured,
    navigateTo,
    searchAndNavigate,
  } = useApp();

  // Browser automation hook
  const browserAutomation = useBrowserAutomation();
  const [isBrowserProcessing, setIsBrowserProcessing] = useState(false);

  /**
   * Check if a message is a local command
   */
  const isLocalCommand = useCallback((message: string): boolean => {
    const lowerMessage = message.toLowerCase().trim();

    // Navigation commands
    for (const { pattern } of NAVIGATION_PATTERNS) {
      if (pattern.test(message)) return true;
    }

    // Email search commands
    for (const pattern of EMAIL_SEARCH_PATTERNS) {
      if (pattern.test(message)) return true;
    }

    // Context queries
    for (const pattern of CONTEXT_PATTERNS) {
      if (pattern.test(message)) return true;
    }

    // Setup commands
    for (const pattern of SETUP_PATTERNS) {
      if (pattern.test(message)) return true;
    }

    // Calendar/meeting commands
    for (const pattern of CALENDAR_PATTERNS) {
      if (pattern.test(message)) return true;
    }

    // Booking link commands
    for (const pattern of BOOKING_LINK_PATTERNS) {
      if (pattern.test(message)) return true;
    }

    // Browser automation commands
    for (const pattern of BROWSER_AUTOMATION_PATTERNS) {
      if (pattern.test(message)) return true;
    }

    // Also check using the browser command detector
    const browserCommand = detectBrowserCommand(message);
    if (browserCommand && browserCommand.confidence > 0.7) {
      return true;
    }

    return false;
  }, []);

  /**
   * Process a navigation command
   */
  const processNavigationCommand = useCallback((message: string): CommandResult => {
    for (const { pattern, panel } of NAVIGATION_PATTERNS) {
      if (pattern.test(message)) {
        setActivePanel(panel);
        return {
          handled: true,
          message: `Opening ${panel}...`,
        };
      }
    }
    return { handled: false };
  }, [setActivePanel]);

  /**
   * Process an email search command
   */
  const processEmailSearchCommand = useCallback((message: string): CommandResult => {
    for (const pattern of EMAIL_SEARCH_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        // Extract the search query (last capture group usually contains the search term)
        const searchTerm = match[match.length - 1]?.trim();

        if (searchTerm) {
          // If Composio not configured, prompt setup
          if (!composioConfigured) {
            navigateTo('settings');
            toast({
              title: 'Email not connected',
              description: 'Please connect your email first to search conversations.',
            });
            return {
              handled: true,
              message: 'To search your emails, you need to connect your email account first. Let me take you to settings.',
            };
          }

          // Navigate to conversations with search
          searchAndNavigate('conversations', searchTerm);
          return {
            handled: true,
            message: `Searching for "${searchTerm}" in your conversations...`,
          };
        }
      }
    }
    return { handled: false };
  }, [composioConfigured, navigateTo, searchAndNavigate, toast]);

  /**
   * Process a context query (what am I looking at?)
   */
  const processContextQuery = useCallback((): CommandResult => {
    if (!selectedItem.type) {
      return {
        handled: true,
        message: `You're currently viewing the ${activePanel} panel. Select an item to see more details.`,
      };
    }

    let description = '';
    switch (selectedItem.type) {
      case 'email':
        description = `You're viewing an email`;
        if (selectedItem.data?.subject) {
          description += ` with subject "${selectedItem.data.subject}"`;
        }
        if (selectedItem.data?.from) {
          description += ` from ${selectedItem.data.from}`;
        }
        break;
      case 'contact':
        description = `You're viewing a contact`;
        if (selectedItem.data?.name) {
          description += `: ${selectedItem.data.name}`;
        }
        if (selectedItem.data?.company) {
          description += ` at ${selectedItem.data.company}`;
        }
        break;
      case 'meeting':
        description = `You're viewing a meeting`;
        if (selectedItem.data?.title) {
          description += `: "${selectedItem.data.title}"`;
        }
        if (selectedItem.data?.date) {
          description += ` on ${selectedItem.data.date}`;
        }
        break;
      case 'lead':
        description = `You're viewing a lead`;
        if (selectedItem.data?.name) {
          description += `: ${selectedItem.data.name}`;
        }
        break;
    }

    return {
      handled: true,
      message: description || `You're viewing a ${selectedItem.type}.`,
    };
  }, [activePanel, selectedItem]);

  /**
   * Process a setup command
   */
  const processSetupCommand = useCallback((): CommandResult => {
    if (composioConfigured) {
      return {
        handled: true,
        message: 'Your email is already connected! Go to Settings if you want to manage your connection.',
      };
    }

    navigateTo('settings');
    return {
      handled: true,
      message: 'Let me take you to Settings where you can connect your email account.',
    };
  }, [composioConfigured, navigateTo]);

  /**
   * Process a calendar/meeting command
   */
  const processCalendarCommand = useCallback((message: string): CommandResult => {
    for (const pattern of CALENDAR_PATTERNS) {
      if (pattern.test(message)) {
        // Check if it's a command to create a meeting
        if (/\b(schedule|book|create)\s+a\s+(meeting|call|event)/i.test(message)) {
          setActivePanel('meetings');
          return {
            handled: true,
            message: 'Opening your calendar to create a new meeting...',
          };
        }

        // Default: just view calendar
        setActivePanel('meetings');
        return {
          handled: true,
          message: 'Opening your calendar...',
        };
      }
    }
    return { handled: false };
  }, [setActivePanel]);

  /**
   * Process a booking link command
   */
  const processBookingLinkCommand = useCallback((): CommandResult => {
    setActivePanel('meetings');
    return {
      handled: true,
      message: 'Opening Meetings - your booking link is shown at the top. Share it with anyone who wants to schedule time with you!',
    };
  }, [setActivePanel]);

  /**
   * Process browser automation command
   */
  const processBrowserCommand = useCallback(async (message: string): Promise<CommandResult> => {
    const command = detectBrowserCommand(message);
    
    if (!command || command.confidence < 0.7) {
      return { handled: false };
    }

    // Check if running in Electron
    const isElectron = typeof window !== 'undefined' && !!(window as any).playwright;
    if (!isElectron) {
      return {
        handled: true,
        message: 'Browser automation requires the desktop app. Please download and use the Capy desktop app for LinkedIn and Twitter automation.',
      };
    }

    setIsBrowserProcessing(true);
    try {
      // Initialize browser if needed
      if (!browserAutomation.isInitialized) {
        await browserAutomation.initialize();
      }

      // Execute the command
      const result = await browserAutomation.executeCommand(message);
      
      // Navigate to the appropriate panel to show live view
      if (command.platform === 'linkedin') {
        setActivePanel('linkedin');
      } else if (command.platform === 'twitter') {
        // Twitter panel if exists, otherwise stay on current
        // setActivePanel('twitter');
      }

      return {
        handled: true,
        message: result.message,
      };
    } catch (error) {
      return {
        handled: true,
        message: `Browser automation failed: ${(error as Error).message}`,
      };
    } finally {
      setIsBrowserProcessing(false);
    }
  }, [browserAutomation, setActivePanel]);

  /**
   * Process a local command
   * Returns true if the command was handled locally
   */
  const processLocalCommand = useCallback(async (message: string): Promise<boolean> => {
    // Try navigation commands
    const navResult = processNavigationCommand(message);
    if (navResult.handled) {
      if (navResult.message) {
        toast({ title: navResult.message });
      }
      return true;
    }

    // Try email search commands
    const searchResult = processEmailSearchCommand(message);
    if (searchResult.handled) {
      if (searchResult.message) {
        toast({ title: searchResult.message });
      }
      return true;
    }

    // Try context queries
    for (const pattern of CONTEXT_PATTERNS) {
      if (pattern.test(message)) {
        const contextResult = processContextQuery();
        if (contextResult.handled && contextResult.message) {
          toast({ title: contextResult.message });
        }
        return true;
      }
    }

    // Try setup commands
    for (const pattern of SETUP_PATTERNS) {
      if (pattern.test(message)) {
        const setupResult = processSetupCommand();
        if (setupResult.handled && setupResult.message) {
          toast({ title: setupResult.message });
        }
        return true;
      }
    }

    // Try calendar/meeting commands
    for (const pattern of CALENDAR_PATTERNS) {
      if (pattern.test(message)) {
        const calendarResult = processCalendarCommand(message);
        if (calendarResult.handled && calendarResult.message) {
          toast({ title: calendarResult.message });
        }
        return true;
      }
    }

    // Try booking link commands
    for (const pattern of BOOKING_LINK_PATTERNS) {
      if (pattern.test(message)) {
        const bookingResult = processBookingLinkCommand();
        if (bookingResult.handled && bookingResult.message) {
          toast({ title: bookingResult.message });
        }
        return true;
      }
    }

    // Try browser automation commands
    const browserCommand = detectBrowserCommand(message);
    if (browserCommand && browserCommand.confidence >= 0.7) {
      const browserResult = await processBrowserCommand(message);
      if (browserResult.handled) {
        if (browserResult.message) {
          toast({ 
            title: browserResult.message,
            description: browserCommand.platform === 'linkedin' 
              ? 'Check the LinkedIn panel for live view'
              : browserCommand.platform === 'twitter'
                ? 'Check the Twitter panel for live view'
                : undefined,
          });
        }
        return true;
      }
    }

    return false;
  }, [processNavigationCommand, processEmailSearchCommand, processContextQuery, processSetupCommand, processCalendarCommand, processBookingLinkCommand, processBrowserCommand, toast]);

  return {
    isLocalCommand,
    processLocalCommand,
    // Browser automation state
    isBrowserProcessing,
    browserAutomation,
  };
}

export default useChatAssistant;
