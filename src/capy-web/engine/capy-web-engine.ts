// ============================================================================
// CAPY WEB - MAIN ENGINE
// Autonomous Internet Intelligence Engine
// ============================================================================

import {
  CapyWebConfig,
  CapyWebSession,
  CapyWebResult,
  ResearchObjective,
  ResearchPlan,
  OperatorMode,
  ExecutionStatus,
  ExecutionPath,
  StopCondition,
  Answer,
  ExecutionStats,
  ClaimConfidence,
  SourceTier,
  TelemetryEvent,
  ProgressState
} from '../types';
import { generateId, PriorityQueue, sleep } from '../utils/helpers';
import { PlannerBrain, createPlannerBrain } from '../core/planner-brain';
import { SourceIntelligenceEngine, createSourceIntelligence } from '../core/source-intelligence';
import { ConfidenceEngine, createConfidenceEngine } from '../core/confidence-engine';
import { ClaimGraphEngine, createClaimGraph } from '../core/claim-graph';
import { CacheManager, createCacheManager } from '../cache/cache-manager';
import { TelemetryEngine, createTelemetry } from '../telemetry/telemetry-engine';
import { NavigationEngine, createNavigationEngine } from './navigation-engine';
import { getAdapterRegistry } from '../adapters/adapter-registry';

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: CapyWebConfig = {
  mode: OperatorMode.STANDARD,
  defaultBudgets: {
    maxTimeMs: 120000,
    maxPages: 30,
    maxConcurrency: 3,
    maxCostUnits: 50,
    marginalGainFloor: 0.02
  },
  cacheEnabled: true,
  cacheTTL: 3600000,
  parallelism: 3,
  humanBehavior: true,
  respectRobotsTxt: true,
  rateLimit: {
    requestsPerSecond: 2,
    burstSize: 5,
    perDomainDelay: 1000
  },
  telemetryEnabled: true
};

// ============================================================================
// CAPY WEB ENGINE
// ============================================================================

export class CapyWebEngine {
  private config: CapyWebConfig;
  private session: CapyWebSession | null = null;
  
  // Core subsystems
  private planner: PlannerBrain;
  private sourceIntel: SourceIntelligenceEngine;
  private confidence: ConfidenceEngine | null = null;
  private claimGraph: ClaimGraphEngine;
  private cache: CacheManager;
  private telemetry: TelemetryEngine | null = null;
  private navigation: NavigationEngine;
  
  // Execution state
  private pathQueue: PriorityQueue<ExecutionPath & { priority: number }>;
  private activePaths: Map<string, { pathId: string; sessionId: string }> = new Map();
  private visitedUrls: Set<string> = new Set();
  private isExecuting: boolean = false;
  private stopRequested: boolean = false;
  
  // Browser context (set externally)
  private browserContext: unknown = null;
  
  // Event callbacks
  private onProgressCallback?: (progress: ProgressState) => void;
  private onEventCallback?: (event: TelemetryEvent) => void;
  private onCompleteCallback?: (result: CapyWebResult) => void;
  
  constructor(config?: Partial<CapyWebConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Initialize subsystems
    this.planner = createPlannerBrain(this.config.mode);
    this.sourceIntel = createSourceIntelligence();
    this.claimGraph = createClaimGraph();
    this.cache = this.config.cacheEnabled ? createCacheManager() : createCacheManager();
    this.navigation = createNavigationEngine({
      humanBehavior: this.config.humanBehavior,
      respectRobotsTxt: this.config.respectRobotsTxt,
      rateLimit: this.config.rateLimit
    });
    this.pathQueue = new PriorityQueue();
    
    // Wire up navigation with source intel
    this.navigation.setSourceIntelligence(this.sourceIntel);
  }
  
  /**
   * Set browser context (from Playwright)
   */
  setBrowserContext(context: unknown): void {
    this.browserContext = context;
    this.navigation.setBrowserContext(context as any);
  }
  
  /**
   * Subscribe to progress updates
   */
  onProgress(callback: (progress: ProgressState) => void): void {
    this.onProgressCallback = callback;
  }
  
  /**
   * Subscribe to telemetry events
   */
  onEvent(callback: (event: TelemetryEvent) => void): void {
    this.onEventCallback = callback;
  }
  
  /**
   * Subscribe to completion
   */
  onComplete(callback: (result: CapyWebResult) => void): void {
    this.onCompleteCallback = callback;
  }
  
