/**
 * Profiles Module
 * Re-exports all profile-related functionality
 */

export * from './types';
export { profileStorage, ProfileStorage } from './storage';
export { profileManager, ProfileManager } from './profile-manager';
export { sessionDetector, SessionDetector, PLATFORM_CONFIG } from './session-detector';
