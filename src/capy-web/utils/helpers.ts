// ============================================================================
// CAPY WEB - UTILITY HELPERS
// ============================================================================

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate unique ID
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Generate short ID for display
 */
export function shortId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Hash a string for content comparison
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Normalize URL for comparison
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash, lowercase, remove www
    let normalized = parsed.origin + parsed.pathname;
    normalized = normalized.replace(/\/$/, '');
    normalized = normalized.toLowerCase();
    normalized = normalized.replace('://www.', '://');
    return normalized;
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Sleep with optional jitter for human-like behavior
 */
export async function sleep(ms: number, jitter = 0): Promise<void> {
  const delay = jitter > 0 
    ? ms + Math.random() * jitter - jitter / 2 
    : ms;
  return new Promise(resolve => setTimeout(resolve, Math.max(0, delay)));
}

/**
 * Human-like delay (50-150ms for actions, 500-1500ms for page loads)
 */
export async function humanDelay(type: 'action' | 'page' | 'read'): Promise<void> {
  const delays = {
    action: { base: 100, jitter: 100 },
    page: { base: 1000, jitter: 1000 },
    read: { base: 2000, jitter: 2000 }
  };
  const { base, jitter } = delays[type];
  await sleep(base, jitter);
}

/**
 * Retry with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts - 1) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Timeout wrapper
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/**
 * Clean and normalize text for extraction
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Extract text content from HTML (basic)
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse price string to number
 */
export function parsePrice(priceStr: string): number | null {
  const cleaned = priceStr.replace(/[^0-9.,]/g, '');
  const normalized = cleaned.replace(/,/g, '');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse date string to timestamp
 */
export function parseDate(dateStr: string): number | null {
  const parsed = Date.parse(dateStr);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Check if URL is same domain
 */
export function isSameDomain(url1: string, url2: string): boolean {
  return extractDomain(url1) === extractDomain(url2);
}

/**
 * Check if URL matches pattern
 */
export function matchesPattern(url: string, pattern: string | RegExp): boolean {
  if (typeof pattern === 'string') {
    // Convert glob-like pattern to regex
    const regexStr = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(regexStr, 'i').test(url);
  }
  return pattern.test(url);
}

/**
 * Chunk array for parallel processing
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Rate limiter
 */
export class RateLimiter {
  private timestamps: number[] = [];
  
  constructor(
    private requestsPerSecond: number,
    private burstSize: number = requestsPerSecond
  ) {}
  
  async acquire(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 1000;
    
    // Remove old timestamps
    this.timestamps = this.timestamps.filter(t => t > windowStart);
    
    if (this.timestamps.length >= this.burstSize) {
      // Wait until oldest request expires
      const waitTime = this.timestamps[0] - windowStart;
      await sleep(waitTime);
      this.timestamps.shift();
    }
    
    this.timestamps.push(now);
  }
}

/**
 * Priority queue for execution paths
 */
export class PriorityQueue<T extends { priority: number }> {
  private items: T[] = [];
  
  enqueue(item: T): void {
    let inserted = false;
    for (let i = 0; i < this.items.length; i++) {
      if (item.priority > this.items[i].priority) {
        this.items.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.items.push(item);
    }
  }
  
  dequeue(): T | undefined {
    return this.items.shift();
  }
  
  peek(): T | undefined {
    return this.items[0];
  }
  
  isEmpty(): boolean {
    return this.items.length === 0;
  }
  
  size(): number {
    return this.items.length;
  }
  
  toArray(): T[] {
    return [...this.items];
  }
}

/**
 * Event emitter for telemetry
 */
export class EventEmitter<T extends Record<string, unknown[]>> {
  private listeners: Map<keyof T, Set<(...args: unknown[]) => void>> = new Map();
  
  on<K extends keyof T>(event: K, callback: (...args: T[K]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as (...args: unknown[]) => void);
  }
  
  off<K extends keyof T>(event: K, callback: (...args: T[K]) => void): void {
    this.listeners.get(event)?.delete(callback as (...args: unknown[]) => void);
  }
  
  emit<K extends keyof T>(event: K, ...args: T[K]): void {
    this.listeners.get(event)?.forEach(cb => {
      try {
        cb(...args);
      } catch (e) {
        console.error(`Event handler error for ${String(event)}:`, e);
      }
    });
  }
  
  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Deduplicate array by key
 */
export function dedupeBy<T>(array: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        (result[key] as Record<string, unknown>) || {},
        source[key] as Record<string, unknown>
      ) as T[typeof key];
    } else if (source[key] !== undefined) {
      result[key] = source[key] as T[typeof key];
    }
  }
  return result;
}
