/**
 * Campaign Types
 * 
 * Type definitions for the Campaign Engine including:
 * - Campaign configuration and state
 * - Lead management
 * - Throttle configuration
 * - Scheduling
 */

import { Action, ActionKind } from './events';

// ============================================================================
// Campaign State Machine
// ============================================================================

export type CampaignState = 
  | 'DRAFT'       // Campaign created but not started
  | 'SCHEDULED'   // Waiting for scheduled start time
  | 'RUNNING'     // Actively processing leads
  | 'PAUSED'      // Temporarily paused, can resume
  | 'STOPPED'     // Manually stopped, can restart
  | 'COMPLETED'   // All leads processed
  | 'FAILED';     // Unrecoverable error

export const CAMPAIGN_STATE_TRANSITIONS: Record<CampaignState, CampaignState[]> = {
  DRAFT: ['SCHEDULED', 'RUNNING', 'STOPPED'],
  SCHEDULED: ['RUNNING', 'PAUSED', 'STOPPED'],
  RUNNING: ['PAUSED', 'STOPPED', 'COMPLETED', 'FAILED'],
  PAUSED: ['RUNNING', 'STOPPED'],
  STOPPED: ['DRAFT', 'RUNNING'],
  COMPLETED: ['DRAFT', 'RUNNING'], // Allow restart
  FAILED: ['DRAFT', 'STOPPED'],
};

// ============================================================================
// Lead Types
// ============================================================================

export type LeadStatus = 
  | 'PENDING'     // Waiting to be processed
  | 'QUEUED'      // In active queue
  | 'PROCESSING'  // Currently being processed
  | 'COMPLETED'   // Successfully processed
  | 'SKIPPED'     // Skipped (do-not-contact, already contacted, etc.)
  | 'FAILED'      // Failed after retries
  | 'RETRY'       // Marked for retry
  | 'CANCELLED';  // Campaign stopped before processing

export type LeadPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface LeadSource {
  type: 'manual' | 'import' | 'capyfr' | 'linkedin_search' | 'twitter_search';
  sourceId?: string;
  importedAt: number;
}

export interface LeadContactInfo {
  linkedinUrl?: string;
  twitterUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
}

export interface LeadCompanyInfo {
  name?: string;
  title?: string;
  industry?: string;
  size?: string;
  location?: string;
}

export interface Lead {
  id: string;
  campaignId: string;
  
  // Basic info
  name: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  profileImageUrl?: string;
  
  // Contact info
  contact: LeadContactInfo;
  
  // Company info
  company: LeadCompanyInfo;
  
  // Queue status
  status: LeadStatus;
  priority: LeadPriority;
  position: number; // Position in queue
  
  // Processing info
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  
  // Outcome
  processedAt?: number;
  outcome?: LeadOutcome;
  
  // Source
  source: LeadSource;
  
  // Custom data from ICP matching
  icpScore?: number;
  icpMatchReasons?: string[];
  customFields?: Record<string, unknown>;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

export interface LeadOutcome {
  success: boolean;
  action: ActionKind;
  actionId?: string;
  details?: {
    messageSent?: boolean;
    connectionSent?: boolean;
    responseReceived?: boolean;
    error?: string;
  };
  timestamp: number;
}

// ============================================================================
// Throttle Configuration
// ============================================================================

export interface ThrottleConfig {
  // Per-hour limits
  perHourCap: number;
  
  // Per-day limits
  perDayCap: number;
  
  // Delay between actions (random within range)
  minDelayMs: number;
  maxDelayMs: number;
  
  // Quiet hours (no actions during these times)
  quietHours: {
    enabled: boolean;
    start: string;  // HH:MM format
    end: string;    // HH:MM format
    timezone: string;
  };
  
  // Progressive ramp-up
  progressiveRamp: {
    enabled: boolean;
    startCap: number;      // Day 1 cap
    rampPerDay: number;    // Increase per day
    maxCap: number;        // Maximum after ramp
  };
  
  // Action-specific limits (override global limits)
  actionLimits?: Partial<Record<ActionKind, {
    perHourCap: number;
    perDayCap: number;
  }>>;
  
  // Burst control (prevent too many actions in short time)
  burstControl: {
    enabled: boolean;
    maxActionsPerBurst: number;
    burstWindowMs: number;
    cooldownMs: number;
  };
}

export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  perHourCap: 20,
  perDayCap: 100,
  minDelayMs: 30000,   // 30 seconds minimum
  maxDelayMs: 120000,  // 2 minutes maximum
  quietHours: {
    enabled: true,
    start: '22:00',
    end: '08:00',
    timezone: 'America/Los_Angeles',
  },
  progressiveRamp: {
    enabled: true,
    startCap: 10,
    rampPerDay: 10,
    maxCap: 100,
  },
  burstControl: {
    enabled: true,
    maxActionsPerBurst: 5,
    burstWindowMs: 300000, // 5 minutes
    cooldownMs: 60000,     // 1 minute cooldown after burst
  },
};

