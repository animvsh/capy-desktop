/**
 * Twitter Selectors
 * 
 * Centralized selector management for Twitter/X automation.
 * Twitter uses obfuscated class names that change frequently,
 * so we use multiple selector strategies with fallbacks.
 */

// ============================================================================
// Selector Types
// ============================================================================

export interface SelectorConfig {
  /** Primary selector to try first */
  primary: string;
  /** Fallback selectors in order of preference */
  fallbacks: string[];
  /** Human-readable description */
  description: string;
  /** Expected element type for validation */
  expectedTag?: string;
}

export type SelectorKey = keyof typeof TWITTER_SELECTORS;

// ============================================================================
// Profile Page Selectors
// ============================================================================

export const PROFILE_SELECTORS = {
  // Profile header elements
  profileName: {
    primary: '[data-testid="UserName"] span:first-child',
    fallbacks: [
      '[data-testid="UserProfileHeader_Items"] span',
      'h2[role="heading"] span',
      '[data-testid="primaryColumn"] h2 span',
    ],
    description: 'Profile display name',
  },

  profileHandle: {
    primary: '[data-testid="UserName"] div:last-child span',
    fallbacks: [
      '[data-testid="UserName"] a span',
      'a[href*="/"] span[dir="ltr"]',
    ],
    description: 'Profile @handle',
  },

  profileBio: {
    primary: '[data-testid="UserDescription"]',
    fallbacks: [
      '[data-testid="UserProfileHeader_Items"] + div > div',
      '[data-testid="primaryColumn"] div[dir="auto"]',
    ],
    description: 'Profile biography',
  },

  profileAvatar: {
    primary: '[data-testid="UserAvatar-Container-unknown"] img',
    fallbacks: [
      'a[href$="/photo"] img',
      '[data-testid="primaryColumn"] img[src*="profile_images"]',
    ],
    description: 'Profile avatar image',
  },

  profileBanner: {
    primary: '[data-testid="UserProfileHeader_Items"] img',
    fallbacks: [
      'a[href$="/header_photo"] img',
      '[style*="background-image"]',
    ],
    description: 'Profile banner image',
  },

  // Stats
  followersCount: {
    primary: 'a[href$="/verified_followers"] span span',
    fallbacks: [
      'a[href$="/followers"] span span',
      '[data-testid="primaryColumn"] a[href$="/followers"]',
    ],
    description: 'Followers count',
  },

  followingCount: {
    primary: 'a[href$="/following"] span span',
    fallbacks: [
      '[data-testid="primaryColumn"] a[href$="/following"]',
    ],
    description: 'Following count',
  },

  // Location, website, join date
  profileLocation: {
    primary: '[data-testid="UserProfileHeader_Items"] span[data-testid="UserLocation"]',
    fallbacks: [
      '[data-testid="UserProfileHeader_Items"] span:has(svg[viewBox="0 0 24 24"])',
    ],
    description: 'Profile location',
  },

  profileWebsite: {
    primary: '[data-testid="UserProfileHeader_Items"] a[href*="t.co"]',
    fallbacks: [
      '[data-testid="UserUrl"] a',
    ],
    description: 'Profile website link',
  },

  profileJoinDate: {
    primary: '[data-testid="UserProfileHeader_Items"] span[data-testid="UserJoinDate"]',
    fallbacks: [
      '[data-testid="UserProfileHeader_Items"] span:contains("Joined")',
    ],
    description: 'Profile join date',
  },

  // Verification
  verifiedBadge: {
    primary: '[data-testid="UserName"] svg[aria-label="Verified account"]',
    fallbacks: [
      '[data-testid="UserName"] [data-testid="icon-verified"]',
      '[data-testid="verificationBadge"]',
    ],
    description: 'Verified badge indicator',
  },
} as const;

// ============================================================================
// Action Button Selectors
// ============================================================================

