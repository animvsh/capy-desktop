// ============================================================================
// CAPY WEB - PLANNER BRAIN
// The Most Important Part: Plans before browsing
// ============================================================================

import {
  ResearchObjective,
  ResearchPlan,
  PrimaryQuestion,
  AnswerType,
  SourceCategory,
  RankedDomain,
  DomainExpectation,
  ExtractionSchema,
  ExecutionBudgets,
  ExecutionPath,
  OperatorMode,
  SourceTier
} from '../types';
import { generateId } from '../utils/helpers';

// ============================================================================
// PLANNER CONFIGURATION
// ============================================================================

const MODE_BUDGETS: Record<OperatorMode, ExecutionBudgets> = {
  [OperatorMode.LIGHTNING]: {
    maxTimeMs: 30000,
    maxPages: 10,
    maxConcurrency: 5,
    maxCostUnits: 10,
    marginalGainFloor: 0.05
  },
  [OperatorMode.STANDARD]: {
    maxTimeMs: 120000,
    maxPages: 30,
    maxConcurrency: 3,
    maxCostUnits: 50,
    marginalGainFloor: 0.02
  },
  [OperatorMode.DEEP_RESEARCH]: {
    maxTimeMs: 600000,
    maxPages: 100,
    maxConcurrency: 5,
    maxCostUnits: 200,
    marginalGainFloor: 0.01
  },
  [OperatorMode.COMPLIANCE]: {
    maxTimeMs: 300000,
    maxPages: 50,
    maxConcurrency: 2,
    maxCostUnits: 100,
    marginalGainFloor: 0.03
  },
  [OperatorMode.SIMULATION]: {
    maxTimeMs: 0,
    maxPages: 0,
    maxConcurrency: 0,
    maxCostUnits: 0,
    marginalGainFloor: 1
  }
};

// ============================================================================
// QUESTION DECOMPOSITION
// ============================================================================

interface QuestionPattern {
  pattern: RegExp;
  questionType: string;
  expectedAnswerType: AnswerType['expectedType'];
  sourceCategories: SourceCategory['category'][];
  extractionHints: string[];
}

const QUESTION_PATTERNS: QuestionPattern[] = [
  {
    pattern: /(?:pricing|cost|price|how much|subscription|plans?)/i,
    questionType: 'pricing',
    expectedAnswerType: 'structured',
    sourceCategories: ['official', 'docs'],
    extractionHints: ['pricing-page', 'plans-section', 'pricing-table']
  },
  {
    pattern: /(?:features?|capabilities|what can|does it|functionality)/i,
    questionType: 'features',
    expectedAnswerType: 'list',
    sourceCategories: ['official', 'docs'],
    extractionHints: ['features-section', 'product-page', 'docs']
  },
  {
    pattern: /(?:tech stack|technologies|built with|framework|language)/i,
    questionType: 'technical',
    expectedAnswerType: 'list',
    sourceCategories: ['code', 'docs'],
    extractionHints: ['github-repo', 'docs', 'blog']
  },
  {
    pattern: /(?:founded|started|when was|history|origin)/i,
    questionType: 'company_history',
    expectedAnswerType: 'date',
    sourceCategories: ['official', 'news', 'filings'],
    extractionHints: ['about-page', 'press', 'crunchbase']
  },
  {
    pattern: /(?:employees?|team size|headcount|how many people)/i,
    questionType: 'company_size',
    expectedAnswerType: 'number',
    sourceCategories: ['official', 'filings', 'news'],
    extractionHints: ['about-page', 'linkedin', 'crunchbase']
  },
  {
    pattern: /(?:security|compliance|soc|gdpr|hipaa|certifications?)/i,
    questionType: 'security',
    expectedAnswerType: 'structured',
    sourceCategories: ['official', 'docs'],
    extractionHints: ['security-page', 'trust-center', 'compliance']
  },
  {
    pattern: /(?:integrate|integration|api|connect|webhook)/i,
    questionType: 'integrations',
    expectedAnswerType: 'list',
    sourceCategories: ['docs', 'official'],
    extractionHints: ['integrations-page', 'api-docs', 'marketplace']
  },
  {
    pattern: /(?:competitors?|alternatives?|vs|compared to|similar)/i,
    questionType: 'competitive',
    expectedAnswerType: 'list',
    sourceCategories: ['reviews', 'news'],
    extractionHints: ['comparison-sites', 'reviews', 'g2']
  },
  {
    pattern: /(?:funding|investors?|raised|valuation|series)/i,
    questionType: 'funding',
    expectedAnswerType: 'structured',
    sourceCategories: ['filings', 'news'],
    extractionHints: ['crunchbase', 'press-releases', 'techcrunch']
  },
  {
    pattern: /(?:contact|email|phone|address|headquarters|location)/i,
    questionType: 'contact',
    expectedAnswerType: 'structured',
    sourceCategories: ['official'],
    extractionHints: ['contact-page', 'about-page', 'footer']
  }
];

