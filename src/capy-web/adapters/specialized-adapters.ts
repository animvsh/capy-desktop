// ============================================================================
// CAPY WEB - SPECIALIZED DOMAIN ADAPTERS
// High-signal extraction for specific source types
// ============================================================================

import {
  AdapterType,
  NavigationHeuristic,
  ExtractionSchema,
  ConfidenceRule,
  NavigationResult,
  ExtractionResult
} from '../types';
import { BaseAdapter } from './base-adapter';
import { cleanText, parsePrice } from '../utils/helpers';

// ============================================================================
// COMPANY SITE ADAPTER
// ============================================================================

export class CompanySiteAdapter extends BaseAdapter {
  type = AdapterType.COMPANY_SITE;
  name = 'Company Website Adapter';
  
  urlPatterns = [
    /^https?:\/\/(?:www\.)?[^\/]+\/?$/,  // Homepage
    /\/about/i,
    /\/company/i,
    /\/team/i
  ];
  
  navigationHeuristics: NavigationHeuristic[] = [
    {
      name: 'nav_about',
      condition: 'on_homepage',
      action: { type: 'click', selector: 'a[href*="about"], nav a:has-text("About")' },
      priority: 10
    },
    {
      name: 'nav_team',
      condition: 'looking_for_team',
      action: { type: 'click', selector: 'a[href*="team"], a[href*="people"]' },
      priority: 8
    }
  ];
  
  extractionSchema: ExtractionSchema = {
    name: 'company_info',
    fields: [
      { name: 'company_name', type: 'string', required: true },
      { name: 'tagline', type: 'string', required: false },
      { name: 'description', type: 'string', required: false },
      { name: 'founded', type: 'string', required: false },
      { name: 'location', type: 'string', required: false },
      { name: 'employees', type: 'string', required: false },
      { name: 'industry', type: 'string', required: false }
    ],
    sourcePatterns: ['about', 'company', 'home']
  };
  
  confidenceRules: ConfidenceRule[] = [
    { condition: 'has(company_name)', adjustment: 0.2, reason: 'Has company name' },
    { condition: 'has(description)', adjustment: 0.15, reason: 'Has description' },
    { condition: 'has(founded)', adjustment: 0.1, reason: 'Has founding date' },
    { condition: 'has(location)', adjustment: 0.1, reason: 'Has location' }
  ];
  
  async navigate(page: any, target: string): Promise<NavigationResult> {
    try {
      const selectors = [
        `a[href*="${target}"]`,
        `nav a:has-text("${target}")`,
        `header a:has-text("${target}")`,
        `a:has-text("${target}")`
      ];
      
      for (const selector of selectors) {
        try {
          const link = await page.$(selector);
          if (link) {
            await link.click();
            await page.waitForLoadState('domcontentloaded');
            return { success: true, url: await page.url() };
          }
        } catch {}
      }
      
      return { success: false, url: await page.url(), error: 'Navigation target not found' };
    } catch (error) {
      return { success: false, url: await page.url(), error: String(error) };
    }
  }
  
  async extract(page: any): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    const url = await this.getCurrentUrl(page);
    
    try {
      const data: Record<string, unknown> = {};
      
      // Company name from various sources
      data.company_name = 
        await this.extractText(page, 'meta[property="og:site_name"]') ||
        await this.extractAttribute(page, 'meta[property="og:site_name"]', 'content') ||
        await this.extractText(page, '.logo, [class*="logo"]') ||
        await this.extractText(page, 'h1');
      
      // Tagline
      data.tagline = 
        await this.extractText(page, '.tagline, [class*="tagline"], .hero-subtitle') ||
        await this.extractAttribute(page, 'meta[name="description"]', 'content');
      
      // Description from about section
      data.description = 
        await this.extractText(page, '[class*="about"] p, .about-content p') ||
        await this.extractText(page, 'main p:first-of-type');
      
      // Founded date
      const pageText = await page.textContent('body');
      const foundedMatch = pageText?.match(/(?:founded|established|started)\s*(?:in\s*)?(\d{4})/i);
      if (foundedMatch) {
        data.founded = foundedMatch[1];
      }
      
      // Location
      const locationMatch = pageText?.match(/(?:headquartered|based|located)\s*in\s*([A-Z][a-zA-Z\s,]+)/);
      if (locationMatch) {
        data.location = cleanText(locationMatch[1]);
      }
      
      // Employee count
      const employeeMatch = pageText?.match(/(\d+(?:,\d+)?)\s*(?:\+\s*)?employees/i);
      if (employeeMatch) {
        data.employees = employeeMatch[1].replace(/,/g, '');
      }
      
      const baseConfidence = 0.5;
      const confidence = this.applyConfidenceRules(baseConfidence, data);
      
      if (Object.keys(data).some(k => data[k])) {
        results.push(this.createExtractionResult('company_info', data, url, confidence));
      }
    } catch {}
    
