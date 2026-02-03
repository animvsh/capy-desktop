import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

// ============================================
// TYPES
// ============================================

export type PanelType = 'home' | 'dashboard' | 'conversations' | 'linkedin' | 'contacts' | 'meetings' | 'campaigns' | 'settings' | 'admin';

// Chat mode types
export type ChatMode = 'autopilot' | 'ask_before_send' | 'readonly';

// Theme type
export type Theme = 'dark' | 'light';

export const CHAT_MODES: { id: ChatMode; label: string; description: string; icon: string }[] = [
  { id: 'autopilot', label: 'Autopilot', description: 'Fully autonomous - sends emails automatically', icon: 'fa-rocket' },
  { id: 'ask_before_send', label: 'Ask First', description: 'Reviews with you before sending anything', icon: 'fa-hand' },
  { id: 'readonly', label: 'Read Only', description: 'No actions - just answers questions', icon: 'fa-eye' },
];

export interface SelectedItem {
  type: 'email' | 'contact' | 'meeting' | 'lead' | null;
  id: string | null;
  data: any;
}

export interface SearchState {
  query: string;
  panel: PanelType;
}

export interface AppContextType {
  // Panel state
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;

  // Selected item (for context-awareness)
  selectedItem: SelectedItem;
  setSelectedItem: (item: SelectedItem) => void;
  clearSelectedItem: () => void;

  // Composio configuration state
  composioConfigured: boolean;
  setComposioConfigured: (configured: boolean) => void;

  // Chat sidebar state
  chatSidebarOpen: boolean;
  setChatSidebarOpen: (open: boolean) => void;
  chatSidebarCollapsed: boolean;
  setChatSidebarCollapsed: (collapsed: boolean) => void;

  // Chat mode state
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;

  // Chat expanded state
  chatExpanded: boolean;
  setChatExpanded: (expanded: boolean) => void;

  // Theme state
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  // Search state
  searchState: SearchState | null;
  setSearchState: (state: SearchState | null) => void;

  // Navigation helpers
  navigateTo: (panel: PanelType, itemId?: string) => void;
  searchAndNavigate: (panel: PanelType, query: string) => void;
}

// ============================================
// CONTEXT
// ============================================

