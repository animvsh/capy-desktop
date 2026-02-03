// ============================================================================
// CAPY WEB - SOURCE INTELLIGENCE TESTS
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SourceIntelligenceEngine, createSourceIntelligence } from '../core/source-intelligence';
import { SourceTier } from '../types';

describe('SourceIntelligenceEngine', () => {
  let engine: SourceIntelligenceEngine;
  
  beforeEach(() => {
    engine = createSourceIntelligence();
  });
  
  describe('classifyDomain', () => {
    it('should classify GitHub as Tier 1', () => {
      expect(engine.classifyDomain('github.com')).toBe(SourceTier.TIER_1);
    });
    
    it('should classify .gov as Tier 1', () => {
      expect(engine.classifyDomain('sec.gov')).toBe(SourceTier.TIER_1);
      expect(engine.classifyDomain('whitehouse.gov')).toBe(SourceTier.TIER_1);
    });
    
    it('should classify docs subdomains as Tier 1', () => {
      expect(engine.classifyDomain('docs.example.com')).toBe(SourceTier.TIER_1);
    });
    
    it('should classify Crunchbase as Tier 2', () => {
      expect(engine.classifyDomain('crunchbase.com')).toBe(SourceTier.TIER_2);
    });
    
    it('should classify LinkedIn as Tier 2', () => {
      expect(engine.classifyDomain('linkedin.com')).toBe(SourceTier.TIER_2);
    });
    
    it('should classify TechCrunch as Tier 3', () => {
      expect(engine.classifyDomain('techcrunch.com')).toBe(SourceTier.TIER_3);
    });
    
    it('should classify G2 as Tier 3', () => {
      expect(engine.classifyDomain('g2.com')).toBe(SourceTier.TIER_3);
    });
    
    it('should classify Reddit as Tier 4', () => {
      expect(engine.classifyDomain('reddit.com')).toBe(SourceTier.TIER_4);
    });
    
    it('should classify Medium as Tier 5', () => {
      expect(engine.classifyDomain('medium.com')).toBe(SourceTier.TIER_5);
    });
    
    it('should strip www prefix', () => {
      expect(engine.classifyDomain('www.github.com')).toBe(SourceTier.TIER_1);
    });
    
    it('should default to Tier 3 for unknown domains', () => {
      expect(engine.classifyDomain('unknown-site.xyz')).toBe(SourceTier.TIER_3);
    });
  });
  
  describe('scoreDomain', () => {
    it('should return higher scores for authoritative sources', () => {
      const githubScore = engine.scoreDomain('github.com');
      const redditScore = engine.scoreDomain('reddit.com');
      
      expect(githubScore.overallScore).toBeGreaterThan(redditScore.overallScore);
    });
    
    it('should include all score dimensions', () => {
      const score = engine.scoreDomain('github.com');
      
      expect(score.scores.authority).toBeDefined();
      expect(score.scores.originality).toBeDefined();
      expect(score.scores.freshness).toBeDefined();
      expect(score.scores.specificity).toBeDefined();
      expect(score.scores.consistency).toBeDefined();
    });
    
    it('should update lastUpdated timestamp', () => {
      const before = Date.now();
      const score = engine.scoreDomain('example.com');
      
      expect(score.lastUpdated).toBeGreaterThanOrEqual(before);
    });
  });
  
  describe('shouldAvoid', () => {
    it('should avoid blocked domains', () => {
      expect(engine.shouldAvoid('pinterest.com')).toBe(true);
      expect(engine.shouldAvoid('facebook.com')).toBe(true);
    });
    
    it('should avoid Tier 5 domains', () => {
      expect(engine.shouldAvoid('medium.com')).toBe(true);
    });
    
    it('should not avoid good sources', () => {
      expect(engine.shouldAvoid('github.com')).toBe(false);
      expect(engine.shouldAvoid('docs.example.com')).toBe(false);
    });
  });
  
  describe('rankDomains', () => {
    it('should rank domains by tier and score', () => {
      const domains = ['reddit.com', 'github.com', 'medium.com', 'techcrunch.com'];
      const ranked = engine.rankDomains(domains);
      
      // GitHub should be first (Tier 1)
      expect(ranked[0]).toBe('github.com');
      
      // Medium should be filtered out (Tier 5)
      expect(ranked).not.toContain('medium.com');
    });
    
    it('should filter out blocked domains', () => {
      const domains = ['github.com', 'pinterest.com', 'facebook.com'];
      const ranked = engine.rankDomains(domains);
      
      expect(ranked).toContain('github.com');
      expect(ranked).not.toContain('pinterest.com');
      expect(ranked).not.toContain('facebook.com');
    });
  });
  
  describe('updateSourceIntelligence', () => {
    it('should track visit success rate', () => {
      engine.updateSourceIntelligence('example.com', {
        success: true,
        url: 'https://example.com/page1',
        extractionYield: 5
      });
      
      const intel = engine.getSourceIntelligence('example.com');
      expect(intel).not.toBeNull();
      expect(intel!.successRate).toBeGreaterThan(0);
    });
    
    it('should update extraction yield', () => {
      engine.updateSourceIntelligence('example.com', {
        success: true,
        url: 'https://example.com/page1',
        extractionYield: 10
      });
      
      const intel = engine.getSourceIntelligence('example.com');
      // Uses exponential moving average, so first update is alpha * 10
      expect(intel!.avgExtractionYield).toBeGreaterThan(0);
    });
    
    it('should track blocked paths', () => {
      engine.updateSourceIntelligence('example.com', {
        success: false,
        url: 'https://example.com/blocked',
        extractionYield: 0,
        blockedPaths: ['/blocked']
      });
      
      const intel = engine.getSourceIntelligence('example.com');
      expect(intel!.blockedPaths).toContain('/blocked');
    });
  });
  
  describe('updateConsistency', () => {
    it('should update consistency scores based on agreement', () => {
      engine.updateConsistency([
        { domain: 'site1.com', value: 'same' },
        { domain: 'site2.com', value: 'same' }
      ]);
      
      // Both should have increased consistency
      const score1 = engine.scoreDomain('site1.com');
      const score2 = engine.scoreDomain('site2.com');
      
      expect(score1.scores.consistency).toBeGreaterThanOrEqual(0.5);
      expect(score2.scores.consistency).toBeGreaterThanOrEqual(0.5);
    });
  });
  
  describe('exportState / importState', () => {
    it('should export and import state correctly', () => {
      // Score some domains
      engine.scoreDomain('github.com');
      engine.scoreDomain('example.com');
      
      engine.updateSourceIntelligence('example.com', {
        success: true,
        url: 'https://example.com',
        extractionYield: 5
      });
      
      // Export
      const state = engine.exportState();
      
      // Create new engine and import
      const newEngine = createSourceIntelligence();
      newEngine.importState(state);
      
      // Verify
      const intel = newEngine.getSourceIntelligence('example.com');
      expect(intel).not.toBeNull();
      expect(intel!.avgExtractionYield).toBeGreaterThan(0);
    });
  });
});
