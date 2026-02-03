/**
 * Profile Manager
 * Orchestrates profile lifecycle and browser session management
 */

import { profileStorage } from './storage';
import type {
  Profile,
  ProfileCreateOptions,
  ProfileUpdateOptions,
  ProfileEvent,
  Platform,
  PlatformStatus,
  TakeoverRequest,
} from './types';

type EventCallback = (event: ProfileEvent) => void;

/**
 * Profile Manager Class
 * Handles creation, deletion, and management of browser profiles
 */
export class ProfileManager {
  private eventListeners: Set<EventCallback> = new Set();
  private activeProfileId: string | null = null;

  /**
   * Initialize the profile manager
   * Should be called on app startup
   */
  async initialize(): Promise<void> {
    // Load active profile from storage
    this.activeProfileId = await profileStorage.getActiveProfileId();

    // If no profiles exist, create a default one
    const profiles = await this.listProfiles();
    if (profiles.length === 0) {
      await this.createProfile({
        name: 'Default Profile',
        isDefault: true,
      });
    }

    // If no active profile, set the default
    if (!this.activeProfileId) {
      const defaultProfile = await profileStorage.getDefaultProfile();
      if (defaultProfile) {
        await this.activateProfile(defaultProfile.id);
      }
    }
  }

  /**
   * Create a new browser profile
   */
  async createProfile(options: ProfileCreateOptions): Promise<Profile> {
    const profile = await profileStorage.createProfile({
      name: options.name,
      color: options.color,
      icon: options.icon,
      isDefault: options.isDefault,
    });

    // Request the main process to create profile directories
    await this.requestCreateProfileDirs(profile.id);

    // If cloning from existing profile, copy browser data
    if (options.cloneFromId) {
      await this.requestCloneProfileData(options.cloneFromId, profile.id);
    }

    this.emit({ type: 'PROFILE_CREATED', profile });

    return profile;
  }

  /**
   * Update an existing profile
   */
  async updateProfile(profileId: string, updates: ProfileUpdateOptions): Promise<Profile | null> {
    const profile = await profileStorage.updateProfile(profileId, updates);
    
    if (profile) {
      this.emit({ type: 'PROFILE_UPDATED', profile });
    }

    return profile;
  }

  /**
   * Delete a profile and all its data
   */
  async deleteProfile(profileId: string): Promise<boolean> {
    // Don't allow deleting the last profile
    const profiles = await this.listProfiles();
    if (profiles.length <= 1) {
      throw new Error('Cannot delete the last profile');
    }

    // If deleting active profile, switch to another one first
    if (this.activeProfileId === profileId) {
      const otherProfile = profiles.find(p => p.id !== profileId);
      if (otherProfile) {
        await this.activateProfile(otherProfile.id);
      }
    }

    // Request main process to delete profile directories
    await this.requestDeleteProfileDirs(profileId);

    // Delete from storage
    const success = await profileStorage.deleteProfile(profileId);

    if (success) {
      this.emit({ type: 'PROFILE_DELETED', profileId });
    }

    return success;
  }

  /**
   * Get a profile by ID
   */
  async getProfile(profileId: string): Promise<Profile | null> {
    return profileStorage.getProfile(profileId);
  }

  /**
   * List all profiles
   */
  async listProfiles(): Promise<Profile[]> {
    return profileStorage.loadProfiles();
  }

  /**
   * Get the currently active profile
   */
  async getActiveProfile(): Promise<Profile | null> {
    if (!this.activeProfileId) {
      return null;
    }
    return profileStorage.getProfile(this.activeProfileId);
  }

  /**
   * Get the active profile ID
   */
  getActiveProfileId(): string | null {
    return this.activeProfileId;
  }

  /**
   * Activate a profile (switch to it)
   */
  async activateProfile(profileId: string): Promise<Profile> {
    const profile = await profileStorage.getProfile(profileId);
    
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    this.activeProfileId = profileId;
    await profileStorage.setActiveProfileId(profileId);
    await profileStorage.touchProfile(profileId);

    // Request main process to switch browser session
    await this.requestSwitchBrowserSession(profileId);

    this.emit({ type: 'PROFILE_ACTIVATED', profile });

    return profile;
  }

  /**
   * Update platform login status for the active profile
   */
  async updatePlatformStatus(
    platform: Platform,
    status: Partial<PlatformStatus>
  ): Promise<void> {
    if (!this.activeProfileId) {
      throw new Error('No active profile');
    }

    const profile = await profileStorage.updatePlatformStatus(
      this.activeProfileId,
      platform,
      status
    );

    if (profile) {
      this.emit({
        type: 'PLATFORM_STATUS_CHANGED',
        profileId: this.activeProfileId,
        platform,
        status: profile.platforms[platform],
      });
    }
  }

  /**
   * Request user takeover for login
   */
  requestTakeover(request: TakeoverRequest): void {
    this.emit({ type: 'TAKEOVER_REQUESTED', request });
  }

  /**
   * Mark takeover as completed
   */
  completeTakeover(profileId: string, platform: Platform): void {
    this.emit({ type: 'TAKEOVER_COMPLETED', profileId, platform });
  }

  /**
   * Export a profile
   */
  async exportProfile(profileId: string, password?: string): Promise<string> {
    const exportData = await profileStorage.exportProfile(profileId, password);
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import a profile
   */
  async importProfile(exportJson: string, password?: string): Promise<Profile> {
    const exportData = JSON.parse(exportJson);
    const profile = await profileStorage.importProfile(exportData, password);

    // Create profile directories
    await this.requestCreateProfileDirs(profile.id);

    this.emit({ type: 'PROFILE_CREATED', profile });

    return profile;
  }

  /**
   * Get the Chromium partition string for a profile
   * Used when creating BrowserView or BrowserWindow
   */
  getProfilePartition(profileId: string): string {
    return `persist:profile-${profileId}`;
  }

  /**
   * Get the active profile's partition
   */
  getActivePartition(): string | null {
    if (!this.activeProfileId) {
      return null;
    }
    return this.getProfilePartition(this.activeProfileId);
  }

  // =========================================================================
  // Event System
  // =========================================================================

  /**
   * Subscribe to profile events
   */
  subscribe(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: ProfileEvent): void {
    this.eventListeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in profile event listener:', error);
      }
    });
  }

  // =========================================================================
  // IPC Requests to Main Process
  // =========================================================================

  /**
   * Request main process to create profile directories
   */
  private async requestCreateProfileDirs(profileId: string): Promise<void> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      await window.electron.invoke('profile:create-dirs', profileId);
    }
  }

  /**
   * Request main process to delete profile directories
   */
  private async requestDeleteProfileDirs(profileId: string): Promise<void> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      await window.electron.invoke('profile:delete-dirs', profileId);
    }
  }

  /**
   * Request main process to clone profile data
   */
  private async requestCloneProfileData(sourceId: string, targetId: string): Promise<void> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      await window.electron.invoke('profile:clone-dirs', sourceId, targetId);
    }
  }

  /**
   * Request main process to switch browser session
   */
  private async requestSwitchBrowserSession(profileId: string): Promise<void> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      await window.electron.invoke('profile:switch-session', profileId);
    }
  }
}

// Export singleton instance
export const profileManager = new ProfileManager();
