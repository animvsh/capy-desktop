// ============================================================================
// CAPY WEB - CONFIDENCE ENGINE
// Knows when to stop
// ============================================================================

import {
  ConfidenceState,
  MarginalGain,
  StopCondition,
  Claim,
  ClaimConfidence,
  PrimaryQuestion,
  ExecutionBudgets,
  SourceTier
} from '../types';
import { generateId } from '../utils/helpers';

// ============================================================================
// CONFIDENCE CALCULATION WEIGHTS
// ============================================================================

const TIER_WEIGHTS: Record<SourceTier, number> = {
  [SourceTier.TIER_1]: 1.0,
  [SourceTier.TIER_2]: 0.8,
  [SourceTier.TIER_3]: 0.6,
  [SourceTier.TIER_4]: 0.3,
  [SourceTier.TIER_5]: 0.1
};

const CORROBORATION_BOOST = 0.15;  // Boost per corroborating source
const CONTRADICTION_PENALTY = 0.3; // Penalty for contradictions
const MAX_CORROBORATION_BOOST = 0.4; // Cap on corroboration boost

// ============================================================================
// CONFIDENCE ENGINE CLASS
// ============================================================================

export class ConfidenceEngine {
  private state: ConfidenceState;
  private questions: PrimaryQuestion[] = [];
  private budgets: ExecutionBudgets;
  private startTime: number = 0;
  private pagesVisited: number = 0;
  
  constructor(budgets: ExecutionBudgets) {
    this.budgets = budgets;
    this.state = {
      overall: 0,
      perQuestion: new Map(),
      perClaim: new Map(),
      marginalGainHistory: [],
      lastAction: undefined,
      projectedGain: undefined
    };
  }
  
  /**
   * Initialize with questions
   */
  initialize(questions: PrimaryQuestion[]): void {
    this.questions = questions;
    this.startTime = Date.now();
    this.pagesVisited = 0;
    
    // Initialize per-question confidence to 0
    for (const question of questions) {
      this.state.perQuestion.set(question.id, 0);
    }
  }
  
  /**
   * Calculate confidence score for a single claim
   */
  calculateClaimConfidence(claim: Claim): number {
    let score = 0;
    
    // Base score from primary source tier
    score += TIER_WEIGHTS[claim.primarySourceTier] * 0.5;
    
    // Corroboration boost
    const corroborationBoost = Math.min(
      claim.corroborationCount * CORROBORATION_BOOST,
      MAX_CORROBORATION_BOOST
    );
    score += corroborationBoost;
    
    // Contradiction penalty
    if (claim.contradictionCount > 0) {
      score -= claim.contradictionCount * CONTRADICTION_PENALTY;
    }
    
    // Source diversity bonus (different domains)
    const uniqueDomains = new Set(claim.sources.map(s => s.domain)).size;
    if (uniqueDomains > 1) {
      score += 0.1 * Math.min(uniqueDomains - 1, 3);
    }
    
    // Clamp to 0-1
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Determine claim confidence level from score
   */
  getClaimConfidenceLevel(score: number): ClaimConfidence {
    if (score >= 0.9) return ClaimConfidence.VERIFIED;
    if (score >= 0.75) return ClaimConfidence.HIGH;
    if (score >= 0.5) return ClaimConfidence.MEDIUM;
    if (score >= 0.25) return ClaimConfidence.LOW;
    return ClaimConfidence.UNCERTAIN;
  }
  
  /**
   * Update confidence state after processing claims
   */
  update(claims: Claim[], action: string): void {
    const previousOverall = this.state.overall;
    
    // Update per-claim confidence
    for (const claim of claims) {
      const claimScore = this.calculateClaimConfidence(claim);
      this.state.perClaim.set(claim.id, claimScore);
      
      // Update per-question confidence
      if (claim.questionId) {
        const currentQuestionConf = this.state.perQuestion.get(claim.questionId) || 0;
        // Take the max of current and new claim confidence for this question
        const newQuestionConf = Math.max(currentQuestionConf, claimScore);
        this.state.perQuestion.set(claim.questionId, newQuestionConf);
      }
    }
    
    // Calculate overall confidence as weighted average of question confidence
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const question of this.questions) {
      const questionConf = this.state.perQuestion.get(question.id) || 0;
      const weight = question.priority;
      weightedSum += questionConf * weight;
      totalWeight += weight;
    }
    
    this.state.overall = totalWeight > 0 ? weightedSum / totalWeight : 0;
    
    // Track marginal gain
    const marginalGain: MarginalGain = {
      timestamp: Date.now(),
      action,
      gainBefore: previousOverall,
      gainAfter: this.state.overall,
      marginalGain: this.state.overall - previousOverall
    };
    
    this.state.marginalGainHistory.push(marginalGain);
    this.state.lastAction = action;
    
    // Project future gain based on recent history
    this.state.projectedGain = this.projectFutureGain();
    
    this.pagesVisited++;
  }
  
