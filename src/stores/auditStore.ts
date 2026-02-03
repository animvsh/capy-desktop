/**
 * Audit Store
 * Zustand store for audit log state management in the UI
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  AuditEntry,
  AuditQuery,
  AuditQueryResult,
  AuditStats,
  AuditActionType,
  AuditResult,
  AuditSeverity,
  ExportOptions,
  ExportResult,
} from '../audit/types';
import { getAuditExporter } from '../audit/export';

// ============================================================================
// Types
// ============================================================================

export interface AuditFilter {
  dateFrom?: number;
  dateTo?: number;
  actions: AuditActionType[];
  results: AuditResult[];
  severities: AuditSeverity[];
  searchTerm: string;
  runId?: string;
}

export interface AuditStoreState {
  // Entries
  entries: AuditEntry[];
  totalEntries: number;
  hasMore: boolean;
  
  // Selected entry
  selectedEntryId: string | null;
  selectedEntry: AuditEntry | null;
  
  // Loading states
  isLoading: boolean;
  isLoadingMore: boolean;
  isExporting: boolean;
  
  // Filters
  filters: AuditFilter;
  
  // Statistics
  stats: AuditStats | null;
  isLoadingStats: boolean;
  
  // Pagination
  currentPage: number;
  pageSize: number;
  
  // Screenshot viewer
  screenshotViewerOpen: boolean;
  screenshotViewerPath: string | null;
  
  // Error state
  error: string | null;
}

export interface AuditStoreActions {
  // Data loading
  loadEntries: (reset?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  refreshEntries: () => Promise<void>;
  
  // Entry selection
  selectEntry: (id: string | null) => Promise<void>;
  clearSelection: () => void;
  
  // Filtering
  setFilters: (filters: Partial<AuditFilter>) => void;
  resetFilters: () => void;
  setSearchTerm: (term: string) => void;
  setDateRange: (from?: number, to?: number) => void;
  toggleActionFilter: (action: AuditActionType) => void;
  toggleResultFilter: (result: AuditResult) => void;
  
  // Statistics
  loadStats: () => Promise<void>;
  
  // Export
  exportLogs: (options: Omit<ExportOptions, 'dateFrom' | 'dateTo' | 'actions' | 'results'>) => Promise<ExportResult>;
  downloadExport: (format: 'json' | 'csv', includeScreenshots?: boolean) => Promise<boolean>;
  
  // Screenshot viewer
  openScreenshotViewer: (path: string) => void;
  closeScreenshotViewer: () => void;
  
  // Real-time updates
  addEntry: (entry: AuditEntry) => void;
  
  // Cleanup
  deleteOldEntries: (olderThanDays: number) => Promise<number>;
  
  // Reset
  reset: () => void;
}

export type AuditStore = AuditStoreState & AuditStoreActions;

// ============================================================================
// Default Filter
// ============================================================================

const defaultFilters: AuditFilter = {
  dateFrom: undefined,
  dateTo: undefined,
  actions: [],
  results: [],
  severities: [],
  searchTerm: '',
  runId: undefined,
};

// ============================================================================
// Initial State
// ============================================================================

const initialState: AuditStoreState = {
  entries: [],
  totalEntries: 0,
  hasMore: false,
  selectedEntryId: null,
  selectedEntry: null,
  isLoading: false,
  isLoadingMore: false,
  isExporting: false,
  filters: defaultFilters,
  stats: null,
  isLoadingStats: false,
  currentPage: 1,
  pageSize: 50,
  screenshotViewerOpen: false,
  screenshotViewerPath: null,
  error: null,
};

// ============================================================================
// Store
// ============================================================================

export const useAuditStore = create<AuditStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ========================================================================
    // Data Loading
    // ========================================================================

    loadEntries: async (reset = true) => {
      const { filters, pageSize, isLoading } = get();
      
      if (isLoading) return;
      
      set({ isLoading: true, error: null });
      
      if (reset) {
        set({ currentPage: 1, entries: [] });
      }

      try {
        const query: AuditQuery = {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          actions: filters.actions.length > 0 ? filters.actions : undefined,
          results: filters.results.length > 0 ? filters.results : undefined,
          severities: filters.severities.length > 0 ? filters.severities : undefined,
          searchTerm: filters.searchTerm || undefined,
          runId: filters.runId,
          limit: pageSize,
          offset: 0,
          orderBy: 'timestamp',
          orderDirection: 'desc',
        };

        const result = await getAuditExporter().query(query);

        set({
          entries: result.entries,
          totalEntries: result.total,
          hasMore: result.hasMore,
          isLoading: false,
          currentPage: 1,
        });
      } catch (error) {
        console.error('Failed to load audit entries:', error);
        set({
          error: error instanceof Error ? error.message : 'Failed to load entries',
          isLoading: false,
        });
      }
    },

    loadMore: async () => {
      const { filters, pageSize, currentPage, entries, hasMore, isLoadingMore } = get();
      
      if (isLoadingMore || !hasMore) return;
      
      set({ isLoadingMore: true });

      try {
        const query: AuditQuery = {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          actions: filters.actions.length > 0 ? filters.actions : undefined,
          results: filters.results.length > 0 ? filters.results : undefined,
          severities: filters.severities.length > 0 ? filters.severities : undefined,
          searchTerm: filters.searchTerm || undefined,
          runId: filters.runId,
          limit: pageSize,
          offset: currentPage * pageSize,
          orderBy: 'timestamp',
          orderDirection: 'desc',
        };

        const result = await getAuditExporter().query(query);

        set({
          entries: [...entries, ...result.entries],
          hasMore: result.hasMore,
          isLoadingMore: false,
          currentPage: currentPage + 1,
        });
      } catch (error) {
        console.error('Failed to load more entries:', error);
        set({ isLoadingMore: false });
      }
    },

    refreshEntries: async () => {
      await get().loadEntries(true);
    },

    // ========================================================================
    // Entry Selection
    // ========================================================================

    selectEntry: async (id: string | null) => {
      if (!id) {
        set({ selectedEntryId: null, selectedEntry: null });
        return;
      }

      set({ selectedEntryId: id });

      try {
        const entry = await getAuditExporter().getEntry(id);
        set({ selectedEntry: entry });
      } catch (error) {
        console.error('Failed to load entry:', error);
        set({ selectedEntry: null });
      }
    },

    clearSelection: () => {
      set({ selectedEntryId: null, selectedEntry: null });
    },

    // ========================================================================
    // Filtering
    // ========================================================================

    setFilters: (newFilters: Partial<AuditFilter>) => {
      set((state) => ({
        filters: { ...state.filters, ...newFilters },
      }));
      // Trigger reload with new filters
      get().loadEntries(true);
    },

    resetFilters: () => {
      set({ filters: defaultFilters });
      get().loadEntries(true);
    },

    setSearchTerm: (term: string) => {
      set((state) => ({
        filters: { ...state.filters, searchTerm: term },
      }));
      // Debounced reload would be better here
      get().loadEntries(true);
    },

    setDateRange: (from?: number, to?: number) => {
      set((state) => ({
        filters: { ...state.filters, dateFrom: from, dateTo: to },
      }));
      get().loadEntries(true);
    },

    toggleActionFilter: (action: AuditActionType) => {
      set((state) => {
        const actions = state.filters.actions.includes(action)
          ? state.filters.actions.filter((a) => a !== action)
          : [...state.filters.actions, action];
        return { filters: { ...state.filters, actions } };
      });
      get().loadEntries(true);
    },

    toggleResultFilter: (result: AuditResult) => {
      set((state) => {
        const results = state.filters.results.includes(result)
          ? state.filters.results.filter((r) => r !== result)
          : [...state.filters.results, result];
        return { filters: { ...state.filters, results } };
      });
      get().loadEntries(true);
    },

    // ========================================================================
    // Statistics
    // ========================================================================

    loadStats: async () => {
      set({ isLoadingStats: true });

      try {
        const stats = await getAuditExporter().getStats();
        set({ stats, isLoadingStats: false });
      } catch (error) {
        console.error('Failed to load stats:', error);
        set({ isLoadingStats: false });
      }
    },

    // ========================================================================
    // Export
    // ========================================================================

    exportLogs: async (options) => {
      const { filters } = get();
      
      set({ isExporting: true });

      try {
        const result = await getAuditExporter().export({
          ...options,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          actions: filters.actions.length > 0 ? filters.actions : undefined,
          results: filters.results.length > 0 ? filters.results : undefined,
        });

        set({ isExporting: false });
        return result;
      } catch (error) {
        set({ isExporting: false });
        return {
          success: false,
          entryCount: 0,
          error: error instanceof Error ? error.message : 'Export failed',
        };
      }
    },

    downloadExport: async (format, includeScreenshots = false) => {
      const { filters } = get();
      
      set({ isExporting: true });

      try {
        const success = await getAuditExporter().downloadExport({
          format,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          actions: filters.actions.length > 0 ? filters.actions : undefined,
          results: filters.results.length > 0 ? filters.results : undefined,
          includeScreenshots,
        });

        set({ isExporting: false });
        return success;
      } catch (error) {
        set({ isExporting: false });
        return false;
      }
    },

    // ========================================================================
    // Screenshot Viewer
    // ========================================================================

    openScreenshotViewer: (path: string) => {
      set({ screenshotViewerOpen: true, screenshotViewerPath: path });
    },

    closeScreenshotViewer: () => {
      set({ screenshotViewerOpen: false, screenshotViewerPath: null });
    },

    // ========================================================================
    // Real-time Updates
    // ========================================================================

    addEntry: (entry: AuditEntry) => {
      set((state) => ({
        entries: [entry, ...state.entries],
        totalEntries: state.totalEntries + 1,
      }));
    },

    // ========================================================================
    // Cleanup
    // ========================================================================

    deleteOldEntries: async (olderThanDays: number) => {
      try {
        if (typeof window !== 'undefined' && window.electron?.invoke) {
          const deletedCount = await window.electron.invoke('audit:delete-old', olderThanDays) as number;
          await get().loadEntries(true);
          return deletedCount;
        }
        return 0;
      } catch (error) {
        console.error('Failed to delete old entries:', error);
        return 0;
      }
    },

    // ========================================================================
    // Reset
    // ========================================================================

    reset: () => {
      set(initialState);
    },
  }))
);

// ============================================================================
// Selectors
// ============================================================================

export const selectAuditEntries = (state: AuditStore) => state.entries;
export const selectTotalEntries = (state: AuditStore) => state.totalEntries;
export const selectHasMore = (state: AuditStore) => state.hasMore;
export const selectIsLoading = (state: AuditStore) => state.isLoading;
export const selectFilters = (state: AuditStore) => state.filters;
export const selectStats = (state: AuditStore) => state.stats;
export const selectSelectedEntry = (state: AuditStore) => state.selectedEntry;

export const selectRecentEntries = (state: AuditStore) => 
  state.entries.slice(0, 10);

export const selectEntriesByAction = (action: AuditActionType) => (state: AuditStore) =>
  state.entries.filter((e) => e.action === action);

export const selectEntriesByResult = (result: AuditResult) => (state: AuditStore) =>
  state.entries.filter((e) => e.result === result);

export const selectFailedEntries = (state: AuditStore) =>
  state.entries.filter((e) => e.result === 'failed');

export const selectEntriesWithScreenshots = (state: AuditStore) =>
  state.entries.filter((e) => e.screenshotPath || e.screenshotPathBefore || e.screenshotPathAfter);

// ============================================================================
// Initialize real-time listener
// ============================================================================

export function initAuditStoreListener(): () => void {
  if (typeof window !== 'undefined' && window.electron?.on) {
    const unsubscribe = window.electron.on('audit:new-entry', (entry: unknown) => {
      if (entry && typeof entry === 'object') {
        useAuditStore.getState().addEntry(entry as AuditEntry);
      }
    });
    return unsubscribe;
  }
  return () => {};
}

export default useAuditStore;