    return results;
  }
}

// ============================================================================
// PRICING ADAPTER
// ============================================================================

export class PricingAdapter extends BaseAdapter {
  type = AdapterType.PRICING;
  name = 'Pricing Page Adapter';
  
  urlPatterns = [
    /\/pricing/i,
    /\/plans/i,
    /\/subscribe/i,
    /\/packages/i
  ];
  
  navigationHeuristics: NavigationHeuristic[] = [
    {
      name: 'nav_pricing',
      condition: 'on_any_page',
      action: { type: 'click', selector: 'a[href*="pricing"], a:has-text("Pricing")' },
      priority: 10
    }
  ];
  
  extractionSchema: ExtractionSchema = {
    name: 'pricing',
    fields: [
      { name: 'plans', type: 'list', required: true },
      { name: 'currency', type: 'string', required: false },
      { name: 'has_free_tier', type: 'boolean', required: false },
      { name: 'has_enterprise', type: 'boolean', required: false },
      { name: 'billing_options', type: 'list', required: false }
    ],
    sourcePatterns: ['pricing', 'plans']
  };
  
  confidenceRules: ConfidenceRule[] = [
    { condition: 'plans.length > 0', adjustment: 0.3, reason: 'Has pricing plans' },
    { condition: 'has(currency)', adjustment: 0.1, reason: 'Has currency' },
    { condition: 'plans.length > 2', adjustment: 0.1, reason: 'Multiple plans found' }
  ];
  
  async navigate(page: any, target: string): Promise<NavigationResult> {
    try {
      const link = await page.$('a[href*="pricing"], a[href*="plans"], nav a:has-text("Pricing")');
      if (link) {
        await link.click();
        await page.waitForLoadState('domcontentloaded');
        return { success: true, url: await page.url() };
      }
      return { success: false, url: await page.url(), error: 'Pricing page not found' };
    } catch (error) {
      return { success: false, url: await page.url(), error: String(error) };
    }
  }
  
  async extract(page: any): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    const url = await this.getCurrentUrl(page);
    
    try {
      const data: Record<string, unknown> = {};
      const plans: Array<{name: string; price: string | null; features: string[]}> = [];
      
      // Try to find pricing cards/sections
      const pricingSelectors = [
        '[class*="pricing-card"]',
        '[class*="plan-card"]',
        '[class*="pricing-tier"]',
        '[class*="price-card"]',
        '.pricing-table > div',
        '[data-pricing]'
      ];
      
      for (const selector of pricingSelectors) {
        const cards = await page.$$(selector);
        if (cards.length > 0) {
          for (const card of cards) {
            try {
              const name = await card.$eval('h2, h3, [class*="title"], [class*="name"]', 
                (el: Element) => el.textContent?.trim()
              ).catch(() => null);
              
              const priceText = await card.$eval('[class*="price"], [class*="amount"]',
                (el: Element) => el.textContent?.trim()
              ).catch(() => null);
              
              const featureEls = await card.$$('[class*="feature"] li, ul li');
              const features: string[] = [];
              for (const fel of featureEls.slice(0, 10)) {
                const text = await fel.textContent();
                if (text) features.push(cleanText(text));
              }
              
              if (name) {
                plans.push({
                  name,
                  price: priceText,
                  features
                });
              }
            } catch {}
          }
          break;
        }
      }
      
      // Fallback: look for price patterns in text
      if (plans.length === 0) {
        const pageText = await page.textContent('body');
        const priceMatches = pageText?.matchAll(/\$[\d,]+(?:\.\d{2})?(?:\s*\/\s*(?:mo|month|year|yr))?/gi);
        if (priceMatches) {
          for (const match of priceMatches) {
            plans.push({ name: 'Unknown', price: match[0], features: [] });
          }
        }
      }
      
      data.plans = plans;
      
      // Detect currency
      const pageText = await page.textContent('body');
      if (pageText?.includes('$')) data.currency = 'USD';
      else if (pageText?.includes('€')) data.currency = 'EUR';
      else if (pageText?.includes('£')) data.currency = 'GBP';
      
      // Detect free tier
      data.has_free_tier = pageText?.toLowerCase().includes('free') || 
                           plans.some(p => p.price?.includes('0') || p.name.toLowerCase().includes('free'));
      
      // Detect enterprise
      data.has_enterprise = pageText?.toLowerCase().includes('enterprise') ||
                            plans.some(p => p.name.toLowerCase().includes('enterprise'));
      
      // Billing options
      const billingOptions: string[] = [];
      if (pageText?.match(/monthly|\/mo/i)) billingOptions.push('monthly');
      if (pageText?.match(/annual|yearly|\/yr/i)) billingOptions.push('annual');
      data.billing_options = billingOptions;
      
      const baseConfidence = 0.4;
      const confidence = this.applyConfidenceRules(baseConfidence, data);
      
      if (plans.length > 0) {
        results.push(this.createExtractionResult('pricing', data, url, confidence));
      }
    } catch {}
    