// ============================================================================
// Schedule Types
// ============================================================================

export type ScheduleType = 'ONCE' | 'RECURRING';

export type RecurrencePattern = 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'CUSTOM';

export interface Schedule {
  id: string;
  campaignId: string;
  
  type: ScheduleType;
  timezone: string;
  
  // One-time schedule
  startAt?: number;  // Unix timestamp
  endAt?: number;    // Optional end time
  
  // Recurring schedule
  recurrence?: {
    pattern: RecurrencePattern;
    customDays?: number[];  // For CUSTOM pattern (0=Sunday, 6=Saturday)
    startTime: string;      // HH:MM format
    endTime: string;        // HH:MM format
    
    // Optional: specific dates to skip
    skipDates?: string[];   // YYYY-MM-DD format
    
    // Optional: date range
    effectiveFrom?: string; // YYYY-MM-DD
    effectiveUntil?: string; // YYYY-MM-DD
  };
  
  // State
  isActive: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
  
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleWindow {
  start: Date;
  end: Date;
  isActive: boolean;
}

// ============================================================================
// Campaign Types
// ============================================================================

export type CampaignType = 
  | 'LINKEDIN_CONNECT'
  | 'LINKEDIN_MESSAGE'
  | 'LINKEDIN_INMAIL'
  | 'TWITTER_DM'
  | 'TWITTER_FOLLOW'
  | 'EMAIL_OUTREACH'
  | 'MULTI_CHANNEL';

export interface CampaignTemplate {
  id: string;
  name: string;
  subject?: string;      // For email/InMail
  content: string;       // Message template with variables
  variables: string[];   // e.g., ['firstName', 'company', 'title']
  platform: 'linkedin' | 'twitter' | 'email';
}

export interface CampaignSequenceStep {
  id: string;
  order: number;
  action: ActionKind;
  template?: CampaignTemplate;
  delayAfterMs?: number;  // Delay before next step
  conditions?: {
    // Conditional execution
    onlyIf?: 'connected' | 'not_connected' | 'replied' | 'not_replied';
    skipIf?: 'already_messaged' | 'do_not_contact';
  };
}

export interface CampaignStats {
  totalLeads: number;
  processed: number;
  pending: number;
  completed: number;
  failed: number;
  skipped: number;
  
  // Outcome stats
  connectionsSent: number;
  connectionsAccepted: number;
  messagesSent: number;
  messagesReplied: number;
  
  // Rate stats
  actionsToday: number;
  actionsThisHour: number;
  averageResponseRate: number;
  
  // Time stats
  startedAt?: number;
  lastActivityAt?: number;
  estimatedCompletionAt?: number;
}

export interface Campaign {
  id: string;
  
  // Basic info
  name: string;
  description?: string;
  type: CampaignType;
  
  // State
  state: CampaignState;
  
  // Configuration
  throttle: ThrottleConfig;
  schedule?: Schedule;
  
  // Sequence (steps to execute for each lead)
  sequence: CampaignSequenceStep[];
  
  // Lead management
  totalLeads: number;
  processedLeadIndex: number;  // Resume position
  
  // Stats
  stats: CampaignStats;
  
  // Audit
  auditLog: CampaignAuditEntry[];
  
  // Error handling
  lastError?: string;
  consecutiveErrors: number;
  maxConsecutiveErrors: number;
  
