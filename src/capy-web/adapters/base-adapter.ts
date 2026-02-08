// ============================================================================
// CAPY WEB - BASE DOMAIN ADAPTER
// Foundation for all domain-specific adapters
// ============================================================================

import type { Page } from 'playwright-core';
import {
  DomainAdapter,
  AdapterType,
  NavigationHeuristic,
  ExtractionSchema,
  ConfidenceRule,
  NavigationAction,
  NavigationResult,
  ExtractionResult
} from '../types';
import { generateId, hashString, cleanText } from '../utils/helpers';

// ============================================================================
// BASE ADAPTER CLASS
// ============================================================================

export abstract class BaseAdapter implements DomainAdapter {
  abstract type: AdapterType;
  abstract name: string;
  abstract urlPatterns: RegExp[];
  abstract navigationHeuristics: NavigationHeuristic[];
  abstract extractionSchema: ExtractionSchema;
  abstract confidenceRules: ConfidenceRule[];
  
  /**
   * Check if this adapter matches a URL
   */
  matches(url: string): boolean {
    return this.urlPatterns.some(pattern => pattern.test(url));
  }
  
  /**
   * Navigate to target on page
   */
  abstract navigate(page: Page, target: string): Promise<NavigationResult>;
  
  /**
   * Extract data from page
   */
  abstract extract(page: Page): Promise<ExtractionResult[]>;
  
  /**
   * Create an extraction result
   */
  protected createExtractionResult(
    schemaName: string,
    data: Record<string, unknown>,
    sourceUrl: string,
    confidence: number,
    selector?: string
  ): ExtractionResult {
    return {
      schemaName,
      data,
      confidence,
      sourceUrl,
      sourceSelector: selector,
      timestamp: Date.now(),
      hash: hashString(JSON.stringify(data))
    };
  }
  
