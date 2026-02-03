/**
 * Visit Profile Workflow
 * 
 * Navigates to a LinkedIn profile and extracts basic information.
 * This is a prerequisite workflow for other LinkedIn actions.
 * 
 * Steps:
 * 1. Navigate to profile URL
 * 2. Wait for page load
 * 3. Check for errors (not found, login required, rate limited)
 * 4. Extract basic profile data
 * 5. Detect connection status
 */

import {
  WorkflowDefinition,
  WorkflowStep,
  StepResult,
  ValidationResult,
  VisitProfileInput,
  VisitProfileOutput,
  LinkedInProfile,
  extractFirstName,
} from './types';
import {
  PROFILE_SELECTORS,
  ACTION_SELECTORS,
  COMMON_SELECTORS,
  toPlaywrightSelector,
} from './selectors';
import { WorkflowError } from './workflow-runner';

// ============================================================================
// Context
// ============================================================================

interface VisitProfileContext {
  input: VisitProfileInput;
  pageLoaded: boolean;
  profile: LinkedInProfile;
  errors: string[];
}

// ============================================================================
// Browser Interface
// ============================================================================

/**
 * Abstract browser interface - will be implemented by Playwright/Puppeteer
 */
export interface BrowserInterface {
  navigate(url: string): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number; state?: 'visible' | 'attached' }): Promise<void>;
  querySelector(selector: string): Promise<string | null>;
  querySelectorAll(selector: string): Promise<string[]>;
  getTextContent(selector: string): Promise<string | null>;
  getAttribute(selector: string, attribute: string): Promise<string | null>;
  isVisible(selector: string): Promise<boolean>;
  screenshot(): Promise<string>;
  currentUrl(): Promise<string>;
}

// Will be injected at runtime
let browser: BrowserInterface;

export function setBrowser(b: BrowserInterface): void {
  browser = b;
}

// ============================================================================
// Step Implementations
// ============================================================================

const navigateStep: WorkflowStep<VisitProfileContext> = {
  id: 'navigate',
  name: 'Navigate to Profile',
  description: 'Opening LinkedIn profile page',
  timeoutMs: 15000,
  maxRetries: 2,

  async execute(context): Promise<StepResult> {
    try {
      await browser.navigate(context.input.profileUrl);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to navigate: ${error instanceof Error ? error.message : 'Unknown error'}`,
        shouldRetry: true,
      };
    }
  },

  validate(context): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!context.input.profileUrl) {
      errors.push('Profile URL is required');
    } else if (!context.input.profileUrl.includes('linkedin.com/in/')) {
      warnings.push('URL does not appear to be a LinkedIn profile URL');
    }

    return { valid: errors.length === 0, errors, warnings };
  },
};

const waitForPageLoadStep: WorkflowStep<VisitProfileContext> = {
  id: 'wait-page-load',
  name: 'Wait for Page Load',
  description: 'Waiting for profile page to load',
  timeoutMs: 10000,
  maxRetries: 1,

  async execute(context): Promise<StepResult> {
    try {
      // Wait for main layout
      await browser.waitForSelector(
        toPlaywrightSelector(COMMON_SELECTORS.pageLoaded),
        { timeout: 5000 }
      );

      // Wait for profile-specific content
      await browser.waitForSelector(
        toPlaywrightSelector(COMMON_SELECTORS.profileLoaded),
        { timeout: 5000 }
      );

      context.pageLoaded = true;
      return { success: true };
    } catch {
      // Check for specific error states
      return {
        success: false,
        error: 'Page did not load properly',
        shouldRetry: true,
      };
    }
  },
};

const checkErrorStatesStep: WorkflowStep<VisitProfileContext> = {
  id: 'check-errors',
  name: 'Check for Errors',
  description: 'Checking for error states',
  timeoutMs: 5000,
  maxRetries: 0,

  async execute(context): Promise<StepResult> {
    // Check for login required
    const loginRequired = await browser.isVisible(
      toPlaywrightSelector(COMMON_SELECTORS.loginRequired)
    );
    if (loginRequired) {
      return {
        success: false,
        error: 'Login required - please authenticate with LinkedIn',
      };
    }

    // Check for profile not found
    const notFound = await browser.isVisible(
      toPlaywrightSelector(COMMON_SELECTORS.profileNotFound)
    );
    if (notFound) {
      return {
        success: false,
        error: 'Profile not found - the URL may be invalid or the profile was removed',
      };
    }

    // Check for rate limiting
    const rateLimited = await browser.isVisible(
      toPlaywrightSelector(COMMON_SELECTORS.rateLimited)
    );
    if (rateLimited) {
      return {
        success: false,
        error: 'Rate limited by LinkedIn - please wait before trying again',
      };
    }

    return { success: true };
  },
};

const extractBasicInfoStep: WorkflowStep<VisitProfileContext> = {
  id: 'extract-basic',
  name: 'Extract Basic Info',
  description: 'Extracting name, headline, and location',
  timeoutMs: 10000,
  maxRetries: 1,

  async execute(context): Promise<StepResult> {
    try {
      // Extract name
      const name = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.name)
      );
      context.profile.name = name?.trim() ?? null;

      // Extract headline
      const headline = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.headline)
      );
      context.profile.headline = headline?.trim() ?? null;

      // Extract location
      const location = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.location)
      );
      context.profile.location = location?.trim() ?? null;

      // Extract current company (from right panel or headline)
      const currentCompany = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.currentCompany)
      );
      context.profile.currentCompany = currentCompany?.trim() ?? null;

      // Extract profile photo
      const photoUrl = await browser.getAttribute(
        toPlaywrightSelector(PROFILE_SELECTORS.profilePhoto),
        'src'
      );
      context.profile.photoUrl = photoUrl ?? null;

      // Validate we got at least the name
      if (!context.profile.name) {
        return {
          success: false,
          error: 'Could not extract profile name',
          shouldRetry: true,
        };
      }

      return {
        success: true,
        data: {
          name: context.profile.name,
          headline: context.profile.headline,
          location: context.profile.location,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to extract profile info: ${error instanceof Error ? error.message : 'Unknown'}`,
        shouldRetry: true,
      };
    }
  },
};