export const ACTION_SELECTORS = {
  // Follow/Unfollow
  followButton: {
    primary: '[data-testid="followButton"]',
    fallbacks: [
      '[data-testid$="-follow"]',
      'div[role="button"]:has-text("Follow")',
      '[aria-label*="Follow @"]',
    ],
    description: 'Follow button',
  },

  unfollowButton: {
    primary: '[data-testid="unfollowButton"]',
    fallbacks: [
      '[data-testid$="-unfollow"]',
      'div[role="button"]:has-text("Following")',
      '[aria-label*="Following"]',
    ],
    description: 'Unfollow button (shows as "Following")',
  },

  unfollowConfirm: {
    primary: '[data-testid="confirmationSheetConfirm"]',
    fallbacks: [
      '[data-testid="unfollow"]',
      'div[role="button"]:has-text("Unfollow")',
    ],
    description: 'Unfollow confirmation button',
  },

  // Message/DM
  messageButton: {
    primary: '[data-testid="sendDMFromProfile"]',
    fallbacks: [
      '[data-testid="messagePill"]',
      'a[href="/messages/compose"]',
      '[aria-label="Message"]',
    ],
    description: 'Message/DM button on profile',
  },

  // More options
  moreButton: {
    primary: '[data-testid="userActions"]',
    fallbacks: [
      '[aria-label="More"]',
      '[data-testid="moreButton"]',
    ],
    description: 'More actions button',
  },
} as const;

// ============================================================================
// Tweet Selectors
// ============================================================================

export const TWEET_SELECTORS = {
  // Tweet container
  tweetArticle: {
    primary: 'article[data-testid="tweet"]',
    fallbacks: [
      '[data-testid="cellInnerDiv"] article',
      'article[role="article"]',
    ],
    description: 'Tweet article container',
  },

  tweetText: {
    primary: '[data-testid="tweetText"]',
    fallbacks: [
      'article div[lang]',
      'article div[dir="auto"]',
    ],
    description: 'Tweet text content',
  },

  // Tweet actions
  likeButton: {
    primary: '[data-testid="like"]',
    fallbacks: [
      '[aria-label*="Like"]',
      'div[role="button"][aria-label*="like"]',
    ],
    description: 'Like button',
  },

  unlikeButton: {
    primary: '[data-testid="unlike"]',
    fallbacks: [
      '[aria-label*="Liked"]',
      'div[role="button"][aria-label*="liked"]',
    ],
    description: 'Unlike button (already liked)',
  },

  retweetButton: {
    primary: '[data-testid="retweet"]',
    fallbacks: [
      '[aria-label*="Repost"]',
      'div[role="button"][aria-label*="repost"]',
    ],
    description: 'Retweet/Repost button',
  },

  replyButton: {
    primary: '[data-testid="reply"]',
    fallbacks: [
      '[aria-label*="Reply"]',
      'div[role="button"][aria-label*="reply"]',
    ],
    description: 'Reply button',
  },

  shareButton: {
    primary: '[data-testid="share"]',
    fallbacks: [
      '[aria-label*="Share"]',
      'div[role="button"][aria-label*="share"]',
    ],
    description: 'Share button',
  },

  bookmarkButton: {
    primary: '[data-testid="bookmark"]',
    fallbacks: [
      '[aria-label*="Bookmark"]',
      'div[role="button"][aria-label*="bookmark"]',
    ],
    description: 'Bookmark button',
  },

  // Tweet stats
  likeCount: {
    primary: '[data-testid="like"] span span',
    fallbacks: [
      '[aria-label*="Like"] span',
    ],
    description: 'Like count',
  },

  retweetCount: {
    primary: '[data-testid="retweet"] span span',
    fallbacks: [
      '[aria-label*="Repost"] span',
    ],
    description: 'Retweet count',
  },

  replyCount: {
    primary: '[data-testid="reply"] span span',
    fallbacks: [
      '[aria-label*="Reply"] span',
    ],
    description: 'Reply count',
  },

  viewCount: {
    primary: 'a[href*="/analytics"] span',
    fallbacks: [
      '[aria-label*="View"]',
    ],
    description: 'View count',
  },

  // Tweet metadata
  tweetTimestamp: {
    primary: 'time[datetime]',
    fallbacks: [
      'a[href*="/status/"] time',
    ],
    description: 'Tweet timestamp',
  },

  tweetAuthor: {
    primary: '[data-testid="User-Name"]',
    fallbacks: [
      'article a[role="link"][href*="/"]',
    ],
    description: 'Tweet author info',
  },
} as const;

