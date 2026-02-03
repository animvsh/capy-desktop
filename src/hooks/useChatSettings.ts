/**
 * useChatSettings Hook
 * 
 * Manages chat behavior settings with localStorage persistence:
 * - Chat mode (autopilot, ask_before_send, readonly)
 * - Primary service selection (which API/service to use)
 * - Persists to localStorage for instant access
 * - Optionally syncs with database for cross-device persistence
 */

import { useState, useEffect, useCallback } from 'react';

// ============================================
// TYPES
// ============================================

export type ChatMode = 'autopilot' | 'ask_before_send' | 'readonly';

export type PrimaryService = 'auto' | 'apollo' | 'capyweb' | 'perplexity' | 'clado';

export interface ChatSettings {
  chatMode: ChatMode;
  primaryService: PrimaryService;
  confirmBeforeActions: boolean; // Extra confirmation for destructive actions
  showDebugInfo: boolean; // Show internal status messages
}

export interface ChatModeConfig {
  id: ChatMode;
  label: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
}

export interface ServiceConfig {
  id: PrimaryService;
  name: string;
  description: string;
  icon: string;
  color: string;
}

// ============================================
// CONSTANTS
// ============================================

export const CHAT_MODES: ChatModeConfig[] = [
  {
    id: 'autopilot',
    label: 'Autopilot',
    description: 'Fully autonomous - sends emails automatically',
    icon: 'fa-rocket',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500',
  },
  {
    id: 'ask_before_send',
    label: 'Ask First',
    description: 'Reviews with you before sending anything',
    icon: 'fa-hand',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500',
  },
  {
    id: 'readonly',
    label: 'Read Only',
    description: 'No actions - just answers questions',
    icon: 'fa-eye',
    color: 'text-gray-600',
    bgColor: 'bg-gray-500',
  },
];

export const SERVICES: ServiceConfig[] = [
  {
    id: 'auto',
    name: 'Auto (Recommended)',
    description: 'Automatically selects the best source',
    icon: 'fa-wand-magic-sparkles',
    color: 'text-violet-500',
  },
  {
    id: 'apollo',
    name: 'Apollo.io',
    description: 'B2B contact & company data',
    icon: 'fa-database',
    color: 'text-blue-500',
  },
  {
    id: 'capyweb',
    name: 'CapyWeb',
    description: 'AI-powered web discovery',
    icon: 'fa-globe',
    color: 'text-green-500',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI search & research',
    icon: 'fa-sparkles',
    color: 'text-purple-500',
  },
  {
    id: 'clado',
    name: 'Clado',
    description: 'AI deep research & enrichment',
    icon: 'fa-brain',
    color: 'text-indigo-500',
  },
];

const STORAGE_KEY = 'capy-chat-settings';

const DEFAULT_SETTINGS: ChatSettings = {
  chatMode: 'ask_before_send', // Safe default
  primaryService: 'auto',
  confirmBeforeActions: true,
  showDebugInfo: false,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function loadSettingsFromStorage(): ChatSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new fields
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('[useChatSettings] Failed to load from localStorage:', e);
  }
  return DEFAULT_SETTINGS;
}

function saveSettingsToStorage(settings: ChatSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[useChatSettings] Failed to save to localStorage:', e);
  }
}

// ============================================
// HOOK
// ============================================

export interface UseChatSettingsReturn {
  // Settings state
  settings: ChatSettings;
  chatMode: ChatMode;
  primaryService: PrimaryService;
  
  // Config lookups
  chatModeConfig: ChatModeConfig;
  serviceConfig: ServiceConfig;
  
  // Setters
  setChatMode: (mode: ChatMode) => void;
  setPrimaryService: (service: PrimaryService) => void;
  setConfirmBeforeActions: (confirm: boolean) => void;
  setShowDebugInfo: (show: boolean) => void;
  
  // Mode checks
  isReadOnly: boolean;
  requiresConfirmation: boolean;
  isAutopilot: boolean;
  
  // Action helpers
  canExecuteAction: (action: string) => boolean;
  shouldConfirmAction: (action: string) => boolean;
  
  // Reset
  resetToDefaults: () => void;
}

export function useChatSettings(): UseChatSettingsReturn {
  const [settings, setSettings] = useState<ChatSettings>(loadSettingsFromStorage);
  
  // Persist to localStorage on changes
  useEffect(() => {
    saveSettingsToStorage(settings);
  }, [settings]);

  // Setters
  const setChatMode = useCallback((mode: ChatMode) => {
    setSettings(prev => ({ ...prev, chatMode: mode }));
  }, []);

  const setPrimaryService = useCallback((service: PrimaryService) => {
    setSettings(prev => ({ ...prev, primaryService: service }));
  }, []);

  const setConfirmBeforeActions = useCallback((confirm: boolean) => {
    setSettings(prev => ({ ...prev, confirmBeforeActions: confirm }));
  }, []);

  const setShowDebugInfo = useCallback((show: boolean) => {
    setSettings(prev => ({ ...prev, showDebugInfo: show }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  // Derived state
  const isReadOnly = settings.chatMode === 'readonly';
  const requiresConfirmation = settings.chatMode === 'ask_before_send';
  const isAutopilot = settings.chatMode === 'autopilot';

  // Get config objects
  const chatModeConfig = CHAT_MODES.find(m => m.id === settings.chatMode) || CHAT_MODES[1];
  const serviceConfig = SERVICES.find(s => s.id === settings.primaryService) || SERVICES[0];

  // Action permission checks
  const canExecuteAction = useCallback((action: string): boolean => {
    if (isReadOnly) {
      // In readonly mode, only allow read/view actions
      const readOnlyActions = [
        'analytics.',
        'dashboard.',
        'view.',
        'show.',
        'get.',
        'list.',
        'navigate.',
        'search.',
        'status',
        'help',
      ];
      return readOnlyActions.some(prefix => 
        action.toLowerCase().startsWith(prefix) || action.toLowerCase().includes(prefix)
      );
    }
    return true;
  }, [isReadOnly]);

  const shouldConfirmAction = useCallback((action: string): boolean => {
    if (!requiresConfirmation) return false;
    
    // Actions that need confirmation in ask-first mode
    const confirmableActions = [
      'send',
      'email',
      'message',
      'delete',
      'remove',
      'update',
      'create',
      'queue',
      'start',
      'trigger',
      'execute',
      'draft.send',
      'agent.start',
      'campaign.launch',
    ];
    
    return confirmableActions.some(prefix => 
      action.toLowerCase().includes(prefix)
    );
  }, [requiresConfirmation]);

  return {
    settings,
    chatMode: settings.chatMode,
    primaryService: settings.primaryService,
    chatModeConfig,
    serviceConfig,
    setChatMode,
    setPrimaryService,
    setConfirmBeforeActions,
    setShowDebugInfo,
    isReadOnly,
    requiresConfirmation,
    isAutopilot,
    canExecuteAction,
    shouldConfirmAction,
    resetToDefaults,
  };
}

export default useChatSettings;
