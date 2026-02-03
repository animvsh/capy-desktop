// ============================================================================
// CAPY WEB - CLAIM GRAPH & VERIFICATION ENGINE
// Real-time claim tracking and cross-validation
// ============================================================================

import {
  Claim,
  ClaimSource,
  ClaimConfidence,
  ClaimGraph,
  ClaimRelationship,
  VerificationEvent,
  SourceTier,
  ExtractionResult
} from '../types';
import { generateId, hashString, extractDomain } from '../utils/helpers';

// ============================================================================
// VERIFICATION RULES
// ============================================================================

const VERIFICATION_RULES = {
  // High confidence if:
  highConfidence: {
    minCorroboration: 2,  // 2+ independent sources agree, OR
    authoritativeSourceRequired: true  // 1 authoritative source exists
  },
  // Authoritative tiers
  authoritativeTiers: [SourceTier.TIER_1, SourceTier.TIER_2],
  // Similarity threshold for claim matching
  similarityThreshold: 0.8,
  // Contradiction detection sensitivity
  contradictionKeywords: ['not', 'no longer', 'discontinued', 'deprecated', 'false', 'incorrect']
};

// ============================================================================
// CLAIM GRAPH ENGINE
// ============================================================================

export class ClaimGraphEngine {
  private claims: Map<string, Claim> = new Map();
  private relationships: ClaimRelationship[] = [];
  private categoryIndex: Map<string, Set<string>> = new Map();  // category -> claim IDs
  private valueIndex: Map<string, Set<string>> = new Map();  // normalized value -> claim IDs
  
  /**
   * Create a new claim from extraction result
   */
  createClaim(
    extraction: ExtractionResult,
    sourceUrl: string,
    sourceTier: SourceTier,
    questionId?: string,
    category?: string
  ): Claim {
    const claim: Claim = {
      id: generateId(),
      text: this.extractClaimText(extraction),
      normalizedValue: this.normalizeValue(extraction.data),
      category: category || extraction.schemaName,
      questionId,
      sources: [{
        url: sourceUrl,
        domain: extractDomain(sourceUrl),
        tier: sourceTier,
        timestamp: Date.now(),
        snippetHash: hashString(JSON.stringify(extraction.data))
      }],
      primarySourceTier: sourceTier,
      corroborationCount: 0,
      contradictionCount: 0,
      confidence: ClaimConfidence.UNCERTAIN,
      confidenceScore: this.calculateInitialConfidence(sourceTier),
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      verificationHistory: []
    };
    
    // Check for existing similar claims
    const existingClaim = this.findSimilarClaim(claim);
    if (existingClaim) {
      // Merge with existing claim
      return this.mergeClaims(existingClaim, claim);
    }
    
    // Add new claim
    this.addClaim(claim);
    
    // Check for contradictions
    this.checkContradictions(claim);
    
    return claim;
  }
  
