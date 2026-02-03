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
  }
}
