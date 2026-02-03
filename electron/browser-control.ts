/**
 * Browser Control Module
 * Manages BrowserView instances for automated browser control
 */

import { BrowserView, BrowserWindow, session, WebContents } from 'electron';
import * as path from 'path';

export interface BrowserViewConfig {
  partition?: string;
  preload?: string;
  userAgent?: string;
}

export interface AutomationStep {
  id: string;
  type: 'click' | 'type' | 'scroll' | 'navigate' | 'wait' | 'screenshot' | 'execute';
  status: 'pending' | 'running' | 'completed' | 'failed';
  description: string;
  timestamp: number;
  duration?: number;
  error?: string;
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

export class BrowserControl {
  private browserView: BrowserView | null = null;
  private parentWindow: BrowserWindow | null = null;
  private currentUrl: string = '';
  private pageTitle: string = '';
  private isLoading: boolean = false;
  private bounds: { x: number; y: number; width: number; height: number } = {
    x: 0,
    y: 0,
    width: 800,
    height: 600,
  };

  constructor() {}

  /**
   * Create a new BrowserView and attach it to the parent window
   */
  async create(
    parentWindow: BrowserWindow,
    config: BrowserViewConfig = {}
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.browserView) {
        await this.destroy();
      }

      this.parentWindow = parentWindow;

      // Create a session partition for isolation
      const partitionName = config.partition || 'persist:browser-control';
      const ses = session.fromPartition(partitionName);

      // Set custom user agent if provided
      if (config.userAgent) {
        ses.setUserAgent(config.userAgent);
      }

