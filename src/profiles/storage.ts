/**
 * Profile Storage Module
 * Handles encrypted storage of profile metadata and credentials
 */

import type { Profile, ProfileMetadata, ProfileExport, Platform, PlatformStatus } from './types';

// Storage keys
const STORAGE_KEYS = {
  PROFILES: 'capy:profiles',
  ACTIVE_PROFILE: 'capy:active-profile',
  ENCRYPTION_CHECK: 'capy:encryption-check',
} as const;

// Simple encryption using Web Crypto API (available in renderer)
// For production, consider using electron-store's encryption or keychain

/**
 * Derive an encryption key from a password
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data
 */
async function encrypt(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );
  
  // Combine salt + iv + encrypted data
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data
 */
async function decrypt(encryptedData: string, password: string): Promise<string> {
  const combined = new Uint8Array(
    atob(encryptedData).split('').map(c => c.charCodeAt(0))
  );
  
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const data = combined.slice(28);
  
  const key = await deriveKey(password, salt);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Get machine-specific key (used for local encryption)
 * This is a simple approach - for production, use electron's safeStorage or OS keychain
 */
function getMachineKey(): string {
  // Use a combination of app-specific data
  // In production, this should be stored in the OS keychain
  const baseKey = 'capy-desktop-profile-storage';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'electron';
  return `${baseKey}-${userAgent.slice(0, 20)}`;
}

/**
 * Profile Storage Class
 */
export class ProfileStorage {
  private encryptionKey: string;

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || getMachineKey();
  }

  /**
   * Get the Electron store API
   */
  private getStore() {
    if (typeof window !== 'undefined' && window.electronAPI?.store) {
      return window.electronAPI.store;
    }
    // Fallback to localStorage for development
    return {
      get: async (key: string) => localStorage.getItem(key),
      set: async (key: string, value: string) => localStorage.setItem(key, value),
      delete: async (key: string) => localStorage.removeItem(key),
    };
  }

  /**
   * Load all profiles from storage
   */
  async loadProfiles(): Promise<Profile[]> {
    const store = this.getStore();
    const data = await store.get(STORAGE_KEYS.PROFILES);
    
    if (!data) {
      return [];
    }

    try {
      const profiles = JSON.parse(data as string) as Profile[];
      return profiles;
    } catch (error) {
      console.error('Failed to parse profiles:', error);
      return [];
    }
  }

  /**
   * Save all profiles to storage
   */
  async saveProfiles(profiles: Profile[]): Promise<void> {
    const store = this.getStore();
    await store.set(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
  }

  /**
   * Get the active profile ID
   */
  async getActiveProfileId(): Promise<string | null> {
    const store = this.getStore();
    const id = await store.get(STORAGE_KEYS.ACTIVE_PROFILE);
    return id as string | null;
  }

  /**
   * Set the active profile ID
   */
  async setActiveProfileId(profileId: string | null): Promise<void> {
    const store = this.getStore();
    if (profileId) {
      await store.set(STORAGE_KEYS.ACTIVE_PROFILE, profileId);
    } else {
      await store.delete(STORAGE_KEYS.ACTIVE_PROFILE);
    }
  }

  /**
   * Create a new profile
   */
  async createProfile(options: {
    name: string;
    color?: string;
    icon?: string;
    isDefault?: boolean;
  }): Promise<Profile> {
    const profiles = await this.loadProfiles();
    
    const now = Date.now();
    const id = `profile-${now}-${Math.random().toString(36).slice(2, 8)}`;
    
    const newProfile: Profile = {
      id,
      name: options.name,
      createdAt: now,
      lastUsedAt: now,
      color: options.color,
      icon: options.icon,
      isDefault: options.isDefault,
      platforms: {
        linkedin: {
          platform: 'linkedin',
          status: 'unknown',
          lastChecked: 0,
        },
        twitter: {
          platform: 'twitter',
          status: 'unknown',
          lastChecked: 0,
        },
      },
    };

    // If this is default, unset other defaults
    if (options.isDefault) {
      profiles.forEach(p => {
        p.isDefault = false;
      });
    }

    profiles.push(newProfile);
    await this.saveProfiles(profiles);

    return newProfile;
  }

  /**
   * Update an existing profile
   */
  async updateProfile(profileId: string, updates: Partial<Profile>): Promise<Profile | null> {
    const profiles = await this.loadProfiles();
    const index = profiles.findIndex(p => p.id === profileId);
    
    if (index === -1) {
      return null;
    }

    // If setting as default, unset others
    if (updates.isDefault) {
      profiles.forEach(p => {
        p.isDefault = false;
      });
    }

    profiles[index] = {
      ...profiles[index],
      ...updates,
      id: profileId, // Ensure ID can't be changed
    };

    await this.saveProfiles(profiles);
    return profiles[index];
  }

  /**
   * Update platform status for a profile
   */
  async updatePlatformStatus(
    profileId: string,
    platform: Platform,
    status: Partial<PlatformStatus>
  ): Promise<Profile | null> {
    const profiles = await this.loadProfiles();
    const profile = profiles.find(p => p.id === profileId);
    
    if (!profile) {
      return null;
    }

    profile.platforms[platform] = {
      ...profile.platforms[platform],
      ...status,
      platform,
      lastChecked: Date.now(),
    };

    await this.saveProfiles(profiles);
    return profile;
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileId: string): Promise<boolean> {
    const profiles = await this.loadProfiles();
    const index = profiles.findIndex(p => p.id === profileId);
    
    if (index === -1) {
      return false;
    }

    profiles.splice(index, 1);
    await this.saveProfiles(profiles);

    // If deleted profile was active, clear active
    const activeId = await this.getActiveProfileId();
    if (activeId === profileId) {
      await this.setActiveProfileId(null);
    }

    return true;
  }

  /**
   * Get a single profile by ID
   */
  async getProfile(profileId: string): Promise<Profile | null> {
    const profiles = await this.loadProfiles();
    return profiles.find(p => p.id === profileId) || null;
  }

  /**
   * Export a profile (with optional encryption)
   */
  async exportProfile(profileId: string, password?: string): Promise<ProfileExport> {
    const profile = await this.getProfile(profileId);
    
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const metadata: ProfileMetadata = {
      id: profile.id,
      name: profile.name,
      createdAt: profile.createdAt,
      lastUsedAt: profile.lastUsedAt,
      color: profile.color,
      icon: profile.icon,
      isDefault: profile.isDefault,
    };

    const exportData: ProfileExport = {
      version: 1,
      exportedAt: Date.now(),
      profile: metadata,
    };

    // If password provided, encrypt sensitive data
    if (password) {
      const sensitiveData = JSON.stringify({
        platforms: profile.platforms,
      });
      exportData.encryptedData = await encrypt(sensitiveData, password);
    }

    return exportData;
  }

  /**
   * Import a profile from export data
   */
  async importProfile(exportData: ProfileExport, password?: string): Promise<Profile> {
    const profiles = await this.loadProfiles();
    
    // Generate new ID to avoid conflicts
    const now = Date.now();
    const newId = `profile-${now}-${Math.random().toString(36).slice(2, 8)}`;
    
    let platforms: Profile['platforms'] = {
      linkedin: { platform: 'linkedin', status: 'unknown', lastChecked: 0 },
      twitter: { platform: 'twitter', status: 'unknown', lastChecked: 0 },
    };

    // Decrypt sensitive data if provided
    if (exportData.encryptedData && password) {
      try {
        const decrypted = await decrypt(exportData.encryptedData, password);
        const sensitiveData = JSON.parse(decrypted);
        platforms = sensitiveData.platforms || platforms;
      } catch (error) {
        console.error('Failed to decrypt profile data:', error);
        throw new Error('Invalid password or corrupted export data');
      }
    }

    const newProfile: Profile = {
      id: newId,
      name: `${exportData.profile.name} (Imported)`,
      createdAt: now,
      lastUsedAt: now,
      color: exportData.profile.color,
      icon: exportData.profile.icon,
      isDefault: false, // Imported profiles are never default
      platforms,
    };

    profiles.push(newProfile);
    await this.saveProfiles(profiles);

    return newProfile;
  }

  /**
   * Update last used timestamp for a profile
   */
  async touchProfile(profileId: string): Promise<void> {
    await this.updateProfile(profileId, { lastUsedAt: Date.now() });
  }

  /**
   * Get the default profile
   */
  async getDefaultProfile(): Promise<Profile | null> {
    const profiles = await this.loadProfiles();
    return profiles.find(p => p.isDefault) || profiles[0] || null;
  }
}

// Export singleton instance
export const profileStorage = new ProfileStorage();
