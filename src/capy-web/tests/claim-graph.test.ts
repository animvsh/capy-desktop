// ============================================================================
// CAPY WEB - CLAIM GRAPH TESTS
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ClaimGraphEngine, createClaimGraph } from '../core/claim-graph';
import { SourceTier, ClaimConfidence, ExtractionResult } from '../types';

describe('ClaimGraphEngine', () => {
  let engine: ClaimGraphEngine;
  
  beforeEach(() => {
    engine = createClaimGraph();
  });
  
  const createMockExtraction = (data: Record<string, unknown>): ExtractionResult => ({
    schemaName: 'test',
    data,
    confidence: 0.8,
    sourceUrl: 'https://example.com',
    timestamp: Date.now(),
    hash: Math.random().toString(36)
  });
  
  describe('createClaim', () => {
    it('should create a new claim from extraction', () => {
      const extraction = createMockExtraction({ name: 'Test Company' });
      
      const claim = engine.createClaim(
        extraction,
        'https://example.com',
        SourceTier.TIER_1,
        'q1',
        'company_info'
      );
      
      expect(claim.id).toBeDefined();
      expect(claim.text).toContain('name');
      expect(claim.category).toBe('company_info');
      expect(claim.questionId).toBe('q1');
      expect(claim.sources).toHaveLength(1);
    });
    
    it('should assign higher confidence to Tier 1 sources', () => {
      const extraction = createMockExtraction({ value: 'test' });
      
      const tier1Claim = engine.createClaim(
        extraction,
        'https://tier1.com',
        SourceTier.TIER_1
      );
      
      // Clear and create tier 4 claim
      engine.clear();
      
      const tier4Claim = engine.createClaim(
        extraction,
        'https://tier4.com',
        SourceTier.TIER_4
      );
      
      expect(tier1Claim.confidenceScore).toBeGreaterThan(tier4Claim.confidenceScore);
    });
    
    it('should merge similar claims from different sources', () => {
      const extraction1 = createMockExtraction({ price: '$10/month' });
      const extraction2 = createMockExtraction({ price: '$10/month' });
      
      const claim1 = engine.createClaim(
        extraction1,
        'https://source1.com',
        SourceTier.TIER_2,
        'q1',
        'pricing'
      );
      
      const claim2 = engine.createClaim(
        extraction2,
        'https://source2.com',
        SourceTier.TIER_3,
        'q1',
        'pricing'
      );
      
      // Should be merged (same claim returned)
      expect(claim1.id).toBe(claim2.id);
      expect(claim1.sources).toHaveLength(2);
      expect(claim1.corroborationCount).toBe(1);
    });
    
    it('should detect contradictions', () => {
      const extraction1 = createMockExtraction({ employees: '100' });
      const extraction2 = createMockExtraction({ employees: '500' });
      
      engine.createClaim(
        extraction1,
        'https://source1.com',
        SourceTier.TIER_2,
        'q1',
        'company_info'
      );
      
      engine.createClaim(
        extraction2,
        'https://source2.com',
        SourceTier.TIER_2,
        'q1',
        'company_info'
      );
      
      const claims = engine.getAllClaims();
      const hasContradiction = claims.some(c => c.contradictionCount > 0);
      
      expect(hasContradiction).toBe(true);
    });
  });
  
  describe('confidence levels', () => {
    it('should mark claims as verified with multiple corroborations', () => {
      const extraction = createMockExtraction({ fact: 'verified' });
      
      // Create initial claim
      engine.createClaim(extraction, 'https://source1.com', SourceTier.TIER_1, 'q1', 'test');
      
      // Add corroborating sources
      engine.createClaim(extraction, 'https://source2.com', SourceTier.TIER_2, 'q1', 'test');
      engine.createClaim(extraction, 'https://source3.com', SourceTier.TIER_2, 'q1', 'test');
      
      const claims = engine.getVerifiedClaims();
      expect(claims.length).toBeGreaterThan(0);
    });
    
    it('should mark contradicted claims appropriately', () => {
      // Create conflicting claims
      engine.createClaim(
        createMockExtraction({ status: 'active' }),
        'https://source1.com',
        SourceTier.TIER_2,
        'q1',
        'status'
      );
      
      engine.createClaim(
        createMockExtraction({ status: 'inactive' }),
        'https://source2.com',
        SourceTier.TIER_2,
        'q1',
        'status'
      );
      
      const contradicted = engine.getContradictedClaims();
      // At least one should be marked as contradicted if confidence drops enough
      const allClaims = engine.getAllClaims();
      const hasContradiction = allClaims.some(c => c.contradictionCount > 0);
      
      expect(hasContradiction).toBe(true);
    });
  });
  
  describe('getClaim', () => {
    it('should retrieve claim by ID', () => {
      const extraction = createMockExtraction({ test: 'data' });
      const claim = engine.createClaim(extraction, 'https://example.com', SourceTier.TIER_1);
      
      const retrieved = engine.getClaim(claim.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(claim.id);
    });
    
    it('should return null for non-existent ID', () => {
      const retrieved = engine.getClaim('non-existent');
      expect(retrieved).toBeNull();
    });
  });
  
  describe('getClaimsByCategory', () => {
    it('should filter claims by category', () => {
      engine.createClaim(
        createMockExtraction({ price: '$10' }),
        'https://example.com',
        SourceTier.TIER_1,
        undefined,
        'pricing'
      );
      
      engine.createClaim(
        createMockExtraction({ name: 'Test' }),
        'https://example.com',
        SourceTier.TIER_1,
        undefined,
        'company_info'
      );
      
      const pricingClaims = engine.getClaimsByCategory('pricing');
      expect(pricingClaims).toHaveLength(1);
      expect(pricingClaims[0].category).toBe('pricing');
    });
  });
  
  describe('getClaimsForQuestion', () => {
    it('should filter claims by question ID', () => {
      engine.createClaim(
        createMockExtraction({ answer: 'A' }),
        'https://example.com',
        SourceTier.TIER_1,
        'q1'
      );
      
      engine.createClaim(
        createMockExtraction({ answer: 'B' }),
        'https://example.com',
        SourceTier.TIER_1,
        'q2'
      );
      
      const q1Claims = engine.getClaimsForQuestion('q1');
      expect(q1Claims).toHaveLength(1);
      expect(q1Claims[0].questionId).toBe('q1');
    });
  });
  
  describe('getBestAnswerForQuestion', () => {
    it('should return highest confidence claim', () => {
      // Lower confidence (Tier 4)
      engine.createClaim(
        createMockExtraction({ answer: 'low' }),
        'https://tier4.com',
        SourceTier.TIER_4,
        'q1'
      );
      
      // Higher confidence (Tier 1)
      engine.createClaim(
        createMockExtraction({ answer: 'high' }),
        'https://tier1.com',
        SourceTier.TIER_1,
        'q1'
      );
      
      const best = engine.getBestAnswerForQuestion('q1');
      expect(best).not.toBeNull();
      expect(best!.primarySourceTier).toBe(SourceTier.TIER_1);
    });
    
    it('should return null for questions with no claims', () => {
      const best = engine.getBestAnswerForQuestion('unknown');
      expect(best).toBeNull();
    });
  });
  
  describe('getGraph', () => {
    it('should return complete claim graph', () => {
      engine.createClaim(
        createMockExtraction({ a: 1 }),
        'https://example.com',
        SourceTier.TIER_1
      );
      
      const graph = engine.getGraph();
      
      expect(graph.claims.size).toBe(1);
      expect(graph.relationships).toBeDefined();
      expect(typeof graph.overallConfidence).toBe('number');
    });
  });
  
  describe('getStats', () => {
    it('should return accurate statistics', () => {
      engine.createClaim(
        createMockExtraction({ a: 1 }),
        'https://example.com',
        SourceTier.TIER_1,
        'q1',
        'cat1'
      );
      
      engine.createClaim(
        createMockExtraction({ b: 2 }),
        'https://example.com',
        SourceTier.TIER_1,
        'q2',
        'cat2'
      );
      
      const stats = engine.getStats();
      
      expect(stats.totalClaims).toBe(2);
      expect(stats.categories).toContain('cat1');
      expect(stats.categories).toContain('cat2');
      expect(typeof stats.avgConfidence).toBe('number');
    });
  });
  
  describe('export / import', () => {
    it('should export and import correctly', () => {
      engine.createClaim(
        createMockExtraction({ test: 'data' }),
        'https://example.com',
        SourceTier.TIER_1,
        'q1',
        'test'
      );
      
      const exported = engine.export();
      
      const newEngine = createClaimGraph();
      newEngine.import(exported);
      
      expect(newEngine.getAllClaims()).toHaveLength(1);
      expect(newEngine.getClaimsByCategory('test')).toHaveLength(1);
    });
  });
  
  describe('clear', () => {
    it('should remove all claims', () => {
      engine.createClaim(
        createMockExtraction({ a: 1 }),
        'https://example.com',
        SourceTier.TIER_1
      );
      
      engine.clear();
      
      expect(engine.getAllClaims()).toHaveLength(0);
      expect(engine.getStats().totalClaims).toBe(0);
    });
  });
});
