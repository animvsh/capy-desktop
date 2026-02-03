// ============================================================================
// CAPY WEB - SOURCE INTELLIGENCE ENGINE
// Dynamic model of web source quality
// ============================================================================

import {
  SourceTier,
  DomainScore,
  SourceIntelligence,
  UrlPattern
} from '../types';
import { extractDomain, normalizeUrl, hashString } from '../utils/helpers';

// ============================================================================
// TIER CLASSIFICATION RULES
// ============================================================================

interface TierRule {
  pattern: RegExp;
  tier: SourceTier;
  category: string;
  baseScores: Partial<DomainScore['scores']>;
}

const TIER_RULES: TierRule[] = [
  // Tier 1: Official domains, docs, repos, filings
  {
    pattern: /github\.com$/i,
    tier: SourceTier.TIER_1,
    category: 'code',
    baseScores: { authority: 0.95, originality: 0.95, specificity: 0.9 }
  },
  {
    pattern: /gitlab\.com$/i,
    tier: SourceTier.TIER_1,
    category: 'code',
    baseScores: { authority: 0.9, originality: 0.95, specificity: 0.9 }
  },
  {
    pattern: /\.gov$/i,
    tier: SourceTier.TIER_1,
    category: 'official',
    baseScores: { authority: 1.0, originality: 0.95, specificity: 0.8 }
  },
  {
    pattern: /sec\.gov$/i,
    tier: SourceTier.TIER_1,
    category: 'filings',
    baseScores: { authority: 1.0, originality: 1.0, specificity: 0.95 }
  },
  {
    pattern: /docs\./i,
    tier: SourceTier.TIER_1,
    category: 'docs',
    baseScores: { authority: 0.9, originality: 0.9, specificity: 0.95 }
  },
  {
    pattern: /developer\./i,
    tier: SourceTier.TIER_1,
    category: 'docs',
    baseScores: { authority: 0.9, originality: 0.9, specificity: 0.9 }
  },
  
  // Tier 2: First-party blogs, changelogs
  {
    pattern: /blog\./i,
    tier: SourceTier.TIER_2,
    category: 'blog',
    baseScores: { authority: 0.8, originality: 0.9, specificity: 0.7 }
  },
  {
    pattern: /crunchbase\.com$/i,
    tier: SourceTier.TIER_2,
    category: 'company_info',
    baseScores: { authority: 0.85, originality: 0.7, specificity: 0.9 }
  },
  {
    pattern: /linkedin\.com$/i,
    tier: SourceTier.TIER_2,
    category: 'company_info',
    baseScores: { authority: 0.8, originality: 0.75, specificity: 0.8 }
  },
  {
    pattern: /pitchbook\.com$/i,
    tier: SourceTier.TIER_2,
    category: 'funding',
    baseScores: { authority: 0.9, originality: 0.8, specificity: 0.9 }
  },
  
  // Tier 3: Reputable analysis/news
  {
    pattern: /techcrunch\.com$/i,
    tier: SourceTier.TIER_3,
    category: 'news',
    baseScores: { authority: 0.75, originality: 0.7, specificity: 0.6 }
  },
  {
    pattern: /bloomberg\.com$/i,
    tier: SourceTier.TIER_3,
    category: 'news',
    baseScores: { authority: 0.85, originality: 0.75, specificity: 0.7 }
  },
  {
    pattern: /reuters\.com$/i,
    tier: SourceTier.TIER_3,
    category: 'news',
    baseScores: { authority: 0.9, originality: 0.8, specificity: 0.7 }
  },
  {
    pattern: /wsj\.com$/i,
    tier: SourceTier.TIER_3,
    category: 'news',
    baseScores: { authority: 0.9, originality: 0.75, specificity: 0.7 }
  },
  {
    pattern: /g2\.com$/i,
    tier: SourceTier.TIER_3,
    category: 'reviews',
    baseScores: { authority: 0.7, originality: 0.65, specificity: 0.8 }
  },
  {
    pattern: /capterra\.com$/i,
    tier: SourceTier.TIER_3,
    category: 'reviews',
    baseScores: { authority: 0.7, originality: 0.6, specificity: 0.75 }
  },
  {
    pattern: /trustradius\.com$/i,
    tier: SourceTier.TIER_3,
    category: 'reviews',
    baseScores: { authority: 0.7, originality: 0.65, specificity: 0.75 }
  },
  
  // Tier 4: Reviews/forums (corroboration only)
  {
    pattern: /reddit\.com$/i,
    tier: SourceTier.TIER_4,
    category: 'forum',
    baseScores: { authority: 0.4, originality: 0.8, specificity: 0.5 }
  },
  {
    pattern: /quora\.com$/i,
    tier: SourceTier.TIER_4,
    category: 'forum',
    baseScores: { authority: 0.35, originality: 0.6, specificity: 0.4 }
  },
  {
    pattern: /stackexchange\.com$/i,
    tier: SourceTier.TIER_4,
    category: 'forum',
    baseScores: { authority: 0.6, originality: 0.7, specificity: 0.7 }
  },
  {
    pattern: /stackoverflow\.com$/i,
    tier: SourceTier.TIER_4,
    category: 'forum',
    baseScores: { authority: 0.65, originality: 0.7, specificity: 0.75 }
  },
  {
    pattern: /ycombinator\.com$/i,
    tier: SourceTier.TIER_4,
    category: 'forum',
    baseScores: { authority: 0.55, originality: 0.8, specificity: 0.6 }
  },
  
  // Tier 5: SEO/junk (actively penalized)
  {
    pattern: /medium\.com$/i,
    tier: SourceTier.TIER_5,
    category: 'blog',
    baseScores: { authority: 0.3, originality: 0.4, specificity: 0.3 }
  },
  {
    pattern: /\.blogspot\./i,
    tier: SourceTier.TIER_5,
    category: 'blog',
    baseScores: { authority: 0.2, originality: 0.3, specificity: 0.2 }
  },
  {
    pattern: /wordpress\.com$/i,
    tier: SourceTier.TIER_5,
    category: 'blog',
    baseScores: { authority: 0.25, originality: 0.35, specificity: 0.25 }
  },
  {
    pattern: /hubspot\.com$/i,
    tier: SourceTier.TIER_5,
    category: 'seo',
    baseScores: { authority: 0.3, originality: 0.2, specificity: 0.3 }
  }
];