      this.browserView = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          preload: config.preload,
          partition: partitionName,
        },
      });

      // Attach to parent window
      parentWindow.setBrowserView(this.browserView);

      // Set initial bounds
      this.setBounds(this.bounds);

      // Set up event listeners
      this.setupEventListeners();

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Destroy the BrowserView
   */
  async destroy(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.browserView && this.parentWindow) {
        this.parentWindow.removeBrowserView(this.browserView);
        // @ts-ignore - webContents.destroy() exists but may not be in types
        this.browserView.webContents?.destroy?.();
        this.browserView = null;
      }
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Set the bounds of the BrowserView
   */
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = bounds;
    if (this.browserView) {
      this.browserView.setBounds(bounds);
    }
  }

  /**
   * Get current bounds
   */
  getBounds(): { x: number; y: number; width: number; height: number } {
    return this.bounds;
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      await this.browserView.webContents.loadURL(url);
      this.currentUrl = url;
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Execute JavaScript in the page
   */
  async executeScript<T = unknown>(script: string): Promise<{ success: boolean; result?: T; error?: string }> {
    try {
      if (!this.browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      const result = await this.browserView.webContents.executeJavaScript(script);
      return { success: true, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Take a screenshot of the current view
   */
  async screenshot(options: { fullPage?: boolean } = {}): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      if (!this.browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      const image = await this.browserView.webContents.capturePage();
      const dataUrl = image.toDataURL();
      return { success: true, data: dataUrl };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Click at coordinates
   */
  async click(options: ClickOptions): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      const { x, y, button = 'left', clickCount = 1, delay = 0 } = options;
      const webContents = this.browserView.webContents;

      // Send mouse events to simulate click
      webContents.sendInputEvent({
        type: 'mouseDown',
        x,
        y,
        button,
        clickCount,
      });

      if (delay > 0) {
        await this.sleep(delay);
      }

      webContents.sendInputEvent({
        type: 'mouseUp',
        x,
        y,
        button,
        clickCount,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Type text
   */
  async type(options: TypeOptions): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      const { text, delay = 0, clearFirst = false } = options;
      const webContents = this.browserView.webContents;

      // Clear existing text if requested
      if (clearFirst) {
        await this.executeScript(`
          const activeEl = document.activeElement;
          if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
            activeEl.value = '';
            activeEl.textContent = '';
          }
        `);
      }

      // Type each character
      for (const char of text) {
        webContents.sendInputEvent({
          type: 'keyDown',
          keyCode: char,
        });
        webContents.sendInputEvent({
          type: 'char',
          keyCode: char,
        });
        webContents.sendInputEvent({
          type: 'keyUp',
          keyCode: char,
        });

        if (delay > 0) {
          await this.sleep(delay);
        }
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Scroll the page
   */
  async scroll(options: ScrollOptions): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      const { x = 0, y = 0, deltaX = 0, deltaY = 0 } = options;
      const webContents = this.browserView.webContents;

      webContents.sendInputEvent({
        type: 'mouseWheel',
        x,
        y,
        deltaX,
        deltaY,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Go back in history
   */
  async goBack(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      if (this.browserView.webContents.canGoBack()) {
        this.browserView.webContents.goBack();
        return { success: true };
      }
      return { success: false, error: 'Cannot go back' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Go forward in history
   */
  async goForward(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      if (this.browserView.webContents.canGoForward()) {
        this.browserView.webContents.goForward();
        return { success: true };
      }
      return { success: false, error: 'Cannot go forward' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Reload the page
   */
  async reload(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      this.browserView.webContents.reload();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get current state
   */
  getState(): {
    url: string;
    title: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
  } {
    if (!this.browserView) {
      return {
        url: '',
        title: '',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
      };
    }

    return {
      url: this.browserView.webContents.getURL(),
      title: this.browserView.webContents.getTitle(),
      isLoading: this.browserView.webContents.isLoading(),
      canGoBack: this.browserView.webContents.canGoBack(),
      canGoForward: this.browserView.webContents.canGoForward(),
    };
  }

  /**
   * Get WebContents for advanced operations
   */
  getWebContents(): WebContents | null {
    return this.browserView?.webContents || null;
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(timeout: number = 30000): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.browserView) {
        resolve({ success: false, error: 'BrowserView not created' });
        return;
      }

      const timeoutId = setTimeout(() => {
        resolve({ success: false, error: 'Navigation timeout' });
      }, timeout);

      this.browserView.webContents.once('did-finish-load', () => {
        clearTimeout(timeoutId);
        resolve({ success: true });
      });

      this.browserView.webContents.once('did-fail-load', (_, errorCode, errorDescription) => {
        clearTimeout(timeoutId);
        resolve({ success: false, error: `Navigation failed: ${errorDescription} (${errorCode})` });
      });
    });
  }

  /**
   * Wait for an element to appear
   */
  async waitForSelector(
    selector: string,
    options: { timeout?: number; visible?: boolean } = {}
  ): Promise<{ success: boolean; error?: string }> {
    const { timeout = 30000, visible = true } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.executeScript<boolean>(`
        const el = document.querySelector('${selector}');
        if (!el) return false;
        if (${visible}) {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }
        return true;
      `);

      if (result.success && result.result) {
        return { success: true };
      }

      await this.sleep(100);
    }

    return { success: false, error: `Timeout waiting for selector: ${selector}` };
  }

  /**
   * Click on an element by selector
   */
  async clickSelector(selector: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get element position
      const result = await this.executeScript<{ x: number; y: number } | null>(`
        const el = document.querySelector('${selector}');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      `);

      if (!result.success || !result.result) {
        return { success: false, error: `Element not found: ${selector}` };
      }

      return this.click({ x: result.result.x, y: result.result.y });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Type into an element by selector
   */
  async typeIntoSelector(selector: string, text: string, options: Omit<TypeOptions, 'text'> = {}): Promise<{ success: boolean; error?: string }> {
    try {
      // Focus the element first
      const focusResult = await this.executeScript(`
        const el = document.querySelector('${selector}');
        if (!el) throw new Error('Element not found');
        el.focus();
        return true;
      `);

      if (!focusResult.success) {
        return { success: false, error: `Element not found: ${selector}` };
      }

      return this.type({ text, ...options });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Set up event listeners for the BrowserView
   */
  private setupEventListeners(): void {
    if (!this.browserView) return;

    const webContents = this.browserView.webContents;

    webContents.on('did-start-loading', () => {
      this.isLoading = true;
      this.emitStateChange();
    });

    webContents.on('did-stop-loading', () => {
      this.isLoading = false;
      this.emitStateChange();
    });

    webContents.on('did-navigate', (_, url) => {
      this.currentUrl = url;
      this.emitStateChange();
    });

    webContents.on('did-navigate-in-page', (_, url) => {
      this.currentUrl = url;
      this.emitStateChange();
    });

    webContents.on('page-title-updated', (_, title) => {
      this.pageTitle = title;
      this.emitStateChange();
    });

    // Handle new window requests (open in same view or external browser)
    webContents.setWindowOpenHandler(({ url }) => {
      // For now, navigate in the same view
      this.navigate(url);
      return { action: 'deny' };
    });
  }

  /**
   * Emit state change event to parent window
   */
  private emitStateChange(): void {
    if (this.parentWindow && !this.parentWindow.isDestroyed()) {
      this.parentWindow.webContents.send('browser:state-changed', this.getState());
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const browserControl = new BrowserControl();