  /**
   * Execute a research objective
   */
  async research(objective: ResearchObjective): Promise<CapyWebResult> {
    if (this.isExecuting) {
      throw new Error('Research already in progress');
    }
    
    if (!this.browserContext) {
      throw new Error('Browser context not set. Call setBrowserContext() first.');
    }
    
    this.isExecuting = true;
    this.stopRequested = false;
    this.visitedUrls.clear();
    this.claimGraph.clear();
    
    const sessionId = generateId();
    
    try {
      // Initialize telemetry
      this.telemetry = createTelemetry(sessionId);
      this.navigation.setTelemetry(this.telemetry);
      
      // Set up telemetry callbacks
      if (this.onProgressCallback) {
        this.telemetry.onProgress(this.onProgressCallback);
      }
      if (this.onEventCallback) {
        this.telemetry.onEvent(this.onEventCallback);
      }
      
      // Phase 1: Planning
      this.telemetry.start('Generating research plan...');
      this.telemetry.updateStatus(ExecutionStatus.PLANNING);
      
      const plan = await this.planner.generatePlan(objective);
      
      if (!plan.isValid) {
        throw new Error(`Invalid plan: ${plan.validationErrors?.join(', ')}`);
      }
      
      // Initialize confidence engine with budgets
      this.confidence = createConfidenceEngine(plan.budgets);
      this.confidence.initialize(plan.primaryQuestions);
      
      // Initialize session
      this.session = {
        id: sessionId,
        config: this.config,
        objective,
        plan,
        state: this.telemetry.getProgress(),
        claimGraph: this.claimGraph.getGraph(),
        confidence: this.confidence.getState(),
        startTime: Date.now()
      };
      
      // Queue execution paths
      for (const path of plan.executionPaths) {
        this.pathQueue.enqueue({ ...path, priority: path.priority });
      }
      
      // Phase 2: Execution
      this.telemetry.updateStatus(ExecutionStatus.EXECUTING);
      this.telemetry.recordStrategyShift('Plan ready', 'planning', 'executing', {
        totalPaths: plan.executionPaths.length,
        targetDomains: plan.targetDomains.length
      });
      
      await this.executeResearch(plan);
      
      // Phase 3: Build result
      const result = this.buildResult(sessionId, objective, plan);
      
      this.telemetry.updateStatus(ExecutionStatus.COMPLETED);
      this.onCompleteCallback?.(result);
      
      return result;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.telemetry?.recordError(errorMsg, undefined, false);
      this.telemetry?.updateStatus(ExecutionStatus.FAILED);
      
      throw error;
      
    } finally {
      this.isExecuting = false;
      await this.navigation.closeAll();
    }
  }
  
  /**
   * Execute the research plan
   */
  private async executeResearch(plan: ResearchPlan): Promise<void> {
    const maxConcurrent = Math.min(
      plan.budgets.maxConcurrency,
      this.config.parallelism
    );
    
    const activePromises: Map<string, Promise<void>> = new Map();
    
    while (!this.pathQueue.isEmpty() || activePromises.size > 0) {
      // Check stop conditions
      if (this.stopRequested || this.telemetry?.hasPendingStop()) {
        await this.handleStop('User requested stop');
        break;
      }
      
      const stopCondition = this.confidence?.checkStopCondition(plan.confidenceThreshold);
      if (stopCondition) {
        await this.handleStop(stopCondition.details);
        break;
      }
      
      // Launch new paths if under limit
      while (activePromises.size < maxConcurrent && !this.pathQueue.isEmpty()) {
        const path = this.pathQueue.dequeue();
        if (path) {
          const promise = this.executePath(path, plan);
          activePromises.set(path.id, promise);
          
          promise.finally(() => {
            activePromises.delete(path.id);
          });
        }
      }
      
      // Wait for at least one path to complete
      if (activePromises.size > 0) {
        await Promise.race(Array.from(activePromises.values()));
      }
      
      // Update telemetry
      this.telemetry?.updateActivePaths(activePromises.size);
      this.telemetry?.updateConfidence(
        this.confidence?.getOverallConfidence() || 0,
        this.confidence?.estimateTimeToThreshold(plan.confidenceThreshold) || undefined
      );
    }
    
    // Wait for remaining paths
    if (activePromises.size > 0) {
      await Promise.all(Array.from(activePromises.values()));
    }
  }
  