// Domains to actively avoid
const BLOCKED_DOMAINS = new Set([
  'pinterest.com',
  'pinterest.co.uk',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'youtube.com',  // Unless specifically needed
  'amazon.com',   // Unless specifically needed
  'ebay.com'
]);

// ============================================================================
// SOURCE INTELLIGENCE ENGINE
// ============================================================================

export class SourceIntelligenceEngine {
  private domainScores: Map<string, DomainScore> = new Map();
  private sourceIntelligence: Map<string, SourceIntelligence> = new Map();
  private consistencyMatrix: Map<string, Map<string, number>> = new Map();
  
  constructor() {
    // Initialize with known domain scores
    this.initializeKnownDomains();
  }
  
  /**
   * Initialize scores for well-known domains
   */
  private initializeKnownDomains(): void {
    for (const rule of TIER_RULES) {
      // Create a representative domain entry for the pattern
      const domain = rule.pattern.source.replace(/[\\^$]/g, '').replace(/\.\*/g, '');
      if (domain.includes('.')) {
        this.domainScores.set(domain, {
          domain,
          tier: rule.tier,
          scores: {
            authority: rule.baseScores.authority ?? 0.5,
            originality: rule.baseScores.originality ?? 0.5,
            freshness: 0.5,  // Will be updated during execution
            specificity: rule.baseScores.specificity ?? 0.5,
            consistency: 0.5  // Will be updated during execution
          },
          overallScore: this.calculateOverallScore({
            authority: rule.baseScores.authority ?? 0.5,
            originality: rule.baseScores.originality ?? 0.5,
            freshness: 0.5,
            specificity: rule.baseScores.specificity ?? 0.5,
            consistency: 0.5
          }),
          lastUpdated: Date.now(),
          sampleSize: 0
        });
      }
    }
  }
  
  /**
   * Calculate overall score from individual dimensions
   */
  private calculateOverallScore(scores: DomainScore['scores']): number {
    // Weighted average with authority and originality weighted higher
    const weights = {
      authority: 0.3,
      originality: 0.25,
      freshness: 0.15,
      specificity: 0.2,
      consistency: 0.1
    };
    
    return Object.entries(scores).reduce(
      (sum, [key, value]) => sum + value * weights[key as keyof typeof weights],
      0
    );
  }
  
  /**
   * Classify a domain into a tier
   */
  classifyDomain(domain: string): SourceTier {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
    
    // Check if blocked
    if (BLOCKED_DOMAINS.has(normalizedDomain)) {
      return SourceTier.TIER_5;
    }
    
    // Check cached score
    const cached = this.domainScores.get(normalizedDomain);
    if (cached) {
      return cached.tier;
    }
    
    // Check against tier rules
    for (const rule of TIER_RULES) {
      if (rule.pattern.test(normalizedDomain)) {
        return rule.tier;
      }
    }
    
    // Default to Tier 3 for unknown domains (assume neutral)
    return SourceTier.TIER_3;
  }
  
