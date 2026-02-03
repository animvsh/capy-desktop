/**
 * Visit Profile Workflow
 * 
 * Navigates to a Twitter profile, waits for page load,
 * extracts basic profile data, and detects follow status.
 */

import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  VisitProfileInput,
  VisitProfileOutput,
  TwitterProfile,
} from './types';
import {
  PROFILE_SELECTORS,
  ACTION_SELECTORS,
  NAV_SELECTORS,
  getAllSelectors,
  buildProfileUrl,
  extractUsernameFromUrl,
  TWITTER_URL_PATTERNS,
} from './selectors';

// ============================================================================
// Workflow Configuration
// ============================================================================

const VISIT_PROFILE_CONFIG = {
  id: 'twitter-visit-profile',
  name: 'Visit Twitter Profile',
  description: 'Navigate to a Twitter profile and extract basic information',
  platform: 'twitter' as const,
  maxDuration: 60000,
  defaultStepTimeout: 15000,
  maxRetries: 2,
  stepDelay: 500,
};

// ============================================================================
// Workflow Steps
// ============================================================================

type VisitProfileContext = WorkflowContext<VisitProfileInput, Partial<VisitProfileOutput>>;

const steps: WorkflowStep<VisitProfileContext>[] = [
  // Step 1: Navigate to profile URL
  {
    id: 'navigate-to-profile',
    name: 'Navigate to Profile',
    description: 'Navigate to the Twitter profile URL',
    timeout: 15000,
    execute: async (ctx) => {
      const { input, browser, emit } = ctx;
      
      // Build URL from username if only username provided
      let url = input.profileUrl;
      if (!url && input.username) {
        url = buildProfileUrl(input.username);
      }
      
      if (!url) {
        throw new Error('No profile URL or username provided');
      }

      // Validate URL format
      if (!TWITTER_URL_PATTERNS.profile.test(url)) {
        throw new Error(`Invalid Twitter profile URL: ${url}`);
      }

      ctx.data.url = url;
      
      const success = await browser.navigate(url);
      if (!success) {
        throw new Error('Failed to navigate to profile');
      }

      return true;
    },
  },

  // Step 2: Wait for profile page to load
  {
    id: 'wait-for-profile-load',
    name: 'Wait for Profile Load',
    description: 'Wait for the profile page elements to appear',
    timeout: 20000,
    execute: async (ctx) => {
      const { browser, emit } = ctx;

      // Wait for primary column (main content area)
      const primaryLoaded = await browser.waitForSelector(
        getAllSelectors('primaryColumn'),
        10000
      );

      if (!primaryLoaded) {
        throw new Error('Profile page did not load - primary column not found');
      }

      // Wait for profile name to appear
      const nameLoaded = await browser.waitForSelector(
        getAllSelectors('profileName'),
        10000
      );

      if (!nameLoaded) {
        // Check if this is an error page (account suspended, doesn't exist, etc.)
        const errorExists = await browser.elementExists(getAllSelectors('errorMessage'));
        if (errorExists) {
          const errorText = await browser.getElementText(getAllSelectors('errorMessage'));
          throw new Error(`Profile error: ${errorText ?? 'Unknown error'}`);
        }
        throw new Error('Profile name not found - page may not have loaded correctly');
      }

      ctx.data.pageLoaded = true;
      
      emit({
        type: 'TWITTER_PROFILE_EXTRACTED',
        workflowName: VISIT_PROFILE_CONFIG.name,
        data: { stage: 'page_loaded' },
      });

      return true;
    },
  },

  // Step 3: Extract profile display name
  {
    id: 'extract-display-name',
    name: 'Extract Display Name',
    description: 'Extract the profile display name',
    execute: async (ctx) => {
      const { browser } = ctx;

      const displayName = await browser.getElementText(
        getAllSelectors('profileName')
      );

      if (!displayName) {
        throw new Error('Could not extract display name');
      }

      // Initialize profile object
      ctx.data.profile = {
        ...ctx.data.profile,
        displayName,
        username: '',
        followersCount: 0,
        followingCount: 0,
        isVerified: false,
        isFollowing: false,
      } as TwitterProfile;

      return true;
    },
  },

  // Step 4: Extract username/handle
  {
    id: 'extract-handle',
    name: 'Extract Handle',
    description: 'Extract the @username handle',
    execute: async (ctx) => {
      const { browser, input } = ctx;

      // Try to get from selector first
      let username = await browser.getElementText(
        getAllSelectors('profileHandle')
      );

      // Clean up the username (remove @ if present)
      if (username) {
        username = username.replace(/^@/, '').trim();
      }

      // Fallback: extract from URL
      if (!username) {
        const currentUrl = await browser.getCurrentUrl();
        username = extractUsernameFromUrl(currentUrl);
      }

      // Fallback: use input
      if (!username && input.username) {
        username = input.username.replace(/^@/, '');
      }

      if (!username) {
        throw new Error('Could not extract username');
      }

      ctx.data.profile!.username = username;

      return true;
    },
  },

  // Step 5: Extract bio (optional)
  {
    id: 'extract-bio',
    name: 'Extract Bio',
    description: 'Extract the profile biography',
    execute: async (ctx) => {
      const { browser } = ctx;

      const bio = await browser.getElementText(
        getAllSelectors('profileBio')
      );

      ctx.data.profile!.bio = bio ?? undefined;

      return true; // Bio is optional, always succeed
    },
  },

  // Step 6: Extract follower/following counts
  {
    id: 'extract-counts',
    name: 'Extract Follower Counts',
    description: 'Extract followers and following counts',
    execute: async (ctx) => {
      const { browser } = ctx;

      // Extract followers count
      const followersText = await browser.getElementText(
        getAllSelectors('followersCount')
      );
      ctx.data.profile!.followersCount = parseCount(followersText ?? '0');

      // Extract following count
      const followingText = await browser.getElementText(
        getAllSelectors('followingCount')
      );
      ctx.data.profile!.followingCount = parseCount(followingText ?? '0');

      return true;
    },
  },

  // Step 7: Check verification status
  {
    id: 'check-verified',
    name: 'Check Verification',
    description: 'Check if the profile is verified',
    execute: async (ctx) => {
      const { browser } = ctx;

      const isVerified = await browser.elementExists(
        getAllSelectors('verifiedBadge')
      );

      ctx.data.profile!.isVerified = isVerified;

      return true;
    },
  },

  // Step 8: Detect follow status
  {
    id: 'detect-follow-status',
    name: 'Detect Follow Status',
    description: 'Check if currently following this profile',
    execute: async (ctx) => {
      const { browser, emit } = ctx;

      // Check for "Following" button (indicates already following)
      const isFollowing = await browser.elementExists(
        getAllSelectors('unfollowButton')
      );

      // If not following, check if Follow button exists
      const followButtonExists = await browser.elementExists(
        getAllSelectors('followButton')
      );

      ctx.data.profile!.isFollowing = isFollowing;

      emit({
        type: 'TWITTER_FOLLOW_DETECTED',
        workflowName: VISIT_PROFILE_CONFIG.name,
        data: {
          isFollowing,
          followButtonExists,
          username: ctx.data.profile!.username,
        },
      });

      return true;
    },
  },

  // Step 9: Extract additional metadata (optional)
  {
    id: 'extract-metadata',
    name: 'Extract Metadata',
    description: 'Extract location, website, and join date',
    execute: async (ctx) => {
      const { browser } = ctx;

      // Location
      const location = await browser.getElementText(
        getAllSelectors('profileLocation')
      );
      ctx.data.profile!.location = location ?? undefined;

      // Website
      const website = await browser.getElementAttribute(
        getAllSelectors('profileWebsite'),
        'href'
      );
      ctx.data.profile!.website = website ?? undefined;

      // Join date
      const joinDate = await browser.getElementText(
        getAllSelectors('profileJoinDate')
      );
      ctx.data.profile!.joinDate = joinDate ?? undefined;

      // Avatar URL
      const avatarUrl = await browser.getElementAttribute(
        getAllSelectors('profileAvatar'),
        'src'
      );
      ctx.data.profile!.avatarUrl = avatarUrl ?? undefined;

      return true;
    },
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse count strings like "1.2K", "5M", "123" into numbers
 */
function parseCount(text: string): number {
  if (!text) return 0;
  
  const cleaned = text.replace(/,/g, '').trim().toLowerCase();
  const match = cleaned.match(/^([\d.]+)\s*([kmb])?$/);
  
  if (!match) return 0;
  
  const num = parseFloat(match[1]);
  const multiplier = match[2];
  
  switch (multiplier) {
    case 'k': return Math.round(num * 1000);
    case 'm': return Math.round(num * 1000000);
    case 'b': return Math.round(num * 1000000000);
    default: return Math.round(num);
  }
}

// ============================================================================
// Workflow Definition
// ============================================================================

export const visitProfileWorkflow: WorkflowDefinition<VisitProfileInput, VisitProfileOutput> = {
  config: VISIT_PROFILE_CONFIG,
  steps,

  initialize: (input) => ({
    profile: undefined,
    pageLoaded: false,
    url: input.profileUrl ?? (input.username ? buildProfileUrl(input.username) : ''),
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

  finalize: (data) => {
    if (!data.profile) {
      throw new Error('Profile data not extracted');
    }
    
    return {
      profile: data.profile,
      pageLoaded: data.pageLoaded ?? false,
      url: data.url ?? '',
    };
  },
};

export default visitProfileWorkflow;
