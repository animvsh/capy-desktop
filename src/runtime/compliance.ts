/**
 * Compliance / Safety Gatekeeper
 * 
 * Handles:
 * - Approval requirements for risky actions
 * - Rate limiting
 * - Time window restrictions
 * - Do-not-contact list
 * - Message linting
 */

import {
  Action,
  ActionKind,
  ACTIONS_REQUIRING_APPROVAL,
  SendMessageAction,
  ConnectAction,
  PostAction,
  ApprovalRequest,
} from '../types/events';
import { EventBus, getEventBus, createBaseEvent } from './event-bus';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  actionKind: ActionKind;
  limit: number;
  windowMs: number;
}

export interface TimeWindowConfig {
  enabled: boolean;
  allowedStart: string; // HH:MM format
  allowedEnd: string;   // HH:MM format
  timezone: string;
  allowedDays: number[]; // 0 = Sunday, 6 = Saturday
}

export interface ComplianceConfig {
  rateLimits: RateLimitConfig[];
  timeWindow: TimeWindowConfig;
  doNotContactList: Set<string>;
  messageLinting: {
    enabled: boolean;
    maxLength?: number;
    bannedWords?: string[];
    spamPatterns?: RegExp[];
  };
  autoApprove: {
    enabled: boolean;
    maxAutoApprovalsPerHour: number;
    trustedRecipients?: Set<string>;
  };
  approvalTimeoutMs: number;
}

export interface RateLimitState {
  actionKind: ActionKind;
  count: number;
  windowStart: number;
  resetAt: number;
}

export interface ComplianceResult {
  allowed: boolean;
  requiresApproval: boolean;
  approvalRequest?: ApprovalRequest;
  blockReason?: string;
  warnings?: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  rateLimits: [
    { actionKind: 'send_message', limit: 50, windowMs: 3600000 }, // 50/hour
    { actionKind: 'connect', limit: 20, windowMs: 3600000 },      // 20/hour
    { actionKind: 'post', limit: 10, windowMs: 3600000 },         // 10/hour
    { actionKind: 'follow', limit: 30, windowMs: 3600000 },       // 30/hour
  ],
  timeWindow: {
    enabled: true,
    allowedStart: '09:00',
    allowedEnd: '18:00',
    timezone: 'America/Los_Angeles',
    allowedDays: [1, 2, 3, 4, 5], // Monday - Friday
  },
  doNotContactList: new Set(),
  messageLinting: {
    enabled: true,
    maxLength: 2000,
    bannedWords: [
      'guarantee',
      'free money',
      'act now',
      'limited time',
      'click here',
    ],
    spamPatterns: [
      /\b(buy|sale|discount|offer)\b.*\b(now|today|limited)\b/i,
      /!!!+/,
      /\$\$\$+/,
      /click (here|now|this)/i,
    ],
  },
  autoApprove: {
    enabled: false,
    maxAutoApprovalsPerHour: 10,
    trustedRecipients: new Set(),
  },
  approvalTimeoutMs: 300000, // 5 minutes
};

// ============================================================================
// Compliance Manager
// ============================================================================

export class ComplianceManager {
  private config: ComplianceConfig;
  private eventBus: EventBus;
  private rateLimitStates: Map<ActionKind, RateLimitState> = new Map();
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private autoApprovalCount: number = 0;
  private autoApprovalWindowStart: number = 0;

  constructor(config: Partial<ComplianceConfig> = {}, eventBus?: EventBus) {
    this.config = { ...DEFAULT_COMPLIANCE_CONFIG, ...config };
    this.eventBus = eventBus ?? getEventBus();
  }

  // --------------------------------------------------------------------------
  // Main Check
  // --------------------------------------------------------------------------