    return results;
  }
}

// ============================================================================
// GITHUB ADAPTER
// ============================================================================

export class GitHubAdapter extends BaseAdapter {
  type = AdapterType.GITHUB;
  name = 'GitHub Repository Adapter';
  
  urlPatterns = [
    /github\.com\/[^\/]+\/[^\/]+/
  ];
  
  navigationHeuristics: NavigationHeuristic[] = [
    {
      name: 'nav_readme',
      condition: 'on_repo_root',
      action: { type: 'scroll', selector: '#readme' },
      priority: 10
    }
  ];
  
  extractionSchema: ExtractionSchema = {
    name: 'github_repo',
    fields: [
      { name: 'name', type: 'string', required: true },
      { name: 'description', type: 'string', required: false },
      { name: 'stars', type: 'number', required: false },
      { name: 'forks', type: 'number', required: false },
      { name: 'language', type: 'string', required: false },
      { name: 'topics', type: 'list', required: false },
      { name: 'license', type: 'string', required: false },
      { name: 'last_updated', type: 'string', required: false }
    ],
    sourcePatterns: ['github.com']
  };
  
  confidenceRules: ConfidenceRule[] = [
    { condition: 'has(name)', adjustment: 0.2, reason: 'Has repo name' },
    { condition: 'has(stars)', adjustment: 0.1, reason: 'Has star count' },
    { condition: 'has(language)', adjustment: 0.15, reason: 'Has language info' },
    { condition: 'topics.length > 0', adjustment: 0.1, reason: 'Has topics' }
  ];
  
  async navigate(page: any, target: string): Promise<NavigationResult> {
    try {
      // GitHub-specific navigation
      const tabs = ['code', 'issues', 'pulls', 'actions', 'security'];
      if (tabs.includes(target.toLowerCase())) {
        const tab = await page.$(`a[data-tab-item="${target}"], a[href$="/${target}"]`);
        if (tab) {
          await tab.click();
          await page.waitForLoadState('domcontentloaded');
          return { success: true, url: await page.url() };
        }
      }
      return { success: false, url: await page.url(), error: 'Tab not found' };
    } catch (error) {
      return { success: false, url: await page.url(), error: String(error) };
    }
  }
  
  async extract(page: any): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    const url = await this.getCurrentUrl(page);
    
    try {
      const data: Record<string, unknown> = {};
      
      // Repo name
      data.name = await this.extractText(page, '[itemprop="name"] a, .AppHeader-context-item-label');
      
      // Description
      data.description = await this.extractText(page, '[itemprop="about"], .f4.my-3');
      
      // Stars
      const starsText = await this.extractText(page, '#repo-stars-counter-star, [id*="star"] .Counter');
      if (starsText) {
        const num = starsText.replace(/[^0-9.k]/gi, '');
        data.stars = num.includes('k') ? parseFloat(num) * 1000 : parseInt(num);
      }
      
      // Forks
      const forksText = await this.extractText(page, '#repo-network-counter, [id*="fork"] .Counter');
      if (forksText) {
        const num = forksText.replace(/[^0-9.k]/gi, '');
        data.forks = num.includes('k') ? parseFloat(num) * 1000 : parseInt(num);
      }
      
      // Primary language
      data.language = await this.extractText(page, '[itemprop="programmingLanguage"], .d-inline-flex [class*="language-color"] + span');
      
      // Topics
      const topics = await this.extractTextList(page, '.topic-tag');
      data.topics = topics;
      
      // License
      data.license = await this.extractText(page, '[href*="LICENSE"] span, [data-analytics-event*="license"]');
      
      // Last updated
      data.last_updated = await this.extractAttribute(page, 'relative-time', 'datetime');
      
      const baseConfidence = 0.7;  // GitHub is highly reliable
      const confidence = this.applyConfidenceRules(baseConfidence, data);
      
      if (data.name) {
        results.push(this.createExtractionResult('github_repo', data, url, confidence));
      }
    } catch {}
    
