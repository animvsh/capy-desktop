// ============================================================================
// CAPY WEB - CACHE MANAGER
// Memory, page cache, domain map - huge power boost
// ============================================================================

import {
  CacheEntry,
  PageCache,
  DomainMapEntry,
  ExtractionResult
} from '../types';
import { normalizeUrl, hashString } from '../utils/helpers';

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const DEFAULT_TTL = 3600 * 1000;  // 1 hour
const PAGE_CACHE_TTL = 1800 * 1000;  // 30 minutes
const DOMAIN_MAP_TTL = 86400 * 1000;  // 24 hours
const MAX_CACHE_SIZE = 1000;  // Max entries per cache
const MAX_PAGE_CACHE_SIZE = 100;  // Pages are larger

// ============================================================================
// GENERIC CACHE
// ============================================================================

class Cache<T> {
  private entries: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private defaultTTL: number;
  private version: number = 1;
  
  constructor(maxSize = MAX_CACHE_SIZE, defaultTTL = DEFAULT_TTL) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }
  
  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    
    // Update hit count
    entry.hits++;
    return entry.value;
  }
  
  set(key: string, value: T, ttl?: number): void {
    // Evict if at capacity
    if (this.entries.size >= this.maxSize) {
      this.evictOne();
    }
    
    const now = Date.now();
    this.entries.set(key, {
      key,
      value,
      createdAt: now,
      expiresAt: now + (ttl ?? this.defaultTTL),
      version: this.version,
      hits: 0
    });
  }
  
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }
  
  delete(key: string): boolean {
    return this.entries.delete(key);
  }
  
  clear(): void {
    this.entries.clear();
  }
  
  /**
   * Evict one entry (LRU by hits)
   */
  private evictOne(): void {
    let minHits = Infinity;
    let minKey: string | null = null;
    
    for (const [key, entry] of this.entries) {
      if (entry.hits < minHits) {
        minHits = entry.hits;
        minKey = key;
      }
    }
    
    if (minKey) {
      this.entries.delete(minKey);
    }
  }
  
  /**
   * Clean expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) {
        this.entries.delete(key);
        removed++;
      }
    }
    
    return removed;
  }
  
  /**
   * Get cache stats
   */
  stats(): { size: number; hitRate: number; avgAge: number } {
    const now = Date.now();
    let totalHits = 0;
    let totalAge = 0;
    
    for (const entry of this.entries.values()) {
      totalHits += entry.hits;
      totalAge += now - entry.createdAt;
    }
    
    return {
      size: this.entries.size,
      hitRate: this.entries.size > 0 ? totalHits / this.entries.size : 0,
      avgAge: this.entries.size > 0 ? totalAge / this.entries.size : 0
    };
  }
  
  /**
   * Export for persistence
   */
  export(): Array<CacheEntry<T>> {
    const now = Date.now();
    return Array.from(this.entries.values())
      .filter(e => e.expiresAt > now);
  }
  
  /**
   * Import from persistence
   */
  import(entries: Array<CacheEntry<T>>): void {
    const now = Date.now();
    for (const entry of entries) {
      if (entry.expiresAt > now) {
        this.entries.set(entry.key, entry);
      }
    }
  }
}

// ============================================================================
// CACHE MANAGER
// ============================================================================

export class CacheManager {
  private pageCache: Cache<PageCache>;
  private extractionCache: Cache<ExtractionResult[]>;
  private domainMap: Cache<DomainMapEntry>;
  private queryCache: Cache<string[]>;  // Query -> relevant URLs
  
  private hits = 0;
  private misses = 0;
  
  constructor() {
    this.pageCache = new Cache(MAX_PAGE_CACHE_SIZE, PAGE_CACHE_TTL);
    this.extractionCache = new Cache(MAX_CACHE_SIZE, DEFAULT_TTL);
    this.domainMap = new Cache(MAX_CACHE_SIZE, DOMAIN_MAP_TTL);
    this.queryCache = new Cache(MAX_CACHE_SIZE, DEFAULT_TTL);
  }
  
  // ==========================================================================
  // PAGE CACHE
  // ==========================================================================
  
  /**
   * Get cached page
   */
  getPage(url: string): PageCache | null {
    const key = normalizeUrl(url);
    const result = this.pageCache.get(key);
    
    if (result) {
      this.hits++;
    } else {
      this.misses++;
    }
    
    return result;
  }
  
  /**
   * Cache a page
   */
  setPage(url: string, html: string, text: string, extractedData?: Record<string, unknown>): void {
    const key = normalizeUrl(url);
    const pageCache: PageCache = {
      url,
      html,
      text,
      extractedData,
      timestamp: Date.now(),
      ttl: PAGE_CACHE_TTL,
      version: 1
    };
    this.pageCache.set(key, pageCache);
  }
  
  /**
   * Check if page is cached
   */
  hasPage(url: string): boolean {
    return this.pageCache.has(normalizeUrl(url));
  }
  
  // ==========================================================================
  // EXTRACTION CACHE
  // ==========================================================================
  
  /**
   * Get cached extractions for a URL
   */
  getExtractions(url: string): ExtractionResult[] | null {
    const key = normalizeUrl(url);
    const result = this.extractionCache.get(key);
    
    if (result) {
      this.hits++;
    } else {
      this.misses++;
    }
    
    return result;
  }
  
  /**
   * Cache extractions
   */
  setExtractions(url: string, extractions: ExtractionResult[]): void {
    const key = normalizeUrl(url);
    this.extractionCache.set(key, extractions);
  }
  