// ============================================================================
// DOMAIN INTELLIGENCE
// ============================================================================

interface DomainTemplate {
  pattern: RegExp;
  tier: SourceTier;
  contentTypes: string[];
  commonPaths: string[];
}

const DOMAIN_TEMPLATES: DomainTemplate[] = [
  {
    pattern: /github\.com/i,
    tier: SourceTier.TIER_1,
    contentTypes: ['code', 'docs', 'technical'],
    commonPaths: ['/', '/blob/main/README.md', '/releases', '/issues']
  },
  {
    pattern: /docs\.|documentation\./i,
    tier: SourceTier.TIER_1,
    contentTypes: ['docs', 'technical'],
    commonPaths: ['/', '/getting-started', '/api']
  },
  {
    pattern: /\.gov$/i,
    tier: SourceTier.TIER_1,
    contentTypes: ['official', 'filings'],
    commonPaths: ['/']
  },
  {
    pattern: /crunchbase\.com/i,
    tier: SourceTier.TIER_2,
    contentTypes: ['company_info', 'funding'],
    commonPaths: ['/organization/']
  },
  {
    pattern: /linkedin\.com/i,
    tier: SourceTier.TIER_2,
    contentTypes: ['company_info', 'employees'],
    commonPaths: ['/company/']
  },
  {
    pattern: /techcrunch|bloomberg|reuters|wsj/i,
    tier: SourceTier.TIER_3,
    contentTypes: ['news', 'funding'],
    commonPaths: ['/']
  },
  {
    pattern: /g2\.com|capterra|trustradius/i,
    tier: SourceTier.TIER_3,
    contentTypes: ['reviews', 'competitive'],
    commonPaths: ['/products/']
  },
  {
    pattern: /reddit\.com|quora\.com/i,
    tier: SourceTier.TIER_4,
    contentTypes: ['opinions', 'reviews'],
    commonPaths: ['/']
  }
];

// ============================================================================
// PLANNER BRAIN CLASS
// ============================================================================

export class PlannerBrain {
  private mode: OperatorMode;
  
  constructor(mode: OperatorMode = OperatorMode.STANDARD) {
    this.mode = mode;
  }
  
  /**
   * Generate a complete research plan from an objective
   * If a plan cannot be produced, execution must not begin
   */
  async generatePlan(objective: ResearchObjective): Promise<ResearchPlan> {
    const planId = generateId();
    const errors: string[] = [];
    
    // Step 1: Decompose the objective into primary questions
    const primaryQuestions = this.decompose(objective);
    if (primaryQuestions.length === 0) {
      errors.push('Could not decompose objective into actionable questions');
    }
    
    // Step 2: Determine expected answer types
    const expectedAnswerTypes = this.determineAnswerTypes(primaryQuestions);
    
    // Step 3: Identify source categories needed
    const sourceCategories = this.identifySourceCategories(primaryQuestions);
    
    // Step 4: Rank target domains
    const targetDomains = this.rankTargetDomains(objective, primaryQuestions);
    if (targetDomains.length === 0) {
      errors.push('Could not identify any target domains');
    }
    
    // Step 5: Set domain expectations
    const domainExpectations = this.setDomainExpectations(targetDomains, primaryQuestions);
    
    // Step 6: Generate extraction schemas
    const extractionSchemas = this.generateExtractionSchemas(primaryQuestions, expectedAnswerTypes);
    
    // Step 7: Set budgets based on mode and constraints
    const budgets = this.calculateBudgets(objective);
    
    // Step 8: Generate execution paths
    const executionPaths = this.generateExecutionPaths(
      targetDomains,
      primaryQuestions,
      sourceCategories
    );
    
    // Step 9: Calculate confidence threshold
    const confidenceThreshold = objective.confidenceRequirement ?? 0.8;
    
    const plan: ResearchPlan = {
      id: planId,
      objective,
      createdAt: Date.now(),
      primaryQuestions,
      expectedAnswerTypes,
      sourceCategories,
      targetDomains,
      domainExpectations,
      extractionSchemas,
      confidenceThreshold,
      budgets,
      executionPaths,
      isValid: errors.length === 0,
      validationErrors: errors.length > 0 ? errors : undefined
    };
    
    return plan;
  }
  