  /**
   * Extract readable claim text from extraction data
   */
  private extractClaimText(extraction: ExtractionResult): string {
    const data = extraction.data;
    
    // Try to create a readable text from the data
    const parts: string[] = [];
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value)) {
          parts.push(`${key}: ${value.join(', ')}`);
        } else {
          parts.push(`${key}: ${value}`);
        }
      }
    }
    
    return parts.join('; ') || JSON.stringify(data);
  }
  
  /**
   * Normalize value for comparison
   */
  private normalizeValue(data: Record<string, unknown>): unknown {
    // Create a canonical form for comparison
    const normalized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
      const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, '');
      
      if (typeof value === 'string') {
        normalized[normalizedKey] = value.toLowerCase().trim();
      } else if (typeof value === 'number') {
        normalized[normalizedKey] = value;
      } else if (Array.isArray(value)) {
        normalized[normalizedKey] = value.map(v => 
          typeof v === 'string' ? v.toLowerCase().trim() : v
        ).sort();
      } else {
        normalized[normalizedKey] = value;
      }
    }
    
    return normalized;
  }
  
  /**
   * Calculate initial confidence based on source tier
   */
  private calculateInitialConfidence(tier: SourceTier): number {
    const tierScores: Record<SourceTier, number> = {
      [SourceTier.TIER_1]: 0.7,
      [SourceTier.TIER_2]: 0.5,
      [SourceTier.TIER_3]: 0.35,
      [SourceTier.TIER_4]: 0.2,
      [SourceTier.TIER_5]: 0.1
    };
    return tierScores[tier];
  }
  
  /**
   * Add a claim to the graph
   */
  private addClaim(claim: Claim): void {
    this.claims.set(claim.id, claim);
    
    // Update category index
    if (!this.categoryIndex.has(claim.category)) {
      this.categoryIndex.set(claim.category, new Set());
    }
    this.categoryIndex.get(claim.category)!.add(claim.id);
    
    // Update value index
    const valueKey = hashString(JSON.stringify(claim.normalizedValue));
    if (!this.valueIndex.has(valueKey)) {
      this.valueIndex.set(valueKey, new Set());
    }
    this.valueIndex.get(valueKey)!.add(claim.id);
    
    // Update confidence level
    claim.confidence = this.determineConfidenceLevel(claim);
  }
  
  /**
   * Find a similar existing claim
   */
  private findSimilarClaim(newClaim: Claim): Claim | null {
    // Check same category claims
    const categoryClaims = this.categoryIndex.get(newClaim.category);
    if (!categoryClaims) return null;
    
    for (const claimId of categoryClaims) {
      const existing = this.claims.get(claimId);
      if (existing && this.claimsAreSimilar(existing, newClaim)) {
        return existing;
      }
    }
    
    return null;
  }
  
  /**
   * Check if two claims are similar enough to merge
   */
  private claimsAreSimilar(claim1: Claim, claim2: Claim): boolean {
    // Same question ID is a strong signal
    if (claim1.questionId && claim1.questionId === claim2.questionId) {
      // Check value similarity
      return this.valuesAreSimilar(claim1.normalizedValue, claim2.normalizedValue);
    }
    
    // Same category with similar values
    if (claim1.category === claim2.category) {
      return this.valuesAreSimilar(claim1.normalizedValue, claim2.normalizedValue);
    }
    
    return false;
  }
  
  /**
   * Check if two values are similar
   */
  private valuesAreSimilar(value1: unknown, value2: unknown): boolean {
    if (typeof value1 !== typeof value2) return false;
    
    if (typeof value1 === 'string' && typeof value2 === 'string') {
      return this.stringSimilarity(value1, value2) >= VERIFICATION_RULES.similarityThreshold;
    }
    
    if (typeof value1 === 'number' && typeof value2 === 'number') {
      // Allow 5% variance for numbers
      const variance = Math.abs(value1 - value2) / Math.max(value1, value2, 1);
      return variance <= 0.05;
    }
    
    if (Array.isArray(value1) && Array.isArray(value2)) {
      // Check overlap
      const set1 = new Set(value1.map(String));
      const set2 = new Set(value2.map(String));
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      const union = new Set([...set1, ...set2]);
      return intersection.size / union.size >= VERIFICATION_RULES.similarityThreshold;
    }
    
    // For objects, compare JSON strings
    return JSON.stringify(value1) === JSON.stringify(value2);
  }
  
  /**
   * Simple string similarity (Jaccard on words)
   */
  private stringSimilarity(s1: string, s2: string): number {
    const words1 = new Set(s1.toLowerCase().split(/\s+/));
    const words2 = new Set(s2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Merge a new claim into an existing one (corroboration)
   */
  private mergeClaims(existing: Claim, newClaim: Claim): Claim {
    // Check if from same domain (not truly independent)
    const existingDomains = new Set(existing.sources.map(s => s.domain));
    const newDomain = newClaim.sources[0]?.domain;
    const isNewSource = !existingDomains.has(newDomain);
    
    // Add new source
    existing.sources.push(...newClaim.sources);
    existing.lastUpdated = Date.now();
    
    // Update corroboration if from different domain
    if (isNewSource) {
      existing.corroborationCount++;
      
      // Record verification event
      const previousConfidence = existing.confidence;
      existing.confidenceScore = this.recalculateConfidence(existing);
      existing.confidence = this.determineConfidenceLevel(existing);
      
      existing.verificationHistory.push({
        timestamp: Date.now(),
        type: 'corroboration',
        sourceUrl: newClaim.sources[0].url,
        previousConfidence,
        newConfidence: existing.confidence,
        note: `Corroborated by ${newDomain}`
      });
      
      // Update primary tier if new source is more authoritative
      if (newClaim.primarySourceTier < existing.primarySourceTier) {
        existing.primarySourceTier = newClaim.primarySourceTier;
      }
    }
    
    return existing;
  }
  
  /**
   * Check for contradictions with existing claims
   */
  private checkContradictions(newClaim: Claim): void {
    const categoryClaims = this.categoryIndex.get(newClaim.category);
    if (!categoryClaims) return;
    
    for (const claimId of categoryClaims) {
      if (claimId === newClaim.id) continue;
      
      const existing = this.claims.get(claimId);
      if (!existing) continue;
      
      // Same question but different values = potential contradiction
      if (existing.questionId === newClaim.questionId && 
          !this.valuesAreSimilar(existing.normalizedValue, newClaim.normalizedValue)) {
        this.recordContradiction(existing, newClaim);
      }
    }
  }
  
  /**
   * Record a contradiction between two claims
   */
  private recordContradiction(claim1: Claim, claim2: Claim): void {
    // Add relationship
    this.relationships.push({
      claimId1: claim1.id,
      claimId2: claim2.id,
      type: 'contradicts',
      strength: 1.0
    });
    
    // Update both claims
    claim1.contradictionCount++;
    claim2.contradictionCount++;
    
    // Recalculate confidence
    const prev1 = claim1.confidence;
    const prev2 = claim2.confidence;
    
    claim1.confidenceScore = this.recalculateConfidence(claim1);
    claim2.confidenceScore = this.recalculateConfidence(claim2);
    
    claim1.confidence = this.determineConfidenceLevel(claim1);
    claim2.confidence = this.determineConfidenceLevel(claim2);
    
    // Mark as contradicted if severe
    if (claim1.confidenceScore < 0.3) {
      claim1.confidence = ClaimConfidence.CONTRADICTED;
    }
    if (claim2.confidenceScore < 0.3) {
      claim2.confidence = ClaimConfidence.CONTRADICTED;
    }
    
    // Record verification events
    claim1.verificationHistory.push({
      timestamp: Date.now(),
      type: 'contradiction',
      sourceUrl: claim2.sources[0]?.url || '',
      previousConfidence: prev1,
      newConfidence: claim1.confidence,
      note: `Contradicted by: ${claim2.text.substring(0, 50)}...`
    });
    
    claim2.verificationHistory.push({
      timestamp: Date.now(),
      type: 'contradiction',
      sourceUrl: claim1.sources[0]?.url || '',
      previousConfidence: prev2,
      newConfidence: claim2.confidence,
      note: `Contradicted by: ${claim1.text.substring(0, 50)}...`
    });
  }
  
  /**
   * Recalculate confidence score for a claim
   */
  private recalculateConfidence(claim: Claim): number {
    // Base score from tier
    let score = this.calculateInitialConfidence(claim.primarySourceTier);
    
    // Corroboration bonus (0.1 per corroboration, max 0.3)
    score += Math.min(claim.corroborationCount * 0.1, 0.3);
    
    // Source diversity bonus
    const uniqueDomains = new Set(claim.sources.map(s => s.domain)).size;
    score += Math.min((uniqueDomains - 1) * 0.05, 0.15);
    
    // Contradiction penalty (0.2 per contradiction)
    score -= claim.contradictionCount * 0.2;
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Determine confidence level from score
   */
  private determineConfidenceLevel(claim: Claim): ClaimConfidence {
    const score = claim.confidenceScore;
    
    // Check high confidence rules
    if (claim.corroborationCount >= VERIFICATION_RULES.highConfidence.minCorroboration ||
        VERIFICATION_RULES.authoritativeTiers.includes(claim.primarySourceTier)) {
      if (claim.contradictionCount === 0 && score >= 0.7) {
        return ClaimConfidence.VERIFIED;
      }
    }
    
    if (claim.contradictionCount > 0 && score < 0.3) {
      return ClaimConfidence.CONTRADICTED;
    }
    
    if (score >= 0.7) return ClaimConfidence.HIGH;
    if (score >= 0.5) return ClaimConfidence.MEDIUM;
    if (score >= 0.25) return ClaimConfidence.LOW;
    return ClaimConfidence.UNCERTAIN;
  }
  
  /**
   * Get a claim by ID
   */
  getClaim(id: string): Claim | null {
    return this.claims.get(id) || null;
  }
  
  /**
   * Get all claims
   */
  getAllClaims(): Claim[] {
    return Array.from(this.claims.values());
  }
  
  /**
   * Get claims by category
   */
  getClaimsByCategory(category: string): Claim[] {
    const claimIds = this.categoryIndex.get(category);
    if (!claimIds) return [];
    
    return Array.from(claimIds)
      .map(id => this.claims.get(id))
      .filter((c): c is Claim => c !== undefined);
  }
  
  /**
   * Get claims for a question
   */
  getClaimsForQuestion(questionId: string): Claim[] {
    return Array.from(this.claims.values())
      .filter(c => c.questionId === questionId);
  }
  
  /**
   * Get verified claims
   */
  getVerifiedClaims(): Claim[] {
    return Array.from(this.claims.values())
      .filter(c => c.confidence === ClaimConfidence.VERIFIED);
  }
  
  /**
   * Get unverified claims that need more sources
   */
  getUnverifiedClaims(): Claim[] {
    return Array.from(this.claims.values())
      .filter(c => c.confidence === ClaimConfidence.UNCERTAIN || 
                   c.confidence === ClaimConfidence.LOW);
  }
  
  /**
   * Get contradicted claims
   */
  getContradictedClaims(): Claim[] {
    return Array.from(this.claims.values())
      .filter(c => c.confidence === ClaimConfidence.CONTRADICTED);
  }
  
  /**
   * Get claim graph for export
   */
  getGraph(): ClaimGraph {
    return {
      claims: new Map(this.claims),
      relationships: [...this.relationships],
      overallConfidence: this.calculateOverallConfidence(),
      questionConfidence: this.calculateQuestionConfidence()
    };
  }
  
  /**
   * Calculate overall confidence across all claims
   */
  private calculateOverallConfidence(): number {
    if (this.claims.size === 0) return 0;
    
    let totalScore = 0;
    for (const claim of this.claims.values()) {
      totalScore += claim.confidenceScore;
    }
    
    return totalScore / this.claims.size;
  }
  
  /**
   * Calculate confidence per question
   */
  private calculateQuestionConfidence(): Map<string, number> {
    const questionConfidence = new Map<string, number>();
    const questionClaims = new Map<string, Claim[]>();
    
    // Group claims by question
    for (const claim of this.claims.values()) {
      if (claim.questionId) {
        const claims = questionClaims.get(claim.questionId) || [];
        claims.push(claim);
        questionClaims.set(claim.questionId, claims);
      }
    }
    
    // Calculate max confidence per question
    for (const [questionId, claims] of questionClaims) {
      const maxConfidence = Math.max(...claims.map(c => c.confidenceScore));
      questionConfidence.set(questionId, maxConfidence);
    }
    
    return questionConfidence;
  }
  
  /**
   * Get best answer for a question
   */
  getBestAnswerForQuestion(questionId: string): Claim | null {
    const claims = this.getClaimsForQuestion(questionId);
    if (claims.length === 0) return null;
    
    // Sort by confidence score descending
    claims.sort((a, b) => b.confidenceScore - a.confidenceScore);
    
    return claims[0];
  }
  
  /**
   * Get summary statistics
   */
  getStats(): {
    totalClaims: number;
    verified: number;
    high: number;
    medium: number;
    low: number;
    uncertain: number;
    contradicted: number;
    avgConfidence: number;
    categories: string[];
    contradictionPairs: number;
  } {
    let verified = 0, high = 0, medium = 0, low = 0, uncertain = 0, contradicted = 0;
    let totalConfidence = 0;
    
    for (const claim of this.claims.values()) {
      totalConfidence += claim.confidenceScore;
      
      switch (claim.confidence) {
        case ClaimConfidence.VERIFIED: verified++; break;
        case ClaimConfidence.HIGH: high++; break;
        case ClaimConfidence.MEDIUM: medium++; break;
        case ClaimConfidence.LOW: low++; break;
        case ClaimConfidence.UNCERTAIN: uncertain++; break;
        case ClaimConfidence.CONTRADICTED: contradicted++; break;
      }
    }
    
    return {
      totalClaims: this.claims.size,
      verified,
      high,
      medium,
      low,
      uncertain,
      contradicted,
      avgConfidence: this.claims.size > 0 ? totalConfidence / this.claims.size : 0,
      categories: Array.from(this.categoryIndex.keys()),
      contradictionPairs: this.relationships.filter(r => r.type === 'contradicts').length
    };
  }
  
  /**
   * Clear all claims
   */
  clear(): void {
    this.claims.clear();
    this.relationships = [];
    this.categoryIndex.clear();
    this.valueIndex.clear();
  }
  
  /**
   * Export for persistence
   */
  export(): {
    claims: Array<[string, Claim]>;
    relationships: ClaimRelationship[];
  } {
    return {
      claims: Array.from(this.claims.entries()),
      relationships: [...this.relationships]
    };
  }
  
  /**
   * Import from persistence
   */
  import(data: {
    claims: Array<[string, Claim]>;
    relationships: ClaimRelationship[];
  }): void {
    this.clear();
    
    for (const [id, claim] of data.claims) {
      this.claims.set(id, claim);
      
      // Rebuild indexes
      if (!this.categoryIndex.has(claim.category)) {
        this.categoryIndex.set(claim.category, new Set());
      }
      this.categoryIndex.get(claim.category)!.add(claim.id);
      
      const valueKey = hashString(JSON.stringify(claim.normalizedValue));
      if (!this.valueIndex.has(valueKey)) {
        this.valueIndex.set(valueKey, new Set());
      }
      this.valueIndex.get(valueKey)!.add(claim.id);
    }
    
    this.relationships = data.relationships;
  }
}

// Export factory function
export function createClaimGraph(): ClaimGraphEngine {
  return new ClaimGraphEngine();
}
