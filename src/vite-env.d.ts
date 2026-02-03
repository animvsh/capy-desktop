/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Browser response type
interface BrowserResponse<T = void> {
  success: boolean;
  error?: string;
  result?: T;
}

// Browser state type
interface BrowserState {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

// Browser bounds type
interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Automation step types
interface AutomationStep {
  type: 'click' | 'click-selector' | 'type' | 'type-selector' | 'scroll' | 'navigate' | 'wait' | 'wait-selector' | 'execute';
  params: Record<string, unknown>;
  description?: string;
}

interface AutomationStepResult {
  step: AutomationStep;
  success: boolean;
  error?: string;
  duration: number;
}

interface StepEvent {
  index: number;
  step: AutomationStep;
  total: number;
}

interface StepCompletedEvent extends StepEvent {
  result: AutomationStepResult;
}

// Electron IPC bridge types
interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (data: unknown) => void) => () => void;
  send: (channel: string, ...args: unknown[]) => void;
  store: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
}

interface ElectronBrowserAPI {
  create: (config?: unknown) => Promise<BrowserResponse>;
  destroy: () => Promise<BrowserResponse>;
  navigate: (url: string) => Promise<BrowserResponse>;
  execute: <T>(script: string) => Promise<BrowserResponse<T>>;
  screenshot: (options?: { fullPage?: boolean }) => Promise<{ success: boolean; data?: string; error?: string }>;
  click: (options: unknown) => Promise<BrowserResponse>;
  clickSelector: (selector: string) => Promise<BrowserResponse>;
  type: (options: unknown) => Promise<BrowserResponse>;
  typeSelector: (selector: string, text: string, options?: unknown) => Promise<BrowserResponse>;
  scroll: (options: unknown) => Promise<BrowserResponse>;
  back: () => Promise<BrowserResponse>;
  forward: () => Promise<BrowserResponse>;
  reload: () => Promise<BrowserResponse>;
  getState: () => Promise<BrowserState | null>;
  setBounds: (bounds: BrowserBounds) => Promise<BrowserResponse>;
  getBounds: () => Promise<BrowserBounds | null>;
  waitForNavigation: (timeout?: number) => Promise<BrowserResponse>;
  waitForSelector: (selector: string, options?: unknown) => Promise<BrowserResponse>;
  executeSequence: (steps: AutomationStep[]) => Promise<{ success: boolean; results: AutomationStepResult[]; error?: string }>;
  onStateChanged: (callback: (state: BrowserState) => void) => () => void;
  onStepStarted: (callback: (event: StepEvent) => void) => () => void;
  onStepCompleted: (callback: (event: StepCompletedEvent) => void) => () => void;
  getUrl: () => Promise<string>;
  getTitle: () => Promise<string>;
  select: (selector: string, value: string) => Promise<void>;
  hover: (selector: string) => Promise<void>;
  focus: (selector: string) => Promise<void>;
  getAttribute: (selector: string, attribute: string) => Promise<string | null>;
  getProperty: (selector: string, property: string) => Promise<unknown>;
  getText: (selector: string) => Promise<string>;
  isVisible: (selector: string) => Promise<boolean>;
  evaluate: <T>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]) => Promise<T>;
  onFrameUpdate: (callback: (frameData: unknown) => void) => () => void;
  onConsole: (callback: (message: unknown) => void) => () => void;
  onError: (callback: (error: unknown) => void) => () => void;
}

interface Window {
  electron?: ElectronAPI;
  electronBrowser?: ElectronBrowserAPI;
  electronAPI?: ElectronAPI;
}
