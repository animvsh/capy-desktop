/**
 * Campaign Scheduler
 * 
 * Handles scheduling campaigns for specific times:
 * - One-time schedules
 * - Recurring schedules (daily, weekdays, weekly, custom)
 * - Timezone handling
 * - Schedule window calculations
 */

import { 
  Schedule, 
  ScheduleType, 
  RecurrencePattern, 
  ScheduleWindow,
  CampaignState 
} from '../types/campaign';

// ============================================================================
// Types
// ============================================================================

export interface SchedulerConfig {
  defaultTimezone: string;
  checkIntervalMs: number;
  lookaheadMs: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  defaultTimezone: 'America/Los_Angeles',
  checkIntervalMs: 60000,  // Check every minute
  lookaheadMs: 86400000,   // Look ahead 24 hours
};

export type ScheduleCallback = (schedule: Schedule) => void | Promise<void>;

interface ScheduledJob {
  scheduleId: string;
  campaignId: string;
  nextRunAt: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// Scheduler
// ============================================================================

export class CampaignScheduler {
  private config: SchedulerConfig;
  private schedules: Map<string, Schedule> = new Map();
  private jobs: Map<string, ScheduledJob> = new Map();
  private callbacks: Map<string, ScheduleCallback> = new Map();
  private checkIntervalId?: ReturnType<typeof setInterval>;
  private isRunning: boolean = false;
  
  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }
  
  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------
  
  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.scheduleAllJobs();
    
