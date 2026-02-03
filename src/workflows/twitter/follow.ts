/**
 * Follow Workflow
 * 
 * Follows a Twitter user by clicking the Follow button.
 * Supports skip-if-following and verification of follow action.
 */

import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  FollowInput,
  FollowOutput,
} from './types';
import {
  ACTION_SELECTORS,
  getAllSelectors,
  buildProfileUrl,
  extractUsernameFromUrl,
  TWITTER_URL_PATTERNS,
} from './selectors';
import { visitProfileWorkflow } from './visit-profile';
import { createWorkflowExecutor } from './base-workflow';

// ============================================================================
// Workflow Configuration
// ============================================================================

const FOLLOW_CONFIG = {
  id: 'twitter-follow',
  name: 'Follow Twitter User',
  description: 'Follow a Twitter user by clicking the Follow button',
  platform: 'twitter' as const,
  maxDuration: 30000,
  defaultStepTimeout: 10000,
  maxRetries: 2,
  stepDelay: 300,
};

// ============================================================================
// Workflow Steps
// ============================================================================

type FollowContext = WorkflowContext<FollowInput, Partial<FollowOutput>>;

const steps: WorkflowStep<FollowContext>[] = [
  // Step 1: Ensure we're on the profile page
  {
    id: 'ensure-profile-page',
    name: 'Ensure Profile Page',
    description: 'Navigate to profile if not already there',
    timeout: 20000,
    execute: async (ctx) => {
      const { input, browser, emit } = ctx;

      // Check current URL
      const currentUrl = await browser.getCurrentUrl();
      
      // Determine target URL
      let targetUrl = input.profileUrl;
      if (!targetUrl && input.username) {
        targetUrl = buildProfileUrl(input.username);
      }

      // If we have a target and we're not there, navigate
      if (targetUrl) {
        const isOnProfile = currentUrl.toLowerCase().includes(
          extractUsernameFromUrl(targetUrl)?.toLowerCase() ?? ''
        );

        if (!isOnProfile) {
          const success = await browser.navigate(targetUrl);
          if (!success) {
            throw new Error('Failed to navigate to profile');
          }
          
          // Wait for page load
          await browser.waitForNavigation(10000);
        }
      }

      // Extract username from current URL if not provided
      if (!ctx.data.username) {
        const url = await browser.getCurrentUrl();
        ctx.data.username = extractUsernameFromUrl(url) ?? input.username ?? 'unknown';
      }

      return true;
    },
  },

  // Step 2: Check current follow status
  {
    id: 'check-follow-status',
    name: 'Check Follow Status',
    description: 'Check if already following this user',
    timeout: 5000,
    execute: async (ctx) => {
      const { browser, input, emit } = ctx;

      // Check for "Following" button (already following)
      const isFollowing = await browser.elementExists(
        getAllSelectors('unfollowButton')
      );

      ctx.data.wasAlreadyFollowing = isFollowing;

      if (isFollowing && input.skipIfFollowing) {
        emit({
          type: 'TWITTER_FOLLOW_DETECTED',
          workflowName: FOLLOW_CONFIG.name,
          data: {
            username: ctx.data.username,
            alreadyFollowing: true,
            skipping: true,
          },
        });
        
        ctx.data.followed = false;
        return true; // Will be handled by canSkip
      }

      return true;
    },
  },

  // Step 3: Click Follow button
  {
    id: 'click-follow',
    name: 'Click Follow Button',
    description: 'Click the Follow button to follow the user',
    timeout: 5000,
    requiresApproval: true, // Follow action requires approval
    canSkip: (ctx) => {
      // Skip if already following and skipIfFollowing is true
      return ctx.data.wasAlreadyFollowing === true && ctx.input.skipIfFollowing === true;
    },
    execute: async (ctx) => {
      const { browser, emit } = ctx;

      // If already following, nothing to do
      if (ctx.data.wasAlreadyFollowing) {
        ctx.data.followed = false;
        return true;
      }

      // Check if Follow button exists
      const followExists = await browser.elementExists(
        getAllSelectors('followButton')
      );

      if (!followExists) {
        // Maybe protected account or already following
        const isFollowing = await browser.elementExists(
          getAllSelectors('unfollowButton')
        );
        
        if (isFollowing) {
          ctx.data.wasAlreadyFollowing = true;
          ctx.data.followed = false;
          return true;
        }
        
        throw new Error('Follow button not found - account may be protected');
      }

      // Click the Follow button
      const clicked = await browser.click(getAllSelectors('followButton'));
      
      if (!clicked) {
        throw new Error('Failed to click Follow button');
      }

      // Small delay for the action to process
      await new Promise(resolve => setTimeout(resolve, 500));

      return true;
    },
  },

  // Step 4: Verify follow action
  {
    id: 'verify-follow',
    name: 'Verify Follow',
    description: 'Verify that the follow action was successful',
    timeout: 10000,
    canSkip: (ctx) => {
      return ctx.data.wasAlreadyFollowing === true && ctx.input.skipIfFollowing === true;
    },
    execute: async (ctx) => {
      const { browser, emit } = ctx;

      // If we skipped or were already following, mark as complete
      if (ctx.data.wasAlreadyFollowing) {
        ctx.data.followed = false;
        return true;
      }

      // Wait a bit for UI to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify: "Following" button should now be visible
      let isNowFollowing = await browser.elementExists(
        getAllSelectors('unfollowButton')
      );

      // If not immediately visible, wait and retry
      if (!isNowFollowing) {
        await browser.waitForSelector(
          getAllSelectors('unfollowButton'),
          5000
        );
        
        isNowFollowing = await browser.elementExists(
          getAllSelectors('unfollowButton')
        );
      }

      if (!isNowFollowing) {
        // Check if there was an error (rate limit, etc.)
        const errorExists = await browser.elementExists(getAllSelectors('errorMessage'));
        if (errorExists) {
          const errorText = await browser.getElementText(getAllSelectors('errorMessage'));
          throw new Error(`Follow failed: ${errorText ?? 'Unknown error'}`);
        }
        
        throw new Error('Follow verification failed - button state did not change');
      }

      ctx.data.followed = true;

      emit({
        type: 'TWITTER_FOLLOW_DETECTED',
        workflowName: FOLLOW_CONFIG.name,
        data: {
          username: ctx.data.username,
          followed: true,
          verified: true,
        },
      });

      return true;
    },
  },
];

// ============================================================================
// Workflow Definition
// ============================================================================

export const followWorkflow: WorkflowDefinition<FollowInput, FollowOutput> = {
  config: FOLLOW_CONFIG,
  steps,

  initialize: (input) => ({
    followed: false,
    wasAlreadyFollowing: false,
    username: input.username?.replace(/^@/, '') ?? '',
  }),

  validateInput: (input) => {
    const errors: string[] = [];
    
    if (!input.profileUrl && !input.username) {
      errors.push('Either profileUrl or username is required');
    }
    
    if (input.profileUrl && !TWITTER_URL_PATTERNS.profile.test(input.profileUrl)) {
      errors.push('Invalid Twitter profile URL format');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },

  finalize: (data) => ({
    followed: data.followed ?? false,
    wasAlreadyFollowing: data.wasAlreadyFollowing ?? false,
    username: data.username ?? 'unknown',
  }),
};

export default followWorkflow;