    return results;
  }
}

// ============================================================================
// DOCS ADAPTER
// ============================================================================

export class DocsAdapter extends BaseAdapter {
  type = AdapterType.DOCS;
  name = 'Documentation Adapter';
  
  urlPatterns = [
    /docs\./i,
    /\/docs\//i,
    /\/documentation\//i,
    /\/api\//i,
    /developer\./i
  ];
  
  navigationHeuristics: NavigationHeuristic[] = [
    {
      name: 'nav_getting_started',
      condition: 'on_docs_root',
      action: { type: 'click', selector: 'a[href*="getting-started"], a[href*="quickstart"]' },
      priority: 10
    }
  ];
  
  extractionSchema: ExtractionSchema = {
    name: 'documentation',
    fields: [
      { name: 'title', type: 'string', required: true },
      { name: 'content_summary', type: 'string', required: false },
      { name: 'sections', type: 'list', required: false },
      { name: 'code_examples', type: 'boolean', required: false },
      { name: 'api_endpoints', type: 'list', required: false }
    ],
    sourcePatterns: ['docs', 'documentation', 'api']
  };
  
  confidenceRules: ConfidenceRule[] = [
    { condition: 'has(title)', adjustment: 0.15, reason: 'Has title' },
    { condition: 'sections.length > 2', adjustment: 0.15, reason: 'Has multiple sections' },
    { condition: 'code_examples == true', adjustment: 0.1, reason: 'Has code examples' }
  ];
  
  async navigate(page: any, target: string): Promise<NavigationResult> {
    try {
      const link = await page.$(`a[href*="${target}"], nav a:has-text("${target}")`);
      if (link) {
        await link.click();
        await page.waitForLoadState('domcontentloaded');
        return { success: true, url: await page.url() };
      }
      return { success: false, url: await page.url(), error: 'Navigation target not found' };
    } catch (error) {
      return { success: false, url: await page.url(), error: String(error) };
    }
  }
  
  async extract(page: any): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    const url = await this.getCurrentUrl(page);
    
    try {
      const data: Record<string, unknown> = {};
      
      // Title
      data.title = await this.extractText(page, 'h1, .doc-title, [class*="title"]');
      
      // Content summary (first paragraph)
      data.content_summary = await this.extractText(page, 'main p:first-of-type, article p:first-of-type');
      
      // Sections (headings)
      const sections = await this.extractTextList(page, 'h2, h3');
      data.sections = sections.slice(0, 20);
      
      // Check for code examples
      const hasCode = await this.elementExists(page, 'pre code, .highlight, [class*="code-block"]');
      data.code_examples = hasCode;
      
      // Extract API endpoints if present
      const pageText = await page.textContent('body');
      const apiMatches = pageText?.matchAll(/(?:GET|POST|PUT|DELETE|PATCH)\s+\/[\w\-\/\{\}]+/g);
      if (apiMatches) {
        data.api_endpoints = Array.from(apiMatches).map(m => m[0]).slice(0, 20);
      }
      
      const baseConfidence = 0.6;
      const confidence = this.applyConfidenceRules(baseConfidence, data);
      
      if (data.title) {
        results.push(this.createExtractionResult('documentation', data, url, confidence));
      }
    } catch {}
    
    return results;
  }
}

// ============================================================================
// SECURITY/TRUST ADAPTER
// ============================================================================

export class SecurityTrustAdapter extends BaseAdapter {
  type = AdapterType.SECURITY_TRUST;
  name = 'Security & Trust Page Adapter';
  
  urlPatterns = [
    /\/security/i,
    /\/trust/i,
    /\/compliance/i,
    /\/privacy/i
  ];
  
  navigationHeuristics: NavigationHeuristic[] = [
    {
      name: 'nav_security',
      condition: 'on_any_page',
      action: { type: 'click', selector: 'a[href*="security"], a[href*="trust"]' },
      priority: 10
    }
  ];
  