  /**
   * Check if an action is allowed and whether it requires approval
   */
  async checkAction(action: Action, runId: string): Promise<ComplianceResult> {
    const warnings: string[] = [];
    
    // Check time window
    const timeWindowResult = this.checkTimeWindow();
    if (!timeWindowResult.allowed) {
      this.emitTimeWindowBlocked(runId);
      return {
        allowed: false,
        requiresApproval: false,
        blockReason: timeWindowResult.reason,
      };
    }

    // Check rate limit
    const rateLimitResult = this.checkRateLimit(action.kind);
    if (!rateLimitResult.allowed) {
      this.emitRateLimitHit(action.kind, runId);
      return {
        allowed: false,
        requiresApproval: false,
        blockReason: rateLimitResult.reason,
      };
    }

    // Check do-not-contact list for relevant actions
    if (this.isContactAction(action)) {
      const contact = this.getContactFromAction(action);
      if (contact && this.isBlocked(contact)) {
        this.emitContactBlocked(contact, runId);
        return {
          allowed: false,
          requiresApproval: false,
          blockReason: `Contact "${contact}" is on the do-not-contact list`,
        };
      }
    }

    // Lint messages
    if (this.isMessageAction(action)) {
      const message = this.getMessageFromAction(action);
      if (message) {
        const lintResult = this.lintMessage(message);
        if (lintResult.warnings.length > 0) {
          warnings.push(...lintResult.warnings);
          this.emitMessageLintWarning(lintResult.warnings, message, runId);
        }
      }
    }

    // Check if approval is required
    const requiresApproval = this.requiresApproval(action);
    
    if (requiresApproval) {
      // Check auto-approve
      if (this.canAutoApprove(action)) {
        this.recordAutoApproval();
        return {
          allowed: true,
          requiresApproval: false,
          warnings,
        };
      }

      // Create approval request
      const approvalRequest = this.createApprovalRequest(action, runId);
      this.pendingApprovals.set(approvalRequest.id, approvalRequest);
      
      this.emitNeedsApproval(approvalRequest, runId);
      
      return {
        allowed: false,
        requiresApproval: true,
        approvalRequest,
        warnings,
      };
    }

    // Increment rate limit counter
    this.incrementRateLimit(action.kind);

    return {
      allowed: true,
      requiresApproval: false,
      warnings,
    };
  }

  // --------------------------------------------------------------------------
  // Time Window
  // --------------------------------------------------------------------------

  private checkTimeWindow(): { allowed: boolean; reason?: string } {
    if (!this.config.timeWindow.enabled) {
      return { allowed: true };
    }

    const now = new Date();
    const { allowedStart, allowedEnd, allowedDays } = this.config.timeWindow;

    // Check day of week
    const dayOfWeek = now.getDay();
    if (!allowedDays.includes(dayOfWeek)) {
      return {
        allowed: false,
        reason: `Automation is only allowed on ${this.formatDays(allowedDays)}`,
      };
    }

    // Check time
    const currentTime = this.formatTime(now);
    if (currentTime < allowedStart || currentTime > allowedEnd) {
      return {
        allowed: false,
        reason: `Automation is only allowed between ${allowedStart} and ${allowedEnd}`,
      };
    }

    return { allowed: true };
  }