  /**
   * Execute a single path
   */
  private async executePath(path: ExecutionPath, plan: ResearchPlan): Promise<void> {
    const browsingSession = await this.navigation.startSession(path);
    this.activePaths.set(path.id, { pathId: path.id, sessionId: browsingSession.id });
    
    try {
      path.status = 'active';
      
      // Get URLs to visit for this path
      const urls = this.getUrlsForPath(path, plan);
      
      for (const url of urls) {
        // Check if should continue
        if (this.stopRequested) break;
        
        // Skip if already visited
        if (this.visitedUrls.has(url)) continue;
        this.visitedUrls.add(url);
        
        // Check source intelligence
        const domain = new URL(url).hostname;
        if (this.sourceIntel.shouldAvoid(domain)) {
          this.telemetry?.recordBlocked(url, 'Low-quality source', path.id);
          continue;
        }
        
        // Visit and extract
        const visit = await this.navigation.visitUrl(browsingSession.id, url, {
          useCache: this.config.cacheEnabled,
          extractionTargets: path.extractionTargets
        });
        
        if (visit.success && visit.extractionResults) {
          // Process extractions into claims
          for (const extraction of visit.extractionResults) {
            const tier = this.sourceIntel.classifyDomain(domain);
            
            // Find matching question
            const matchingQuestion = plan.primaryQuestions.find(q => 
              path.extractionTargets.some(t => 
                q.question.toLowerCase().includes(t.toLowerCase())
              )
            );
            
            const claim = this.claimGraph.createClaim(
              extraction,
              url,
              tier,
              matchingQuestion?.id,
              extraction.schemaName
            );
            
            browsingSession.claimsFound++;
            
            this.telemetry?.recordClaimFound(
              claim.id,
              claim.category,
              claim.confidenceScore,
              url,
              path.id
            );
          }
          
          // Update confidence
          const allClaims = this.claimGraph.getAllClaims();
          this.confidence?.update(allClaims, `visited:${url}`);
        }
        
        // Check marginal gain - terminate path if too low
        const summary = this.confidence?.getSummary();
        if (summary && summary.avgMarginalGain < plan.budgets.marginalGainFloor) {
          this.telemetry?.recordStrategyShift(
            'Low marginal gain',
            'exploring',
            'terminating_path',
            { pathId: path.id, avgGain: summary.avgMarginalGain }
          );
          break;
        }
      }
      
      path.status = 'completed';
      
    } catch (error) {
      path.status = 'terminated';
      this.telemetry?.recordError(
        error instanceof Error ? error.message : String(error),
        undefined,
        true,
        path.id
      );
      
    } finally {
      await this.navigation.endSession(browsingSession.id, path.status);
      this.activePaths.delete(path.id);
    }
  }
  
  /**
   * Get URLs to visit for a path
   */
  private getUrlsForPath(path: ExecutionPath, plan: ResearchPlan): string[] {
    const urls: string[] = [];
    
    for (const domain of path.domainScope) {
      // Get from plan's domain expectations
      const expectation = plan.domainExpectations.find(d => d.domain === domain);
      if (expectation) {
        urls.push(...expectation.expectedPages);
      }
      
      // Get from cache's high-signal URLs
      const cachedUrls = this.cache.getHighSignalUrls(domain);
      urls.push(...cachedUrls);
      
      // Fallback to domain root
      if (urls.length === 0) {
        urls.push(`https://${domain}/`);
        urls.push(`https://www.${domain}/`);
      }
    }
    
    // Deduplicate
    return [...new Set(urls)];
  }
  
  /**
   * Handle stop request
   */
  private async handleStop(reason: string): Promise<void> {
    this.telemetry?.stop(reason);
    
    // Close all active sessions
    for (const [pathId, { sessionId }] of this.activePaths) {
      await this.navigation.terminateSession(sessionId, reason);
    }
    this.activePaths.clear();
  }
  