  /**
   * Apply confidence rules
   */
  protected applyConfidenceRules(baseConfidence: number, context: Record<string, unknown>): number {
    let confidence = baseConfidence;
    
    for (const rule of this.confidenceRules) {
      try {
        // Simple condition evaluation
        const condition = rule.condition;
        let matches = false;
        
        // Check for key existence
        if (condition.includes('has(')) {
          const key = condition.match(/has\(['"]?(\w+)['"]?\)/)?.[1];
          if (key && context[key] !== undefined && context[key] !== null && context[key] !== '') {
            matches = true;
          }
        }
        
        // Check for value equality
        if (condition.includes('==')) {
          const [key, value] = condition.split('==').map(s => s.trim());
          if (String(context[key]) === value.replace(/['"]/g, '')) {
            matches = true;
          }
        }
        
        // Check for array length
        if (condition.includes('.length >')) {
          const [key, threshold] = condition.split('.length >').map(s => s.trim());
          const arr = context[key];
          if (Array.isArray(arr) && arr.length > parseInt(threshold)) {
            matches = true;
          }
        }
        
        if (matches) {
          confidence += rule.adjustment;
        }
      } catch (e) {
        // Ignore rule evaluation errors
      }
    }
    
    return Math.max(0, Math.min(1, confidence));
  }
  
  /**
   * Extract text content from page element
   */
  protected async extractText(page: Page, selector: string): Promise<string | null> {
    try {
      const element = await page.$(selector);
      if (!element) return null;
      
      const text = await element.textContent();
      return text ? cleanText(text) : null;
    } catch {
      return null;
    }
  }
  
  /**
   * Extract multiple text elements
   */
  protected async extractTextList(page: Page, selector: string): Promise<string[]> {
    try {
      const elements = await page.$$(selector);
      const texts: string[] = [];
      
      for (const element of elements) {
        const text = await element.textContent();
        if (text) {
          texts.push(cleanText(text));
        }
      }
      
      return texts;
    } catch {
      return [];
    }
  }
  
  /**
   * Extract attribute from element
   */
  protected async extractAttribute(page: Page, selector: string, attr: string): Promise<string | null> {
    try {
      const element = await page.$(selector);
      if (!element) return null;
      
      return await element.getAttribute(attr);
    } catch {
      return null;
    }
  }
  
  /**
   * Check if element exists
   */
  protected async elementExists(page: Page, selector: string): Promise<boolean> {
    try {
      const element = await page.$(selector);
      return element !== null;
    } catch {
      return false;
    }
  }
  
  /**
   * Get current URL
   */
  protected async getCurrentUrl(page: Page): Promise<string> {
    try {
      return await page.url();
    } catch {
      return '';
    }
  }
  
  /**
   * Wait for element
   */
  protected async waitForElement(page: Page, selector: string, timeout = 5000): Promise<boolean> {
    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// GENERIC ADAPTER (fallback)
// ============================================================================

export class GenericAdapter extends BaseAdapter {
  type = AdapterType.GENERIC;
  name = 'Generic Web Adapter';
  urlPatterns = [/.*/];  // Matches everything
  
  navigationHeuristics: NavigationHeuristic[] = [
    {
      name: 'find_about',
      condition: 'looking_for_company_info',
      action: { type: 'click', selector: 'a[href*="about"]' },
      priority: 5
    },
    {
      name: 'find_pricing',
      condition: 'looking_for_pricing',
      action: { type: 'click', selector: 'a[href*="pricing"], a[href*="plans"]' },
      priority: 5
    }
  ];
  
  extractionSchema: ExtractionSchema = {
    name: 'generic',
    fields: [
      { name: 'title', type: 'string', required: false },
      { name: 'description', type: 'string', required: false },
      { name: 'headings', type: 'list', required: false },
      { name: 'links', type: 'list', required: false }
    ],
    sourcePatterns: ['*']
  };
  
  confidenceRules: ConfidenceRule[] = [
    { condition: 'has(title)', adjustment: 0.1, reason: 'Has title' },
    { condition: 'has(description)', adjustment: 0.1, reason: 'Has description' },
    { condition: 'headings.length > 3', adjustment: 0.1, reason: 'Has multiple headings' }
  ];
  
  async navigate(page: Page, target: string): Promise<NavigationResult> {
    try {
      // Try to find and click a link matching target
      const linkSelector = `a[href*="${target}"], a:has-text("${target}")`;
      const link = await page.$(linkSelector);
      
      if (link) {
        await link.click();
        await page.waitForLoadState('domcontentloaded');
        return {
          success: true,
          url: await page.url()
        };
      }
      
      return {
        success: false,
        url: await page.url(),
        error: `Could not find link for: ${target}`
      };
    } catch (error) {
      return {
        success: false,
        url: await page.url(),
        error: String(error)
      };
    }
  }
  
  async extract(page: Page): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    const url = await this.getCurrentUrl(page);
    
    try {
      const data: Record<string, unknown> = {};
      
      // Extract title
      data.title = await this.extractText(page, 'title') || 
                   await this.extractText(page, 'h1');
      
      // Extract meta description
      data.description = await this.extractAttribute(page, 'meta[name="description"]', 'content');
      
      // Extract headings
      data.headings = await this.extractTextList(page, 'h1, h2, h3');
      
      // Extract main links
      const links = await page.$$eval('a[href]', (els: Element[]) => 
        els.slice(0, 20).map((el: Element) => ({
          text: (el as HTMLAnchorElement).textContent?.trim(),
          href: (el as HTMLAnchorElement).href
        })).filter((l: {text?: string; href: string}) => l.text && l.href)
      );
      data.links = links;
      
      const baseConfidence = 0.3;  // Generic adapter has low base confidence
      const confidence = this.applyConfidenceRules(baseConfidence, data);
      
      results.push(this.createExtractionResult(
        'generic',
        data,
        url,
        confidence
      ));
    } catch (error) {
      // Return empty results on error
    }
    
    return results;
  }
}
