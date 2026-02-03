/**
 * Session Detector
 * Detects login status for LinkedIn and Twitter in the browser
 */

import type { Platform, LoginStatus, SessionDetectionResult, TakeoverRequest } from './types';
import { profileManager } from './profile-manager';

// Platform-specific detection configuration
const PLATFORM_CONFIG = {
  linkedin: {
    name: 'LinkedIn',
    baseUrl: 'https://www.linkedin.com',
    loginUrl: 'https://www.linkedin.com/login',
    feedUrl: 'https://www.linkedin.com/feed/',
    
    // Selectors that indicate logged-in state
    loggedInSelectors: [
      '[data-control-name="identity_welcome_message"]',
      '.global-nav__me-photo',
      '.feed-identity-module__actor-meta',
      'div[data-test-id="nav-settings-submenu-icon"]',
      '.search-global-typeahead__input',
    ],
    
    // Selectors that indicate login page/wall
    loginSelectors: [
      'form.login__form',
      'input#username',
      '[data-id="sign-in-form"]',
      '.login__form_action_container',
      'button[data-id="sign-in-form__submit-btn"]',
    ],
    
    // Selectors that indicate session expired
    expiredSelectors: [
      '.login-form__session-expired',
      '[data-test-id="session-expired"]',
    ],
    
    // Script to extract user info when logged in
    userInfoScript: `
      (function() {
        try {
          const nameEl = document.querySelector('.feed-identity-module__actor-meta .feed-identity-module__actor-name');
          const avatarEl = document.querySelector('.global-nav__me-photo') || document.querySelector('.feed-identity-module__actor-image');
          return {
            username: nameEl?.textContent?.trim() || null,
            avatarUrl: avatarEl?.src || avatarEl?.style?.backgroundImage?.match(/url\\("(.+)"\\)/)?.[1] || null
          };
        } catch (e) {
          return { username: null, avatarUrl: null };
        }
      })()
    `,
  },
  
  twitter: {
    name: 'Twitter/X',
    baseUrl: 'https://x.com',
    loginUrl: 'https://x.com/login',
    feedUrl: 'https://x.com/home',
    
    // Selectors that indicate logged-in state
    loggedInSelectors: [
      '[data-testid="primaryColumn"]',
      '[data-testid="AppTabBar_Home_Link"]',
      '[data-testid="SideNav_AccountSwitcher_Button"]',
      'a[href="/compose/tweet"]',
      '[data-testid="tweetButtonInline"]',
    ],
    
    // Selectors that indicate login page/wall
    loginSelectors: [
      '[data-testid="loginButton"]',
      'input[autocomplete="username"]',
      '[data-testid="google_sign_in_container"]',
      'a[href="/login"]',
      '[data-testid="auth"]',
    ],
    
    // Selectors that indicate session expired
    expiredSelectors: [
      '[data-testid="confirmationSheetConfirm"]', // "Log in" modal
    ],
    
    // Script to extract user info when logged in
    userInfoScript: `
      (function() {
        try {
          const accountBtn = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
          const avatarEl = accountBtn?.querySelector('img');
          const nameEl = accountBtn?.querySelector('span');
          return {
            username: nameEl?.textContent?.trim() || null,
            avatarUrl: avatarEl?.src || null
          };
        } catch (e) {
          return { username: null, avatarUrl: null };
        }
      })()
    `,
  },
} as const;

/**
 * Session Detector Class
 */
export class SessionDetector {
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastCheckResults: Map<Platform, SessionDetectionResult> = new Map();

  /**
   * Detect login status for a platform
   * This runs detection scripts in the browser
   */
  async detectSession(platform: Platform): Promise<SessionDetectionResult> {
    const config = PLATFORM_CONFIG[platform];
    
    const result: SessionDetectionResult = {
      platform,
      status: 'unknown',
      loginUrl: config.loginUrl,
      loginIndicators: [...config.loginSelectors],
    };

    try {
      // Execute detection via browser bridge
      const detectionResult = await this.runDetectionScript(platform);
      
      if (detectionResult) {
        result.status = detectionResult.status;
        result.username = detectionResult.username;
        result.avatarUrl = detectionResult.avatarUrl;
      }

      // Cache the result
      this.lastCheckResults.set(platform, result);

      // Update profile manager with new status
      await profileManager.updatePlatformStatus(platform, {
        status: result.status,
        username: result.username,
        avatarUrl: result.avatarUrl,
      });

      // If login required, request takeover
      if (result.status === 'logged_out' || result.status === 'expired' || result.status === 'login_wall') {
        this.requestLoginTakeover(platform, result);
      }

    } catch (error) {
      result.status = 'unknown';
      result.error = error instanceof Error ? error.message : 'Detection failed';
    }

    return result;
  }

