/**
 * Like Tweet Workflow
 * 
 * Navigates to a tweet and likes it.
 * Supports skip-if-liked and verification.
 */

import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  LikeTweetInput,
  LikeTweetOutput,
} from './types';
import {
  TWEET_SELECTORS,
  NAV_SELECTORS,
  getAllSelectors,
  extractTweetIdFromUrl,
  TWITTER_URL_PATTERNS,
} from './selectors';

// ============================================================================
// Workflow Configuration
// ============================================================================

const LIKE_TWEET_CONFIG = {
  id: 'twitter-like-tweet',
  name: 'Like Twitter Tweet',
  description: 'Navigate to a tweet and like it',
  platform: 'twitter' as const,
  maxDuration: 45000,
  defaultStepTimeout: 10000,
  maxRetries: 2,
  stepDelay: 300,
};

// ============================================================================
// Workflow Steps
// ============================================================================

type LikeTweetContext = WorkflowContext<LikeTweetInput, Partial<LikeTweetOutput>>;

const steps: WorkflowStep<LikeTweetContext>[] = [
  // Step 1: Navigate to tweet
  {
    id: 'navigate-to-tweet',
    name: 'Navigate to Tweet',
    description: 'Navigate to the tweet URL',
    timeout: 15000,
    execute: async (ctx) => {
      const { input, browser, emit } = ctx;

      // Validate and extract tweet ID
      if (!TWITTER_URL_PATTERNS.tweet.test(input.tweetUrl)) {
        throw new Error(`Invalid tweet URL: ${input.tweetUrl}`);
      }

      const tweetId = extractTweetIdFromUrl(input.tweetUrl);
      if (!tweetId) {
        throw new Error('Could not extract tweet ID from URL');
      }

      ctx.data.tweetId = input.tweetId ?? tweetId;

      // Check if already on the tweet page
      const currentUrl = await browser.getCurrentUrl();
      const currentTweetId = extractTweetIdFromUrl(currentUrl);

      if (currentTweetId !== ctx.data.tweetId) {
        const success = await browser.navigate(input.tweetUrl);
        if (!success) {
          throw new Error('Failed to navigate to tweet');
        }
        
        await browser.waitForNavigation(10000);
      }

      return true;
    },
  },

  // Step 2: Wait for tweet to load
  {
    id: 'wait-for-tweet',
    name: 'Wait for Tweet',
    description: 'Wait for the tweet content to load',
    timeout: 15000,
    execute: async (ctx) => {
      const { browser, emit } = ctx;

      // Wait for tweet article to appear
      const tweetLoaded = await browser.waitForSelector(
        getAllSelectors('tweetArticle'),
        10000
      );

      if (!tweetLoaded) {
        // Check for error states
        const errorExists = await browser.elementExists(getAllSelectors('errorMessage'));
        if (errorExists) {
          const errorText = await browser.getElementText(getAllSelectors('errorMessage'));
          throw new Error(`Tweet error: ${errorText ?? 'Tweet may be deleted or unavailable'}`);
        }
        
        throw new Error('Tweet did not load');
      }

      // Wait for like button to be available
      const likeButtonLoaded = await browser.waitForSelector(
        [...getAllSelectors('likeButton'), ...getAllSelectors('unlikeButton')],
        5000
      );

      if (!likeButtonLoaded) {
        throw new Error('Like button not found');
      }

      emit({
        type: 'TWITTER_TWEET_LOADED',
        workflowName: LIKE_TWEET_CONFIG.name,
        data: { tweetId: ctx.data.tweetId },
      });

      return true;
    },
  },

  // Step 3: Check if already liked
  {
    id: 'check-like-status',
    name: 'Check Like Status',
    description: 'Check if the tweet is already liked',
    timeout: 5000,
    execute: async (ctx) => {
      const { browser, input, emit } = ctx;

      // Check for unlike button (indicates already liked)
      // We need to find the unlike button in the main tweet, not in any quoted tweets
      const isLiked = await browser.execute<boolean>(`
        // Find the main tweet (first article or the one focused)
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        let mainTweet = articles[0];
        
        // Try to find the tweet we're actually looking at
        for (const article of articles) {
          const tweetLink = article.querySelector('a[href*="/status/"]');
          if (tweetLink && tweetLink.href.includes(${JSON.stringify(ctx.data.tweetId)})) {
            mainTweet = article;
            break;
          }
        }
        
        if (!mainTweet) return false;
        
        // Check for unlike button within this tweet
        const unlikeBtn = mainTweet.querySelector('[data-testid="unlike"]');
        return !!unlikeBtn;
      `);

      ctx.data.wasAlreadyLiked = isLiked ?? false;

      if (isLiked && input.skipIfLiked) {
        ctx.data.liked = false;
        
        emit({
          type: 'TWITTER_STEP_COMPLETED',
          workflowName: LIKE_TWEET_CONFIG.name,
          data: {
            tweetId: ctx.data.tweetId,
            alreadyLiked: true,
            skipping: true,
          },
        });
      }

      return true;
    },
  },

  // Step 4: Click Like button
  {
    id: 'click-like',
    name: 'Click Like',
    description: 'Click the like button',
    timeout: 5000,
    canSkip: (ctx) => {
      return ctx.data.wasAlreadyLiked === true && ctx.input.skipIfLiked === true;
    },
    execute: async (ctx) => {
      const { browser } = ctx;

      // If already liked, nothing to do
      if (ctx.data.wasAlreadyLiked) {
        ctx.data.liked = false;
        return true;
      }

      // Click the like button in the main tweet
      const clicked = await browser.execute<boolean>(`
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        let mainTweet = articles[0];
        
        // Find the specific tweet
        for (const article of articles) {
          const tweetLink = article.querySelector('a[href*="/status/"]');
          if (tweetLink && tweetLink.href.includes(${JSON.stringify(ctx.data.tweetId)})) {
            mainTweet = article;
            break;
          }
        }
        
        if (!mainTweet) return false;
        
        const likeBtn = mainTweet.querySelector('[data-testid="like"]');
        if (likeBtn) {
          likeBtn.click();
          return true;
        }
        return false;
      `);

      if (!clicked) {
        // Fallback to regular click
        const fallbackClicked = await browser.click(getAllSelectors('likeButton'));
        if (!fallbackClicked) {
          throw new Error('Failed to click like button');
        }
      }

      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 500));

      return true;
    },
  },

  // Step 5: Verify like action
  {
    id: 'verify-like',
    name: 'Verify Like',
    description: 'Verify that the like action was successful',
    timeout: 10000,
    canSkip: (ctx) => {
      return ctx.data.wasAlreadyLiked === true && ctx.input.skipIfLiked === true;
    },
    execute: async (ctx) => {
      const { browser, emit } = ctx;

      // If skipped or already liked
      if (ctx.data.wasAlreadyLiked) {
        ctx.data.liked = false;
        return true;
      }

      // Wait a moment for UI update
      await new Promise(resolve => setTimeout(resolve, 800));

      // Verify: unlike button should now be visible
      const isNowLiked = await browser.execute<boolean>(`
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        let mainTweet = articles[0];
        
        for (const article of articles) {
          const tweetLink = article.querySelector('a[href*="/status/"]');
          if (tweetLink && tweetLink.href.includes(${JSON.stringify(ctx.data.tweetId)})) {
            mainTweet = article;
            break;
          }
        }
        
        if (!mainTweet) return false;
        
        const unlikeBtn = mainTweet.querySelector('[data-testid="unlike"]');
        return !!unlikeBtn;
      `);

      if (!isNowLiked) {
        // Retry check after short delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryCheck = await browser.elementExists(getAllSelectors('unlikeButton'));
        if (!retryCheck) {
          throw new Error('Like verification failed - button state did not change');
        }
      }

      ctx.data.liked = true;

      emit({
        type: 'TWITTER_STEP_COMPLETED',
        workflowName: LIKE_TWEET_CONFIG.name,
        data: {
          tweetId: ctx.data.tweetId,
          liked: true,
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

export const likeTweetWorkflow: WorkflowDefinition<LikeTweetInput, LikeTweetOutput> = {
  config: LIKE_TWEET_CONFIG,
  steps,

  initialize: (input) => ({
    liked: false,
    wasAlreadyLiked: false,
    tweetId: input.tweetId ?? extractTweetIdFromUrl(input.tweetUrl) ?? '',
  }),

  validateInput: (input) => {
    const errors: string[] = [];
    
    if (!input.tweetUrl) {
      errors.push('tweetUrl is required');
    }
    
    if (input.tweetUrl && !TWITTER_URL_PATTERNS.tweet.test(input.tweetUrl)) {
      errors.push('Invalid tweet URL format');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },

  finalize: (data) => ({
    liked: data.liked ?? false,
    wasAlreadyLiked: data.wasAlreadyLiked ?? false,
    tweetId: data.tweetId ?? '',
  }),
};

export default likeTweetWorkflow;