  /**
   * Decompose objective into primary questions
   */
  private decompose(objective: ResearchObjective): PrimaryQuestion[] {
    const questions: PrimaryQuestion[] = [];
    const query = objective.query.toLowerCase();
    
    // Match against question patterns
    for (const pattern of QUESTION_PATTERNS) {
      if (pattern.pattern.test(query)) {
        questions.push({
          id: generateId(),
          question: this.generateQuestionFromPattern(objective.query, pattern),
          priority: questions.length === 0 ? 10 : 5,
          requiredConfidence: 0.7,
          relatedQuestions: []
        });
      }
    }
    
    // If no patterns matched, create a generic question
    if (questions.length === 0) {
      questions.push({
        id: generateId(),
        question: objective.query,
        priority: 10,
        requiredConfidence: 0.7,
        relatedQuestions: []
      });
    }
    
    // Add contextual follow-up questions
    if (objective.context) {
      const contextQuestions = this.generateContextualQuestions(objective.context, questions);
      questions.push(...contextQuestions);
    }
    
    return questions;
  }
  
  /**
   * Generate a specific question from a pattern match
   */
  private generateQuestionFromPattern(query: string, pattern: QuestionPattern): string {
    // Extract the subject from the query
    const subject = this.extractSubject(query);
    
    switch (pattern.questionType) {
      case 'pricing':
        return `What is the pricing structure for ${subject}?`;
      case 'features':
        return `What are the key features and capabilities of ${subject}?`;
      case 'technical':
        return `What technologies and frameworks does ${subject} use?`;
      case 'company_history':
        return `When was ${subject} founded and what is its history?`;
      case 'company_size':
        return `How many employees does ${subject} have?`;
      case 'security':
        return `What security certifications and compliance does ${subject} have?`;
      case 'integrations':
        return `What integrations and APIs does ${subject} offer?`;
      case 'competitive':
        return `What are the main competitors and alternatives to ${subject}?`;
      case 'funding':
        return `What is the funding history and investors of ${subject}?`;
      case 'contact':
        return `What are the contact details for ${subject}?`;
      default:
        return query;
    }
  }
  
  /**
   * Extract the main subject from a query
   */
  private extractSubject(query: string): string {
    // Remove common question words and extract the subject
    const cleaned = query
      .replace(/^(what|who|when|where|how|why|is|are|does|do|can|could|would|tell me about|find|search|look up)\s+/i, '')
      .replace(/\?$/, '')
      .trim();
    
    // Try to find company/product names (capitalized words)
    const capitalizedMatch = cleaned.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/);
    if (capitalizedMatch) {
      return capitalizedMatch[1];
    }
    
