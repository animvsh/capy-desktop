/**
 * Throttle Manager
 * 
 * Handles rate limiting for campaign actions:
 * - Per-hour caps (configurable)
 * - Per-day caps (configurable)
 * - Random delays between actions (min/max)
 * - Quiet hours (e.g., no actions 10pm-8am)
 * - Progressive ramp (day 1: 10, day 2: 20, etc.)
 * - Burst control
 */

import { ThrottleConfig, DEFAULT_THROTTLE_CONFIG } from '../types/campaign';
import { ActionKind } from '../types/events';

// ============================================================================
// Types
// ============================================================================

export interface ThrottleState {
  hourlyCount: number;
  hourlyWindowStart: number;
  dailyCount: number;
  dailyWindowStart: number;
  lastActionAt: number;
  
  // Burst tracking
  burstCount: number;
  burstWindowStart: number;
  burstCooldownUntil: number;
  
  // Progressive ramp
  campaignStartDate: number;
  currentDayCap: number;
  
  // Per-action tracking
  actionCounts: Map<ActionKind, {
    hourly: number;
    daily: number;
    hourlyWindowStart: number;
    dailyWindowStart: number;
  }>;
}

export interface ThrottleDecision {
  allowed: boolean;
  waitMs: number;
  reason?: ThrottleReason;
  resumeAt?: number;
}

export type ThrottleReason = 
  | 'HOURLY_CAP_REACHED'
  | 'DAILY_CAP_REACHED'
  | 'ACTION_HOURLY_CAP'
  | 'ACTION_DAILY_CAP'
  | 'QUIET_HOURS'
  | 'BURST_COOLDOWN'
  | 'PROGRESSIVE_RAMP_CAP'
  | 'MIN_DELAY_NOT_MET';

export interface ThrottleMetrics {
  hourlyRemaining: number;
  dailyRemaining: number;
  currentDayCap: number;
  nextActionAt: number;
  isInQuietHours: boolean;
  quietHoursEndAt?: number;
  burstRemaining: number;
  daysSinceStart: number;
}

// ============================================================================
// Throttle Manager
// ============================================================================

export class ThrottleManager {
  private config: ThrottleConfig;
  private state: ThrottleState;
  
  constructor(config: Partial<ThrottleConfig> = {}) {
    this.config = { ...DEFAULT_THROTTLE_CONFIG, ...config };
    this.state = this.createInitialState();
  }
  
  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------
  
  private createInitialState(): ThrottleState {
    const now = Date.now();
    return {
      hourlyCount: 0,
      hourlyWindowStart: now,
      dailyCount: 0,
      dailyWindowStart: this.getStartOfDay(now),
      lastActionAt: 0,
      burstCount: 0,
      burstWindowStart: now,
      burstCooldownUntil: 0,
      campaignStartDate: now,
      currentDayCap: this.config.progressiveRamp.enabled 
        ? this.config.progressiveRamp.startCap 
        : this.config.perDayCap,
      actionCounts: new Map(),
    };
  }
  
  /**
   * Reset state (call when campaign starts)
   */
  reset(): void {
    this.state = this.createInitialState();
  }
  
  /**
   * Set campaign start date (for progressive ramp calculation)
   */
  setCampaignStartDate(timestamp: number): void {
    this.state.campaignStartDate = timestamp;
    this.updateProgressiveRampCap();
  }
  
  /**
   * Get current state (for persistence/debugging)
   */
  getState(): ThrottleState {
    return { ...this.state };
  }
  
  /**
   * Restore state (for resuming campaigns)
   */
  restoreState(state: Partial<ThrottleState>): void {
    this.state = {
      ...this.state,
      ...state,
      actionCounts: state.actionCounts 
        ? new Map(state.actionCounts) 
        : this.state.actionCounts,
    };
  }
  
  // --------------------------------------------------------------------------
  // Throttle Checking
  // --------------------------------------------------------------------------
  