  // ==========================================================================
  // DOMAIN MAP
  // ==========================================================================
  
  /**
   * Get domain map entry
   */
  getDomainMap(domain: string): DomainMapEntry | null {
    const key = domain.toLowerCase().replace(/^www\./, '');
    return this.domainMap.get(key);
  }
  
  /**
   * Update domain map
   */
  updateDomainMap(domain: string, highSignalUrls: string[], navigationPaths?: string[]): void {
    const key = domain.toLowerCase().replace(/^www\./, '');
    const existing = this.domainMap.get(key);
    
    const entry: DomainMapEntry = {
      domain: key,
      highSignalUrls: existing 
        ? [...new Set([...existing.highSignalUrls, ...highSignalUrls])]
        : highSignalUrls,
      navigationPaths: navigationPaths ?? existing?.navigationPaths ?? [],
      lastUpdated: Date.now()
    };
    
    this.domainMap.set(key, entry, DOMAIN_MAP_TTL);
  }
  
  /**
   * Get high signal URLs for a domain
   */
  getHighSignalUrls(domain: string): string[] {
    const entry = this.getDomainMap(domain);
    return entry?.highSignalUrls ?? [];
  }
  
  // ==========================================================================
  // QUERY CACHE
  // ==========================================================================
  
  /**
   * Get cached URLs for a query
   */
  getQueryResults(query: string): string[] | null {
    const key = hashString(query.toLowerCase());
    const result = this.queryCache.get(key);
    
    if (result) {
      this.hits++;
    } else {
      this.misses++;
    }
    
    return result;
  }
  
  /**
   * Cache query results
   */
  setQueryResults(query: string, urls: string[]): void {
    const key = hashString(query.toLowerCase());
    this.queryCache.set(key, urls);
  }
  
  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================
  
  /**
   * Get cache statistics
   */
  getStats(): {
    hitRate: number;
    hits: number;
    misses: number;
    pageCache: { size: number; hitRate: number };
    extractionCache: { size: number; hitRate: number };
    domainMap: { size: number };
    queryCache: { size: number };
  } {
    return {
      hitRate: this.hits + this.misses > 0 
        ? this.hits / (this.hits + this.misses) 
        : 0,
      hits: this.hits,
      misses: this.misses,
      pageCache: this.pageCache.stats(),
      extractionCache: this.extractionCache.stats(),
      domainMap: { size: this.domainMap.stats().size },
      queryCache: { size: this.queryCache.stats().size }
    };
  }
  
  /**
   * Cleanup expired entries
   */
  cleanup(): { pagesRemoved: number; extractionsRemoved: number; domainsRemoved: number } {
    return {
      pagesRemoved: this.pageCache.cleanup(),
      extractionsRemoved: this.extractionCache.cleanup(),
      domainsRemoved: this.domainMap.cleanup()
    };
  }
  
  /**
   * Clear all caches
   */
  clear(): void {
    this.pageCache.clear();
    this.extractionCache.clear();
    this.domainMap.clear();
    this.queryCache.clear();
    this.hits = 0;
    this.misses = 0;
  }
  
  /**
   * Reset hit/miss counters
   */
  resetCounters(): void {
    this.hits = 0;
    this.misses = 0;
  }
  
  /**
   * Export state for persistence
   */
  exportState(): {
    pageCache: Array<CacheEntry<PageCache>>;
    extractionCache: Array<CacheEntry<ExtractionResult[]>>;
    domainMap: Array<CacheEntry<DomainMapEntry>>;
    queryCache: Array<CacheEntry<string[]>>;
  } {
    return {
      pageCache: this.pageCache.export(),
      extractionCache: this.extractionCache.export(),
      domainMap: this.domainMap.export(),
      queryCache: this.queryCache.export()
    };
  }
  
  /**
   * Import state from persistence
   */
  importState(state: {
    pageCache?: Array<CacheEntry<PageCache>>;
    extractionCache?: Array<CacheEntry<ExtractionResult[]>>;
    domainMap?: Array<CacheEntry<DomainMapEntry>>;
    queryCache?: Array<CacheEntry<string[]>>;
  }): void {
    if (state.pageCache) {
      this.pageCache.import(state.pageCache);
    }
    if (state.extractionCache) {
      this.extractionCache.import(state.extractionCache);
    }
    if (state.domainMap) {
      this.domainMap.import(state.domainMap);
    }
    if (state.queryCache) {
      this.queryCache.import(state.queryCache);
    }
  }
  
  /**
   * Get memory estimate
   */
  estimateMemory(): { bytes: number; formatted: string } {
    // Rough estimate based on cache stats
    const pageStats = this.pageCache.stats();
    const extractionStats = this.extractionCache.stats();
    const domainStats = this.domainMap.stats();
    const queryStats = this.queryCache.stats();
    
    // Rough estimates per entry type
    const pageSize = 50000;  // 50KB average per page
    const extractionSize = 2000;  // 2KB per extraction set
    const domainSize = 500;  // 500B per domain entry
    const querySize = 200;  // 200B per query result
    
    const totalBytes = 
      pageStats.size * pageSize +
      extractionStats.size * extractionSize +
      domainStats.size * domainSize +
      queryStats.size * querySize;
    
    const formatted = totalBytes < 1024 * 1024
      ? `${(totalBytes / 1024).toFixed(1)} KB`
      : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    
    return { bytes: totalBytes, formatted };
  }
}

// Export singleton
let cacheManagerInstance: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager();
  }
  return cacheManagerInstance;
}

export function createCacheManager(): CacheManager {
  return new CacheManager();
}
