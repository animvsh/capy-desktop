/**
 * Twitter Workflow Types
 * 
 * Type definitions for Twitter automation workflows
 */

import { Action, RuntimeEvent } from '../../types/events';

// ============================================================================
// Workflow State Machine
// ============================================================================

export type WorkflowStatus = 
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'awaiting_approval';

export interface WorkflowState<TData = unknown> {
  status: WorkflowStatus;
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
  data: TData;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  pausedAt?: number;
}

// ============================================================================
// Profile Data
// ============================================================================

export interface TwitterProfile {
  username: string;
  displayName: string;
  bio?: string;
  location?: string;
  website?: string;
  joinDate?: string;
  followersCount: number;
  followingCount: number;
  isVerified: boolean;
  avatarUrl?: string;
  bannerUrl?: string;
  isFollowing: boolean;
  isFollowedBy?: boolean;
  isProtected?: boolean;
}

export interface ProfileExtractionResult {
  success: boolean;
  profile?: TwitterProfile;
  recentTweets?: TweetData[];
  engagementStats?: EngagementStats;
  error?: string;
  extractedAt: number;
}

// ============================================================================
// Tweet Data
// ============================================================================

export interface TweetData {
  id: string;
  text: string;
  authorUsername: string;
  authorDisplayName: string;
  timestamp: string;
  likes: number;
  retweets: number;
  replies: number;
  views?: number;
  isRetweet: boolean;
  isReply: boolean;
  hasMedia: boolean;
  url: string;
}

export interface EngagementStats {
  totalTweets?: number;
  avgLikes: number;
  avgRetweets: number;
  avgReplies: number;
  engagementRate: number;
  topTweet?: TweetData;
}

// ============================================================================
// Workflow Input/Output Types
// ============================================================================

// Visit Profile
export interface VisitProfileInput {
  profileUrl: string;
  username?: string;
  waitForFullLoad?: boolean;
}

export interface VisitProfileOutput {
  profile: TwitterProfile;
  pageLoaded: boolean;
  url: string;
}

// Follow
export interface FollowInput {
  profileUrl?: string;
  username?: string;
  /** If true, skip if already following */
  skipIfFollowing?: boolean;
}

export interface FollowOutput {
  followed: boolean;
  wasAlreadyFollowing: boolean;
  username: string;
}

// Send DM
export interface SendDMInput {
  recipientUsername: string;
  message: string;
  /** Navigate to profile first to click DM button */
  navigateToProfile?: boolean;
}

export interface SendDMOutput {
  sent: boolean;
  messageId?: string;
  recipientUsername: string;
}

// Like Tweet
export interface LikeTweetInput {
  tweetUrl: string;
  tweetId?: string;
  /** If true, skip if already liked */
  skipIfLiked?: boolean;
}

export interface LikeTweetOutput {
  liked: boolean;
  wasAlreadyLiked: boolean;
  tweetId: string;
}

// Extract Profile
export interface ExtractProfileInput {
  profileUrl: string;
  username?: string;
  /** Number of recent tweets to extract */
  tweetCount?: number;
  /** Include engagement stats calculation */
  includeEngagementStats?: boolean;
}

export interface ExtractProfileOutput {
  profile: TwitterProfile;
  recentTweets: TweetData[];
  engagementStats?: EngagementStats;
}

// ============================================================================
// Workflow Events
// ============================================================================

export type TwitterWorkflowEventType =
  | 'TWITTER_WORKFLOW_STARTED'
  | 'TWITTER_WORKFLOW_COMPLETED'
  | 'TWITTER_WORKFLOW_FAILED'
  | 'TWITTER_WORKFLOW_PAUSED'
  | 'TWITTER_WORKFLOW_RESUMED'
  | 'TWITTER_WORKFLOW_STOPPED'
  | 'TWITTER_STEP_STARTED'
  | 'TWITTER_STEP_COMPLETED'
  | 'TWITTER_STEP_FAILED'
  | 'TWITTER_SELECTOR_FALLBACK'
  | 'TWITTER_PROFILE_EXTRACTED'
  | 'TWITTER_FOLLOW_DETECTED'
  | 'TWITTER_DM_READY'
  | 'TWITTER_TWEET_LOADED';