  /**
   * Project future marginal gain based on recent history
   */
  private projectFutureGain(): number {
    const recentGains = this.state.marginalGainHistory.slice(-5);
    if (recentGains.length === 0) return 0.1;
    
    // Exponential decay projection
    const avgGain = recentGains.reduce((sum, g) => sum + g.marginalGain, 0) / recentGains.length;
    const decayFactor = 0.8; // Each subsequent action expected to yield less
    
    return avgGain * decayFactor;
  }
  
  /**
   * Check if a stop condition is met
   */
  checkStopCondition(confidenceThreshold: number): StopCondition | null {
    // Check confidence reached
    if (this.state.overall >= confidenceThreshold) {
      return {
        reason: 'confidence_reached',
        details: `Overall confidence ${(this.state.overall * 100).toFixed(1)}% reached threshold ${(confidenceThreshold * 100).toFixed(1)}%`,
        finalConfidence: this.state.overall,
        timestamp: Date.now()
      };
    }
    
    // Check marginal gain floor
    const recentGains = this.state.marginalGainHistory.slice(-3);
    if (recentGains.length >= 3) {
      const avgRecentGain = recentGains.reduce((sum, g) => sum + g.marginalGain, 0) / recentGains.length;
      if (avgRecentGain < this.budgets.marginalGainFloor) {
        return {
          reason: 'marginal_gain_low',
          details: `Marginal gain ${(avgRecentGain * 100).toFixed(2)}% below floor ${(this.budgets.marginalGainFloor * 100).toFixed(2)}%`,
          finalConfidence: this.state.overall,
          timestamp: Date.now()
        };
      }
    }
    
    // Check time budget
    const elapsed = Date.now() - this.startTime;
    if (elapsed >= this.budgets.maxTimeMs) {
      return {
        reason: 'budget_exhausted',
        details: `Time budget exhausted: ${(elapsed / 1000).toFixed(1)}s >= ${(this.budgets.maxTimeMs / 1000).toFixed(1)}s`,
        finalConfidence: this.state.overall,
        timestamp: Date.now()
      };
    }
    
    // Check page budget
    if (this.pagesVisited >= this.budgets.maxPages) {
      return {
        reason: 'budget_exhausted',
        details: `Page budget exhausted: ${this.pagesVisited} >= ${this.budgets.maxPages}`,
        finalConfidence: this.state.overall,
        timestamp: Date.now()
      };
    }
    
    return null;
  }
  
  /**
   * Get questions that still need more confidence
   */
  getUnderconfidentQuestions(): PrimaryQuestion[] {
    return this.questions.filter(q => {
      const conf = this.state.perQuestion.get(q.id) || 0;
      return conf < q.requiredConfidence;
    });
  }
  
  /**
   * Get claims that need verification
   */
  getUnverifiedClaimIds(): string[] {
    return Array.from(this.state.perClaim.entries())
      .filter(([_, conf]) => conf < 0.7)
      .map(([id, _]) => id);
  }
  