const detectConnectionStatusStep: WorkflowStep<VisitProfileContext> = {
  id: 'detect-connection',
  name: 'Detect Connection Status',
  description: 'Checking connection status and available actions',
  timeoutMs: 5000,
  maxRetries: 1,

  async execute(context): Promise<StepResult> {
    try {
      // Check connection degree
      const degreeText = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.connectionStatus)
      );

      if (degreeText) {
        if (degreeText.includes('1st')) {
          context.profile.connectionDegree = '1st';
          context.profile.isConnected = true;
        } else if (degreeText.includes('2nd')) {
          context.profile.connectionDegree = '2nd';
          context.profile.isConnected = false;
        } else if (degreeText.includes('3rd')) {
          context.profile.connectionDegree = '3rd';
          context.profile.isConnected = false;
        } else {
          context.profile.connectionDegree = 'Out of network';
          context.profile.isConnected = false;
        }
      }

      // Check for Connect button
      const connectVisible = await browser.isVisible(
        toPlaywrightSelector(ACTION_SELECTORS.connectButton)
      );
      context.profile.canConnect = connectVisible;

      // Check for Pending button (already sent connection)
      const pendingVisible = await browser.isVisible(
        toPlaywrightSelector(ACTION_SELECTORS.pendingButton)
      );
      context.profile.isPending = pendingVisible;

      // Check for Message button
      const messageVisible = await browser.isVisible(
        toPlaywrightSelector(ACTION_SELECTORS.messageButton)
      );
      context.profile.canMessage = messageVisible;

      // If no direct Connect button, check in More dropdown
      if (!connectVisible && !pendingVisible && !context.profile.isConnected) {
        const moreVisible = await browser.isVisible(
          toPlaywrightSelector(ACTION_SELECTORS.moreButton)
        );
        if (moreVisible) {
          // Connect might be in the More dropdown
          context.profile.canConnect = true; // Will verify when actually clicking
        }
      }

      // Extract connection count
      const connectionCount = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.connectionCount)
      );
      if (connectionCount) {
        const match = connectionCount.match(/(\d+)/);
        if (match) {
          context.profile.connectionCount = parseInt(match[1], 10);
        }
      }

      return {
        success: true,
        data: {
          connectionDegree: context.profile.connectionDegree,
          isConnected: context.profile.isConnected,
          isPending: context.profile.isPending,
          canConnect: context.profile.canConnect,
          canMessage: context.profile.canMessage,
        },
      };
    } catch (error) {
      // Non-fatal error - we can continue without connection status
      context.errors.push(
        `Could not detect connection status: ${error instanceof Error ? error.message : 'Unknown'}`
      );
      return { success: true };
    }
  },
};

// ============================================================================
// Workflow Definition
// ============================================================================

export const visitProfileWorkflow: WorkflowDefinition<
  VisitProfileInput,
  VisitProfileOutput,
  VisitProfileContext
> = {
  id: 'linkedin-visit-profile',
  name: 'Visit LinkedIn Profile',
  description: 'Navigate to a LinkedIn profile and extract basic information',
  version: '1.0.0',

  createContext(input: VisitProfileInput): VisitProfileContext {
    return {
      input,
      pageLoaded: false,
      profile: {
        url: input.profileUrl,
        name: null,
        headline: null,
        location: null,
        about: null,
        photoUrl: null,
        connectionDegree: null,
        connectionCount: null,
        currentCompany: null,
        isConnected: false,
        isPending: false,
        canMessage: false,
        canConnect: false,
      },
      errors: [],
    };
  },

  steps: [
    navigateStep,
    waitForPageLoadStep,
    checkErrorStatesStep,
    extractBasicInfoStep,
    detectConnectionStatusStep,
  ],

  getOutput(context: VisitProfileContext): VisitProfileOutput {
    return {
      profile: context.profile,
      pageLoaded: context.pageLoaded,
    };
  },

  validate(input: VisitProfileInput): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!input.profileUrl) {
      errors.push('profileUrl is required');
    } else {
      // Validate URL format
      try {
        const url = new URL(input.profileUrl);
        if (!url.hostname.includes('linkedin.com')) {
          errors.push('URL must be a LinkedIn URL');
        }
        if (!url.pathname.includes('/in/')) {
          warnings.push('URL does not appear to be a profile URL (missing /in/)');
        }
      } catch {
        errors.push('Invalid URL format');
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  },
};

// ============================================================================
// Factory Function
// ============================================================================

export function createVisitProfileWorkflow(browserInterface: BrowserInterface) {
  setBrowser(browserInterface);
  return visitProfileWorkflow;
}