const AppContext = createContext<AppContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Get initial panel from URL or default to home
  // Map legacy 'dashboard' and 'conversations' to 'home' for backwards compatibility
  const urlPanel = searchParams.get('panel') as PanelType;
  const initialPanel = urlPanel === 'dashboard' || urlPanel === 'conversations' ? 'home' : (urlPanel || 'home');

  // Panel state
  const [activePanel, setActivePanelState] = useState<PanelType>(initialPanel);

  // Selected item state
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({
    type: null,
    id: null,
    data: null,
  });

  // Composio configuration state
  const [composioConfigured, setComposioConfigured] = useState(false);

  // Chat sidebar state - default open and not collapsed
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true);
  const [chatSidebarCollapsed, setChatSidebarCollapsed] = useState(false);

  // Chat mode state - default to ask_before_send (safest), will be loaded from DB
  const [chatMode, setChatModeState] = useState<ChatMode>('ask_before_send');
  const chatModeLoadedRef = useRef(false);

  // Load chat mode from user_settings on mount
  useEffect(() => {
    const loadChatMode = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: settings } = await supabase
          .from('user_settings')
          .select('capy_mode')
          .eq('user_id', user.id)
          .maybeSingle();

        if (settings?.capy_mode) {
          // Map database values to frontend values
          const modeMap: Record<string, ChatMode> = {
            'autopilot': 'autopilot',
            'autonomous': 'autopilot', // legacy support
            'ask_before_send': 'ask_before_send',
            'manual': 'ask_before_send', // legacy support
            'readonly': 'readonly',
            'read_only': 'readonly', // legacy support
          };
          const mappedMode = modeMap[settings.capy_mode] || 'ask_before_send';
          setChatModeState(mappedMode);
        }
        chatModeLoadedRef.current = true;
      } catch (error) {
        console.error('[AppContext] Failed to load chat mode:', error);
      }
    };

    loadChatMode();
  }, []);

  // Save chat mode to database when changed
  const setChatMode = useCallback(async (mode: ChatMode) => {
    setChatModeState(mode);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Upsert user_settings with new capy_mode
      const { error } = await supabase
        .from('user_settings')
        .upsert(
          { user_id: user.id, capy_mode: mode },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('[AppContext] Failed to save chat mode:', error);
      } else {
        console.log('[AppContext] Chat mode saved:', mode);
      }
    } catch (error) {
      console.error('[AppContext] Failed to save chat mode:', error);
    }
  }, []);

  // Chat expanded state
  const [chatExpanded, setChatExpanded] = useState(false);

  // Theme state - check localStorage or default to dark
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('capy-theme');
      return (saved as Theme) || 'dark';
    }
    return 'dark';
  });

  // Apply theme to document
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
    localStorage.setItem('capy-theme', theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // Search state
  const [searchState, setSearchState] = useState<SearchState | null>(null);

  // Clear selected item helper
  const clearSelectedItem = useCallback(() => {
    setSelectedItem({ type: null, id: null, data: null });
  }, []);

  // Set active panel with URL sync
  const setActivePanel = useCallback((panel: PanelType) => {
    // Map legacy panel names to 'home' for backwards compatibility
    const mappedPanel = panel === 'dashboard' || panel === 'conversations' ? 'home' : panel;
    setActivePanelState(mappedPanel);
    // Update URL without navigation
    const newParams = new URLSearchParams(searchParams);
    newParams.set('panel', mappedPanel);
    setSearchParams(newParams, { replace: true });
    // Clear selected item when changing panels
    clearSelectedItem();
  }, [searchParams, setSearchParams, clearSelectedItem]);

  // Navigate to a panel with optional item ID
  const navigateTo = useCallback((panel: PanelType, itemId?: string) => {
    setActivePanel(panel);
    if (itemId) {
      // If there's an item ID, we'll need to handle it in the panel
      // For now, store it in search params
      const newParams = new URLSearchParams(searchParams);
      newParams.set('panel', panel);
      newParams.set('itemId', itemId);
      setSearchParams(newParams, { replace: true });
    }
  }, [setActivePanel, searchParams, setSearchParams]);

  // Search and navigate helper
  const searchAndNavigate = useCallback((panel: PanelType, query: string) => {
    // Keep the original panel in searchState for filtering (e.g., 'conversations')
    // but navigate to the mapped panel (e.g., 'home')
    setSearchState({ query, panel });
    // setActivePanel handles the mapping internally
    setActivePanel(panel);
  }, [setActivePanel]);

  // Sync URL changes back to state
  useEffect(() => {
    const panel = searchParams.get('panel') as PanelType;
    if (panel && panel !== activePanel) {
      setActivePanelState(panel);
    }
  }, [searchParams]);

  // Memoize the context value to prevent unnecessary re-renders
  const value: AppContextType = useMemo(() => ({
    activePanel,
    setActivePanel,
    selectedItem,
    setSelectedItem,
    clearSelectedItem,
    composioConfigured,
    setComposioConfigured,
    chatSidebarOpen,
    setChatSidebarOpen,
    chatSidebarCollapsed,
    setChatSidebarCollapsed,
    chatMode,
    setChatMode,
    chatExpanded,
    setChatExpanded,
    theme,
    setTheme,
    toggleTheme,
    searchState,
    setSearchState,
    navigateTo,
    searchAndNavigate,
  }), [
    activePanel,
    setActivePanel,
    selectedItem,
    setSelectedItem,
    clearSelectedItem,
    composioConfigured,
    setComposioConfigured,
    chatSidebarOpen,
    setChatSidebarOpen,
    chatSidebarCollapsed,
    setChatSidebarCollapsed,
    chatMode,
    setChatMode,
    chatExpanded,
    setChatExpanded,
    theme,
    setTheme,
    toggleTheme,
    searchState,
    setSearchState,
    navigateTo,
    searchAndNavigate,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Export for convenience
export { AppContext };