  extractionSchema: ExtractionSchema = {
    name: 'security_info',
    fields: [
      { name: 'certifications', type: 'list', required: false },
      { name: 'compliance_standards', type: 'list', required: false },
      { name: 'security_features', type: 'list', required: false },
      { name: 'has_soc2', type: 'boolean', required: false },
      { name: 'has_gdpr', type: 'boolean', required: false },
      { name: 'has_hipaa', type: 'boolean', required: false }
    ],
    sourcePatterns: ['security', 'trust', 'compliance']
  };
  
  confidenceRules: ConfidenceRule[] = [
    { condition: 'certifications.length > 0', adjustment: 0.2, reason: 'Has certifications' },
    { condition: 'has_soc2 == true', adjustment: 0.15, reason: 'Has SOC 2' },
    { condition: 'has_gdpr == true', adjustment: 0.1, reason: 'GDPR compliant' }
  ];
  
  async navigate(page: any, target: string): Promise<NavigationResult> {
    try {
      const link = await page.$(`a[href*="${target}"]`);
      if (link) {
        await link.click();
        await page.waitForLoadState('domcontentloaded');
        return { success: true, url: await page.url() };
      }
      return { success: false, url: await page.url(), error: 'Security page not found' };
    } catch (error) {
      return { success: false, url: await page.url(), error: String(error) };
    }
  }
  
  async extract(page: any): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    const url = await this.getCurrentUrl(page);
    
    try {
      const data: Record<string, unknown> = {};
      const pageText = (await page.textContent('body'))?.toLowerCase() || '';
      
      // Certifications
      const certPatterns = [
        'soc 2', 'soc2', 'iso 27001', 'iso27001', 'pci dss', 'pci-dss',
        'fedramp', 'hitrust', 'csa star', 'iso 9001'
      ];
      const certifications = certPatterns.filter(c => pageText.includes(c));
      data.certifications = certifications;
      
      // Compliance standards
      const compliancePatterns = [
        'gdpr', 'ccpa', 'hipaa', 'hitech', 'ferpa', 'coppa', 'lgpd', 'pipeda'
      ];
      const compliance = compliancePatterns.filter(c => pageText.includes(c));
      data.compliance_standards = compliance;
      
      // Security features
      const features: string[] = [];
      if (pageText.includes('encrypt')) features.push('encryption');
      if (pageText.includes('two-factor') || pageText.includes('2fa') || pageText.includes('mfa')) features.push('MFA');
      if (pageText.includes('sso') || pageText.includes('single sign-on')) features.push('SSO');
      if (pageText.includes('audit log')) features.push('audit_logs');
      if (pageText.includes('penetration test')) features.push('pen_testing');
      data.security_features = features;
      
      // Specific compliance flags
      data.has_soc2 = pageText.includes('soc 2') || pageText.includes('soc2');
      data.has_gdpr = pageText.includes('gdpr');
      data.has_hipaa = pageText.includes('hipaa');
      
      const baseConfidence = 0.5;
      const confidence = this.applyConfidenceRules(baseConfidence, data);
      
      if (certifications.length > 0 || compliance.length > 0 || features.length > 0) {
        results.push(this.createExtractionResult('security_info', data, url, confidence));
      }
    } catch {}
    
    return results;
  }
}

// ============================================================================
// NEWS ADAPTER
// ============================================================================

export class NewsAdapter extends BaseAdapter {
  type = AdapterType.NEWS;
  name = 'News Article Adapter';
  
  urlPatterns = [
    /techcrunch\.com/i,
    /bloomberg\.com/i,
    /reuters\.com/i,
    /wsj\.com/i,
    /theverge\.com/i,
    /wired\.com/i,
    /\/news\//i,
    /\/article\//i,
    /\/story\//i
  ];
  
  navigationHeuristics: NavigationHeuristic[] = [];
  
  extractionSchema: ExtractionSchema = {
    name: 'news_article',
    fields: [
      { name: 'headline', type: 'string', required: true },
      { name: 'author', type: 'string', required: false },
      { name: 'date', type: 'date', required: false },
      { name: 'summary', type: 'string', required: false },
      { name: 'mentions', type: 'list', required: false }
    ],
    sourcePatterns: ['news', 'article']
  };
  
  confidenceRules: ConfidenceRule[] = [
    { condition: 'has(headline)', adjustment: 0.15, reason: 'Has headline' },
    { condition: 'has(date)', adjustment: 0.1, reason: 'Has date' },
    { condition: 'has(author)', adjustment: 0.1, reason: 'Has author' }
  ];
  
  async navigate(page: any, target: string): Promise<NavigationResult> {
    // News articles typically don't need internal navigation
    return { success: true, url: await page.url() };
  }
  