  /**
   * Score a domain based on all dimensions
   */
  scoreDomain(domain: string, context?: {
    url?: string;
    content?: string;
    timestamp?: number;
    existingClaims?: string[];
  }): DomainScore {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
    const tier = this.classifyDomain(normalizedDomain);
    
    // Get base scores
    let baseScores = this.getBaseScores(normalizedDomain);
    
    // Adjust based on context
    if (context) {
      baseScores = this.adjustScoresWithContext(baseScores, context);
    }
    
    const score: DomainScore = {
      domain: normalizedDomain,
      tier,
      scores: baseScores,
      overallScore: this.calculateOverallScore(baseScores),
      lastUpdated: Date.now(),
      sampleSize: (this.domainScores.get(normalizedDomain)?.sampleSize ?? 0) + 1
    };
    
    // Update cache
    this.domainScores.set(normalizedDomain, score);
    
    return score;
  }
  
  /**
   * Get base scores for a domain
   */
  private getBaseScores(domain: string): DomainScore['scores'] {
    // Check cached
    const cached = this.domainScores.get(domain);
    if (cached) {
      return { ...cached.scores };
    }
    
    // Check tier rules
    for (const rule of TIER_RULES) {
      if (rule.pattern.test(domain)) {
        return {
          authority: rule.baseScores.authority ?? 0.5,
          originality: rule.baseScores.originality ?? 0.5,
          freshness: 0.5,
          specificity: rule.baseScores.specificity ?? 0.5,
          consistency: 0.5
        };
      }
    }
    
    // Default neutral scores
    return {
      authority: 0.5,
      originality: 0.5,
      freshness: 0.5,
      specificity: 0.5,
      consistency: 0.5
    };
  }
  
  /**
   * Adjust scores based on contextual signals
   */
  private adjustScoresWithContext(
    scores: DomainScore['scores'],
    context: {
      url?: string;
      content?: string;
      timestamp?: number;
      existingClaims?: string[];
    }
  ): DomainScore['scores'] {
    const adjusted = { ...scores };
    
    // Freshness based on content signals
    if (context.content) {
      // Look for date indicators in content
      const datePatterns = [
        /updated?\s*:?\s*(\d{4})/i,
        /(\d{1,2}\/\d{1,2}\/\d{4})/,
        /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/i
      ];
      
      for (const pattern of datePatterns) {
        const match = context.content.match(pattern);
        if (match) {
          const year = parseInt(match[1]) || new Date().getFullYear();
          const yearsOld = new Date().getFullYear() - year;
          adjusted.freshness = Math.max(0, 1 - yearsOld * 0.2);
          break;
        }
      }
      
      // Specificity based on content density
      const wordCount = context.content.split(/\s+/).length;
      if (wordCount > 500) {
        adjusted.specificity = Math.min(1, adjusted.specificity + 0.1);
      }
      if (wordCount < 100) {
        adjusted.specificity = Math.max(0, adjusted.specificity - 0.2);
      }
    }
    
    // Consistency based on existing claims
    if (context.existingClaims && context.existingClaims.length > 0) {
      // This will be updated by the verification engine
      // For now, leave at default
    }
    
    return adjusted;
  }
  
  /**
   * Get intelligence for a domain
   */
  getSourceIntelligence(domain: string): SourceIntelligence | null {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
    return this.sourceIntelligence.get(normalizedDomain) || null;
  }
  
  /**
   * Update source intelligence after visiting a domain
   */
  updateSourceIntelligence(
    domain: string,
    visitResult: {
      success: boolean;
      url: string;
      extractionYield: number;
      patterns?: UrlPattern[];
      blockedPaths?: string[];
    }
  ): void {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
    
    let intel = this.sourceIntelligence.get(normalizedDomain);
    if (!intel) {
      intel = {
        domain: normalizedDomain,
        score: this.scoreDomain(normalizedDomain),
        knownPatterns: [],
        lastVisit: Date.now(),
        successRate: 1,
        avgExtractionYield: 0,
        blockedPaths: []
      };
    }
    
    // Update success rate (exponential moving average)
    const alpha = 0.3;
    intel.successRate = alpha * (visitResult.success ? 1 : 0) + (1 - alpha) * intel.successRate;
    
    // Update extraction yield
    intel.avgExtractionYield = alpha * visitResult.extractionYield + (1 - alpha) * intel.avgExtractionYield;
    
    // Update last visit
    intel.lastVisit = Date.now();
    
    // Add new patterns
    if (visitResult.patterns) {
      for (const pattern of visitResult.patterns) {
        const existing = intel.knownPatterns.find(p => p.pattern === pattern.pattern);
        if (existing) {
          existing.reliability = alpha * pattern.reliability + (1 - alpha) * existing.reliability;
          existing.lastVerified = Date.now();
        } else {
          intel.knownPatterns.push(pattern);
        }
      }
    }
    
    // Track blocked paths
    if (visitResult.blockedPaths) {
      intel.blockedPaths = [...new Set([...intel.blockedPaths, ...visitResult.blockedPaths])];
    }
    
    this.sourceIntelligence.set(normalizedDomain, intel);
  }
  
