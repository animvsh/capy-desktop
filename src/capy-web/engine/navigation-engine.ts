// ============================================================================
// CAPY WEB - NAVIGATION & EXECUTION ENGINE
// Browser control with human-like behavior
// ============================================================================

import {
  BrowsingSession,
  NavigationAction,
  PageVisit,
  ExtractionResult,
  ExecutionPath,
  SourceTier,
  RateLimitConfig
} from '../types';
import { 
  generateId, 
  humanDelay, 
  sleep, 
  extractDomain, 
  RateLimiter,
  withTimeout 
} from '../utils/helpers';
import { getAdapterRegistry } from '../adapters/adapter-registry';
import { getCacheManager } from '../cache/cache-manager';
import { TelemetryEngine } from '../telemetry/telemetry-engine';
import { SourceIntelligenceEngine } from '../core/source-intelligence';

// ============================================================================
// BROWSER TYPES (Playwright-compatible)
// ============================================================================

interface BrowserContext {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

interface Page {
  goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  content(): Promise<string>;
  textContent(selector: string): Promise<string | null>;
  $(selector: string): Promise<ElementHandle | null>;
  $$(selector: string): Promise<ElementHandle[]>;
  $eval(selector: string, fn: (el: Element) => unknown): Promise<unknown>;
  $$eval(selector: string, fn: (els: Element[]) => unknown): Promise<unknown>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<ElementHandle | null>;
  waitForLoadState(state?: string): Promise<void>;
  evaluate(fn: () => unknown): Promise<unknown>;
  close(): Promise<void>;
  isClosed(): boolean;
}

interface ElementHandle {
  click(): Promise<void>;
  textContent(): Promise<string | null>;
  getAttribute(name: string): Promise<string | null>;
  $eval(selector: string, fn: (el: Element) => unknown): Promise<unknown>;
  $$(selector: string): Promise<ElementHandle[]>;
}

// ============================================================================
// NAVIGATION ENGINE
// ============================================================================

export class NavigationEngine {
  private context: BrowserContext | null = null;
  private activeSessions: Map<string, BrowsingSession> = new Map();
  private activePages: Map<string, Page> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private robotsTxtCache: Map<string, Set<string>> = new Map();
  
  private telemetry: TelemetryEngine | null = null;
  private sourceIntel: SourceIntelligenceEngine | null = null;
  private adapterRegistry = getAdapterRegistry();
  private cache = getCacheManager();
  
  private config: {
    humanBehavior: boolean;
    respectRobotsTxt: boolean;
    rateLimit: RateLimitConfig;
    defaultTimeout: number;
    maxConcurrentPages: number;
  };
  
  constructor(config?: Partial<NavigationEngine['config']>) {
    this.config = {
      humanBehavior: true,
      respectRobotsTxt: true,
      rateLimit: {
        requestsPerSecond: 2,
        burstSize: 5,
        perDomainDelay: 1000
      },
      defaultTimeout: 30000,
      maxConcurrentPages: 5,
      ...config
    };
  }
  
  /**
   * Set browser context (from Playwright)
   */
  setBrowserContext(context: BrowserContext): void {
    this.context = context;
  }
  
  /**
   * Set telemetry engine
   */
  setTelemetry(telemetry: TelemetryEngine): void {
    this.telemetry = telemetry;
  }
  
  /**
   * Set source intelligence engine
   */
  setSourceIntelligence(sourceIntel: SourceIntelligenceEngine): void {
    this.sourceIntel = sourceIntel;
  }
  
  /**
   * Start a browsing session for an execution path
   */
  async startSession(path: ExecutionPath): Promise<BrowsingSession> {
    if (!this.context) {
      throw new Error('Browser context not set');
    }
    
    const session: BrowsingSession = {
      id: generateId(),
      pathId: path.id,
      startTime: Date.now(),
      pagesVisited: 0,
      extractionsCompleted: 0,
      claimsFound: 0,
      status: 'active'
    };
    
    this.activeSessions.set(session.id, session);
    
    return session;
  }
  
  /**
   * Visit a URL and extract data
   */
  async visitUrl(
    sessionId: string,
    url: string,
    options?: {
      extractionTargets?: string[];
      useCache?: boolean;
      timeout?: number;
    }
  ): Promise<PageVisit> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'active') {
      throw new Error('Invalid or inactive session');
    }
    