  // Metadata
  tags?: string[];
  metadata?: Record<string, unknown>;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  pausedAt?: number;
  stoppedAt?: number;
  completedAt?: number;
}

// ============================================================================
// Audit Types
// ============================================================================

export type CampaignAuditAction = 
  | 'CREATED'
  | 'STARTED'
  | 'PAUSED'
  | 'RESUMED'
  | 'STOPPED'
  | 'COMPLETED'
  | 'FAILED'
  | 'LEAD_ADDED'
  | 'LEAD_REMOVED'
  | 'LEAD_PROCESSED'
  | 'LEAD_SKIPPED'
  | 'LEAD_FAILED'
  | 'CONFIG_UPDATED'
  | 'THROTTLE_HIT'
  | 'QUIET_HOURS_STARTED'
  | 'QUIET_HOURS_ENDED'
  | 'SCHEDULE_TRIGGERED'
  | 'ERROR';

export interface CampaignAuditEntry {
  id: string;
  campaignId: string;
  timestamp: number;
  action: CampaignAuditAction;
  details: {
    leadId?: string;
    leadName?: string;
    previousState?: CampaignState;
    newState?: CampaignState;
    error?: string;
    metadata?: Record<string, unknown>;
  };
}

// ============================================================================
// Campaign Events
// ============================================================================

export type CampaignEventType = 
  | 'CAMPAIGN_CREATED'
  | 'CAMPAIGN_STARTED'
  | 'CAMPAIGN_PAUSED'
  | 'CAMPAIGN_RESUMED'
  | 'CAMPAIGN_STOPPED'
  | 'CAMPAIGN_COMPLETED'
  | 'CAMPAIGN_FAILED'
  | 'LEAD_QUEUED'
  | 'LEAD_PROCESSING'
  | 'LEAD_COMPLETED'
  | 'LEAD_SKIPPED'
  | 'LEAD_FAILED'
  | 'LEAD_RETRY_SCHEDULED'
  | 'THROTTLE_WAITING'
  | 'THROTTLE_READY'
  | 'QUIET_HOURS_BLOCKED'
  | 'SCHEDULE_NEXT_WINDOW'
  | 'STATS_UPDATED';

export interface BaseCampaignEvent {
  id: string;
  type: CampaignEventType;
  campaignId: string;
  timestamp: number;
}

export interface CampaignStateEvent extends BaseCampaignEvent {
  type: 'CAMPAIGN_CREATED' | 'CAMPAIGN_STARTED' | 'CAMPAIGN_PAUSED' | 
        'CAMPAIGN_RESUMED' | 'CAMPAIGN_STOPPED' | 'CAMPAIGN_COMPLETED' | 'CAMPAIGN_FAILED';
  state: CampaignState;
  previousState?: CampaignState;
  reason?: string;
}

export interface LeadEvent extends BaseCampaignEvent {
  type: 'LEAD_QUEUED' | 'LEAD_PROCESSING' | 'LEAD_COMPLETED' | 
        'LEAD_SKIPPED' | 'LEAD_FAILED' | 'LEAD_RETRY_SCHEDULED';
  leadId: string;
  leadName: string;
  status: LeadStatus;
  error?: string;
  retryAt?: number;
}

export interface ThrottleEvent extends BaseCampaignEvent {
  type: 'THROTTLE_WAITING' | 'THROTTLE_READY' | 'QUIET_HOURS_BLOCKED';
  waitMs?: number;
  reason?: string;
  resumeAt?: number;
}

export interface ScheduleEvent extends BaseCampaignEvent {
  type: 'SCHEDULE_NEXT_WINDOW';
  nextWindowStart: number;
  nextWindowEnd: number;
}

export interface StatsEvent extends BaseCampaignEvent {
  type: 'STATS_UPDATED';
  stats: CampaignStats;
}

export type CampaignEvent = 
  | CampaignStateEvent 
  | LeadEvent 
  | ThrottleEvent 
  | ScheduleEvent 
  | StatsEvent;

// ============================================================================
// Queue Types
// ============================================================================

export interface QueueConfig {
  maxSize: number;
  maxRetries: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
  maxRetryDelayMs: number;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxSize: 10000,
  maxRetries: 3,
  retryDelayMs: 300000,        // 5 minutes
  retryBackoffMultiplier: 2,
  maxRetryDelayMs: 3600000,    // 1 hour max
};

// ============================================================================
// Do-Not-Contact Types
// ============================================================================

export interface DoNotContactEntry {
  id: string;
  identifier: string;  // Email, LinkedIn URL, etc.
  type: 'email' | 'linkedin' | 'twitter' | 'domain';
  reason: string;
  addedAt: number;
  addedBy?: 'user' | 'system' | 'import';
  expiresAt?: number;  // Optional expiry
}

// ============================================================================
// Utility Types
// ============================================================================

export interface CreateCampaignInput {
  name: string;
  description?: string;
  type: CampaignType;
  throttle?: Partial<ThrottleConfig>;
  schedule?: Omit<Schedule, 'id' | 'campaignId' | 'createdAt' | 'updatedAt'>;
  sequence: Omit<CampaignSequenceStep, 'id'>[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AddLeadsInput {
  campaignId: string;
  leads: Omit<Lead, 'id' | 'campaignId' | 'status' | 'position' | 'retryCount' | 
              'createdAt' | 'updatedAt'>[];
}

export interface CampaignProgress {
  campaignId: string;
  state: CampaignState;
  progress: number;  // 0-100
  currentLead?: {
    id: string;
    name: string;
    status: LeadStatus;
  };
  stats: CampaignStats;
  nextAction?: {
    type: string;
    scheduledAt: number;
    waitReason?: string;
  };
}