  private formatTime(date: Date): string {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  private formatDays(days: number[]): string {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days.map(d => dayNames[d]).join(', ');
  }

  // --------------------------------------------------------------------------
  // Rate Limiting
  // --------------------------------------------------------------------------

  private checkRateLimit(actionKind: ActionKind): { allowed: boolean; reason?: string } {
    const limitConfig = this.config.rateLimits.find(r => r.actionKind === actionKind);
    if (!limitConfig) {
      return { allowed: true };
    }

    const state = this.rateLimitStates.get(actionKind);
    if (!state) {
      return { allowed: true };
    }

    const now = Date.now();
    
    // Check if window has expired
    if (now >= state.resetAt) {
      this.rateLimitStates.delete(actionKind);
      return { allowed: true };
    }

    // Check if limit reached
    if (state.count >= limitConfig.limit) {
      const resetIn = Math.ceil((state.resetAt - now) / 60000);
      return {
        allowed: false,
        reason: `Rate limit reached for ${actionKind}. ${limitConfig.limit} actions per ${limitConfig.windowMs / 60000} minutes. Resets in ${resetIn} minutes.`,
      };
    }

    return { allowed: true };
  }

  private incrementRateLimit(actionKind: ActionKind): void {
    const limitConfig = this.config.rateLimits.find(r => r.actionKind === actionKind);
    if (!limitConfig) return;

    const now = Date.now();
    const state = this.rateLimitStates.get(actionKind);

    if (!state || now >= state.resetAt) {
      this.rateLimitStates.set(actionKind, {
        actionKind,
        count: 1,
        windowStart: now,
        resetAt: now + limitConfig.windowMs,
      });
    } else {
      state.count++;
    }
  }

  getRateLimitStatus(actionKind: ActionKind): RateLimitState | null {
    return this.rateLimitStates.get(actionKind) ?? null;
  }

  getAllRateLimitStatus(): Map<ActionKind, RateLimitState> {
    return new Map(this.rateLimitStates);
  }

  // --------------------------------------------------------------------------
  // Do-Not-Contact List
  // --------------------------------------------------------------------------

  addToDoNotContact(contact: string): void {
    this.config.doNotContactList.add(contact.toLowerCase());
  }

  removeFromDoNotContact(contact: string): void {
    this.config.doNotContactList.delete(contact.toLowerCase());
  }

  isBlocked(contact: string): boolean {
    return this.config.doNotContactList.has(contact.toLowerCase());
  }

  getDoNotContactList(): string[] {
    return Array.from(this.config.doNotContactList);
  }

  // --------------------------------------------------------------------------
  // Message Linting
  // --------------------------------------------------------------------------

  private lintMessage(message: string): { warnings: string[] } {
    const warnings: string[] = [];
    const { messageLinting } = this.config;

    if (!messageLinting.enabled) {
      return { warnings };
    }

    // Check length
    if (messageLinting.maxLength && message.length > messageLinting.maxLength) {
      warnings.push(`Message exceeds maximum length of ${messageLinting.maxLength} characters`);
    }

    // Check banned words
    if (messageLinting.bannedWords) {
      const lowerMessage = message.toLowerCase();
      for (const word of messageLinting.bannedWords) {
        if (lowerMessage.includes(word.toLowerCase())) {
          warnings.push(`Message contains potentially problematic word: "${word}"`);
        }
      }
    }

    // Check spam patterns
    if (messageLinting.spamPatterns) {
      for (const pattern of messageLinting.spamPatterns) {
        if (pattern.test(message)) {
          warnings.push(`Message matches spam pattern: ${pattern.toString()}`);
        }
      }
    }

    return { warnings };
  }

  // --------------------------------------------------------------------------
  // Approvals
  // --------------------------------------------------------------------------

  private requiresApproval(action: Action): boolean {
    return ACTIONS_REQUIRING_APPROVAL.includes(action.kind);
  }

  private createApprovalRequest(action: Action, runId: string): ApprovalRequest {
    const now = Date.now();
    return {
      id: `apr_${now}_${Math.random().toString(36).substring(2, 9)}`,
      action,
      reason: this.getApprovalReason(action),
      createdAt: now,
      expiresAt: now + this.config.approvalTimeoutMs,
      status: 'pending',
    };
  }

  private getApprovalReason(action: Action): string {
    switch (action.kind) {
      case 'send_message':
        return 'Sending a message requires your approval';
      case 'connect':
        return 'Sending a connection request requires your approval';
      case 'post':
        return 'Publishing a post requires your approval';
      case 'follow':
        return 'Following a user requires your approval';
      default:
        return 'This action requires your approval';
    }
  }

  approveAction(approvalId: string): boolean {
    const request = this.pendingApprovals.get(approvalId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    const now = Date.now();
    if (now > request.expiresAt) {
      request.status = 'expired';
      request.resolvedAt = now;
      request.resolvedBy = 'timeout';
      return false;
    }

    request.status = 'approved';
    request.resolvedAt = now;
    request.resolvedBy = 'user';
    
    // Increment rate limit on approval
    this.incrementRateLimit(request.action.kind);

    return true;
  }

  denyAction(approvalId: string): boolean {
    const request = this.pendingApprovals.get(approvalId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'denied';
    request.resolvedAt = Date.now();
    request.resolvedBy = 'user';
    return true;
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (r) => r.status === 'pending'
    );
  }

  getApprovalRequest(approvalId: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  // --------------------------------------------------------------------------
  // Auto-Approve
  // --------------------------------------------------------------------------

  private canAutoApprove(action: Action): boolean {
    if (!this.config.autoApprove.enabled) {
      return false;
    }

    // Check hourly limit
    const now = Date.now();
    if (now - this.autoApprovalWindowStart > 3600000) {
      this.autoApprovalCount = 0;
      this.autoApprovalWindowStart = now;
    }

    if (this.autoApprovalCount >= this.config.autoApprove.maxAutoApprovalsPerHour) {
      return false;
    }

    // Check trusted recipients for contact actions
    if (this.isContactAction(action) && this.config.autoApprove.trustedRecipients) {
      const contact = this.getContactFromAction(action);
      if (contact && this.config.autoApprove.trustedRecipients.has(contact)) {
        return true;
      }
    }

    return false;
  }

  private recordAutoApproval(): void {
    this.autoApprovalCount++;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private isContactAction(action: Action): action is SendMessageAction | ConnectAction {
    return action.kind === 'send_message' || action.kind === 'connect';
  }

  private isMessageAction(action: Action): action is SendMessageAction | PostAction {
    return action.kind === 'send_message' || action.kind === 'post';
  }

  private getContactFromAction(action: Action): string | null {
    if (action.kind === 'send_message') {
      return (action as SendMessageAction).recipient;
    }
    if (action.kind === 'connect') {
      return (action as ConnectAction).profileUrl;
    }
    return null;
  }

  private getMessageFromAction(action: Action): string | null {
    if (action.kind === 'send_message') {
      return (action as SendMessageAction).message;
    }
    if (action.kind === 'post') {
      return (action as PostAction).content;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Event Emission
  // --------------------------------------------------------------------------

  private emitNeedsApproval(request: ApprovalRequest, runId: string): void {
    this.eventBus.emit({
      ...createBaseEvent('NEEDS_APPROVAL', runId),
      action: request.action,
      reason: request.reason,
      approvalId: request.id,
      timeoutMs: this.config.approvalTimeoutMs,
    });
  }

  private emitRateLimitHit(actionKind: ActionKind, runId: string): void {
    const limitConfig = this.config.rateLimits.find(r => r.actionKind === actionKind);
    const state = this.rateLimitStates.get(actionKind);
    
    this.eventBus.emit({
      ...createBaseEvent('RATE_LIMIT_HIT', runId),
      actionKind,
      limit: limitConfig?.limit ?? 0,
      windowMs: limitConfig?.windowMs ?? 0,
      resetAt: state?.resetAt ?? 0,
    });
  }

  private emitTimeWindowBlocked(runId: string): void {
    const { allowedStart, allowedEnd } = this.config.timeWindow;
    const now = new Date();
    
    this.eventBus.emit({
      ...createBaseEvent('TIME_WINDOW_BLOCKED', runId),
      windowStart: allowedStart,
      windowEnd: allowedEnd,
      currentTime: this.formatTime(now),
    });
  }

  private emitContactBlocked(contact: string, runId: string): void {
    this.eventBus.emit({
      ...createBaseEvent('CONTACT_BLOCKED', runId),
      contact,
      reason: 'Contact is on the do-not-contact list',
    });
  }

  private emitMessageLintWarning(warnings: string[], message: string, runId: string): void {
    this.eventBus.emit({
      ...createBaseEvent('MESSAGE_LINT_WARNING', runId),
      warnings,
      message,
    });
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  updateConfig(config: Partial<ComplianceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ComplianceConfig {
    return { ...this.config };
  }

  resetRateLimits(): void {
    this.rateLimitStates.clear();
  }

  clearPendingApprovals(): void {
    this.pendingApprovals.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalComplianceManager: ComplianceManager | null = null;

export function getComplianceManager(config?: Partial<ComplianceConfig>): ComplianceManager {
  if (!globalComplianceManager) {
    globalComplianceManager = new ComplianceManager(config);
  }
  return globalComplianceManager;
}

export function resetComplianceManager(): void {
  if (globalComplianceManager) {
    globalComplianceManager.clearPendingApprovals();
    globalComplianceManager.resetRateLimits();
    globalComplianceManager = null;
  }
}
