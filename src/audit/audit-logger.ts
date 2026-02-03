/**
 * Audit Logger
 * Append-only logging with daily rotation, structured JSON format, and optional encryption
 */

import {
  AuditEntry,
  AuditLoggerConfig,
  AuditActionType,
  AuditResult,
  AuditSeverity,
  DEFAULT_AUDIT_CONFIG,
  createAuditEntryId,
  hashContent,
  severityToNumber,
  getDateString,
} from './types';

// ============================================================================
// Audit Logger Class (Renderer-side wrapper)
// ============================================================================

export class AuditLogger {
  private config: AuditLoggerConfig;
  private sessionId: string;
  private userId: string | null = null;
  private buffer: AuditEntry[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds
  private readonly MAX_BUFFER_SIZE = 100;

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  updateConfig(config: Partial<AuditLoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AuditLoggerConfig {
    return { ...this.config };
  }

  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  // --------------------------------------------------------------------------
  // Core Logging Methods
  // --------------------------------------------------------------------------

  /**
   * Log an audit entry
   */
  async log(
    action: AuditActionType,
    target: string,
    result: AuditResult,
    options: {
      content?: string;
      severity?: AuditSeverity;
      screenshotPath?: string;
      screenshotPathBefore?: string;
      screenshotPathAfter?: string;
      runId?: string;
      stepIndex?: number;
      platform?: 'linkedin' | 'twitter' | 'email' | 'other';
      errorMessage?: string;
      durationMs?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<AuditEntry | null> {
    if (!this.config.enabled) {
      return null;
    }

    // Check if action should be logged
    if (!this.config.logActions.includes(action)) {
      return null;
    }

    // Check severity threshold
    const severity = options.severity ?? this.getSeverityForResult(result);
    if (severityToNumber(severity) < severityToNumber(this.config.minSeverity)) {
      return null;
    }

    const entry: AuditEntry = {
      id: createAuditEntryId(),
      timestamp: Date.now(),
      action,
      target,
      contentHash: options.content ? hashContent(options.content) : undefined,
      result,
      severity,
      screenshotPath: options.screenshotPath,
      screenshotPathBefore: options.screenshotPathBefore,
      screenshotPathAfter: options.screenshotPathAfter,
      runId: options.runId,
      stepIndex: options.stepIndex,
      platform: options.platform,
      errorMessage: options.errorMessage,
      durationMs: options.durationMs,
      userId: this.userId ?? undefined,
      sessionId: this.sessionId,
      metadata: options.metadata,
    };

    // Add to buffer
    this.buffer.push(entry);

    // Flush if buffer is full
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      await this.flush();
    } else if (!this.flushTimeout) {
      // Schedule flush
      this.flushTimeout = setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
    }

    // Also send to main process immediately for critical actions
    if (severity === 'critical' || this.isImmediateAction(action)) {
      await this.sendToMainProcess(entry);
    }

    return entry;
  }

  /**
   * Convenience method for logging send message actions
   */
  async logSendMessage(
    target: string,
    result: AuditResult,
    options: {
      messageContent?: string;
      platform: 'linkedin' | 'twitter' | 'email';
      screenshotBefore?: string;
      screenshotAfter?: string;
      runId?: string;
      stepIndex?: number;
      errorMessage?: string;
      durationMs?: number;
    }
  ): Promise<AuditEntry | null> {
    return this.log('send_message', target, result, {
      content: options.messageContent,
      platform: options.platform,
      screenshotPathBefore: options.screenshotBefore,
      screenshotPathAfter: options.screenshotAfter,
      runId: options.runId,
      stepIndex: options.stepIndex,
      errorMessage: options.errorMessage,
      durationMs: options.durationMs,
      severity: result === 'success' ? 'info' : 'warning',
    });
  }

  /**
   * Convenience method for logging connection requests
   */
  async logConnect(
    profileUrl: string,
    result: AuditResult,
    options: {
      noteContent?: string;
      platform?: 'linkedin';
      screenshotBefore?: string;
      screenshotAfter?: string;
      runId?: string;
      stepIndex?: number;
      errorMessage?: string;
      durationMs?: number;
    } = {}
  ): Promise<AuditEntry | null> {
    return this.log('connect', profileUrl, result, {
      content: options.noteContent,
      platform: options.platform ?? 'linkedin',
      screenshotPathBefore: options.screenshotBefore,
      screenshotPathAfter: options.screenshotAfter,
      runId: options.runId,
      stepIndex: options.stepIndex,
      errorMessage: options.errorMessage,
      durationMs: options.durationMs,
    });
  }

  /**
   * Convenience method for logging posts
   */
  async logPost(
    platform: 'linkedin' | 'twitter',
    result: AuditResult,
    options: {
      postContent?: string;
      postUrl?: string;
      screenshotAfter?: string;
      runId?: string;
      errorMessage?: string;
      durationMs?: number;
    } = {}
  ): Promise<AuditEntry | null> {
    return this.log('post', options.postUrl ?? platform, result, {
      content: options.postContent,
      platform,
      screenshotPathAfter: options.screenshotAfter,
      runId: options.runId,
      errorMessage: options.errorMessage,
      durationMs: options.durationMs,
    });
  }

  /**
   * Log run lifecycle events
   */
  async logRunStarted(runId: string, taskDescription: string): Promise<AuditEntry | null> {
    return this.log('run_started', taskDescription, 'success', {
      runId,
      severity: 'info',
    });
  }

  async logRunCompleted(
    runId: string,
    summary: {
      totalSteps: number;
      completedSteps: number;
      failedSteps: number;
      durationMs: number;
    }
  ): Promise<AuditEntry | null> {
    return this.log('run_completed', `Run completed: ${summary.completedSteps}/${summary.totalSteps} steps`, 'success', {
      runId,
      durationMs: summary.durationMs,
      metadata: summary,
      severity: summary.failedSteps > 0 ? 'warning' : 'info',
    });
  }

  async logRunFailed(runId: string, error: string): Promise<AuditEntry | null> {
    return this.log('run_failed', error, 'failed', {
      runId,
      errorMessage: error,
      severity: 'error',
    });
  }

  /**
   * Log approval events
   */
  async logApprovalGranted(
    action: AuditActionType,
    target: string,
    runId?: string
  ): Promise<AuditEntry | null> {
    return this.log('approval_granted', `${action} -> ${target}`, 'success', {
      runId,
      metadata: { originalAction: action },
    });
  }

  async logApprovalDenied(
    action: AuditActionType,
    target: string,
    reason?: string,
    runId?: string
  ): Promise<AuditEntry | null> {
    return this.log('approval_denied', `${action} -> ${target}`, 'cancelled', {
      runId,
      errorMessage: reason,
      metadata: { originalAction: action },
    });
  }

  // --------------------------------------------------------------------------
  // Buffer Management
  // --------------------------------------------------------------------------

  /**
   * Flush buffered entries to main process
   */
  async flush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.buffer.length === 0) {
      return;
    }

    const entries = [...this.buffer];
    this.buffer = [];

    try {
      await this.sendBatchToMainProcess(entries);
    } catch (error) {
      console.error('Failed to flush audit entries:', error);
      // Re-add to buffer for retry
      this.buffer = [...entries, ...this.buffer];
    }
  }

  /**
   * Force flush and close
   */
  async close(): Promise<void> {
    await this.flush();
  }

  // --------------------------------------------------------------------------
  // IPC Communication (to main process)
  // --------------------------------------------------------------------------

  private async sendToMainProcess(entry: AuditEntry): Promise<void> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      await window.electron.invoke('audit:log-entry', entry);
    }
  }

  private async sendBatchToMainProcess(entries: AuditEntry[]): Promise<void> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      await window.electron.invoke('audit:log-batch', entries);
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `session_${timestamp}_${random}`;
  }

  private getSeverityForResult(result: AuditResult): AuditSeverity {
    switch (result) {
      case 'success':
        return 'info';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'warning';
      case 'timeout':
        return 'warning';
      case 'pending':
        return 'info';
      default:
        return 'info';
    }
  }

  private isImmediateAction(action: AuditActionType): boolean {
    const immediateActions: AuditActionType[] = [
      'send_message',
      'connect',
      'post',
      'follow',
      'approval_granted',
      'approval_denied',
    ];
    return immediateActions.includes(action);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalAuditLogger: AuditLogger | null = null;

export function getAuditLogger(config?: Partial<AuditLoggerConfig>): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(config);
  }
  return globalAuditLogger;
}

export function resetAuditLogger(): void {
  if (globalAuditLogger) {
    globalAuditLogger.close();
    globalAuditLogger = null;
  }
}

// ============================================================================
// Convenience Export Functions
// ============================================================================

export async function logAudit(
  action: AuditActionType,
  target: string,
  result: AuditResult,
  options?: Parameters<AuditLogger['log']>[3]
): Promise<AuditEntry | null> {
  return getAuditLogger().log(action, target, result, options);
}

export async function logSendMessage(
  ...args: Parameters<AuditLogger['logSendMessage']>
): Promise<AuditEntry | null> {
  return getAuditLogger().logSendMessage(...args);
}

export async function logConnect(
  ...args: Parameters<AuditLogger['logConnect']>
): Promise<AuditEntry | null> {
  return getAuditLogger().logConnect(...args);
}

export async function logPost(
  ...args: Parameters<AuditLogger['logPost']>
): Promise<AuditEntry | null> {
  return getAuditLogger().logPost(...args);
}