    return cleaned;
  }
  
  /**
   * Generate contextual follow-up questions
   */
  private generateContextualQuestions(
    context: string,
    existingQuestions: PrimaryQuestion[]
  ): PrimaryQuestion[] {
    const contextQuestions: PrimaryQuestion[] = [];
    
    // Analyze context for additional question opportunities
    if (/compare|versus|vs\.|alternative/i.test(context)) {
      contextQuestions.push({
        id: generateId(),
        question: 'How does this compare to alternatives?',
        priority: 3,
        requiredConfidence: 0.6,
        relatedQuestions: existingQuestions.map(q => q.id)
      });
    }
    
    if (/recent|latest|new|update/i.test(context)) {
      contextQuestions.push({
        id: generateId(),
        question: 'What are the most recent updates or changes?',
        priority: 4,
        requiredConfidence: 0.6,
        relatedQuestions: existingQuestions.map(q => q.id)
      });
    }
    
    return contextQuestions;
  }
  
  /**
   * Determine expected answer types for questions
   */
  private determineAnswerTypes(questions: PrimaryQuestion[]): AnswerType[] {
    return questions.map(q => {
      for (const pattern of QUESTION_PATTERNS) {
        if (pattern.pattern.test(q.question)) {
          return {
            questionId: q.id,
            expectedType: pattern.expectedAnswerType,
            format: this.getFormatForType(pattern.expectedAnswerType),
            unit: this.getUnitForType(pattern.questionType)
          };
        }
      }
      return {
        questionId: q.id,
        expectedType: 'string' as const,
        format: undefined,
        unit: undefined
      };
    });
  }
  
  private getFormatForType(type: AnswerType['expectedType']): string | undefined {
    const formats: Record<string, string> = {
      date: 'ISO8601',
      number: 'decimal',
      structured: 'JSON'
    };
    return formats[type];
  }
  
  private getUnitForType(questionType: string): string | undefined {
    const units: Record<string, string> = {
      pricing: 'USD',
      company_size: 'employees',
      funding: 'USD'
    };
    return units[questionType];
  }
  
  /**
   * Identify source categories needed
   */
  private identifySourceCategories(questions: PrimaryQuestion[]): SourceCategory[] {
    const categoryMap = new Map<SourceCategory['category'], number>();
    
    for (const question of questions) {
      for (const pattern of QUESTION_PATTERNS) {
        if (pattern.pattern.test(question.question)) {
          for (const category of pattern.sourceCategories) {
            const current = categoryMap.get(category) || 0;
            categoryMap.set(category, current + 1);
          }
        }
      }
    }
    
    // Always include official sources
    if (!categoryMap.has('official')) {
      categoryMap.set('official', 5);
    }
    
    // Convert to sorted array
    const categories: SourceCategory[] = Array.from(categoryMap.entries())
      .map(([category, priority]) => ({
        category,
        priority,
        maxSources: Math.min(priority * 2, 10)
      }))
      .sort((a, b) => b.priority - a.priority);
    
    return categories;
  }
  
  /**
   * Rank target domains based on objective and questions
   */
  private rankTargetDomains(
    objective: ResearchObjective,
    questions: PrimaryQuestion[]
  ): RankedDomain[] {
    const domains: RankedDomain[] = [];
    const subject = this.extractSubject(objective.query);
    
    // Add known domains from objective
    if (objective.knownDomains) {
      for (const domain of objective.knownDomains) {
        domains.push({
          domain,
          expectedTier: SourceTier.TIER_1,
          relevanceScore: 1.0,
          expectedContent: ['primary'],
          urlPatterns: [`https://${domain}/*`]
        });
      }
    }
    
    // Infer primary domain from subject
    const primaryDomain = this.inferPrimaryDomain(subject);
    if (primaryDomain && !domains.find(d => d.domain === primaryDomain)) {
      domains.push({
        domain: primaryDomain,
        expectedTier: SourceTier.TIER_1,
        relevanceScore: 0.95,
        expectedContent: ['official', 'product'],
        urlPatterns: [`https://${primaryDomain}/*`, `https://www.${primaryDomain}/*`]
      });
    }
    
    // Add question-specific domains
    for (const question of questions) {
      const questionDomains = this.getDomainsForQuestion(question, subject);
      for (const qd of questionDomains) {
        if (!domains.find(d => d.domain === qd.domain)) {
          domains.push(qd);
        }
      }
    }
    
    // Sort by relevance
    return domains.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
  
  /**
   * Infer primary domain from subject
   */
  private inferPrimaryDomain(subject: string): string | null {
    // Try common patterns
    const cleaned = subject.toLowerCase().replace(/\s+/g, '');
    
    // Common TLDs to try
    const tlds = ['.com', '.io', '.ai', '.co', '.app', '.dev'];
    
    // Return the most likely domain
    for (const tld of tlds) {
      const domain = cleaned + tld;
      return domain;  // Return first guess, will be validated during execution
    }
    
    return null;
  }
  
  /**
   * Get domains relevant to a specific question
   */
  private getDomainsForQuestion(question: PrimaryQuestion, subject: string): RankedDomain[] {
    const domains: RankedDomain[] = [];
    
    for (const pattern of QUESTION_PATTERNS) {
      if (pattern.pattern.test(question.question)) {
        switch (pattern.questionType) {
          case 'technical':
            domains.push({
              domain: 'github.com',
              expectedTier: SourceTier.TIER_1,
              relevanceScore: 0.8,
              expectedContent: ['code', 'technical'],
              urlPatterns: [`https://github.com/*/${subject.toLowerCase()}`]
            });
            break;
          case 'funding':
          case 'company_history':
            domains.push({
              domain: 'crunchbase.com',
              expectedTier: SourceTier.TIER_2,
              relevanceScore: 0.7,
              expectedContent: ['company', 'funding'],
              urlPatterns: [`https://www.crunchbase.com/organization/${subject.toLowerCase()}`]
            });
            break;
          case 'competitive':
            domains.push({
              domain: 'g2.com',
              expectedTier: SourceTier.TIER_3,
              relevanceScore: 0.6,
              expectedContent: ['reviews', 'competitive'],
              urlPatterns: [`https://www.g2.com/products/${subject.toLowerCase()}`]
            });
            break;
        }
      }
    }
    
    return domains;
  }
  
  /**
   * Set expectations for each domain
   */
  private setDomainExpectations(
    domains: RankedDomain[],
    questions: PrimaryQuestion[]
  ): DomainExpectation[] {
    return domains.map(domain => {
      const expectations: DomainExpectation = {
        domain: domain.domain,
        expectedPages: [],
        extractionTargets: [],
        navigationType: 'direct'
      };
      
      // Match domain to template for expected pages
      for (const template of DOMAIN_TEMPLATES) {
        if (template.pattern.test(domain.domain)) {
          expectations.expectedPages = template.commonPaths.map(
            path => `https://${domain.domain}${path}`
          );
          break;
        }
      }
      
      // If no template, use generic paths
      if (expectations.expectedPages.length === 0) {
        expectations.expectedPages = [
          `https://${domain.domain}/`,
          `https://${domain.domain}/about`,
          `https://${domain.domain}/pricing`,
          `https://${domain.domain}/features`
        ];
      }
      
      // Set extraction targets based on questions
      for (const question of questions) {
        for (const pattern of QUESTION_PATTERNS) {
          if (pattern.pattern.test(question.question)) {
            expectations.extractionTargets.push(...pattern.extractionHints);
          }
        }
      }
      
      return expectations;
    });
  }
  
  /**
   * Generate extraction schemas for the questions
   */
  private generateExtractionSchemas(
    questions: PrimaryQuestion[],
    answerTypes: AnswerType[]
  ): ExtractionSchema[] {
    const schemas: ExtractionSchema[] = [];
    
    // Common extraction schemas
    schemas.push({
      name: 'company_info',
      fields: [
        { name: 'name', type: 'string', required: true },
        { name: 'description', type: 'string', required: false },
        { name: 'founded', type: 'date', required: false },
        { name: 'location', type: 'string', required: false },
        { name: 'employees', type: 'number', required: false }
      ],
      sourcePatterns: ['about', 'company', 'team']
    });
    
    schemas.push({
      name: 'pricing',
      fields: [
        { name: 'plans', type: 'list', required: true },
        { name: 'currency', type: 'string', required: false },
        { name: 'billing_options', type: 'list', required: false },
        { name: 'free_tier', type: 'boolean', required: false },
        { name: 'enterprise', type: 'boolean', required: false }
      ],
      sourcePatterns: ['pricing', 'plans', 'subscribe']
    });
    
    schemas.push({
      name: 'features',
      fields: [
        { name: 'feature_list', type: 'list', required: true },
        { name: 'categories', type: 'list', required: false }
      ],
      sourcePatterns: ['features', 'product', 'capabilities']
    });
    
    schemas.push({
      name: 'technical',
      fields: [
        { name: 'languages', type: 'list', required: false },
        { name: 'frameworks', type: 'list', required: false },
        { name: 'infrastructure', type: 'list', required: false },
        { name: 'apis', type: 'list', required: false }
      ],
      sourcePatterns: ['github', 'docs', 'technical', 'stack']
    });
    
    schemas.push({
      name: 'security',
      fields: [
        { name: 'certifications', type: 'list', required: false },
        { name: 'compliance', type: 'list', required: false },
        { name: 'security_features', type: 'list', required: false }
      ],
      sourcePatterns: ['security', 'trust', 'compliance', 'privacy']
    });
    
    return schemas;
  }
  
  /**
   * Calculate execution budgets
   */
  private calculateBudgets(objective: ResearchObjective): ExecutionBudgets {
    const mode = objective.constraints?.mode || this.mode;
    const baseBudgets = MODE_BUDGETS[mode];
    
    // Apply constraint overrides
    return {
      maxTimeMs: objective.constraints?.maxTimeMs ?? baseBudgets.maxTimeMs,
      maxPages: objective.constraints?.maxPages ?? baseBudgets.maxPages,
      maxConcurrency: objective.constraints?.maxConcurrency ?? baseBudgets.maxConcurrency,
      maxCostUnits: objective.constraints?.maxCostUnits ?? baseBudgets.maxCostUnits,
      marginalGainFloor: baseBudgets.marginalGainFloor
    };
  }
  
  /**
   * Generate execution paths
   */
  private generateExecutionPaths(
    domains: RankedDomain[],
    questions: PrimaryQuestion[],
    categories: SourceCategory[]
  ): ExecutionPath[] {
    const paths: ExecutionPath[] = [];
    
    // Primary path: direct to main domain
    if (domains.length > 0) {
      paths.push({
        id: generateId(),
        goal: 'Primary source investigation',
        domainScope: [domains[0].domain],
        extractionTargets: questions.map(q => q.question),
        confidenceContribution: 0.5,
        priority: 10,
        status: 'pending'
      });
    }
    
    // Secondary paths for each category
    for (const category of categories.slice(0, 3)) {
      const categoryDomains = domains.filter(d => 
        d.expectedContent.includes(category.category)
      );
      
      if (categoryDomains.length > 0) {
        paths.push({
          id: generateId(),
          goal: `${category.category} source investigation`,
          domainScope: categoryDomains.map(d => d.domain),
          extractionTargets: this.getTargetsForCategory(category.category, questions),
          confidenceContribution: 0.2,
          priority: category.priority,
          status: 'pending'
        });
      }
    }
    
    // Verification path (runs last)
    paths.push({
      id: generateId(),
      goal: 'Cross-verification and contradiction detection',
      domainScope: domains.slice(0, 5).map(d => d.domain),
      extractionTargets: ['verify', 'corroborate'],
      confidenceContribution: 0.1,
      priority: 1,
      status: 'pending'
    });
    
    return paths;
  }
  
  /**
   * Get extraction targets for a category
   */
  private getTargetsForCategory(
    category: SourceCategory['category'],
    questions: PrimaryQuestion[]
  ): string[] {
    const targets: string[] = [];
    
    for (const question of questions) {
      for (const pattern of QUESTION_PATTERNS) {
        if (
          pattern.pattern.test(question.question) &&
          pattern.sourceCategories.includes(category)
        ) {
          targets.push(...pattern.extractionHints);
        }
      }
    }
    
    return [...new Set(targets)];
  }
  
  /**
   * Validate a plan
   */
  validatePlan(plan: ResearchPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (plan.primaryQuestions.length === 0) {
      errors.push('No primary questions generated');
    }
    
    if (plan.targetDomains.length === 0) {
      errors.push('No target domains identified');
    }
    
    if (plan.executionPaths.length === 0) {
      errors.push('No execution paths generated');
    }
    
    if (plan.budgets.maxPages < 1) {
      errors.push('Page budget too low');
    }
    
    if (plan.budgets.maxTimeMs < 1000) {
      errors.push('Time budget too low');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Adjust plan based on early results
   */
  adjustPlan(
    plan: ResearchPlan,
    confidenceState: { overall: number; perQuestion: Map<string, number> }
  ): ResearchPlan {
    const adjustedPlan = { ...plan };
    
    // Terminate paths for questions that have reached confidence threshold
    for (const [questionId, confidence] of confidenceState.perQuestion) {
      const question = plan.primaryQuestions.find(q => q.id === questionId);
      if (question && confidence >= question.requiredConfidence) {
        // Mark related paths as lower priority
        for (const path of adjustedPlan.executionPaths) {
          if (path.extractionTargets.includes(question.question)) {
            path.priority = Math.max(0, path.priority - 5);
          }
        }
      }
    }
    
    // Sort paths by priority
    adjustedPlan.executionPaths.sort((a, b) => b.priority - a.priority);
    
    return adjustedPlan;
  }
}

// Export singleton factory
export function createPlannerBrain(mode?: OperatorMode): PlannerBrain {
  return new PlannerBrain(mode);
}