  /**
   * Check if an action is allowed and calculate wait time if not
   */
  check(actionKind?: ActionKind): ThrottleDecision {
    const now = Date.now();
    
    // Reset windows if expired
    this.maybeResetWindows(now);
    
    // Check quiet hours first
    const quietHoursCheck = this.checkQuietHours(now);
    if (!quietHoursCheck.allowed) {
      return quietHoursCheck;
    }
    
    // Check burst cooldown
    const burstCheck = this.checkBurstCooldown(now);
    if (!burstCheck.allowed) {
      return burstCheck;
    }
    
    // Check progressive ramp cap
    if (this.config.progressiveRamp.enabled) {
      this.updateProgressiveRampCap();
      if (this.state.dailyCount >= this.state.currentDayCap) {
        const nextDayStart = this.getStartOfNextDay(now);
        return {
          allowed: false,
          waitMs: nextDayStart - now,
          reason: 'PROGRESSIVE_RAMP_CAP',
          resumeAt: nextDayStart,
        };
      }
    }
    
    // Check daily cap
    if (this.state.dailyCount >= this.config.perDayCap) {
      const nextDayStart = this.getStartOfNextDay(now);
      return {
        allowed: false,
        waitMs: nextDayStart - now,
        reason: 'DAILY_CAP_REACHED',
        resumeAt: nextDayStart,
      };
    }
    
    // Check hourly cap
    if (this.state.hourlyCount >= this.config.perHourCap) {
      const nextHourStart = this.state.hourlyWindowStart + 3600000;
      return {
        allowed: false,
        waitMs: nextHourStart - now,
        reason: 'HOURLY_CAP_REACHED',
        resumeAt: nextHourStart,
      };
    }
    
    // Check action-specific limits
    if (actionKind && this.config.actionLimits?.[actionKind]) {
      const actionCheck = this.checkActionLimits(actionKind, now);
      if (!actionCheck.allowed) {
        return actionCheck;
      }
    }
    
    // Check burst limit
    const burstLimitCheck = this.checkBurstLimit(now);
    if (!burstLimitCheck.allowed) {
      return burstLimitCheck;
    }
    
    // Check minimum delay
    const delayCheck = this.checkMinDelay(now);
    if (!delayCheck.allowed) {
      return delayCheck;
    }
    
    return { allowed: true, waitMs: 0 };
  }
  
  /**
   * Record that an action was performed
   */
  recordAction(actionKind?: ActionKind): void {
    const now = Date.now();
    
    // Reset windows if needed
    this.maybeResetWindows(now);
    
    // Increment global counters
    this.state.hourlyCount++;
    this.state.dailyCount++;
    this.state.lastActionAt = now;
    
    // Increment burst counter
    this.state.burstCount++;
    
    // Check if we've hit burst limit - trigger cooldown
    if (this.config.burstControl.enabled && 
        this.state.burstCount >= this.config.burstControl.maxActionsPerBurst) {
      this.state.burstCooldownUntil = now + this.config.burstControl.cooldownMs;
      this.state.burstCount = 0;
      this.state.burstWindowStart = now;
    }
    
    // Increment action-specific counter
    if (actionKind) {
      this.incrementActionCount(actionKind, now);
    }
  }
  
  /**
   * Get a random delay between actions
   */
  getRandomDelay(): number {
    const { minDelayMs, maxDelayMs } = this.config;
    return Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
  }
  
  /**
   * Calculate when the next action will be allowed
   */
  getNextActionTime(): number {
    const now = Date.now();
    const decision = this.check();
    
    if (decision.allowed) {
      // Add random delay
      return now + this.getRandomDelay();
    }
    
    return decision.resumeAt ?? (now + decision.waitMs);
  }
  
  // --------------------------------------------------------------------------
  // Specific Checks
  // --------------------------------------------------------------------------
  
  private checkQuietHours(now: number): ThrottleDecision {
    if (!this.config.quietHours.enabled) {
      return { allowed: true, waitMs: 0 };
    }
    
    const { start, end, timezone } = this.config.quietHours;
    const currentTime = this.getCurrentTimeInTimezone(now, timezone);
    const currentMinutes = this.timeToMinutes(currentTime);
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);
    
