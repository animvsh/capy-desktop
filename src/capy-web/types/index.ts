// ============================================================================
// CAPY WEB - TYPE DEFINITIONS
// Autonomous Internet Intelligence Engine
// ============================================================================

// ============================================================================
// CORE ENUMS
// ============================================================================

export enum OperatorMode {
  LIGHTNING = 'lightning',      // Fast, cache-heavy, shallow
  STANDARD = 'standard',        // Balanced, verified
  DEEP_RESEARCH = 'deep',       // Multi-path, contradiction aware
  COMPLIANCE = 'compliance',    // Authoritative sources only
  SIMULATION = 'simulation'     // No execution, plan only
}

export enum SourceTier {
  TIER_1 = 1,  // Official domains, docs, repos, filings
  TIER_2 = 2,  // First-party blogs, changelogs
  TIER_3 = 3,  // Reputable analysis/news
  TIER_4 = 4,  // Reviews/forums (corroboration only)
  TIER_5 = 5   // SEO/junk (actively penalized)
}

export enum ClaimConfidence {
  VERIFIED = 'verified',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  UNCERTAIN = 'uncertain',
  CONTRADICTED = 'contradicted'
}

export enum ExecutionStatus {
  IDLE = 'idle',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum NavigationEventType {
  PAGE_LOAD = 'page_load',
  EXTRACTION = 'extraction',
  CLAIM_FOUND = 'claim_found',
  VERIFICATION = 'verification',
  STRATEGY_SHIFT = 'strategy_shift',
  PATH_TERMINATED = 'path_terminated',
  ERROR = 'error',
  BLOCKED = 'blocked'
}

export enum AdapterType {
  COMPANY_SITE = 'company_site',
  DOCS = 'docs',
  PRICING = 'pricing',
  CAREERS = 'careers',
  GITHUB = 'github',
  SECURITY_TRUST = 'security_trust',
  BLOG_CHANGELOG = 'blog_changelog',
  NEWS = 'news',
  GENERIC = 'generic'
}

// ============================================================================
// PLANNER TYPES
// ============================================================================

export interface ResearchObjective {
  query: string;
  context?: string;
  constraints?: ResearchConstraints;
  confidenceRequirement?: number;  // 0-1
  knownEntities?: string[];
  knownDomains?: string[];
}

export interface ResearchConstraints {
  maxTimeMs?: number;
  maxPages?: number;
  maxConcurrency?: number;
  maxCostUnits?: number;
  mode?: OperatorMode;
  allowedTiers?: SourceTier[];
  blockedDomains?: string[];
}

export interface ResearchPlan {
  id: string;
  objective: ResearchObjective;
  createdAt: number;
  
  // Core plan outputs
  primaryQuestions: PrimaryQuestion[];
  expectedAnswerTypes: AnswerType[];
  sourceCategories: SourceCategory[];
  targetDomains: RankedDomain[];
  domainExpectations: DomainExpectation[];
  extractionSchemas: ExtractionSchema[];
  
  // Thresholds and budgets
  confidenceThreshold: number;
  budgets: ExecutionBudgets;
  
  // Execution paths
  executionPaths: ExecutionPath[];
  