// ============================================================================
// DM/Message Selectors
// ============================================================================

export const DM_SELECTORS = {
  // Compose
  dmComposeButton: {
    primary: '[data-testid="NewDM_Button"]',
    fallbacks: [
      'a[href="/messages/compose"]',
      '[aria-label*="New message"]',
    ],
    description: 'New DM compose button',
  },

  dmSearchInput: {
    primary: '[data-testid="searchPeople"] input',
    fallbacks: [
      'input[placeholder*="Search"]',
      '[data-testid="DMDrawer"] input',
    ],
    description: 'DM recipient search input',
  },

  dmTextarea: {
    primary: '[data-testid="dmComposerTextInput"]',
    fallbacks: [
      '[data-testid="dmComposerTextarea"]',
      'div[contenteditable="true"][data-testid*="dm"]',
      '[data-testid="messageEntry"] div[contenteditable]',
    ],
    description: 'DM message textarea',
  },

  dmSendButton: {
    primary: '[data-testid="dmComposerSendButton"]',
    fallbacks: [
      '[data-testid="sendButton"]',
      'button[aria-label="Send"]',
      '[data-testid="messageEntry"] button[type="button"]',
    ],
    description: 'DM send button',
  },

  // DM conversation
  dmConversation: {
    primary: '[data-testid="conversation"]',
    fallbacks: [
      '[data-testid="DM_conversation"]',
      'div[data-testid*="conversation"]',
    ],
    description: 'DM conversation container',
  },

  dmMessageEntry: {
    primary: '[data-testid="messageEntry"]',
    fallbacks: [
      '[data-testid="DM_message_entry"]',
    ],
    description: 'DM message entry',
  },

  dmMessage: {
    primary: '[data-testid="dmConversationMessage"]',
    fallbacks: [
      '[data-testid*="message"]',
    ],
    description: 'Individual DM message',
  },

  // DM drawer
  dmDrawer: {
    primary: '[data-testid="DMDrawer"]',
    fallbacks: [
      '[aria-label="Direct Messages"]',
    ],
    description: 'DM drawer/sidebar',
  },
} as const;

// ============================================================================
// Navigation & UI Selectors
// ============================================================================

export const NAV_SELECTORS = {
  // Main navigation
  homeLink: {
    primary: 'a[data-testid="AppTabBar_Home_Link"]',
    fallbacks: [
      'a[href="/home"]',
      '[aria-label="Home"]',
    ],
    description: 'Home navigation link',
  },

  searchLink: {
    primary: 'a[data-testid="AppTabBar_Explore_Link"]',
    fallbacks: [
      'a[href="/explore"]',
      '[aria-label="Search and explore"]',
    ],
    description: 'Explore/Search navigation link',
  },

  notificationsLink: {
    primary: 'a[data-testid="AppTabBar_Notifications_Link"]',
    fallbacks: [
      'a[href="/notifications"]',
      '[aria-label="Notifications"]',
    ],
    description: 'Notifications navigation link',
  },

  messagesLink: {
    primary: 'a[data-testid="AppTabBar_DirectMessage_Link"]',
    fallbacks: [
      'a[href="/messages"]',
      '[aria-label="Direct Messages"]',
    ],
    description: 'Messages navigation link',
  },

  profileLink: {
    primary: 'a[data-testid="AppTabBar_Profile_Link"]',
    fallbacks: [
      '[aria-label="Profile"]',
    ],
    description: 'Profile navigation link',
  },

  // Page indicators
  primaryColumn: {
    primary: '[data-testid="primaryColumn"]',
    fallbacks: [
      'main[role="main"]',
      'div[data-testid="primaryColumn"]',
    ],
    description: 'Primary content column',
  },

  sidebarColumn: {
    primary: '[data-testid="sidebarColumn"]',
    fallbacks: [
      'aside[aria-label="Trending"]',
    ],
    description: 'Sidebar column',
  },

  // Loading states
  loadingSpinner: {
    primary: '[role="progressbar"]',
    fallbacks: [
      'svg[aria-label="Loading"]',
      '[data-testid="loading"]',
    ],
    description: 'Loading spinner',
  },

  // Error states
  errorMessage: {
    primary: '[data-testid="error-detail"]',
    fallbacks: [
      '[role="alert"]',
    ],
    description: 'Error message',
  },
} as const;

