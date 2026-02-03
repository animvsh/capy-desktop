/**
 * Profile Paths Module
 * Manages Chromium user data directories for isolated browser profiles
 */

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface ProfilePaths {
  /** Root directory for this profile */
  root: string;
  /** Chromium user data directory (cookies, localStorage, etc.) */
  userData: string;
  /** Cache directory */
  cache: string;
  /** Session storage */
  sessions: string;
  /** Profile metadata file */
  metadata: string;
}

/**
 * Get the base directory for all profiles
 */
export function getProfilesBaseDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'profiles');
}

/**
 * Get all paths for a specific profile
 */
export function getProfilePaths(profileId: string): ProfilePaths {
  const baseDir = getProfilesBaseDir();
  const profileRoot = path.join(baseDir, profileId);
  
  return {
    root: profileRoot,
    userData: path.join(profileRoot, 'chromium-data'),
    cache: path.join(profileRoot, 'cache'),
    sessions: path.join(profileRoot, 'sessions'),
    metadata: path.join(profileRoot, 'metadata.json'),
  };
}

/**
 * Ensure all directories for a profile exist
 */
export function ensureProfileDirs(profileId: string): ProfilePaths {
  const paths = getProfilePaths(profileId);
  
  // Create all directories
  fs.mkdirSync(paths.root, { recursive: true });
  fs.mkdirSync(paths.userData, { recursive: true });
  fs.mkdirSync(paths.cache, { recursive: true });
  fs.mkdirSync(paths.sessions, { recursive: true });
  
  return paths;
}

/**
 * Delete all directories for a profile
 */
export function deleteProfileDirs(profileId: string): void {
  const paths = getProfilePaths(profileId);
  
  if (fs.existsSync(paths.root)) {
    fs.rmSync(paths.root, { recursive: true, force: true });
  }
}

/**
 * Check if a profile directory exists
 */
export function profileDirExists(profileId: string): boolean {
  const paths = getProfilePaths(profileId);
  return fs.existsSync(paths.root);
}

/**
 * List all profile IDs that have directories
 */
export function listProfileDirs(): string[] {
  const baseDir = getProfilesBaseDir();
  
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  
  return fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

/**
 * Get the Chromium partition name for a profile
 * This is used with Electron's session.fromPartition()
 */
export function getProfilePartition(profileId: string): string {
  return `persist:profile-${profileId}`;
}

/**
 * Get the total size of a profile directory in bytes
 */
export function getProfileSize(profileId: string): number {
  const paths = getProfilePaths(profileId);
  
  if (!fs.existsSync(paths.root)) {
    return 0;
  }
  
  return getDirSize(paths.root);
}

/**
 * Helper: Get directory size recursively
 */
function getDirSize(dirPath: string): number {
  let size = 0;
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      size += getDirSize(fullPath);
    } else if (entry.isFile()) {
      size += fs.statSync(fullPath).size;
    }
  }
  
  return size;
}

/**
 * Export profile data to a compressed archive
 */
export async function exportProfileDir(profileId: string, outputPath: string): Promise<void> {
  const paths = getProfilePaths(profileId);
  
  if (!fs.existsSync(paths.root)) {
    throw new Error(`Profile directory not found: ${profileId}`);
  }
  
  // Use tar + gzip for compression
  const archiver = await import('archiver');
  const archive = archiver.default('tar', { gzip: true });
  const output = fs.createWriteStream(outputPath);
  
  return new Promise((resolve, reject) => {
    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    
    archive.pipe(output);
    archive.directory(paths.root, false);
    archive.finalize();
  });
}

/**
 * Import profile data from a compressed archive
 */
export async function importProfileDir(profileId: string, archivePath: string): Promise<void> {
  const paths = getProfilePaths(profileId);
  
  // Ensure target directory exists
  ensureProfileDirs(profileId);
  
  // Extract using tar
  const tar = await import('tar');
  await tar.extract({
    file: archivePath,
    cwd: paths.root,
  });
}

/**
 * Copy profile directory to create a clone
 */
export function cloneProfileDir(sourceProfileId: string, targetProfileId: string): void {
  const sourcePaths = getProfilePaths(sourceProfileId);
  const targetPaths = getProfilePaths(targetProfileId);
  
  if (!fs.existsSync(sourcePaths.root)) {
    throw new Error(`Source profile directory not found: ${sourceProfileId}`);
  }
  
  // Use recursive copy
  fs.cpSync(sourcePaths.root, targetPaths.root, { recursive: true });
}
