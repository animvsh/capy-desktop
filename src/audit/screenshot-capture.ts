/**
 * Screenshot Capture Module
 * Captures screenshots at key moments before/after actions
 */

import {
  ScreenshotConfig,
  CapturedScreenshot,
  DEFAULT_AUDIT_CONFIG,
  getDateString,
} from './types';

// ============================================================================
// Screenshot Capture Class (Renderer-side)
// ============================================================================

export class ScreenshotCapture {
  private config: ScreenshotConfig;
  private captureQueue: Array<{
    type: 'before' | 'after' | 'manual';
    auditEntryId?: string;
    resolve: (result: CapturedScreenshot | null) => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessing = false;

  constructor(config: Partial<ScreenshotConfig> = {}) {
    this.config = { ...DEFAULT_AUDIT_CONFIG.screenshots, ...config };
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  updateConfig(config: Partial<ScreenshotConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ScreenshotConfig {
    return { ...this.config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  // --------------------------------------------------------------------------
  // Capture Methods
  // --------------------------------------------------------------------------

  /**
   * Capture a screenshot before an action
   */
  async captureBeforeAction(auditEntryId?: string): Promise<CapturedScreenshot | null> {
    if (!this.config.enabled || !this.config.captureBeforeAction) {
      return null;
    }
    return this.queueCapture('before', auditEntryId);
  }

  /**
   * Capture a screenshot after an action
   */
  async captureAfterAction(auditEntryId?: string): Promise<CapturedScreenshot | null> {
    if (!this.config.enabled || !this.config.captureAfterAction) {
      return null;
    }
    return this.queueCapture('after', auditEntryId);
  }

  /**
   * Capture a manual screenshot
   */
  async captureManual(): Promise<CapturedScreenshot | null> {
    if (!this.config.enabled) {
      return null;
    }
    return this.queueCapture('manual');
  }

  /**
   * Capture screenshot pair (before and after)
   */
  async capturePair(
    action: () => Promise<void>,
    auditEntryId?: string
  ): Promise<{
    before: CapturedScreenshot | null;
    after: CapturedScreenshot | null;
  }> {
    const before = await this.captureBeforeAction(auditEntryId);
    
    try {
      await action();
    } finally {
      // Always capture after, even if action fails
    }
    
    // Small delay to let UI update
    await this.delay(100);
    
    const after = await this.captureAfterAction(auditEntryId);
    
    return { before, after };
  }

  // --------------------------------------------------------------------------
  // Queue Processing
  // --------------------------------------------------------------------------

  private async queueCapture(
    type: 'before' | 'after' | 'manual',
    auditEntryId?: string
  ): Promise<CapturedScreenshot | null> {
    return new Promise((resolve, reject) => {
      this.captureQueue.push({ type, auditEntryId, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.captureQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.captureQueue.length > 0) {
      const item = this.captureQueue.shift();
      if (!item) continue;

      try {
        const screenshot = await this.doCapture(item.type, item.auditEntryId);
        item.resolve(screenshot);
      } catch (error) {
        console.error('Screenshot capture failed:', error);
        item.resolve(null);
      }
    }

    this.isProcessing = false;
  }

  // --------------------------------------------------------------------------
  // Actual Capture Logic
  // --------------------------------------------------------------------------

  private async doCapture(
    type: 'before' | 'after' | 'manual',
    auditEntryId?: string
  ): Promise<CapturedScreenshot | null> {
    try {
      // Call main process to capture screenshot
      if (typeof window !== 'undefined' && window.electron?.invoke) {
        const result = await window.electron.invoke('audit:capture-screenshot', {
          type,
          auditEntryId,
          quality: this.config.quality,
          maxWidth: this.config.maxWidth,
        }) as CapturedScreenshot | null;

        return result;
      }

      // Fallback: try to use browser API
      return this.captureFallback(type, auditEntryId);
    } catch (error) {
      console.error('Screenshot capture error:', error);
      return null;
    }
  }

  /**
   * Fallback capture using browser view screenshot
   */
  private async captureFallback(
    type: 'before' | 'after' | 'manual',
    auditEntryId?: string
  ): Promise<CapturedScreenshot | null> {
    try {
      if (typeof window !== 'undefined' && window.electronBrowser?.screenshot) {
        const result = await window.electronBrowser.screenshot({ fullPage: false });
        
        if (result.success && result.data) {
          const timestamp = Date.now();
          const id = this.generateScreenshotId();
          
          // In fallback mode, we just return the base64 data
          // The main process will handle saving if needed
          return {
            id,
            path: `memory://${id}`, // Indicates in-memory screenshot
            timestamp,
            type,
            auditEntryId,
            width: 0, // Unknown in fallback
            height: 0,
            sizeBytes: result.data.length,
          };
        }
      }
      return null;
    } catch (error) {
      console.error('Fallback screenshot capture error:', error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Request cleanup of old screenshots
   */
  async cleanupOldScreenshots(): Promise<number> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      const deletedCount = await window.electron.invoke(
        'audit:cleanup-screenshots',
        this.config.retentionDays
      ) as number;
      return deletedCount;
    }
    return 0;
  }

  /**
   * Get screenshot by ID
   */
  async getScreenshot(id: string): Promise<string | null> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      return window.electron.invoke('audit:get-screenshot', id) as Promise<string | null>;
    }
    return null;
  }

  /**
   * Get screenshot path for a given audit entry
   */
  async getScreenshotPaths(auditEntryId: string): Promise<{
    before?: string;
    after?: string;
  }> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      return window.electron.invoke('audit:get-screenshot-paths', auditEntryId) as Promise<{
        before?: string;
        after?: string;
      }>;
    }
    return {};
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private generateScreenshotId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `ss_${timestamp}_${random}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate organized path for screenshot
   */
  static generatePath(
    baseDir: string,
    type: 'before' | 'after' | 'manual',
    timestamp: number = Date.now()
  ): string {
    const dateStr = getDateString(timestamp);
    const timeStr = new Date(timestamp).toTimeString().split(' ')[0].replace(/:/g, '-');
    const random = Math.random().toString(36).substring(2, 6);
    return `${baseDir}/${dateStr}/${type}_${timeStr}_${random}.png`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalScreenshotCapture: ScreenshotCapture | null = null;

export function getScreenshotCapture(config?: Partial<ScreenshotConfig>): ScreenshotCapture {
  if (!globalScreenshotCapture) {
    globalScreenshotCapture = new ScreenshotCapture(config);
  }
  return globalScreenshotCapture;
}

export function resetScreenshotCapture(): void {
  globalScreenshotCapture = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function captureScreenshot(
  type: 'before' | 'after' | 'manual',
  auditEntryId?: string
): Promise<CapturedScreenshot | null> {
  const capture = getScreenshotCapture();
  
  switch (type) {
    case 'before':
      return capture.captureBeforeAction(auditEntryId);
    case 'after':
      return capture.captureAfterAction(auditEntryId);
    case 'manual':
      return capture.captureManual();
    default:
      return null;
  }
}

export async function captureActionPair(
  action: () => Promise<void>,
  auditEntryId?: string
): Promise<{
  before: CapturedScreenshot | null;
  after: CapturedScreenshot | null;
}> {
  return getScreenshotCapture().capturePair(action, auditEntryId);
}
