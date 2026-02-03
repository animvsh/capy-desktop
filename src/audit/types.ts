/**
 * Audit System Type Definitions
 * Central types for the audit/logging system
 */

import { ActionKind } from '../types/events';

// ============================================================================
// Audit Entry Types
// ============================================================================

export type AuditActionType =
  | 'send_message'
  | 'connect'
  | 'post'
  | 'follow'
  | 'navigate'
  | 'click'
  | 'type'
  | 'screenshot'
  | 'login'
  | 'logout'
  | 'approval_granted'
  | 'approval_denied'
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  | 'settings_changed';

export type AuditResult = 'success' | 'failed' | 'cancelled' | 'pending' | 'timeout';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

// ============================================================================
// Core Audit Entry Interface
// ============================================================================

export interface AuditEntry {
  id: string;
  timestamp: number; // Unix timestamp in ms
  action: AuditActionType;
  target: string; // Profile URL, username, page URL, etc.
  contentHash?: string; // SHA-256 hash of message/content (not full content for privacy)
  result: AuditResult;
  severity: AuditSeverity;
  screenshotPath?: string; // Path to screenshot if captured
  screenshotPathBefore?: string; // Screenshot before action
  screenshotPathAfter?: string; // Screenshot after action
  
  // Additional context
  runId?: string; // Associated run ID if part of automation
  stepIndex?: number; // Step index in automation
  platform?: 'linkedin' | 'twitter' | 'email' | 'other';
  errorMessage?: string; // Error details if failed
  durationMs?: number; // How long the action took
  
  // User/session context
  userId?: string;
  sessionId?: string;
  
  // Metadata (extensible)
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Audit Log File Format (JSON Lines)
// ============================================================================

export interface AuditLogFile {
  version: string;
  createdAt: number;
  encryptionEnabled: boolean;
  entries: AuditEntry[];
}

// ============================================================================
// Screenshot Capture Types
// ============================================================================

export interface ScreenshotConfig {
  enabled: boolean;
  captureBeforeAction: boolean;
  captureAfterAction: boolean;
  quality: number; // 0-100
  maxWidth: number;
  retentionDays: number;
  directory: string;
}

export interface CapturedScreenshot {
  id: string;
  path: string;
  timestamp: number;
  type: 'before' | 'after' | 'manual';
  auditEntryId?: string;
  width: number;
  height: number;
  sizeBytes: number;
}

// ============================================================================
// Audit Logger Configuration
// ============================================================================

export interface AuditLoggerConfig {
  enabled: boolean;
  logDirectory: string;
  
  // Rotation
  rotateDaily: boolean;
  maxFileSizeMB: number;
  maxRetentionDays: number;
  
  // Encryption
  encryptionEnabled: boolean;
  encryptionKey?: string; // Base64 encoded key
  
  // Filtering
  logActions: AuditActionType[];
  minSeverity: AuditSeverity;
  
  // Screenshots
  screenshots: ScreenshotConfig;
}

export const DEFAULT_AUDIT_CONFIG: AuditLoggerConfig = {
  enabled: true,
  logDirectory: 'audit-logs',
  rotateDaily: true,
  maxFileSizeMB: 50,
  maxRetentionDays: 90,
  encryptionEnabled: false,
  logActions: [
    'send_message',
    'connect',
    'post',
    'follow',
    'login',
    'logout',
    'approval_granted',
    'approval_denied',
    'run_started',
    'run_completed',
    'run_failed',
  ],
  minSeverity: 'info',
  screenshots: {
    enabled: true,
    captureBeforeAction: true,
    captureAfterAction: true,
    quality: 80,
    maxWidth: 1920,
    retentionDays: 30,
    directory: 'audit-screenshots',
  },
};

// ============================================================================
// Export Types
// ============================================================================

export type ExportFormat = 'json' | 'csv';

export interface ExportOptions {
  format: ExportFormat;
  dateFrom?: number;
  dateTo?: number;
  actions?: AuditActionType[];
  results?: AuditResult[];
  includeScreenshots: boolean;
  screenshotFormat?: 'paths' | 'base64' | 'zip';
  outputPath?: string;
}

export interface ExportResult {
  success: boolean;
  outputPath?: string;
  entryCount: number;
  screenshotCount?: number;
  error?: string;
}

// ============================================================================
// Query Types
// ============================================================================

export interface AuditQuery {
  dateFrom?: number;
  dateTo?: number;
  actions?: AuditActionType[];
  results?: AuditResult[];
  severities?: AuditSeverity[];
  targets?: string[];
  searchTerm?: string;
  runId?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'action' | 'result';
  orderDirection?: 'asc' | 'desc';
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface AuditStats {
  totalEntries: number;
  entriesByAction: Record<AuditActionType, number>;
  entriesByResult: Record<AuditResult, number>;
  entriesByDay: Array<{ date: string; count: number }>;
  successRate: number;
  averageDurationMs: number;
  screenshotCount: number;
  oldestEntry?: number;
  newestEntry?: number;
}

// ============================================================================
// Database Schema Types (for SQLite)
// ============================================================================

export interface AuditDBEntry {
  id: string;
  timestamp: number;
  action: string;
  target: string;
  content_hash: string | null;
  result: string;
  severity: string;
  screenshot_path: string | null;
  screenshot_path_before: string | null;
  screenshot_path_after: string | null;
  run_id: string | null;
  step_index: number | null;
  platform: string | null;
  error_message: string | null;
  duration_ms: number | null;
  user_id: string | null;
  session_id: string | null;
  metadata: string | null; // JSON string
  created_at: number;
}

// ============================================================================
// IPC Channel Types
// ============================================================================

export interface AuditIPCChannels {
  'audit:log': (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => Promise<AuditEntry>;
  'audit:query': (query: AuditQuery) => Promise<AuditQueryResult>;
  'audit:export': (options: ExportOptions) => Promise<ExportResult>;
  'audit:stats': () => Promise<AuditStats>;
  'audit:delete-old': (olderThanDays: number) => Promise<number>;
  'audit:screenshot-capture': (type: 'before' | 'after' | 'manual') => Promise<CapturedScreenshot | null>;
  'audit:get-entry': (id: string) => Promise<AuditEntry | null>;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function createAuditEntryId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `audit_${timestamp}_${random}`;
}

export function hashContent(content: string): string {
  // Simple hash for browser environment
  // In electron main process, use crypto.createHash('sha256')
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function severityToNumber(severity: AuditSeverity): number {
  const map: Record<AuditSeverity, number> = {
    info: 0,
    warning: 1,
    error: 2,
    critical: 3,
  };
  return map[severity];
}

export function actionRequiresApproval(action: AuditActionType): boolean {
  const approvalActions: AuditActionType[] = [
    'send_message',
    'connect',
    'post',
    'follow',
  ];
  return approvalActions.includes(action);
}

export function formatAuditTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export function getDateString(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}