// ============================================================================
// Combined Selectors Object
// ============================================================================

export const TWITTER_SELECTORS = {
  ...PROFILE_SELECTORS,
  ...ACTION_SELECTORS,
  ...TWEET_SELECTORS,
  ...DM_SELECTORS,
  ...NAV_SELECTORS,
} as const;

// ============================================================================
// Selector Utilities
// ============================================================================

/**
 * Get all selectors for a key (primary + fallbacks)
 */
export function getAllSelectors(key: SelectorKey): string[] {
  const config = TWITTER_SELECTORS[key];
  return [config.primary, ...config.fallbacks];
}

/**
 * Build a combined selector using :is() for efficiency
 */
export function buildCombinedSelector(key: SelectorKey): string {
  const selectors = getAllSelectors(key);
  // Some selectors contain :has() which may not work in :is()
  // So we fallback to comma-separated selectors
  return selectors.join(', ');
}

/**
 * Build selector with context (e.g., within a specific container)
 */
export function buildScopedSelector(
  key: SelectorKey,
  containerSelector: string
): string[] {
  return getAllSelectors(key).map((sel) => `${containerSelector} ${sel}`);
}

/**
 * Get selector description for logging
 */
export function getSelectorDescription(key: SelectorKey): string {
  return TWITTER_SELECTORS[key].description;
}

/**
 * Check if an element matches any of the selectors for a key
 */
export function matchesSelector(element: Element, key: SelectorKey): boolean {
  const selectors = getAllSelectors(key);
  return selectors.some((sel) => {
    try {
      return element.matches(sel);
    } catch {
      return false;
    }
  });
}

// ============================================================================
// URL Patterns
// ============================================================================

export const TWITTER_URL_PATTERNS = {
  /** Match profile URLs: twitter.com/username or x.com/username */
  profile: /^https?:\/\/(twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/?$/,
  
  /** Match tweet URLs: twitter.com/username/status/123 */
  tweet: /^https?:\/\/(twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/,
  
  /** Match DM URLs */
  dm: /^https?:\/\/(twitter\.com|x\.com)\/messages/,
  
  /** Match home timeline */
  home: /^https?:\/\/(twitter\.com|x\.com)\/home/,
  
  /** Match search */
  search: /^https?:\/\/(twitter\.com|x\.com)\/search/,
  
  /** Match notifications */
  notifications: /^https?:\/\/(twitter\.com|x\.com)\/notifications/,
} as const;

/**
 * Extract username from profile URL
 */
export function extractUsernameFromUrl(url: string): string | null {
  const match = url.match(TWITTER_URL_PATTERNS.profile);
  return match ? match[2] : null;
}

/**
 * Extract tweet ID from tweet URL
 */
export function extractTweetIdFromUrl(url: string): string | null {
  const match = url.match(TWITTER_URL_PATTERNS.tweet);
  return match ? match[3] : null;
}

/**
 * Build profile URL from username
 */
export function buildProfileUrl(username: string): string {
  // Remove @ if present
  const cleanUsername = username.replace(/^@/, '');
  return `https://x.com/${cleanUsername}`;
}

/**
 * Build tweet URL
 */
export function buildTweetUrl(username: string, tweetId: string): string {
  const cleanUsername = username.replace(/^@/, '');
  return `https://x.com/${cleanUsername}/status/${tweetId}`;
}
