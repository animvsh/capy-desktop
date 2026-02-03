/**
 * Browser Bridge
 * Renderer-side API for browser control
 * Provides typed wrappers around the Electron IPC calls
 */

// ============================================================================
// Types
// ============================================================================

export interface BrowserViewConfig {
  /** Session partition name for isolation */
  partition?: string;
  /** Path to preload script */
  preload?: string;
  /** Custom user agent string */
  userAgent?: string;
}

export interface ClickOptions {
  /** X coordinate */
  x: number;
  /** Y coordinate */
  y: number;
  /** Mouse button */
  button?: 'left' | 'right' | 'middle';
  /** Number of clicks */
  clickCount?: number;
  /** Delay between mousedown and mouseup in ms */
  delay?: number;
}

export interface TypeOptions {
  /** Text to type */
  text: string;
  /** Delay between keystrokes in ms */
  delay?: number;
  /** Clear existing content first */
  clearFirst?: boolean;
}

export interface ScrollOptions {
  /** X coordinate for scroll position */
  x?: number;
  /** Y coordinate for scroll position */
  y?: number;
  /** Horizontal scroll delta */
  deltaX?: number;
  /** Vertical scroll delta */
  deltaY?: number;
}

export interface BrowserState {
  /** Current URL */
  url: string;
  /** Page title */
  title: string;
  /** Whether the page is loading */
  isLoading: boolean;
  /** Whether can navigate back */
  canGoBack: boolean;
  /** Whether can navigate forward */
  canGoForward: boolean;
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AutomationStep {
  /** Type of automation action */
  type: 'click' | 'click-selector' | 'type' | 'type-selector' | 'scroll' | 'navigate' | 'wait' | 'wait-selector' | 'execute';
  /** Parameters for the action */
  params: Record<string, unknown>;
  /** Human-readable description */
  description?: string;
}

export interface AutomationStepResult {
  step: AutomationStep;
  success: boolean;
  error?: string;
  duration: number;
}

export interface StepEvent {
  index: number;
  step: AutomationStep;
  total: number;
}

export interface StepCompletedEvent extends StepEvent {
  result: AutomationStepResult;
}

export interface BrowserResponse<T = void> {
  success: boolean;
  error?: string;
  result?: T;
}

// ============================================================================
// Browser Bridge Class
// ============================================================================

class BrowserBridge {
  private isElectron: boolean;

  constructor() {
    this.isElectron = typeof window !== 'undefined' && !!window.electronBrowser;
  }

  /**
   * Check if running in Electron environment
   */
  isAvailable(): boolean {
    return this.isElectron;
  }

  /**
   * Create a new browser view
   */
  async create(config?: BrowserViewConfig): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.create(config);
  }