  // Plan validation
  isValid: boolean;
  validationErrors?: string[];
}

export interface PrimaryQuestion {
  id: string;
  question: string;
  priority: number;
  requiredConfidence: number;
  relatedQuestions?: string[];
}

export interface AnswerType {
  questionId: string;
  expectedType: 'string' | 'number' | 'date' | 'list' | 'structured' | 'boolean';
  format?: string;
  unit?: string;
}

export interface SourceCategory {
  category: 'official' | 'docs' | 'code' | 'news' | 'reviews' | 'forums' | 'filings';
  priority: number;
  maxSources: number;
}

export interface RankedDomain {
  domain: string;
  expectedTier: SourceTier;
  relevanceScore: number;
  expectedContent: string[];
  urlPatterns?: string[];
}

export interface DomainExpectation {
  domain: string;
  expectedPages: string[];
  extractionTargets: string[];
  navigationType: 'direct' | 'search' | 'crawl';
}

export interface ExtractionSchema {
  name: string;
  fields: ExtractionField[];
  sourcePatterns: string[];
}

export interface ExtractionField {
  name: string;
  type: 'string' | 'number' | 'date' | 'list' | 'url' | 'email' | 'boolean';
  required: boolean;
  patterns?: string[];
  validators?: string[];
}

export interface ExecutionBudgets {
  maxTimeMs: number;
  maxPages: number;
  maxConcurrency: number;
  maxCostUnits: number;
  marginalGainFloor: number;  // Stop if gain falls below this
}

export interface ExecutionPath {
  id: string;
  goal: string;
  domainScope: string[];
  extractionTargets: string[];
  confidenceContribution: number;
  priority: number;
  status: 'pending' | 'active' | 'completed' | 'terminated';
}

// ============================================================================
// SOURCE INTELLIGENCE TYPES
// ============================================================================

export interface DomainScore {
  domain: string;
  tier: SourceTier;
  scores: {
    authority: number;      // 0-1: Is this a primary source?
    originality: number;    // 0-1: Is content first-hand?
    freshness: number;      // 0-1: How recent?
    specificity: number;    // 0-1: Is it concrete?
    consistency: number;    // 0-1: Does it agree with others?
  };
  overallScore: number;
  lastUpdated: number;
  sampleSize: number;
}

export interface SourceIntelligence {
  domain: string;
  score: DomainScore;
  knownPatterns: UrlPattern[];
  lastVisit?: number;
  successRate: number;
  avgExtractionYield: number;
  blockedPaths: string[];
}

export interface UrlPattern {
  pattern: string;
  contentType: string;
  reliability: number;
  lastVerified: number;
}

// ============================================================================
// NAVIGATION & EXECUTION TYPES
// ============================================================================

export interface BrowsingSession {
  id: string;
  pathId: string;
  startTime: number;
  endTime?: number;
  pagesVisited: number;
  extractionsCompleted: number;
  claimsFound: number;
  status: 'active' | 'completed' | 'terminated' | 'failed';
  terminationReason?: string;
}

export interface NavigationAction {
  type: 'goto' | 'click' | 'scroll' | 'wait' | 'extract' | 'back';
  target?: string;
  selector?: string;
  timeout?: number;
  humanDelay?: boolean;
}

export interface PageVisit {
  url: string;
  domain: string;
  timestamp: number;
  loadTimeMs: number;
  success: boolean;
  contentHash?: string;
  extractionResults?: ExtractionResult[];
  error?: string;
}

export interface ExtractionResult {
  schemaName: string;
  data: Record<string, unknown>;
  confidence: number;
  sourceUrl: string;
  sourceSelector?: string;
  timestamp: number;
  hash: string;
}

// ============================================================================
// CLAIM & VERIFICATION TYPES
// ============================================================================

export interface Claim {
  id: string;
  text: string;
  normalizedValue?: unknown;
  category: string;
  questionId?: string;
  
  // Source tracking
  sources: ClaimSource[];
  primarySourceTier: SourceTier;
  
  // Verification state
  corroborationCount: number;
  contradictionCount: number;
  confidence: ClaimConfidence;
  confidenceScore: number;
  
  // Metadata
  createdAt: number;
  lastUpdated: number;
  verificationHistory: VerificationEvent[];
}

export interface ClaimSource {
  url: string;
  domain: string;
  tier: SourceTier;
  timestamp: number;
  snippetHash: string;
  selector?: string;
}

export interface VerificationEvent {
  timestamp: number;
  type: 'corroboration' | 'contradiction' | 'update';
  sourceUrl: string;
  previousConfidence: ClaimConfidence;
  newConfidence: ClaimConfidence;
  note?: string;
}

export interface ClaimGraph {
  claims: Map<string, Claim>;
  relationships: ClaimRelationship[];
  overallConfidence: number;
  questionConfidence: Map<string, number>;
}

export interface ClaimRelationship {
  claimId1: string;
  claimId2: string;
  type: 'supports' | 'contradicts' | 'related';
  strength: number;
}

// ============================================================================
// CONFIDENCE ENGINE TYPES
// ============================================================================

export interface ConfidenceState {
  overall: number;
  perQuestion: Map<string, number>;
  perClaim: Map<string, number>;
  marginalGainHistory: MarginalGain[];
  lastAction?: string;
  projectedGain?: number;
}

export interface MarginalGain {
  timestamp: number;
  action: string;
  gainBefore: number;
  gainAfter: number;
  marginalGain: number;
}

export interface StopCondition {
  reason: 'confidence_reached' | 'marginal_gain_low' | 'budget_exhausted' | 'user_stop' | 'error';
  details: string;
  finalConfidence: number;
  timestamp: number;
}

// ============================================================================
// CACHE TYPES
// ============================================================================

export interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  version: number;
  hits: number;
}

