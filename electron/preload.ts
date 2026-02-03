/**
 * Preload Script
 * Exposes safe IPC methods to the renderer process
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Expose the store API for auth persistence
const storeAPI = {
  get: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('store:get', key),
  set: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('store:set', key, value),
  delete: (key: string): Promise<void> =>
    ipcRenderer.invoke('store:delete', key),
  clear: (): Promise<void> =>
    ipcRenderer.invoke('store:clear'),
};

contextBridge.exposeInMainWorld('electronAPI', {
  store: storeAPI,
});

// Also expose a general electron API for other IPC needs
contextBridge.exposeInMainWorld('electron', {
  // Platform info
  platform: process.platform,

  // Generic IPC invoke
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),

  // Generic IPC send
  send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),

  // Generic IPC on
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const handler = (_: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // Generic IPC once
  once: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.once(channel, (_, ...args) => callback(...args));
  },
});

// ============================================
// PLAYWRIGHT AUTOMATION API
// ============================================

// Event listeners for automation events (using Set for efficient add/remove)
const eventListeners = new Set<(event: any) => void>();

// Listen for automation events from main process
ipcRenderer.on('automation:event', (_, event) => {
  eventListeners.forEach(listener => {
    try {
      listener(event);
    } catch (err) {
      console.error('Error in automation event listener:', err);
    }
  });
});

contextBridge.exposeInMainWorld('playwright', {
  // Lifecycle
  initialize: () => ipcRenderer.invoke('playwright:initialize'),
  shutdown: () => ipcRenderer.invoke('playwright:shutdown'),

  // Profile Management
  getProfiles: () => ipcRenderer.invoke('playwright:get-profiles'),
  createProfile: (platform: string, name?: string) => 
    ipcRenderer.invoke('playwright:create-profile', platform, name),
  getOrCreateProfile: (platform: string) => 
    ipcRenderer.invoke('playwright:get-or-create-profile', platform),

  // Live View
  startStreaming: (profileId: string, fps?: number) => 
    ipcRenderer.invoke('playwright:start-streaming', profileId, fps),
  stopStreaming: () => ipcRenderer.invoke('playwright:stop-streaming'),
  captureFrame: (profileId: string) => 
    ipcRenderer.invoke('playwright:capture-frame', profileId),

  // LinkedIn Automation
  linkedinCheckLogin: (profileId: string) => 
    ipcRenderer.invoke('playwright:linkedin-check-login', profileId),
  linkedinNavigate: (profileId: string) => 
    ipcRenderer.invoke('playwright:linkedin-navigate', profileId),
  linkedinConnect: (profileId: string, targetUrl: string, note?: string) => 
    ipcRenderer.invoke('playwright:linkedin-connect', profileId, targetUrl, note),
  linkedinMessage: (profileId: string, targetUrl: string, message: string) => 
    ipcRenderer.invoke('playwright:linkedin-message', profileId, targetUrl, message),

  // Twitter Automation
  twitterCheckLogin: (profileId: string) => 
    ipcRenderer.invoke('playwright:twitter-check-login', profileId),
  twitterFollow: (profileId: string, username: string) => 
    ipcRenderer.invoke('playwright:twitter-follow', profileId, username),
  twitterDM: (profileId: string, username: string, message: string) => 
    ipcRenderer.invoke('playwright:twitter-dm', profileId, username, message),

  // Run Control
  approveAction: (runId: string) => 
    ipcRenderer.invoke('playwright:approve-action', runId),
  rejectAction: (runId: string) => 
    ipcRenderer.invoke('playwright:reject-action', runId),
  stopRun: (runId?: string) => ipcRenderer.invoke('playwright:stop-run', runId),
  
  // CHAOS FIX: New methods for better state management
  getActiveRuns: () => ipcRenderer.invoke('playwright:get-active-runs'),
  isProfileBusy: (profileId: string) => ipcRenderer.invoke('playwright:is-profile-busy', profileId),

  // Generic Navigation
  navigate: (profileId: string, url: string) => 
    ipcRenderer.invoke('playwright:navigate', profileId, url),

  // Event Listeners
  onEvent: (callback: (event: any) => void) => {
    eventListeners.add(callback);
    return () => {
      eventListeners.delete(callback);
    };
  },
});

// Type declarations for TypeScript
declare global {
  interface Window {
    electronAPI: {
      store: typeof storeAPI;
    };
    electron: {
      platform: NodeJS.Platform;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      send: (channel: string, ...args: unknown[]) => void;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      once: (channel: string, callback: (...args: unknown[]) => void) => void;
    };
    playwright: {
      initialize: () => Promise<any>;
      shutdown: () => Promise<any>;
      getProfiles: () => Promise<any>;
      createProfile: (platform: string, name?: string) => Promise<any>;
      getOrCreateProfile: (platform: string) => Promise<any>;
      startStreaming: (profileId: string, fps?: number) => Promise<any>;
      stopStreaming: () => Promise<any>;
      captureFrame: (profileId: string) => Promise<any>;
      linkedinCheckLogin: (profileId: string) => Promise<any>;
      linkedinNavigate: (profileId: string) => Promise<any>;
      linkedinConnect: (profileId: string, targetUrl: string, note?: string) => Promise<any>;
      linkedinMessage: (profileId: string, targetUrl: string, message: string) => Promise<any>;
      twitterCheckLogin: (profileId: string) => Promise<any>;
      twitterFollow: (profileId: string, username: string) => Promise<any>;
      twitterDM: (profileId: string, username: string, message: string) => Promise<any>;
      approveAction: (runId: string) => Promise<any>;
      rejectAction: (runId: string) => Promise<any>;
      stopRun: (runId?: string) => Promise<any>;
      getActiveRuns: () => Promise<any[]>;
      isProfileBusy: (profileId: string) => Promise<boolean>;
      navigate: (profileId: string, url: string) => Promise<any>;
      onEvent: (callback: (event: any) => void) => () => void;
    };
  }
}