    let isInQuietHours = false;
    let resumeAt = 0;
    
    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
      // Overnight: quiet if after start OR before end
      isInQuietHours = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      
      if (isInQuietHours) {
        if (currentMinutes >= startMinutes) {
          // After start, resume next day at end time
          resumeAt = this.getTimestampForTimeNextDay(end, timezone, now);
        } else {
          // Before end, resume today at end time
          resumeAt = this.getTimestampForTimeToday(end, timezone, now);
        }
      }
    } else {
      // Same day: quiet if between start and end
      isInQuietHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      
      if (isInQuietHours) {
        resumeAt = this.getTimestampForTimeToday(end, timezone, now);
      }
    }
    
    if (isInQuietHours) {
      return {
        allowed: false,
        waitMs: resumeAt - now,
        reason: 'QUIET_HOURS',
        resumeAt,
      };
    }
    
    return { allowed: true, waitMs: 0 };
  }
  
  private checkBurstCooldown(now: number): ThrottleDecision {
    if (!this.config.burstControl.enabled) {
      return { allowed: true, waitMs: 0 };
    }
    
    if (now < this.state.burstCooldownUntil) {
      return {
        allowed: false,
        waitMs: this.state.burstCooldownUntil - now,
        reason: 'BURST_COOLDOWN',
        resumeAt: this.state.burstCooldownUntil,
      };
    }
    
    return { allowed: true, waitMs: 0 };
  }
  
  private checkBurstLimit(now: number): ThrottleDecision {
    if (!this.config.burstControl.enabled) {
      return { allowed: true, waitMs: 0 };
    }
    
    const { maxActionsPerBurst, burstWindowMs, cooldownMs } = this.config.burstControl;
    
    // Reset burst window if expired
    if (now - this.state.burstWindowStart >= burstWindowMs) {
      this.state.burstCount = 0;
      this.state.burstWindowStart = now;
    }
    
    if (this.state.burstCount >= maxActionsPerBurst) {
      const cooldownUntil = now + cooldownMs;
      return {
        allowed: false,
        waitMs: cooldownMs,
        reason: 'BURST_COOLDOWN',
        resumeAt: cooldownUntil,
      };
    }
    
    return { allowed: true, waitMs: 0 };
  }
  
  private checkMinDelay(now: number): ThrottleDecision {
    if (this.state.lastActionAt === 0) {
      return { allowed: true, waitMs: 0 };
    }
    
    const elapsed = now - this.state.lastActionAt;
    if (elapsed < this.config.minDelayMs) {
      const waitMs = this.config.minDelayMs - elapsed;
      return {
        allowed: false,
        waitMs,
        reason: 'MIN_DELAY_NOT_MET',
        resumeAt: now + waitMs,
      };
    }
    
    return { allowed: true, waitMs: 0 };
  }
  
  private checkActionLimits(actionKind: ActionKind, now: number): ThrottleDecision {
    const limits = this.config.actionLimits?.[actionKind];
    if (!limits) {
      return { allowed: true, waitMs: 0 };
    }
    
    const counts = this.getOrCreateActionCount(actionKind, now);
    
    // Reset action windows if needed
    if (now - counts.hourlyWindowStart >= 3600000) {
      counts.hourly = 0;
      counts.hourlyWindowStart = now;
    }
    if (now - counts.dailyWindowStart >= 86400000) {
      counts.daily = 0;
      counts.dailyWindowStart = this.getStartOfDay(now);
    }
    
    // Check hourly
    if (counts.hourly >= limits.perHourCap) {
      const nextHourStart = counts.hourlyWindowStart + 3600000;
      return {
        allowed: false,
        waitMs: nextHourStart - now,
        reason: 'ACTION_HOURLY_CAP',
        resumeAt: nextHourStart,
      };
    }
    
    // Check daily
    if (counts.daily >= limits.perDayCap) {
      const nextDayStart = this.getStartOfNextDay(now);
      return {
        allowed: false,
        waitMs: nextDayStart - now,
        reason: 'ACTION_DAILY_CAP',
        resumeAt: nextDayStart,
      };
    }
    
    return { allowed: true, waitMs: 0 };
  }
  
  // --------------------------------------------------------------------------
  // Progressive Ramp
  // --------------------------------------------------------------------------
  
  private updateProgressiveRampCap(): void {
    if (!this.config.progressiveRamp.enabled) {
      return;
    }
    
    const { startCap, rampPerDay, maxCap } = this.config.progressiveRamp;
    const daysSinceStart = this.getDaysSinceCampaignStart();
    
    const calculatedCap = startCap + (daysSinceStart * rampPerDay);
    this.state.currentDayCap = Math.min(calculatedCap, maxCap);
  }
  
  private getDaysSinceCampaignStart(): number {
    const now = Date.now();
    const startOfToday = this.getStartOfDay(now);
    const startOfCampaignDay = this.getStartOfDay(this.state.campaignStartDate);
    return Math.floor((startOfToday - startOfCampaignDay) / 86400000);
  }
  
  // --------------------------------------------------------------------------
  // Window Management
  // --------------------------------------------------------------------------
  
  private maybeResetWindows(now: number): void {
    // Reset hourly window
    if (now - this.state.hourlyWindowStart >= 3600000) {
      this.state.hourlyCount = 0;
      this.state.hourlyWindowStart = now;
    }
    
    // Reset daily window
    const startOfToday = this.getStartOfDay(now);
    if (this.state.dailyWindowStart < startOfToday) {
      this.state.dailyCount = 0;
      this.state.dailyWindowStart = startOfToday;
      // Update progressive ramp cap for new day
      this.updateProgressiveRampCap();
    }
    
    // Reset burst window
    if (this.config.burstControl.enabled) {
      if (now - this.state.burstWindowStart >= this.config.burstControl.burstWindowMs) {
        this.state.burstCount = 0;
        this.state.burstWindowStart = now;
      }
    }
  }
  
  private getOrCreateActionCount(actionKind: ActionKind, now: number) {
    let counts = this.state.actionCounts.get(actionKind);
    if (!counts) {
      counts = {
        hourly: 0,
        daily: 0,
        hourlyWindowStart: now,
        dailyWindowStart: this.getStartOfDay(now),
      };
      this.state.actionCounts.set(actionKind, counts);
    }
    return counts;
  }
  
  private incrementActionCount(actionKind: ActionKind, now: number): void {
    const counts = this.getOrCreateActionCount(actionKind, now);
    counts.hourly++;
    counts.daily++;
  }
  
  // --------------------------------------------------------------------------
  // Time Utilities
  // --------------------------------------------------------------------------
  
  private getStartOfDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
  
  private getStartOfNextDay(timestamp: number): number {
    return this.getStartOfDay(timestamp) + 86400000;
  }
  
  private getCurrentTimeInTimezone(timestamp: number, _timezone: string): string {
    // Simplified: use local time. In production, use a proper timezone library
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  private getTimestampForTimeToday(time: string, _timezone: string, now: number): number {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date(now);
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
  }
  
  private getTimestampForTimeNextDay(time: string, timezone: string, now: number): number {
    return this.getTimestampForTimeToday(time, timezone, now) + 86400000;
  }
  
  // --------------------------------------------------------------------------
  // Metrics
  // --------------------------------------------------------------------------
  
  getMetrics(): ThrottleMetrics {
    const now = Date.now();
    this.maybeResetWindows(now);
    
    const isInQuietHours = !this.checkQuietHours(now).allowed;
    let quietHoursEndAt: number | undefined;
    
    if (isInQuietHours) {
      const quietDecision = this.checkQuietHours(now);
      quietHoursEndAt = quietDecision.resumeAt;
    }
    
    return {
      hourlyRemaining: Math.max(0, this.config.perHourCap - this.state.hourlyCount),
      dailyRemaining: Math.max(0, this.config.perDayCap - this.state.dailyCount),
      currentDayCap: this.state.currentDayCap,
      nextActionAt: this.getNextActionTime(),
      isInQuietHours,
      quietHoursEndAt,
      burstRemaining: this.config.burstControl.enabled
        ? Math.max(0, this.config.burstControl.maxActionsPerBurst - this.state.burstCount)
        : Infinity,
      daysSinceStart: this.getDaysSinceCampaignStart(),
    };
  }
  
  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------
  
  updateConfig(config: Partial<ThrottleConfig>): void {
    this.config = { ...this.config, ...config };
    this.updateProgressiveRampCap();
  }
  
  getConfig(): ThrottleConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a throttle manager with default config
 */
export function createThrottleManager(config?: Partial<ThrottleConfig>): ThrottleManager {
  return new ThrottleManager(config);
}

/**
 * Format throttle reason for display
 */
export function formatThrottleReason(reason: ThrottleReason): string {
  switch (reason) {
    case 'HOURLY_CAP_REACHED':
      return 'Hourly limit reached';
    case 'DAILY_CAP_REACHED':
      return 'Daily limit reached';
    case 'ACTION_HOURLY_CAP':
      return 'Action hourly limit reached';
    case 'ACTION_DAILY_CAP':
      return 'Action daily limit reached';
    case 'QUIET_HOURS':
      return 'Currently in quiet hours';
    case 'BURST_COOLDOWN':
      return 'Cooling down after burst';
    case 'PROGRESSIVE_RAMP_CAP':
      return 'Progressive ramp limit reached';
    case 'MIN_DELAY_NOT_MET':
      return 'Minimum delay between actions';
    default:
      return 'Rate limited';
  }
}

/**
 * Calculate estimated completion time based on remaining leads and throttle config
 */
export function estimateCompletionTime(
  remainingLeads: number,
  throttle: ThrottleConfig
): number {
  const now = Date.now();
  const avgDelayMs = (throttle.minDelayMs + throttle.maxDelayMs) / 2;
  
  // Calculate effective daily cap considering progressive ramp
  let effectiveDailyCap = throttle.perDayCap;
  if (throttle.progressiveRamp.enabled) {
    effectiveDailyCap = throttle.progressiveRamp.maxCap;
  }
  
  // Calculate working hours per day
  let workingHoursPerDay = 24;
  if (throttle.quietHours.enabled) {
    const start = throttle.quietHours.start.split(':').map(Number);
    const end = throttle.quietHours.end.split(':').map(Number);
    const quietMinutes = (start[0] * 60 + start[1]) > (end[0] * 60 + end[1])
      ? (24 * 60) - ((start[0] * 60 + start[1]) - (end[0] * 60 + end[1]))
      : (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
    workingHoursPerDay = (24 * 60 - quietMinutes) / 60;
  }
  
  // Account for hourly cap (can't exceed this per hour)
  const maxPerWorkingHour = Math.min(
    throttle.perHourCap,
    Math.floor(3600000 / avgDelayMs)
  );
  
  const effectivePerDay = Math.min(
    effectiveDailyCap,
    maxPerWorkingHour * workingHoursPerDay
  );
  
  const daysNeeded = Math.ceil(remainingLeads / effectivePerDay);
  
  return now + (daysNeeded * 86400000);
}