  /**
   * Destroy the browser view
   */
  async destroy(): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.destroy();
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.navigate(url);
  }

  /**
   * Execute JavaScript in the page
   */
  async execute<T = unknown>(script: string): Promise<BrowserResponse<T>> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.execute<T>(script);
  }

  /**
   * Take a screenshot of the current view
   */
  async screenshot(options?: { fullPage?: boolean }): Promise<BrowserResponse<string>> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    const result = await window.electronBrowser!.screenshot(options);
    return {
      success: result.success,
      error: result.error,
      result: result.data,
    };
  }

  /**
   * Click at coordinates
   */
  async click(options: ClickOptions): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.click(options);
  }

  /**
   * Click on an element by CSS selector
   */
  async clickSelector(selector: string): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.clickSelector(selector);
  }

  /**
   * Type text (requires element to be focused)
   */
  async type(options: TypeOptions): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.type(options);
  }

  /**
   * Type text into an element by CSS selector
   */
  async typeSelector(
    selector: string,
    text: string,
    options?: Omit<TypeOptions, 'text'>
  ): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.typeSelector(selector, text, options);
  }

  /**
   * Scroll the page
   */
  async scroll(options: ScrollOptions): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.scroll(options);
  }

  /**
   * Go back in history
   */
  async back(): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.back();
  }

  /**
   * Go forward in history
   */
  async forward(): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.forward();
  }

  /**
   * Reload the page
   */
  async reload(): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.reload();
  }

  /**
   * Get current browser state
   */
  async getState(): Promise<BrowserState | null> {
    if (!this.isElectron) {
      return null;
    }
    return window.electronBrowser!.getState();
  }

  /**
   * Set browser view bounds
   */
  async setBounds(bounds: BrowserBounds): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.setBounds(bounds);
  }

  /**
   * Get current browser view bounds
   */
  async getBounds(): Promise<BrowserBounds | null> {
    if (!this.isElectron) {
      return null;
    }
    return window.electronBrowser!.getBounds();
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(timeout?: number): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.waitForNavigation(timeout);
  }

  /**
   * Wait for a selector to appear
   */
  async waitForSelector(
    selector: string,
    options?: { timeout?: number; visible?: boolean }
  ): Promise<BrowserResponse> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return window.electronBrowser!.waitForSelector(selector, options);
  }

  /**
   * Execute a sequence of automation steps
   */
  async executeSequence(steps: AutomationStep[]): Promise<{
    success: boolean;
    results: AutomationStepResult[];
    error?: string;
  }> {
    if (!this.isElectron) {
      return { success: false, results: [], error: 'Not running in Electron' };
    }
    return window.electronBrowser!.executeSequence(steps);
  }

  /**
   * Subscribe to browser state changes
   */
  onStateChanged(callback: (state: BrowserState) => void): () => void {
    if (!this.isElectron) {
      return () => {};
    }
    return window.electronBrowser!.onStateChanged(callback);
  }

  /**
   * Subscribe to step started events
   */
  onStepStarted(callback: (event: StepEvent) => void): () => void {
    if (!this.isElectron) {
      return () => {};
    }
    return window.electronBrowser!.onStepStarted(callback);
  }

  /**
   * Subscribe to step completed events
   */
  onStepCompleted(callback: (event: StepCompletedEvent) => void): () => void {
    if (!this.isElectron) {
      return () => {};
    }
    return window.electronBrowser!.onStepCompleted(callback);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/** Singleton instance */
export const browserBridge = new BrowserBridge();

/** Create browser view */
export const createBrowserView = (config?: BrowserViewConfig) => browserBridge.create(config);

/** Destroy browser view */
export const destroyBrowserView = () => browserBridge.destroy();

/** Navigate to URL */
export const navigateTo = (url: string) => browserBridge.navigate(url);

/** Execute script in page */
export const executeScript = <T = unknown>(script: string) => browserBridge.execute<T>(script);

/** Take screenshot */
export const takeScreenshot = (options?: { fullPage?: boolean }) => browserBridge.screenshot(options);

/** Click at coordinates */
export const clickAt = (x: number, y: number, options?: Omit<ClickOptions, 'x' | 'y'>) =>
  browserBridge.click({ x, y, ...options });

/** Click on selector */
export const clickOn = (selector: string) => browserBridge.clickSelector(selector);

/** Type text */
export const typeText = (text: string, options?: Omit<TypeOptions, 'text'>) =>
  browserBridge.type({ text, ...options });

/** Type into selector */
export const typeInto = (selector: string, text: string, options?: Omit<TypeOptions, 'text'>) =>
  browserBridge.typeSelector(selector, text, options);

/** Scroll page */
export const scrollPage = (deltaY: number, deltaX?: number) =>
  browserBridge.scroll({ deltaX: deltaX ?? 0, deltaY, x: 0, y: 0 });

/** Go back */
export const goBack = () => browserBridge.back();

/** Go forward */
export const goForward = () => browserBridge.forward();

/** Reload page */
export const reloadPage = () => browserBridge.reload();

/** Get browser state */
export const getBrowserState = () => browserBridge.getState();

/** Wait for selector */
export const waitFor = (selector: string, timeout?: number) =>
  browserBridge.waitForSelector(selector, { timeout });

/** Run automation sequence */
export const runAutomation = (steps: AutomationStep[]) => browserBridge.executeSequence(steps);

// ============================================================================
// Export
// ============================================================================

export default browserBridge;