  /**
   * Update consistency scores based on cross-source verification
   */
  updateConsistency(claims: Array<{ domain: string; value: string }>): void {
    // Build agreement matrix
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const d1 = claims[i].domain;
        const d2 = claims[j].domain;
        const agree = claims[i].value === claims[j].value;
        
        // Update consistency matrix
        if (!this.consistencyMatrix.has(d1)) {
          this.consistencyMatrix.set(d1, new Map());
        }
        if (!this.consistencyMatrix.has(d2)) {
          this.consistencyMatrix.set(d2, new Map());
        }
        
        const current1 = this.consistencyMatrix.get(d1)!.get(d2) ?? 0.5;
        const current2 = this.consistencyMatrix.get(d2)!.get(d1) ?? 0.5;
        
        const alpha = 0.2;
        const update = agree ? 1 : 0;
        
        this.consistencyMatrix.get(d1)!.set(d2, alpha * update + (1 - alpha) * current1);
        this.consistencyMatrix.get(d2)!.set(d1, alpha * update + (1 - alpha) * current2);
      }
    }
    
    // Update domain scores with consistency
    for (const [domain, agreements] of this.consistencyMatrix) {
      if (agreements.size > 0) {
        const avgConsistency = Array.from(agreements.values()).reduce((a, b) => a + b, 0) / agreements.size;
        const score = this.domainScores.get(domain);
        if (score) {
          score.scores.consistency = avgConsistency;
          score.overallScore = this.calculateOverallScore(score.scores);
          this.domainScores.set(domain, score);
        }
      }
    }
  }
  
  /**
   * Check if a domain should be avoided
   */
  shouldAvoid(domain: string): boolean {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
    
    // Check blocked list
    if (BLOCKED_DOMAINS.has(normalizedDomain)) {
      return true;
    }
    
    // Check tier
    const tier = this.classifyDomain(normalizedDomain);
    if (tier === SourceTier.TIER_5) {
      return true;
    }
    
    // Check intelligence
    const intel = this.sourceIntelligence.get(normalizedDomain);
    if (intel && intel.successRate < 0.2) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Rank domains by expected value
   */
  rankDomains(domains: string[]): string[] {
    return domains
      .filter(d => !this.shouldAvoid(d))
      .map(domain => ({
        domain,
        score: this.scoreDomain(domain)
      }))
      .sort((a, b) => {
        // First by tier
        if (a.score.tier !== b.score.tier) {
          return a.score.tier - b.score.tier;
        }
        // Then by overall score
        return b.score.overallScore - a.score.overallScore;
      })
      .map(d => d.domain);
  }
  
  /**
   * Get domains by tier
   */
  getDomainsByTier(tier: SourceTier): string[] {
    return Array.from(this.domainScores.entries())
      .filter(([_, score]) => score.tier === tier)
      .map(([domain, _]) => domain);
  }
  
  /**
   * Get best domains for a specific category
   */
  getBestDomainsForCategory(category: string, limit = 5): string[] {
    const categoryRules = TIER_RULES.filter(r => r.category === category);
    const domains: Array<{ domain: string; tier: SourceTier; score: number }> = [];
    
    for (const rule of categoryRules) {
      const domain = rule.pattern.source.replace(/[\\^$]/g, '').replace(/\.\*/g, '');
      if (domain.includes('.')) {
        const score = this.domainScores.get(domain);
        if (score) {
          domains.push({
            domain,
            tier: score.tier,
            score: score.overallScore
          });
        }
      }
    }
    
    return domains
      .sort((a, b) => a.tier - b.tier || b.score - a.score)
      .slice(0, limit)
      .map(d => d.domain);
  }
  
  /**
   * Export current state for persistence
   */
  exportState(): {
    domainScores: Record<string, DomainScore>;
    sourceIntelligence: Record<string, SourceIntelligence>;
  } {
    return {
      domainScores: Object.fromEntries(this.domainScores),
      sourceIntelligence: Object.fromEntries(this.sourceIntelligence)
    };
  }
  
  /**
   * Import state from persistence
   */
  importState(state: {
    domainScores?: Record<string, DomainScore>;
    sourceIntelligence?: Record<string, SourceIntelligence>;
  }): void {
    if (state.domainScores) {
      for (const [domain, score] of Object.entries(state.domainScores)) {
        this.domainScores.set(domain, score);
      }
    }
    if (state.sourceIntelligence) {
      for (const [domain, intel] of Object.entries(state.sourceIntelligence)) {
        this.sourceIntelligence.set(domain, intel);
      }
    }
  }
}

// Export singleton factory
export function createSourceIntelligence(): SourceIntelligenceEngine {
  return new SourceIntelligenceEngine();
}
