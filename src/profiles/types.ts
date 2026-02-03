/**
 * Profile Types
 * Shared types for the profile management system
 */

export type Platform = 'linkedin' | 'twitter';

export type LoginStatus = 'unknown' | 'logged_in' | 'logged_out' | 'expired' | 'login_wall';

export interface PlatformStatus {
  platform: Platform;
  status: LoginStatus;
  lastChecked: number;
  username?: string;
  avatarUrl?: string;
  error?: string;
}

export interface Profile {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** When the profile was created */
  createdAt: number;
  /** Last time this profile was used */
  lastUsedAt: number;
  /** Login status for each platform */
  platforms: Record<Platform, PlatformStatus>;
  /** User-defined color for UI */
  color?: string;
  /** User-defined icon/avatar */
  icon?: string;
  /** Is this the default profile */
  isDefault?: boolean;
}

export interface ProfileMetadata {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number;
  color?: string;
  icon?: string;
  isDefault?: boolean;
}

export interface SessionDetectionResult {
  platform: Platform;
  status: LoginStatus;
  username?: string;
  avatarUrl?: string;
  error?: string;
  /** If login is needed, what URL should we navigate to */
  loginUrl?: string;
  /** What selectors indicate we're on a login page */
  loginIndicators?: string[];
}

export interface TakeoverRequest {
  profileId: string;
  platform: Platform;
  reason: 'login_required' | 'captcha' | 'verification' | 'session_expired';
  loginUrl: string;
  instructions?: string;
}

export interface ProfileExport {
  version: number;
  exportedAt: number;
  profile: ProfileMetadata;
  /** Encrypted profile data (base64) */
  encryptedData?: string;
}

export interface ProfileCreateOptions {
  name: string;
  color?: string;
  icon?: string;
  isDefault?: boolean;
  /** Clone from existing profile */
  cloneFromId?: string;
}

export interface ProfileUpdateOptions {
  name?: string;
  color?: string;
  icon?: string;
  isDefault?: boolean;
}

// Events emitted by the profile system
export type ProfileEvent =
  | { type: 'PROFILE_CREATED'; profile: Profile }
  | { type: 'PROFILE_UPDATED'; profile: Profile }
  | { type: 'PROFILE_DELETED'; profileId: string }
  | { type: 'PROFILE_ACTIVATED'; profile: Profile }
  | { type: 'PLATFORM_STATUS_CHANGED'; profileId: string; platform: Platform; status: PlatformStatus }
  | { type: 'TAKEOVER_REQUESTED'; request: TakeoverRequest }
  | { type: 'TAKEOVER_COMPLETED'; profileId: string; platform: Platform };
