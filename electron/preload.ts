/**
 * Preload Script
 * Exposes safe IPC methods to the renderer process
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Types for browser control
export interface BrowserViewConfig {
  partition?: string;
  preload?: string;
  userAgent?: string;
}

export interface ClickOptions {
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
}

export interface TypeOptions {
  text: string;
  delay?: number;
  clearFirst?: boolean;
}

export interface ScrollOptions {
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
}

export interface BrowserState {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AutomationStep {
  type: 'click' | 'click-selector' | 'type' | 'type-selector' | 'scroll' | 'navigate' | 'wait' | 'wait-selector' | 'execute';
  params: Record<string, unknown>;
  description?: string;
}

export interface StepEvent {
  index: number;
  step: AutomationStep;
  total: number;
}

export interface StepCompletedEvent extends StepEvent {
  result: {
    step: AutomationStep;
    success: boolean;
    error?: string;
    duration: number;
  };
}

// Browser control API
const browserAPI = {
  // Create a new browser view
  create: (config?: BrowserViewConfig): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:create', config),

  // Destroy the browser view
  destroy: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:destroy'),

  // Navigate to a URL
  navigate: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:navigate', url),

  // Execute JavaScript in the page
  execute: <T = unknown>(script: string): Promise<{ success: boolean; result?: T; error?: string }> =>
    ipcRenderer.invoke('browser:execute', script),

  // Take a screenshot
  screenshot: (options?: { fullPage?: boolean }): Promise<{ success: boolean; data?: string; error?: string }> =>
    ipcRenderer.invoke('browser:screenshot', options),

  // Click at coordinates
  click: (options: ClickOptions): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:click', options),

  // Click on a selector
  clickSelector: (selector: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:click-selector', selector),

  // Type text
  type: (options: TypeOptions): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:type', options),

  // Type into a selector
  typeSelector: (selector: string, text: string, options?: Omit<TypeOptions, 'text'>): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:type-selector', selector, text, options),

  // Scroll the page
  scroll: (options: ScrollOptions): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:scroll', options),

  // Navigation controls
  back: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:back'),

  forward: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:forward'),

  reload: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:reload'),

  // Get current state
  getState: (): Promise<BrowserState> =>
    ipcRenderer.invoke('browser:get-state'),

  // Bounds management
  setBounds: (bounds: BrowserBounds): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('browser:set-bounds', bounds),

  getBounds: (): Promise<BrowserBounds> =>
    ipcRenderer.invoke('browser:get-bounds'),

  // Wait operations
  waitForNavigation: (timeout?: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:wait-navigation', timeout),

  waitForSelector: (selector: string, options?: { timeout?: number; visible?: boolean }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('browser:wait-selector', selector, options),

  // Execute automation sequence
  executeSequence: (steps: AutomationStep[]): Promise<{
    success: boolean;
    results: Array<{
      step: AutomationStep;
      success: boolean;
      error?: string;
      duration: number;
    }>;
    error?: string;
  }> => ipcRenderer.invoke('browser:execute-sequence', steps),

  // Event listeners
  onStateChanged: (callback: (state: BrowserState) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, state: BrowserState) => callback(state);
    ipcRenderer.on('browser:state-changed', handler);
    return () => ipcRenderer.removeListener('browser:state-changed', handler);
  },

  onStepStarted: (callback: (event: StepEvent) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, event: StepEvent) => callback(event);
    ipcRenderer.on('browser:step-started', handler);
    return () => ipcRenderer.removeListener('browser:step-started', handler);
  },

  onStepCompleted: (callback: (event: StepCompletedEvent) => void): (() => void) => {
    const handler = (_: IpcRendererEvent, event: StepCompletedEvent) => callback(event);
    ipcRenderer.on('browser:step-completed', handler);
    return () => ipcRenderer.removeListener('browser:step-completed', handler);
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronBrowser', browserAPI);

// Expose the store API for auth persistence
const storeAPI = {
  get: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('store:get', key),
  set: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('store:set', key, value),
  delete: (key: string): Promise<void> =>
    ipcRenderer.invoke('store:delete', key),
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

// Type declarations for TypeScript
declare global {
  interface Window {
    electronBrowser: typeof browserAPI;
    electron: {
      platform: NodeJS.Platform;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      send: (channel: string, ...args: unknown[]) => void;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      once: (channel: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}