export interface TwitterWorkflowEvent {
  id: string;
  type: TwitterWorkflowEventType;
  timestamp: number;
  runId: string;
  workflowName: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Workflow Step Definition
// ============================================================================

export interface WorkflowStep<TContext = unknown> {
  id: string;
  name: string;
  description: string;
  /** Execute the step, returns true if successful */
  execute: (context: TContext) => Promise<boolean>;
  /** Optional: check if step can be skipped */
  canSkip?: (context: TContext) => boolean;
  /** Optional: custom retry logic */
  maxRetries?: number;
  /** Optional: timeout in ms */
  timeout?: number;
  /** Optional: actions that require approval */
  requiresApproval?: boolean;
}

// ============================================================================
// Workflow Configuration
// ============================================================================

export interface WorkflowConfig {
  /** Unique workflow identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the workflow does */
  description: string;
  /** Maximum time for entire workflow in ms */
  maxDuration?: number;
  /** Default step timeout in ms */
  defaultStepTimeout?: number;
  /** Maximum retries per step */
  maxRetries?: number;
  /** Delay between steps in ms */
  stepDelay?: number;
  /** Platform identifier */
  platform: 'twitter';
}

// ============================================================================
// Workflow Execution Context
// ============================================================================

export interface WorkflowContext<TInput = unknown, TData = unknown> {
  /** Unique run identifier */
  runId: string;
  /** Input parameters */
  input: TInput;
  /** Mutable data accumulated during execution */
  data: TData;
  /** Current workflow state */
  state: WorkflowState<TData>;
  /** Abort signal for stopping */
  abortSignal: AbortSignal;
  /** Emit workflow event */
  emit: (event: Omit<TwitterWorkflowEvent, 'id' | 'timestamp' | 'runId'>) => void;
  /** Request approval for an action */
  requestApproval: (action: Action, reason: string) => Promise<boolean>;
  /** Browser control functions */
  browser: BrowserControl;
}

// ============================================================================
// Browser Control Interface
// ============================================================================

export interface BrowserControl {
  /** Navigate to URL */
  navigate: (url: string) => Promise<boolean>;
  /** Click element by selector with fallbacks */
  click: (selectors: string | string[]) => Promise<boolean>;
  /** Type text into element */
  type: (selectors: string | string[], text: string, options?: TypeOptions) => Promise<boolean>;
  /** Wait for element to appear */
  waitForSelector: (selectors: string | string[], timeout?: number) => Promise<boolean>;
  /** Wait for navigation to complete */
  waitForNavigation: (timeout?: number) => Promise<boolean>;
  /** Execute script and return result */
  execute: <T = unknown>(script: string) => Promise<T | null>;
  /** Get current URL */
  getCurrentUrl: () => Promise<string>;
  /** Check if element exists */
  elementExists: (selectors: string | string[]) => Promise<boolean>;
  /** Get element text content */
  getElementText: (selectors: string | string[]) => Promise<string | null>;
  /** Get element attribute */
  getElementAttribute: (selectors: string | string[], attribute: string) => Promise<string | null>;
  /** Scroll page */
  scroll: (direction: 'up' | 'down', amount?: number) => Promise<boolean>;
  /** Take screenshot */
  screenshot: () => Promise<string | null>;
}

export interface TypeOptions {
  /** Delay between keystrokes in ms */
  delay?: number;
  /** Clear existing content first */
  clearFirst?: boolean;
  /** Press Enter after typing */
  pressEnter?: boolean;
}

// ============================================================================
// Workflow Registry
// ============================================================================

export interface WorkflowDefinition<TInput = unknown, TOutput = unknown> {
  config: WorkflowConfig;
  steps: WorkflowStep<WorkflowContext<TInput, Partial<TOutput>>>[];
  /** Initialize workflow data */
  initialize: (input: TInput) => Partial<TOutput>;
  /** Validate input before execution */
  validateInput: (input: TInput) => { valid: boolean; errors?: string[] };
  /** Finalize and return output */
  finalize: (data: Partial<TOutput>) => TOutput;
}

export type WorkflowRegistry = Map<string, WorkflowDefinition<unknown, unknown>>;