    // Periodic check for schedule changes
    this.checkIntervalId = setInterval(() => {
      this.checkSchedules();
    }, this.config.checkIntervalMs);
  }
  
  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = undefined;
    }
    
    // Clear all scheduled jobs
    for (const job of this.jobs.values()) {
      if (job.timeoutId) {
        clearTimeout(job.timeoutId);
      }
    }
    this.jobs.clear();
  }
  
  // --------------------------------------------------------------------------
  // Schedule Management
  // --------------------------------------------------------------------------
  
  /**
   * Add or update a schedule
   */
  addSchedule(schedule: Schedule, callback: ScheduleCallback): void {
    this.schedules.set(schedule.id, schedule);
    this.callbacks.set(schedule.id, callback);
    
    if (this.isRunning && schedule.isActive) {
      this.scheduleJob(schedule);
    }
  }
  
  /**
   * Remove a schedule
   */
  removeSchedule(scheduleId: string): void {
    const job = this.jobs.get(scheduleId);
    if (job?.timeoutId) {
      clearTimeout(job.timeoutId);
    }
    
    this.schedules.delete(scheduleId);
    this.callbacks.delete(scheduleId);
    this.jobs.delete(scheduleId);
  }
  
  /**
   * Pause a schedule
   */
  pauseSchedule(scheduleId: string): void {
    const schedule = this.schedules.get(scheduleId);
    if (schedule) {
      schedule.isActive = false;
      this.cancelJob(scheduleId);
    }
  }
  
  /**
   * Resume a schedule
   */
  resumeSchedule(scheduleId: string): void {
    const schedule = this.schedules.get(scheduleId);
    if (schedule) {
      schedule.isActive = true;
      if (this.isRunning) {
        this.scheduleJob(schedule);
      }
    }
  }
  
  /**
   * Get a schedule by ID
   */
  getSchedule(scheduleId: string): Schedule | undefined {
    return this.schedules.get(scheduleId);
  }
  
  /**
   * Get all schedules
   */
  getAllSchedules(): Schedule[] {
    return Array.from(this.schedules.values());
  }
  
  /**
   * Get schedules for a campaign
   */
  getCampaignSchedules(campaignId: string): Schedule[] {
    return Array.from(this.schedules.values())
      .filter(s => s.campaignId === campaignId);
  }
  
  // --------------------------------------------------------------------------
  // Schedule Calculations
  // --------------------------------------------------------------------------
  
  /**
   * Calculate the next run time for a schedule
   */
  calculateNextRunTime(schedule: Schedule): number | null {
    const now = Date.now();
    
    if (!schedule.isActive) {
      return null;
    }
    
    if (schedule.type === 'ONCE') {
      // One-time schedule
      if (schedule.startAt && schedule.startAt > now) {
        return schedule.startAt;
      }
      return null; // Already past
    }
    
    // Recurring schedule
    if (!schedule.recurrence) {
      return null;
    }
    
    return this.calculateNextRecurrence(schedule, now);
  }
  
  /**
   * Calculate next recurrence time
   */
  private calculateNextRecurrence(schedule: Schedule, fromTime: number): number | null {
    const recurrence = schedule.recurrence!;
    const timezone = schedule.timezone || this.config.defaultTimezone;
    
    // Check if we're past the effective date range
    if (recurrence.effectiveUntil) {
      const untilDate = this.parseDate(recurrence.effectiveUntil);
      if (fromTime > untilDate.getTime()) {
        return null;
      }
    }
    
    // Get current date in timezone
    const currentDate = new Date(fromTime);
    const startTime = this.parseTime(recurrence.startTime);
    
    // Try to find next valid slot
    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
      const candidateDate = new Date(currentDate);
      candidateDate.setDate(candidateDate.getDate() + dayOffset);
      
      // Check if this day is valid
      const dayOfWeek = candidateDate.getDay();
      if (!this.isDayAllowed(recurrence.pattern, dayOfWeek, recurrence.customDays)) {
        continue;
      }
      
      // Check skip dates
      const dateStr = this.formatDate(candidateDate);
      if (recurrence.skipDates?.includes(dateStr)) {
        continue;
      }
      
      // Check effective range
      if (recurrence.effectiveFrom) {
        const fromDate = this.parseDate(recurrence.effectiveFrom);
        if (candidateDate < fromDate) {
          continue;
        }
      }
      
      // Set the start time
      candidateDate.setHours(startTime.hours, startTime.minutes, 0, 0);
      
      // If this is today and we're past the start time, try tomorrow
      if (dayOffset === 0 && candidateDate.getTime() <= fromTime) {
        continue;
      }
      
      return candidateDate.getTime();
    }
    
    return null;
  }
  
  /**
   * Get the current schedule window
   */
  getCurrentWindow(schedule: Schedule): ScheduleWindow | null {
    const now = Date.now();
    
    if (schedule.type === 'ONCE') {
      if (!schedule.startAt) return null;
      
      const start = schedule.startAt;
      const end = schedule.endAt ?? (start + 86400000); // Default 24h window
      
      return {
        start: new Date(start),
        end: new Date(end),
        isActive: now >= start && now < end,
      };
    }
    
    if (!schedule.recurrence) return null;
    
    const recurrence = schedule.recurrence;
    const currentDate = new Date(now);
    const dayOfWeek = currentDate.getDay();
    
    // Check if today is an allowed day
    if (!this.isDayAllowed(recurrence.pattern, dayOfWeek, recurrence.customDays)) {
      return null;
    }
    
    // Check skip dates
    const dateStr = this.formatDate(currentDate);
    if (recurrence.skipDates?.includes(dateStr)) {
      return null;
    }
    
    const startTime = this.parseTime(recurrence.startTime);
    const endTime = this.parseTime(recurrence.endTime);
    
    const windowStart = new Date(currentDate);
    windowStart.setHours(startTime.hours, startTime.minutes, 0, 0);
    
    const windowEnd = new Date(currentDate);
    windowEnd.setHours(endTime.hours, endTime.minutes, 0, 0);
    
    // Handle overnight windows
    if (windowEnd <= windowStart) {
      windowEnd.setDate(windowEnd.getDate() + 1);
    }
    
    const isActive = now >= windowStart.getTime() && now < windowEnd.getTime();
    
    return {
      start: windowStart,
      end: windowEnd,
      isActive,
    };
  }
  
  /**
   * Check if currently in a schedule window
   */
  isInWindow(schedule: Schedule): boolean {
    const window = this.getCurrentWindow(schedule);
    return window?.isActive ?? false;
  }
  
  /**
   * Get time until next window
   */
  getTimeUntilNextWindow(schedule: Schedule): number | null {
    const nextRun = this.calculateNextRunTime(schedule);
    if (!nextRun) return null;
    return Math.max(0, nextRun - Date.now());
  }
  
  // --------------------------------------------------------------------------
  // Job Scheduling
  // --------------------------------------------------------------------------
  
  private scheduleAllJobs(): void {
    for (const schedule of this.schedules.values()) {
      if (schedule.isActive) {
        this.scheduleJob(schedule);
      }
    }
  }
  
  private scheduleJob(schedule: Schedule): void {
    // Cancel existing job if any
    this.cancelJob(schedule.id);
    
    const nextRunAt = this.calculateNextRunTime(schedule);
    if (!nextRunAt) return;
    
    const delay = nextRunAt - Date.now();
    if (delay < 0) return;
    
    // Cap delay at max setTimeout value (~24.8 days)
    const maxDelay = 2147483647;
    const actualDelay = Math.min(delay, maxDelay);
    
    const timeoutId = setTimeout(() => {
      this.executeJob(schedule.id);
    }, actualDelay);
    
    const job: ScheduledJob = {
      scheduleId: schedule.id,
      campaignId: schedule.campaignId,
      nextRunAt,
      timeoutId,
    };
    
    this.jobs.set(schedule.id, job);
    schedule.nextRunAt = nextRunAt;
  }
  
  private cancelJob(scheduleId: string): void {
    const job = this.jobs.get(scheduleId);
    if (job?.timeoutId) {
      clearTimeout(job.timeoutId);
    }
    this.jobs.delete(scheduleId);
  }
  
  private async executeJob(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    const callback = this.callbacks.get(scheduleId);
    
    if (!schedule || !callback || !schedule.isActive) {
      return;
    }
    
    // Update last run time
    schedule.lastRunAt = Date.now();
    
    try {
      await callback(schedule);
    } catch (error) {
      console.error(`[Scheduler] Error executing schedule ${scheduleId}:`, error);
    }
    
    // Schedule next run for recurring schedules
    if (schedule.type === 'RECURRING' && schedule.isActive) {
      this.scheduleJob(schedule);
    }
  }
  
  private checkSchedules(): void {
    const now = Date.now();
    
    for (const schedule of this.schedules.values()) {
      if (!schedule.isActive) continue;
      
      const job = this.jobs.get(schedule.id);
      
      // Reschedule if no job exists
      if (!job) {
        this.scheduleJob(schedule);
        continue;
      }
      
      // Check if next run time needs recalculation
      const nextRun = this.calculateNextRunTime(schedule);
      if (nextRun && nextRun !== job.nextRunAt) {
        this.scheduleJob(schedule);
      }
    }
  }
  
  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  
  private isDayAllowed(
    pattern: RecurrencePattern, 
    dayOfWeek: number,
    customDays?: number[]
  ): boolean {
    switch (pattern) {
      case 'DAILY':
        return true;
      case 'WEEKDAYS':
        return dayOfWeek >= 1 && dayOfWeek <= 5;
      case 'WEEKLY':
        return dayOfWeek === 1; // Monday only
      case 'CUSTOM':
        return customDays?.includes(dayOfWeek) ?? false;
      default:
        return false;
    }
  }
  
  private parseTime(time: string): { hours: number; minutes: number } {
    const [hours, minutes] = time.split(':').map(Number);
    return { hours: hours || 0, minutes: minutes || 0 };
  }
  
  private parseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