export interface PageCache {
  url: string;
  html: string;
  text: string;
  extractedData?: Record<string, unknown>;
  timestamp: number;
  ttl: number;
  version: number;
}

export interface DomainMapEntry {
  domain: string;
  highSignalUrls: string[];
  navigationPaths: string[];
  lastUpdated: number;
}

// ============================================================================
// TELEMETRY & CONTROL TYPES
// ============================================================================

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  type: NavigationEventType;
  sessionId: string;
  pathId?: string;
  data: Record<string, unknown>;
}

export interface ProgressState {
  status: ExecutionStatus;
  planSummary?: string;
  currentPhase: string;
  pagesVisited: number;
  claimsFound: number;
  confidence: number;
  activePaths: number;
  elapsedMs: number;
  estimatedRemainingMs?: number;
}

export interface ControlCommand {
  type: 'pause' | 'resume' | 'stop' | 'adjust_budget' | 'add_domain' | 'block_domain';
  payload?: Record<string, unknown>;
  timestamp: number;
}

// ============================================================================
// ADAPTER TYPES
// ============================================================================

export interface DomainAdapter {
  type: AdapterType;
  name: string;
  urlPatterns: RegExp[];
  navigationHeuristics: NavigationHeuristic[];
  extractionSchema: ExtractionSchema;
  confidenceRules: ConfidenceRule[];
  
  matches(url: string): boolean;
  navigate(page: unknown, target: string): Promise<NavigationResult>;
  extract(page: unknown): Promise<ExtractionResult[]>;
}

export interface NavigationHeuristic {
  name: string;
  condition: string;
  action: NavigationAction;
  priority: number;
}

export interface ConfidenceRule {
  condition: string;
  adjustment: number;
  reason: string;
}

export interface NavigationResult {
  success: boolean;
  url: string;
  nextActions?: NavigationAction[];
  error?: string;
}

// ============================================================================
// MAIN ENGINE TYPES
// ============================================================================

export interface CapyWebConfig {
  mode: OperatorMode;
  defaultBudgets: ExecutionBudgets;
  cacheEnabled: boolean;
  cacheTTL: number;
  parallelism: number;
  humanBehavior: boolean;
  respectRobotsTxt: boolean;
  rateLimit: RateLimitConfig;
  telemetryEnabled: boolean;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstSize: number;
  perDomainDelay: number;
}

export interface CapyWebSession {
  id: string;
  config: CapyWebConfig;
  objective: ResearchObjective;
  plan?: ResearchPlan;
  state: ProgressState;
  claimGraph: ClaimGraph;
  confidence: ConfidenceState;
  startTime: number;
  endTime?: number;
  stopCondition?: StopCondition;
}

export interface CapyWebResult {
  sessionId: string;
  objective: string;
  success: boolean;
  
  // Core outputs
  answers: Answer[];
  claims: Claim[];
  confidence: number;
  
  // Execution stats
  stats: ExecutionStats;
  
  // Audit trail
  visitedUrls: string[];
  telemetry: TelemetryEvent[];
  
  // Stop info
  stopCondition: StopCondition;
}

export interface Answer {
  questionId: string;
  question: string;
  answer: unknown;
  confidence: ClaimConfidence;
  confidenceScore: number;
  sources: ClaimSource[];
  reasoning: string;
}

export interface ExecutionStats {
  totalTimeMs: number;
  pagesVisited: number;
  claimsFound: number;
  claimsVerified: number;
  contradictionsFound: number;
  cacheHits: number;
  cacheMisses: number;
  pathsExecuted: number;
  pathsTerminatedEarly: number;
  avgConfidencePerPage: number;
}
