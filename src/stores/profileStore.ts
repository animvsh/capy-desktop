/**
 * Profile Store
 * Zustand store for profile state management
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  profileManager,
  sessionDetector,
  type Profile,
  type Platform,
  type PlatformStatus,
  type TakeoverRequest,
  type ProfileCreateOptions,
  type ProfileUpdateOptions,
} from '../profiles';

// ============================================================================
// Types
// ============================================================================

export interface ProfileStoreState {
  // Profile data
  profiles: Profile[];
  activeProfileId: string | null;
  activeProfile: Profile | null;

  // Loading states
  isLoading: boolean;
  isInitialized: boolean;
  isSwitching: boolean;

  // Takeover state
  activeTakeover: TakeoverRequest | null;
  isInTakeover: boolean;

  // Error state
  error: string | null;
}

export interface ProfileStoreActions {
  // Initialization
  initialize: () => Promise<void>;

  // Profile CRUD
  createProfile: (options: ProfileCreateOptions) => Promise<Profile | null>;
  updateProfile: (profileId: string, updates: ProfileUpdateOptions) => Promise<Profile | null>;
  deleteProfile: (profileId: string) => Promise<boolean>;
  refreshProfiles: () => Promise<void>;

  // Profile activation
  activateProfile: (profileId: string) => Promise<boolean>;
  getActivePartition: () => string | null;

  // Platform session
  checkPlatformSession: (platform: Platform) => Promise<PlatformStatus | null>;
  checkAllSessions: () => Promise<void>;
  navigateToLogin: (platform: Platform) => Promise<void>;
  navigateToMain: (platform: Platform) => Promise<void>;

  // Takeover handling
  startTakeover: (platform: Platform) => Promise<void>;
  completeTakeover: () => void;
  cancelTakeover: () => void;

  // Export/Import
  exportProfile: (profileId: string, password?: string) => Promise<string | null>;
  importProfile: (exportJson: string, password?: string) => Promise<Profile | null>;

  // Error handling
  clearError: () => void;

  // Cleanup
  cleanup: () => void;
}

export type ProfileStore = ProfileStoreState & ProfileStoreActions;

// ============================================================================
// Initial State
// ============================================================================

const initialState: ProfileStoreState = {
  profiles: [],
  activeProfileId: null,
  activeProfile: null,
  isLoading: false,
  isInitialized: false,
  isSwitching: false,
  activeTakeover: null,
  isInTakeover: false,
  error: null,
};

// ============================================================================
// Store
// ============================================================================

export const useProfileStore = create<ProfileStore>()(
  subscribeWithSelector((set, get) => {
    // Keep track of event unsubscribe function
    let eventUnsubscribe: (() => void) | null = null;

    return {
      ...initialState,

      // ======================================================================
      // Initialization
      // ======================================================================

      initialize: async () => {
        const { isInitialized } = get();
        if (isInitialized) return;

        set({ isLoading: true, error: null });

        try {
          // Initialize the profile manager
          await profileManager.initialize();

          // Load profiles
          const profiles = await profileManager.listProfiles();
          const activeProfile = await profileManager.getActiveProfile();

          // Subscribe to profile events
          eventUnsubscribe = profileManager.subscribe((event) => {
            switch (event.type) {
              case 'PROFILE_CREATED':
              case 'PROFILE_UPDATED':
                get().refreshProfiles();
                break;

              case 'PROFILE_DELETED':
                get().refreshProfiles();
                break;

              case 'PROFILE_ACTIVATED':
                set({
                  activeProfileId: event.profile.id,
                  activeProfile: event.profile,
                  isSwitching: false,
                });
                break;

              case 'PLATFORM_STATUS_CHANGED':
                get().refreshProfiles();
                break;

              case 'TAKEOVER_REQUESTED':
                set({
                  activeTakeover: event.request,
                  isInTakeover: true,
                });
                break;

              case 'TAKEOVER_COMPLETED':
                set({
                  activeTakeover: null,
                  isInTakeover: false,
                });
                get().refreshProfiles();
                break;
            }
          });

          set({
            profiles,
            activeProfileId: activeProfile?.id || null,
            activeProfile,
            isLoading: false,
            isInitialized: true,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to initialize profiles';
          set({ isLoading: false, error: message });
        }
      },

      // ======================================================================
      // Profile CRUD
      // ======================================================================

      createProfile: async (options) => {
        set({ isLoading: true, error: null });

        try {
          const profile = await profileManager.createProfile(options);
          await get().refreshProfiles();
          set({ isLoading: false });
          return profile;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to create profile';
          set({ isLoading: false, error: message });
          return null;
        }
      },

      updateProfile: async (profileId, updates) => {
        set({ error: null });

        try {
          const profile = await profileManager.updateProfile(profileId, updates);
          if (profile) {
            await get().refreshProfiles();
          }
          return profile;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update profile';
          set({ error: message });
          return null;
        }
      },

      deleteProfile: async (profileId) => {
        set({ isLoading: true, error: null });

        try {
          const success = await profileManager.deleteProfile(profileId);
          if (success) {
            await get().refreshProfiles();
          }
          set({ isLoading: false });
          return success;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to delete profile';
          set({ isLoading: false, error: message });
          return false;
        }
      },

      refreshProfiles: async () => {
        try {
          const profiles = await profileManager.listProfiles();
          const activeProfile = await profileManager.getActiveProfile();
          set({
            profiles,
            activeProfileId: activeProfile?.id || null,
            activeProfile,
          });
        } catch (error) {
          console.error('Failed to refresh profiles:', error);
        }
      },

      // ======================================================================
      // Profile Activation
      // ======================================================================

      activateProfile: async (profileId) => {
        const { activeProfileId } = get();
        if (activeProfileId === profileId) return true;

        set({ isSwitching: true, error: null });

        try {
          await profileManager.activateProfile(profileId);
          // State will be updated via event listener
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to switch profile';
          set({ isSwitching: false, error: message });
          return false;
        }
      },

      getActivePartition: () => {
        return profileManager.getActivePartition();
      },

      // ======================================================================
      // Platform Session
      // ======================================================================

      checkPlatformSession: async (platform) => {
        try {
          const result = await sessionDetector.detectSession(platform);
          await get().refreshProfiles();
          
          const { activeProfile } = get();
          return activeProfile?.platforms[platform] || null;
        } catch (error) {
          console.error('Failed to check platform session:', error);
          return null;
        }
      },

      checkAllSessions: async () => {
        try {
          await sessionDetector.checkAllPlatforms();
          await get().refreshProfiles();
        } catch (error) {
          console.error('Failed to check all sessions:', error);
        }
      },

      navigateToLogin: async (platform) => {
        await sessionDetector.navigateToLogin(platform);
      },

      navigateToMain: async (platform) => {
        await sessionDetector.navigateToMain(platform);
      },

      // ======================================================================
      // Takeover Handling
      // ======================================================================

      startTakeover: async (platform) => {
        const { activeProfileId } = get();
        if (!activeProfileId) return;

        // Navigate to login page
        await sessionDetector.navigateToLogin(platform);

        // Create takeover request
        const request: TakeoverRequest = {
          profileId: activeProfileId,
          platform,
          reason: 'login_required',
          loginUrl: platform === 'linkedin' 
            ? 'https://www.linkedin.com/login'
            : 'https://x.com/login',
        };

        set({
          activeTakeover: request,
          isInTakeover: true,
        });

        // Start watching for login completion
        sessionDetector.waitForLogin(platform).then((success) => {
          if (success) {
            set({
              activeTakeover: null,
              isInTakeover: false,
            });
            get().refreshProfiles();
          }
        });
      },

      completeTakeover: () => {
        const { activeTakeover } = get();
        if (activeTakeover) {
          profileManager.completeTakeover(
            activeTakeover.profileId,
            activeTakeover.platform
          );
        }
        set({
          activeTakeover: null,
          isInTakeover: false,
        });
      },

      cancelTakeover: () => {
        set({
          activeTakeover: null,
          isInTakeover: false,
        });
      },

      // ======================================================================
      // Export/Import
      // ======================================================================

      exportProfile: async (profileId, password) => {
        try {
          return await profileManager.exportProfile(profileId, password);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to export profile';
          set({ error: message });
          return null;
        }
      },

      importProfile: async (exportJson, password) => {
        set({ isLoading: true, error: null });

        try {
          const profile = await profileManager.importProfile(exportJson, password);
          await get().refreshProfiles();
          set({ isLoading: false });
          return profile;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to import profile';
          set({ isLoading: false, error: message });
          return null;
        }
      },

      // ======================================================================
      // Error Handling
      // ======================================================================

      clearError: () => {
        set({ error: null });
      },

      // ======================================================================
      // Cleanup
      // ======================================================================

      cleanup: () => {
        if (eventUnsubscribe) {
          eventUnsubscribe();
          eventUnsubscribe = null;
        }
        sessionDetector.stopPeriodicCheck();
      },
    };
  })
);

// ============================================================================
// Selectors
// ============================================================================

export const selectProfiles = (state: ProfileStore) => state.profiles;

export const selectActiveProfile = (state: ProfileStore) => state.activeProfile;

export const selectActiveProfileId = (state: ProfileStore) => state.activeProfileId;

export const selectIsInTakeover = (state: ProfileStore) => state.isInTakeover;

export const selectActiveTakeover = (state: ProfileStore) => state.activeTakeover;

export const selectPlatformStatus = (platform: Platform) => (state: ProfileStore) =>
  state.activeProfile?.platforms[platform] || null;

export const selectIsLoggedIn = (platform: Platform) => (state: ProfileStore) =>
  state.activeProfile?.platforms[platform]?.status === 'logged_in';

export const selectNeedsLogin = (platform: Platform) => (state: ProfileStore) => {
  const status = state.activeProfile?.platforms[platform]?.status;
  return status === 'logged_out' || status === 'expired' || status === 'login_wall';
};

// ============================================================================
// Export
// ============================================================================

export default useProfileStore;
