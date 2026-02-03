// ============================================================================
// CAPY WEB - MAIN EXPORT
// Autonomous Internet Intelligence Engine
// ============================================================================

// Types
export * from './types';

// Core engines
export { PlannerBrain, createPlannerBrain } from './core/planner-brain';
export { SourceIntelligenceEngine, createSourceIntelligence } from './core/source-intelligence';
export { ConfidenceEngine, createConfidenceEngine } from './core/confidence-engine';
export { ClaimGraphEngine, createClaimGraph } from './core/claim-graph';

// Cache
export { CacheManager, getCacheManager, createCacheManager } from './cache/cache-manager';

// Telemetry
export { TelemetryEngine, createTelemetry } from './telemetry/telemetry-engine';

// Navigation
export { NavigationEngine, createNavigationEngine } from './engine/navigation-engine';

// Adapters
export { BaseAdapter, GenericAdapter } from './adapters/base-adapter';
export {
  CompanySiteAdapter,
  PricingAdapter,
  GitHubAdapter,
  DocsAdapter,
  SecurityTrustAdapter,
  NewsAdapter,
  CrunchbaseAdapter
} from './adapters/specialized-adapters';
export { AdapterRegistry, getAdapterRegistry, createAdapterRegistry } from './adapters/adapter-registry';

// Main engine
export { CapyWebEngine, createCapyWeb, research } from './engine/capy-web-engine';

// Utilities
export * from './utils/helpers';

// ============================================================================
// QUICK START
// ============================================================================

/**
 * Quick start example:
 * 
 * ```typescript
 * import { chromium } from 'playwright';
 * import { research, OperatorMode } from './capy-web';
 * 
 * async function main() {
 *   const browser = await chromium.launch();
 *   const context = await browser.newContext();
 *   
 *   const result = await research(
 *     "What is the pricing for Notion?",
 *     context,
 *     {
 *       mode: OperatorMode.STANDARD,
 *       onProgress: (progress) => {
 *         console.log(`Progress: ${progress.confidence * 100}%`);
 *       }
 *     }
 *   );
 *   
 *   console.log('Answers:', result.answers);
 *   console.log('Confidence:', result.confidence);
 *   
 *   await browser.close();
 * }
 * ```
 */