    const domain = extractDomain(url);
    const startTime = Date.now();
    
    // Check cache first
    if (options?.useCache !== false) {
      const cached = this.cache.getPage(url);
      if (cached) {
        this.telemetry?.recordPageLoad(url, true, 0, session.pathId);
        
        // Re-extract from cached content if needed
        const extractions = this.cache.getExtractions(url) || [];
        
        return {
          url,
          domain,
          timestamp: Date.now(),
          loadTimeMs: 0,
          success: true,
          contentHash: cached.url,
          extractionResults: extractions
        };
      }
    }
    
    // Check robots.txt
    if (this.config.respectRobotsTxt) {
      const isAllowed = await this.checkRobotsTxt(url);
      if (!isAllowed) {
        this.telemetry?.recordBlocked(url, 'robots.txt', session.pathId);
        return {
          url,
          domain,
          timestamp: Date.now(),
          loadTimeMs: 0,
          success: false,
          error: 'Blocked by robots.txt'
        };
      }
    }
    
    // Rate limiting
    await this.acquireRateLimit(domain);
    
    // Human-like delay
    if (this.config.humanBehavior) {
      await humanDelay('page');
    }
    
    let page: Page | null = null;
    
    try {
      // Get or create page
      page = this.activePages.get(sessionId);
      if (!page || page.isClosed()) {
        page = await this.context!.newPage();
        this.activePages.set(sessionId, page);
      }
      
      // Navigate with timeout
      await withTimeout(
        page.goto(url, { 
          timeout: options?.timeout || this.config.defaultTimeout,
          waitUntil: 'domcontentloaded'
        }),
        options?.timeout || this.config.defaultTimeout,
        `Navigation timeout for ${url}`
      );
      
      const loadTimeMs = Date.now() - startTime;
      
      // Wait for page to stabilize
      await page.waitForLoadState('networkidle').catch(() => {});
      
      // Get page content
      const html = await page.content();
      const text = await page.textContent('body') || '';
      
      // Get appropriate adapter and extract
      const adapter = this.adapterRegistry.getAdapter(url);
      const extractions = await adapter.extract(page);
      
      // Update session stats
      session.pagesVisited++;
      session.extractionsCompleted += extractions.length;
      
      // Cache the page and extractions
      this.cache.setPage(url, html, text);
      if (extractions.length > 0) {
        this.cache.setExtractions(url, extractions);
      }
      
      // Update source intelligence
      this.sourceIntel?.updateSourceIntelligence(domain, {
        success: true,
        url,
        extractionYield: extractions.length
      });
      
      // Telemetry
      this.telemetry?.recordPageLoad(url, true, loadTimeMs, session.pathId);
      for (const ext of extractions) {
        this.telemetry?.recordExtraction(
          url, 
          ext.schemaName, 
          Object.keys(ext.data).length,
          session.pathId
        );
      }
      
      return {
        url: page.url(),
        domain,
        timestamp: Date.now(),
        loadTimeMs,
        success: true,
        extractionResults: extractions
      };
      
    } catch (error) {
      const loadTimeMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Update source intelligence with failure
      this.sourceIntel?.updateSourceIntelligence(domain, {
        success: false,
        url,
        extractionYield: 0,
        blockedPaths: [url]
      });
      
      this.telemetry?.recordError(errorMsg, url, true, session.pathId);
      
      return {
        url,
        domain,
        timestamp: Date.now(),
        loadTimeMs,
        success: false,
        error: errorMsg
      };
    }
  }
  
  /**
   * Navigate within a page (click, scroll, etc.)
   */
  async executeAction(
    sessionId: string,
    action: NavigationAction
  ): Promise<{ success: boolean; error?: string }> {
    const page = this.activePages.get(sessionId);
    if (!page || page.isClosed()) {
      return { success: false, error: 'No active page for session' };
    }
    
    try {
      if (this.config.humanBehavior) {
        await humanDelay('action');
      }
      
      switch (action.type) {
        case 'click':
          if (action.selector) {
            const element = await page.$(action.selector);
            if (element) {
              await element.click();
              await page.waitForLoadState('domcontentloaded');
            } else {
              return { success: false, error: `Element not found: ${action.selector}` };
            }
          }
          break;
          
        case 'scroll':
          if (action.selector) {
            await page.evaluate(() => {
              const el = document.querySelector(action.selector!);
              el?.scrollIntoView({ behavior: 'smooth' });
            });
          } else {
            await page.evaluate(() => window.scrollBy(0, 500));
          }
          break;
          
        case 'wait':
          await sleep(action.timeout || 1000);
          break;
          
        case 'back':
          await page.evaluate(() => window.history.back());
          await page.waitForLoadState('domcontentloaded');
          break;
          
        default:
          return { success: false, error: `Unknown action type: ${action.type}` };
      }
      
      return { success: true };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  /**
   * End a browsing session
   */
  async endSession(sessionId: string, reason?: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.endTime = Date.now();
      session.terminationReason = reason;
      
      this.telemetry?.recordPathTerminated(
        session.pathId,
        reason || 'completed',
        session.pagesVisited,
        session.claimsFound
      );
    }
    
    // Close the page
    const page = this.activePages.get(sessionId);
    if (page && !page.isClosed()) {
      await page.close().catch(() => {});
    }
    this.activePages.delete(sessionId);
  }
  
  /**
   * Terminate a session early (low yield, blocked, etc.)
   */
  async terminateSession(sessionId: string, reason: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = 'terminated';
      session.terminationReason = reason;
    }
    await this.endSession(sessionId, reason);
  }
  
  /**
   * Close all sessions and cleanup
   */
  async closeAll(): Promise<void> {
    const sessionIds = Array.from(this.activeSessions.keys());
    await Promise.all(sessionIds.map(id => this.endSession(id, 'shutdown')));
    
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
  }
  
  /**
   * Get rate limiter for a domain
   */
  private getRateLimiter(domain: string): RateLimiter {
    let limiter = this.rateLimiters.get(domain);
    if (!limiter) {
      limiter = new RateLimiter(
        this.config.rateLimit.requestsPerSecond,
        this.config.rateLimit.burstSize
      );
      this.rateLimiters.set(domain, limiter);
    }
    return limiter;
  }
  
  /**
   * Acquire rate limit before request
   */
  private async acquireRateLimit(domain: string): Promise<void> {
    const limiter = this.getRateLimiter(domain);
    await limiter.acquire();
    
    // Additional per-domain delay
    if (this.config.rateLimit.perDomainDelay > 0) {
      await sleep(this.config.rateLimit.perDomainDelay);
    }
  }
  
  /**
   * Check robots.txt for a URL
   */
  private async checkRobotsTxt(url: string): Promise<boolean> {
    const domain = extractDomain(url);
    
    // Check cache
    let disallowed = this.robotsTxtCache.get(domain);
    if (!disallowed) {
      disallowed = await this.fetchRobotsTxt(domain);
      this.robotsTxtCache.set(domain, disallowed);
    }
    
    // Check if URL is disallowed
    const path = new URL(url).pathname;
    for (const pattern of disallowed) {
      if (path.startsWith(pattern)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Fetch and parse robots.txt
   */
  private async fetchRobotsTxt(domain: string): Promise<Set<string>> {
    const disallowed = new Set<string>();
    
    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const response = await fetch(robotsUrl, { 
        signal: AbortSignal.timeout(5000) 
      });
      
      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n');
        let isRelevantAgent = false;
        
        for (const line of lines) {
          const trimmed = line.trim().toLowerCase();
          
          if (trimmed.startsWith('user-agent:')) {
            const agent = trimmed.slice(11).trim();
            isRelevantAgent = agent === '*' || agent.includes('bot');
          } else if (isRelevantAgent && trimmed.startsWith('disallow:')) {
            const path = trimmed.slice(9).trim();
            if (path) {
              disallowed.add(path);
            }
          }
        }
      }
    } catch {
      // If we can't fetch robots.txt, allow all
    }
    
    return disallowed;
  }
  
  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): BrowsingSession | null {
    return this.activeSessions.get(sessionId) || null;
  }
  
  /**
   * Get all active sessions
   */
  getActiveSessions(): BrowsingSession[] {
    return Array.from(this.activeSessions.values())
      .filter(s => s.status === 'active');
  }
  
  /**
   * Check if session is active
   */
  isSessionActive(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    return session?.status === 'active';
  }
}

// Export factory
export function createNavigationEngine(
  config?: Partial<NavigationEngine['config']>
): NavigationEngine {
  return new NavigationEngine(config);
}