// ============================================================================
// Schedule Factory
// ============================================================================

let scheduleIdCounter = 0;

function generateScheduleId(): string {
  return `sched_${Date.now()}_${++scheduleIdCounter}`;
}

/**
 * Create a one-time schedule
 */
export function createOneTimeSchedule(
  campaignId: string,
  startAt: number,
  options: {
    timezone?: string;
    endAt?: number;
  } = {}
): Schedule {
  const now = Date.now();
  return {
    id: generateScheduleId(),
    campaignId,
    type: 'ONCE',
    timezone: options.timezone || 'America/Los_Angeles',
    startAt,
    endAt: options.endAt,
    isActive: true,
    nextRunAt: startAt > now ? startAt : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a recurring schedule
 */
export function createRecurringSchedule(
  campaignId: string,
  options: {
    pattern: RecurrencePattern;
    startTime: string;
    endTime: string;
    timezone?: string;
    customDays?: number[];
    skipDates?: string[];
    effectiveFrom?: string;
    effectiveUntil?: string;
  }
): Schedule {
  const now = Date.now();
  const schedule: Schedule = {
    id: generateScheduleId(),
    campaignId,
    type: 'RECURRING',
    timezone: options.timezone || 'America/Los_Angeles',
    recurrence: {
      pattern: options.pattern,
      startTime: options.startTime,
      endTime: options.endTime,
      customDays: options.customDays,
      skipDates: options.skipDates,
      effectiveFrom: options.effectiveFrom,
      effectiveUntil: options.effectiveUntil,
    },
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  
  return schedule;
}

/**
 * Create a weekday schedule (Mon-Fri, 9am-5pm)
 */
export function createWeekdaySchedule(
  campaignId: string,
  options: {
    startTime?: string;
    endTime?: string;
    timezone?: string;
  } = {}
): Schedule {
  return createRecurringSchedule(campaignId, {
    pattern: 'WEEKDAYS',
    startTime: options.startTime || '09:00',
    endTime: options.endTime || '17:00',
    timezone: options.timezone,
  });
}

// ============================================================================
// Singleton
// ============================================================================

let globalScheduler: CampaignScheduler | null = null;

export function getScheduler(config?: Partial<SchedulerConfig>): CampaignScheduler {
  if (!globalScheduler) {
    globalScheduler = new CampaignScheduler(config);
  }
  return globalScheduler;
}

export function resetScheduler(): void {
  if (globalScheduler) {
    globalScheduler.stop();
    globalScheduler = null;
  }
}
