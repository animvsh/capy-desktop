// ============================================================================
// CAPY WEB - ADAPTER REGISTRY
// Manages and selects appropriate adapters for URLs
// ============================================================================

import { DomainAdapter, AdapterType } from '../types';
import { GenericAdapter } from './base-adapter';
import {
  CompanySiteAdapter,
  PricingAdapter,
  GitHubAdapter,
  DocsAdapter,
  SecurityTrustAdapter,
  NewsAdapter,
  CrunchbaseAdapter
} from './specialized-adapters';

// ============================================================================
// ADAPTER REGISTRY
// ============================================================================

export class AdapterRegistry {
  private adapters: DomainAdapter[] = [];
  private genericAdapter: GenericAdapter;
  
  constructor() {
    this.genericAdapter = new GenericAdapter();
    this.registerDefaultAdapters();
  }
  
  /**
   * Register default adapters
   */
  private registerDefaultAdapters(): void {
    // Order matters - more specific adapters first
    this.register(new CrunchbaseAdapter());
    this.register(new GitHubAdapter());
    this.register(new PricingAdapter());
    this.register(new DocsAdapter());
    this.register(new SecurityTrustAdapter());
    this.register(new NewsAdapter());
    this.register(new CompanySiteAdapter());
  }
  
  /**
   * Register a custom adapter
   */
  register(adapter: DomainAdapter): void {
    // Insert at beginning for priority
    this.adapters.unshift(adapter);
  }
  
  /**
   * Get the best adapter for a URL
   */
  getAdapter(url: string): DomainAdapter {
    for (const adapter of this.adapters) {
      if (adapter.matches(url)) {
        return adapter;
      }
    }
    return this.genericAdapter;
  }
  
  /**
   * Get adapter by type
   */
  getAdapterByType(type: AdapterType): DomainAdapter | null {
    return this.adapters.find(a => a.type === type) || null;
  }
  
  /**
   * Get all registered adapters
   */
  getAllAdapters(): DomainAdapter[] {
    return [...this.adapters, this.genericAdapter];
  }
  
  /**
   * Check if a specialized adapter exists for URL
   */
  hasSpecializedAdapter(url: string): boolean {
    return this.adapters.some(a => a.matches(url));
  }
  
  /**
   * Get adapter info for debugging
   */
  getAdapterInfo(url: string): {
    name: string;
    type: AdapterType;
    isSpecialized: boolean;
  } {
    const adapter = this.getAdapter(url);
    return {
      name: adapter.name,
      type: adapter.type,
      isSpecialized: adapter.type !== AdapterType.GENERIC
    };
  }
}

// Singleton instance
let registryInstance: AdapterRegistry | null = null;

export function getAdapterRegistry(): AdapterRegistry {
  if (!registryInstance) {
    registryInstance = new AdapterRegistry();
  }
  return registryInstance;
}

export function createAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry();
}