  async extract(page: any): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    const url = await this.getCurrentUrl(page);
    
    try {
      const data: Record<string, unknown> = {};
      
      // Headline
      data.headline = 
        await this.extractText(page, 'h1, [class*="headline"], article h1') ||
        await this.extractAttribute(page, 'meta[property="og:title"]', 'content');
      
      // Author
      data.author = 
        await this.extractText(page, '[rel="author"], [class*="author"], [itemprop="author"]') ||
        await this.extractAttribute(page, 'meta[name="author"]', 'content');
      
      // Date
      data.date = 
        await this.extractAttribute(page, 'time[datetime]', 'datetime') ||
        await this.extractAttribute(page, 'meta[property="article:published_time"]', 'content');
      
      // Summary
      data.summary = 
        await this.extractText(page, '[class*="summary"], [class*="excerpt"], article p:first-of-type') ||
        await this.extractAttribute(page, 'meta[property="og:description"]', 'content');
      
      const baseConfidence = 0.4;  // News has lower base confidence (needs corroboration)
      const confidence = this.applyConfidenceRules(baseConfidence, data);
      
      if (data.headline) {
        results.push(this.createExtractionResult('news_article', data, url, confidence));
      }
    } catch {}
    
    return results;
  }
}

// ============================================================================
// CRUNCHBASE ADAPTER
// ============================================================================

export class CrunchbaseAdapter extends BaseAdapter {
  type = AdapterType.COMPANY_SITE;  // Reusing type
  name = 'Crunchbase Adapter';
  
  urlPatterns = [
    /crunchbase\.com\/organization\//i
  ];
  
  navigationHeuristics: NavigationHeuristic[] = [];
  
  extractionSchema: ExtractionSchema = {
    name: 'crunchbase_company',
    fields: [
      { name: 'company_name', type: 'string', required: true },
      { name: 'description', type: 'string', required: false },
      { name: 'founded', type: 'string', required: false },
      { name: 'headquarters', type: 'string', required: false },
      { name: 'employees', type: 'string', required: false },
      { name: 'funding_total', type: 'string', required: false },
      { name: 'last_funding_type', type: 'string', required: false },
      { name: 'investors', type: 'list', required: false },
      { name: 'categories', type: 'list', required: false }
    ],
    sourcePatterns: ['crunchbase.com']
  };
  
  confidenceRules: ConfidenceRule[] = [
    { condition: 'has(company_name)', adjustment: 0.2, reason: 'Has company name' },
    { condition: 'has(funding_total)', adjustment: 0.15, reason: 'Has funding info' },
    { condition: 'has(founded)', adjustment: 0.1, reason: 'Has founding date' }
  ];
  
  async navigate(page: any, target: string): Promise<NavigationResult> {
    return { success: true, url: await page.url() };
  }
  
  async extract(page: any): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    const url = await this.getCurrentUrl(page);
    
    try {
      const data: Record<string, unknown> = {};
      
      // Company name
      data.company_name = await this.extractText(page, 'h1, .profile-name');
      
      // Description
      data.description = await this.extractText(page, '[class*="description"], .short-description');
      
      // Look for structured data in the page
      const pageText = await page.textContent('body');
      
      // Founded
      const foundedMatch = pageText?.match(/Founded\s*:?\s*(\d{4})/i);
      if (foundedMatch) data.founded = foundedMatch[1];
      
      // Headquarters
      const hqMatch = pageText?.match(/(?:Headquarters|Location)\s*:?\s*([A-Z][a-zA-Z\s,]+)/);
      if (hqMatch) data.headquarters = cleanText(hqMatch[1]);
      
      // Employees
      const empMatch = pageText?.match(/(\d+(?:-\d+)?)\s*employees/i);
      if (empMatch) data.employees = empMatch[1];
      
      // Funding
      const fundingMatch = pageText?.match(/Total Funding\s*:?\s*\$?([\d.]+[BMK]?)/i);
      if (fundingMatch) data.funding_total = fundingMatch[1];
      
      // Categories/industries
      const categories = await this.extractTextList(page, '[class*="category"], [class*="industry"] a');
      data.categories = categories.slice(0, 10);
      
      const baseConfidence = 0.65;  // Crunchbase is fairly reliable
      const confidence = this.applyConfidenceRules(baseConfidence, data);
      
      if (data.company_name) {
        results.push(this.createExtractionResult('crunchbase_company', data, url, confidence));
      }
    } catch {}
    
    return results;
  }
}
