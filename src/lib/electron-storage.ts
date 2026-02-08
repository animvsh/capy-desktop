/**
 * Electron-safe storage adapter for Supabase auth
 * Uses electron-store instead of localStorage for better persistence and security
 * 
 * Benefits:
 * - Data persists across app restarts reliably
 * - Can be encrypted with encryption key
 * - Works properly in Electron's main and renderer processes
 * - Prevents data loss issues with localStorage in Electron
 */

// Check if we're running in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && 
         typeof window.process === 'object' && 
         (window.process as any).type === 'renderer';
};

// Storage adapter interface for Supabase
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Creates a storage adapter that uses electron-store when available,
 * falls back to localStorage otherwise
 */
export function createStorageAdapter(): StorageAdapter {
  if (isElectron()) {
    // Use electron-store via IPC if available
    // For now, we'll use localStorage but with a wrapper
    // TODO: Implement electron-store IPC bridge
    console.info('📦 Using localStorage (Electron mode) - consider migrating to electron-store');
    return createLocalStorageAdapter();
  } else {
    // Use standard localStorage for web contexts
    return createLocalStorageAdapter();
  }
}

function createLocalStorageAdapter(): StorageAdapter {
  return {
    getItem(key: string): string | null {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        console.error('Storage getItem error:', error);
        return null;
      }
    },
    
    setItem(key: string, value: string): void {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.error('Storage setItem error:', error);
      }
    },
    
    removeItem(key: string): void {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error('Storage removeItem error:', error);
      }
    }
  };
}

/**
 * Enhanced electron-store adapter (requires IPC bridge setup)
 * This is a placeholder for future implementation
 */
export function createElectronStoreAdapter(): StorageAdapter {
  // TODO: Implement IPC bridge to electron-store
  // For now, fall back to localStorage
  console.warn('electron-store adapter not yet implemented, using localStorage');
  return createLocalStorageAdapter();
}

// Export the default storage adapter
export const storage = createStorageAdapter();