  /**
   * Calculate expected value of visiting a domain
   */
  calculateDomainExpectedValue(
    domain: string,
    tier: SourceTier,
    expectedQuestionIds: string[]
  ): number {
    // Base value from tier
    let value = TIER_WEIGHTS[tier];
    
    // Boost for questions that need more confidence
    for (const questionId of expectedQuestionIds) {
      const currentConf = this.state.perQuestion.get(questionId) || 0;
      const question = this.questions.find(q => q.id === questionId);
      if (question) {
        const gap = question.requiredConfidence - currentConf;
        if (gap > 0) {
          value += gap * question.priority * 0.1;
        }
      }
    }
    
    // Diminishing returns based on pages visited
    const diminishingFactor = 1 / (1 + this.pagesVisited * 0.1);
    value *= diminishingFactor;
    
    return value;
  }
  
  /**
   * Should continue execution?
   */
  shouldContinue(confidenceThreshold: number): boolean {
    return this.checkStopCondition(confidenceThreshold) === null;
  }
  
  /**
   * Get current state
   */
  getState(): ConfidenceState {
    return { ...this.state };
  }
  
  /**
   * Get overall confidence
   */
  getOverallConfidence(): number {
    return this.state.overall;
  }
  
  /**
   * Get confidence for a specific question
   */
  getQuestionConfidence(questionId: string): number {
    return this.state.perQuestion.get(questionId) || 0;
  }
  
  /**
   * Get summary statistics
   */
  getSummary(): {
    overall: number;
    questionsAnswered: number;
    questionsTotal: number;
    avgMarginalGain: number;
    pagesVisited: number;
    elapsedMs: number;
    budgetUsed: {
      time: number;
      pages: number;
    };
  } {
    const recentGains = this.state.marginalGainHistory.slice(-5);
    const avgMarginalGain = recentGains.length > 0
      ? recentGains.reduce((sum, g) => sum + g.marginalGain, 0) / recentGains.length
      : 0;
    
    const questionsAnswered = Array.from(this.state.perQuestion.values())
      .filter(conf => conf >= 0.7).length;
    
    const elapsed = Date.now() - this.startTime;
    
    return {
      overall: this.state.overall,
      questionsAnswered,
      questionsTotal: this.questions.length,
      avgMarginalGain,
      pagesVisited: this.pagesVisited,
      elapsedMs: elapsed,
      budgetUsed: {
        time: elapsed / this.budgets.maxTimeMs,
        pages: this.pagesVisited / this.budgets.maxPages
      }
    };
  }
  
  /**
   * Force a stop condition
   */
  forceStop(reason: 'user_stop' | 'error', details: string): StopCondition {
    return {
      reason,
      details,
      finalConfidence: this.state.overall,
      timestamp: Date.now()
    };
  }
  
  /**
   * Handle contradiction found
   */
  handleContradiction(claimId: string): void {
    const currentConf = this.state.perClaim.get(claimId);
    if (currentConf !== undefined) {
      // Reduce confidence for contradicted claims
      this.state.perClaim.set(claimId, Math.max(0, currentConf - CONTRADICTION_PENALTY));
      
      // Recalculate overall
      this.recalculateOverall();
    }
  }
  
  /**
   * Recalculate overall confidence from current state
   */
  private recalculateOverall(): void {
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const question of this.questions) {
      const questionConf = this.state.perQuestion.get(question.id) || 0;
      const weight = question.priority;
      weightedSum += questionConf * weight;
      totalWeight += weight;
    }
    
    this.state.overall = totalWeight > 0 ? weightedSum / totalWeight : 0;
  }
  
  /**
   * Estimate time to reach confidence threshold
   */
  estimateTimeToThreshold(threshold: number): number | null {
    if (this.state.overall >= threshold) return 0;
    
    const avgGain = this.state.projectedGain || 0.05;
    if (avgGain <= 0) return null;
    
    const gap = threshold - this.state.overall;
    const actionsNeeded = gap / avgGain;
    
    // Estimate time per action based on history
    const history = this.state.marginalGainHistory;
    if (history.length < 2) return null;
    
    const avgTimePerAction = (history[history.length - 1].timestamp - history[0].timestamp) / history.length;
    
    return actionsNeeded * avgTimePerAction;
  }
}

// Export factory function
export function createConfidenceEngine(budgets: ExecutionBudgets): ConfidenceEngine {
  return new ConfidenceEngine(budgets);
}
