// ============================================================================
// CAPY WEB - PLANNER BRAIN TESTS
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { PlannerBrain, createPlannerBrain } from '../core/planner-brain';
import { OperatorMode, SourceTier } from '../types';

describe('PlannerBrain', () => {
  let planner: PlannerBrain;
  
  beforeEach(() => {
    planner = createPlannerBrain(OperatorMode.STANDARD);
  });
  
  describe('generatePlan', () => {
    it('should generate a valid plan for pricing queries', async () => {
      const plan = await planner.generatePlan({
        query: 'What is the pricing for Notion?'
      });
      
      expect(plan.isValid).toBe(true);
      expect(plan.primaryQuestions.length).toBeGreaterThan(0);
      expect(plan.targetDomains.length).toBeGreaterThan(0);
      expect(plan.executionPaths.length).toBeGreaterThan(0);
    });
    
    it('should generate a valid plan for feature queries', async () => {
      const plan = await planner.generatePlan({
        query: 'What are the main features of Slack?'
      });
      
      expect(plan.isValid).toBe(true);
      expect(plan.primaryQuestions.some(q => 
        q.question.toLowerCase().includes('feature')
      )).toBe(true);
    });
    
    it('should generate a valid plan for technical queries', async () => {
      const plan = await planner.generatePlan({
        query: 'What tech stack does Linear use?'
      });
      
      expect(plan.isValid).toBe(true);
      expect(plan.targetDomains.some(d => 
        d.domain === 'github.com'
      )).toBe(true);
    });
    
    it('should respect confidence requirements', async () => {
      const plan = await planner.generatePlan({
        query: 'What is the pricing for Notion?',
        confidenceRequirement: 0.95
      });
      
      expect(plan.confidenceThreshold).toBe(0.95);
    });
    
    it('should include known domains', async () => {
      const plan = await planner.generatePlan({
        query: 'Tell me about this company',
        knownDomains: ['example.com']
      });
      
      expect(plan.targetDomains.some(d => 
        d.domain === 'example.com'
      )).toBe(true);
    });
    
    it('should apply mode-specific budgets', async () => {
      const lightningPlanner = createPlannerBrain(OperatorMode.LIGHTNING);
      const deepPlanner = createPlannerBrain(OperatorMode.DEEP_RESEARCH);
      
      const lightningPlan = await lightningPlanner.generatePlan({
        query: 'What is Notion?'
      });
      
      const deepPlan = await deepPlanner.generatePlan({
        query: 'What is Notion?'
      });
      
      expect(lightningPlan.budgets.maxPages).toBeLessThan(deepPlan.budgets.maxPages);
      expect(lightningPlan.budgets.maxTimeMs).toBeLessThan(deepPlan.budgets.maxTimeMs);
    });
    
    it('should generate extraction schemas', async () => {
      const plan = await planner.generatePlan({
        query: 'What is the pricing for Notion?'
      });
      
      expect(plan.extractionSchemas.length).toBeGreaterThan(0);
      expect(plan.extractionSchemas.some(s => s.name === 'pricing')).toBe(true);
    });
  });
  
  describe('validatePlan', () => {
    it('should validate a valid plan', async () => {
      const plan = await planner.generatePlan({
        query: 'What is the pricing for Notion?'
      });
      
      const validation = planner.validatePlan(plan);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
    
    it('should detect invalid plans', () => {
      const invalidPlan = {
        id: 'test',
        objective: { query: 'test' },
        createdAt: Date.now(),
        primaryQuestions: [],  // Empty - invalid
        expectedAnswerTypes: [],
        sourceCategories: [],
        targetDomains: [],  // Empty - invalid
        domainExpectations: [],
        extractionSchemas: [],
        confidenceThreshold: 0.8,
        budgets: {
          maxTimeMs: 0,  // Too low
          maxPages: 0,   // Too low
          maxConcurrency: 1,
          maxCostUnits: 10,
          marginalGainFloor: 0.02
        },
        executionPaths: [],  // Empty - invalid
        isValid: false
      };
      
      const validation = planner.validatePlan(invalidPlan);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
  
  describe('adjustPlan', () => {
    it('should reduce priority of satisfied questions', async () => {
      const plan = await planner.generatePlan({
        query: 'What is the pricing for Notion?'
      });
      
      const confidenceState = {
        overall: 0.5,
        perQuestion: new Map([[plan.primaryQuestions[0].id, 0.9]])
      };
      
      const adjustedPlan = planner.adjustPlan(plan, confidenceState);
      
      // Paths should be re-sorted
      expect(adjustedPlan.executionPaths[0].priority).toBeGreaterThanOrEqual(
        adjustedPlan.executionPaths[adjustedPlan.executionPaths.length - 1].priority
      );
    });
  });
});

describe('Question Decomposition', () => {
  let planner: PlannerBrain;
  
  beforeEach(() => {
    planner = createPlannerBrain();
  });
  
  it('should detect pricing questions', async () => {
    const queries = [
      'How much does Slack cost?',
      'What are the pricing plans for Notion?',
      'Is there a free tier for Linear?'
    ];
    
    for (const query of queries) {
      const plan = await planner.generatePlan({ query });
      // Should have pricing extraction schema
      expect(plan.extractionSchemas.some(s => s.name === 'pricing')).toBe(true);
    }
  });
  
  it('should detect security/compliance questions', async () => {
    const plan = await planner.generatePlan({
      query: 'Is Notion SOC 2 compliant?'
    });
    
    // Should have security extraction schema
    expect(plan.extractionSchemas.some(s => s.name === 'security')).toBe(true);
  });
  
  it('should detect company info questions', async () => {
    const plan = await planner.generatePlan({
      query: 'When was Stripe founded?'
    });
    
    expect(plan.primaryQuestions.some(q => 
      q.question.toLowerCase().includes('founded') ||
      q.question.toLowerCase().includes('history')
    )).toBe(true);
  });
});