  /**
   * Run the detection script in the browser
   */
  private async runDetectionScript(platform: Platform): Promise<{
    status: LoginStatus;
    username?: string;
    avatarUrl?: string;
  } | null> {
    const config = PLATFORM_CONFIG[platform];

    // Build detection script
    const script = `
      (function() {
        const result = {
          status: 'unknown',
          username: null,
          avatarUrl: null,
          currentUrl: window.location.href
        };

        // Check for login page selectors
        const loginSelectors = ${JSON.stringify(config.loginSelectors)};
        for (const selector of loginSelectors) {
          if (document.querySelector(selector)) {
            result.status = 'logged_out';
            return result;
          }
        }

        // Check for session expired selectors
        const expiredSelectors = ${JSON.stringify(config.expiredSelectors)};
        for (const selector of expiredSelectors) {
          if (document.querySelector(selector)) {
            result.status = 'expired';
            return result;
          }
        }

        // Check for logged-in selectors
        const loggedInSelectors = ${JSON.stringify(config.loggedInSelectors)};
        for (const selector of loggedInSelectors) {
          if (document.querySelector(selector)) {
            result.status = 'logged_in';
            
            // Try to get user info
            try {
              const userInfo = ${config.userInfoScript};
              result.username = userInfo.username;
              result.avatarUrl = userInfo.avatarUrl;
            } catch (e) {}
            
            return result;
          }
        }

        // Check URL patterns
        const url = window.location.href;
        if (url.includes('/login') || url.includes('/signin') || url.includes('/auth')) {
          result.status = 'login_wall';
          return result;
        }

        return result;
      })()
    `;

    // Execute in browser
    if (typeof window !== 'undefined' && window.electronBrowser?.execute) {
      const execResult = await window.electronBrowser.execute<{
        status: LoginStatus;
        username?: string;
        avatarUrl?: string;
        currentUrl: string;
      }>(script);

      if (execResult.success && execResult.result) {
        return {
          status: execResult.result.status,
          username: execResult.result.username || undefined,
          avatarUrl: execResult.result.avatarUrl || undefined,
        };
      }
    }

    return null;
  }

  /**
   * Request user takeover for login
   */
  private requestLoginTakeover(platform: Platform, result: SessionDetectionResult): void {
    const profileId = profileManager.getActiveProfileId();
    if (!profileId) return;

    const config = PLATFORM_CONFIG[platform];
    
    const reason = result.status === 'expired' ? 'session_expired' : 'login_required';
    
    const request: TakeoverRequest = {
      profileId,
      platform,
      reason,
      loginUrl: config.loginUrl,
      instructions: `Please log in to ${config.name}. Your session will be saved for future use.`,
    };

    profileManager.requestTakeover(request);
  }

  /**
   * Navigate to a platform's login page
   */
  async navigateToLogin(platform: Platform): Promise<void> {
    const config = PLATFORM_CONFIG[platform];
    
    if (typeof window !== 'undefined' && window.electronBrowser?.navigate) {
      await window.electronBrowser.navigate(config.loginUrl);
    }
  }

  /**
   * Navigate to a platform's main page (to check login status)
   */
  async navigateToMain(platform: Platform): Promise<void> {
    const config = PLATFORM_CONFIG[platform];
    
    if (typeof window !== 'undefined' && window.electronBrowser?.navigate) {
      await window.electronBrowser.navigate(config.feedUrl);
    }
  }

  /**
   * Start periodic session checking
   */
  startPeriodicCheck(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      this.stopPeriodicCheck();
    }

    this.checkInterval = setInterval(async () => {
      // Check current page and detect session for that platform
      const state = await this.getCurrentBrowserState();
      
      if (state?.url) {
        const platform = this.detectPlatformFromUrl(state.url);
        if (platform) {
          await this.detectSession(platform);
        }
      }
    }, intervalMs);
  }

  /**
   * Stop periodic session checking
   */
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Detect which platform a URL belongs to
   */
  detectPlatformFromUrl(url: string): Platform | null {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('linkedin.com')) {
      return 'linkedin';
    }
    
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
      return 'twitter';
    }
    
    return null;
  }

  /**
   * Get current browser state
   */
  private async getCurrentBrowserState(): Promise<{ url: string; title: string } | null> {
    if (typeof window !== 'undefined' && window.electronBrowser?.getState) {
      return window.electronBrowser.getState();
    }
    return null;
  }

  /**
   * Get last check result for a platform
   */
  getLastResult(platform: Platform): SessionDetectionResult | null {
    return this.lastCheckResults.get(platform) || null;
  }

  /**
   * Check all platforms
   */
  async checkAllPlatforms(): Promise<Map<Platform, SessionDetectionResult>> {
    const results = new Map<Platform, SessionDetectionResult>();
    
    for (const platform of ['linkedin', 'twitter'] as Platform[]) {
      // Navigate to platform and check
      await this.navigateToMain(platform);
      
      // Wait for page to load
      if (typeof window !== 'undefined' && window.electronBrowser?.waitForNavigation) {
        await window.electronBrowser.waitForNavigation(10000);
      }
      
      // Small delay for page rendering
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Detect session
      const result = await this.detectSession(platform);
      results.set(platform, result);
    }

    return results;
  }

  /**
   * Wait for user to complete login
   * Polls until logged_in status is detected
   */
  async waitForLogin(platform: Platform, timeoutMs: number = 300000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.detectSession(platform);
      
      if (result.status === 'logged_in') {
        // Notify that takeover is complete
        const profileId = profileManager.getActiveProfileId();
        if (profileId) {
          profileManager.completeTakeover(profileId, platform);
        }
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return false;
  }
}

// Export singleton instance
export const sessionDetector = new SessionDetector();

// Export platform config for UI use
export { PLATFORM_CONFIG };