  /**
   * Build final result
   */
  private buildResult(
    sessionId: string,
    objective: ResearchObjective,
    plan: ResearchPlan
  ): CapyWebResult {
    const claims = this.claimGraph.getAllClaims();
    const stats = this.claimGraph.getStats();
    const confidenceSummary = this.confidence?.getSummary();
    const cacheStats = this.cache.getStats();
    
    // Build answers from claims
    const answers: Answer[] = [];
    for (const question of plan.primaryQuestions) {
      const bestClaim = this.claimGraph.getBestAnswerForQuestion(question.id);
      
      answers.push({
        questionId: question.id,
        question: question.question,
        answer: bestClaim?.normalizedValue ?? null,
        confidence: bestClaim?.confidence ?? ClaimConfidence.UNCERTAIN,
        confidenceScore: bestClaim?.confidenceScore ?? 0,
        sources: bestClaim?.sources ?? [],
        reasoning: bestClaim 
          ? `Based on ${bestClaim.sources.length} source(s) with ${bestClaim.corroborationCount} corroboration(s)`
          : 'No data found'
      });
    }
    
    const executionStats: ExecutionStats = {
      totalTimeMs: Date.now() - (this.session?.startTime || 0),
      pagesVisited: confidenceSummary?.pagesVisited || 0,
      claimsFound: stats.totalClaims,
      claimsVerified: stats.verified + stats.high,
      contradictionsFound: stats.contradictionPairs,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      pathsExecuted: plan.executionPaths.filter(p => p.status === 'completed').length,
      pathsTerminatedEarly: plan.executionPaths.filter(p => p.status === 'terminated').length,
      avgConfidencePerPage: confidenceSummary 
        ? (confidenceSummary.overall / Math.max(confidenceSummary.pagesVisited, 1))
        : 0
    };
    
    return {
      sessionId,
      objective: objective.query,
      success: answers.some(a => a.confidenceScore > 0.5),
      answers,
      claims,
      confidence: this.confidence?.getOverallConfidence() || 0,
      stats: executionStats,
      visitedUrls: Array.from(this.visitedUrls),
      telemetry: this.telemetry?.getEvents() || [],
      stopCondition: {
        reason: this.stopRequested ? 'user_stop' : 'confidence_reached',
        details: 'Research completed',
        finalConfidence: this.confidence?.getOverallConfidence() || 0,
        timestamp: Date.now()
      }
    };
  }
  
  /**
   * Pause execution
   */
  pause(): void {
    this.telemetry?.pause();
  }
  
  /**
   * Resume execution
   */
  resume(): void {
    this.telemetry?.resume();
  }
  
  /**
   * Stop execution immediately
   */
  stop(reason?: string): void {
    this.stopRequested = true;
    this.telemetry?.stop(reason || 'User requested stop');
  }
  
  /**
   * Get current progress
   */
  getProgress(): ProgressState | null {
    return this.telemetry?.getProgress() || null;
  }
  
  /**
   * Get current session
   */
  getSession(): CapyWebSession | null {
    return this.session;
  }
  
  /**
   * Check if research is in progress
   */
  isResearching(): boolean {
    return this.isExecuting;
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): ReturnType<CacheManager['getStats']> {
    return this.cache.getStats();
  }
  
  /**
   * Export source intelligence state
   */
  exportSourceIntelligence(): ReturnType<SourceIntelligenceEngine['exportState']> {
    return this.sourceIntel.exportState();
  }
  
  /**
   * Import source intelligence state
   */
  importSourceIntelligence(state: Parameters<SourceIntelligenceEngine['importState']>[0]): void {
    this.sourceIntel.importState(state);
  }
  
  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createCapyWeb(config?: Partial<CapyWebConfig>): CapyWebEngine {
  return new CapyWebEngine(config);
}

// ============================================================================
// CONVENIENCE FUNCTION FOR ONE-SHOT RESEARCH
// ============================================================================

export async function research(
  query: string,
  browserContext: unknown,
  options?: {
    mode?: OperatorMode;
    confidenceThreshold?: number;
    maxTimeMs?: number;
    maxPages?: number;
    onProgress?: (progress: ProgressState) => void;
  }
): Promise<CapyWebResult> {
  const engine = createCapyWeb({
    mode: options?.mode || OperatorMode.STANDARD,
    defaultBudgets: {
      maxTimeMs: options?.maxTimeMs || 120000,
      maxPages: options?.maxPages || 30,
      maxConcurrency: 3,
      maxCostUnits: 50,
      marginalGainFloor: 0.02
    }
  });
  
  engine.setBrowserContext(browserContext);
  
  if (options?.onProgress) {
    engine.onProgress(options.onProgress);
  }
  
  return engine.research({
    query,
    confidenceRequirement: options?.confidenceThreshold || 0.8
  });
}
