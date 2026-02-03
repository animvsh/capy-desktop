/**
 * Lead Queue Manager
 * 
 * Manages the lead queue for campaigns:
 * - Priority-based queue
 * - Skip/retry logic
 * - Do-not-contact list filtering
 * - Queue persistence for resume
 */

import {
  Lead,
  LeadStatus,
  LeadPriority,
  LeadOutcome,
  QueueConfig,
  DEFAULT_QUEUE_CONFIG,
  DoNotContactEntry,
} from '../types/campaign';
import { ActionKind } from '../types/events';

// ============================================================================
// Types
// ============================================================================

export interface QueueStats {
  total: number;
  pending: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
  retry: number;
}

export interface QueueState {
  leads: Lead[];
  currentIndex: number;
  processingLead: Lead | null;
  stats: QueueStats;
}

export type QueueEventType = 
  | 'LEAD_ADDED'
  | 'LEAD_REMOVED'
  | 'LEAD_PROCESSING'
  | 'LEAD_COMPLETED'
  | 'LEAD_FAILED'
  | 'LEAD_SKIPPED'
  | 'LEAD_RETRY'
  | 'QUEUE_REORDERED'
  | 'QUEUE_CLEARED';

export interface QueueEvent {
  type: QueueEventType;
  lead?: Lead;
  timestamp: number;
  details?: Record<string, unknown>;
}

export type QueueEventHandler = (event: QueueEvent) => void;

// ============================================================================
// Priority Mapping
// ============================================================================

const PRIORITY_VALUES: Record<LeadPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

// ============================================================================
// Lead Queue
// ============================================================================

export class LeadQueue {
  private config: QueueConfig;
  private leads: Map<string, Lead> = new Map();
  private queue: string[] = []; // Lead IDs in queue order
  private currentIndex: number = 0;
  private processingLeadId: string | null = null;
  private doNotContactList: Map<string, DoNotContactEntry> = new Map();
  private eventHandlers: Set<QueueEventHandler> = new Set();
  private campaignId: string;
  
  constructor(campaignId: string, config: Partial<QueueConfig> = {}) {
    this.campaignId = campaignId;
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }
  
  // --------------------------------------------------------------------------
  // Queue Operations
  // --------------------------------------------------------------------------
  
  /**
   * Add a lead to the queue
   */
  addLead(lead: Lead): boolean {
    if (this.leads.size >= this.config.maxSize) {
      console.warn(`[Queue] Max size reached (${this.config.maxSize})`);
      return false;
    }
    
    // Check do-not-contact
    if (this.isDoNotContact(lead)) {
      lead.status = 'SKIPPED';
      lead.lastError = 'Contact is on do-not-contact list';
      this.leads.set(lead.id, lead);
      this.emitEvent('LEAD_SKIPPED', lead);
      return true;
    }
    
    lead.status = 'PENDING';
    lead.position = this.queue.length;
    lead.campaignId = this.campaignId;
    
    this.leads.set(lead.id, lead);
    this.queue.push(lead.id);
    
    this.reorderQueue();
    this.emitEvent('LEAD_ADDED', lead);
    
    return true;
  }
  
  /**
   * Add multiple leads
   */
  addLeads(leads: Lead[]): number {
    let added = 0;
    for (const lead of leads) {
      if (this.addLead(lead)) {
        added++;
      }
    }
    return added;
  }
  
  /**
   * Remove a lead from the queue
   */
  removeLead(leadId: string): boolean {
    const lead = this.leads.get(leadId);
    if (!lead) return false;
    
    this.leads.delete(leadId);
    this.queue = this.queue.filter(id => id !== leadId);
    this.updatePositions();
    
    this.emitEvent('LEAD_REMOVED', lead);
    return true;
  }
  
  /**
   * Get the next lead to process
   */
  getNextLead(): Lead | null {
    if (this.processingLeadId) {
      return null; // Already processing one
    }
    
    // Find next pending or retry lead
    while (this.currentIndex < this.queue.length) {
      const leadId = this.queue[this.currentIndex];
      const lead = this.leads.get(leadId);
      
      if (!lead) {
        this.currentIndex++;
        continue;
      }
      
      // Skip already processed
      if (['COMPLETED', 'SKIPPED', 'CANCELLED', 'FAILED'].includes(lead.status)) {
        this.currentIndex++;
        continue;
      }
      
      // Check retry timing
      if (lead.status === 'RETRY' && lead.nextRetryAt && Date.now() < lead.nextRetryAt) {
        this.currentIndex++;
        continue;
      }
      
      // Check do-not-contact again (list may have been updated)
      if (this.isDoNotContact(lead)) {
        this.skipLead(leadId, 'Contact added to do-not-contact list');
        this.currentIndex++;
        continue;
      }
      
      return lead;
    }
    
    // Check for retry leads that are now ready
    const retryLead = this.getNextRetryLead();
    if (retryLead) {
      return retryLead;
    }
    
    return null;
  }
  
  /**
   * Mark lead as processing
   */
  startProcessing(leadId: string): Lead | null {
    const lead = this.leads.get(leadId);
    if (!lead) return null;
    
    lead.status = 'PROCESSING';
    lead.lastAttemptAt = Date.now();
    this.processingLeadId = leadId;
    
    this.emitEvent('LEAD_PROCESSING', lead);
    return lead;
  }
  
  /**
   * Mark lead as completed
   */
  completeLead(leadId: string, outcome: LeadOutcome): Lead | null {
    const lead = this.leads.get(leadId);
    if (!lead) return null;
    
    lead.status = 'COMPLETED';
    lead.processedAt = Date.now();
    lead.outcome = outcome;
    lead.updatedAt = Date.now();
    
    if (this.processingLeadId === leadId) {
      this.processingLeadId = null;
      this.currentIndex++;
    }
    
    this.emitEvent('LEAD_COMPLETED', lead);
    return lead;
  }
  
  /**
   * Mark lead as failed
   */
  failLead(leadId: string, error: string, canRetry: boolean = true): Lead | null {
    const lead = this.leads.get(leadId);
    if (!lead) return null;
    
    lead.lastError = error;
    lead.retryCount++;
    lead.updatedAt = Date.now();
    
    if (this.processingLeadId === leadId) {
      this.processingLeadId = null;
    }
    
    // Check if we can retry
    if (canRetry && lead.retryCount < lead.maxRetries) {
      lead.status = 'RETRY';
      lead.nextRetryAt = this.calculateNextRetryTime(lead.retryCount);
      this.emitEvent('LEAD_RETRY', lead, { nextRetryAt: lead.nextRetryAt });
    } else {
      lead.status = 'FAILED';
      lead.outcome = {
        success: false,
        action: 'send_message' as ActionKind, // Default, should be passed in
        details: { error },
        timestamp: Date.now(),
      };
      this.currentIndex++;
      this.emitEvent('LEAD_FAILED', lead);
    }
    
    return lead;
  }
  
  /**
   * Skip a lead
   */
  skipLead(leadId: string, reason: string): Lead | null {
    const lead = this.leads.get(leadId);
    if (!lead) return null;
    
    lead.status = 'SKIPPED';
    lead.lastError = reason;
    lead.updatedAt = Date.now();
    
    if (this.processingLeadId === leadId) {
      this.processingLeadId = null;
      this.currentIndex++;
    }
    
    this.emitEvent('LEAD_SKIPPED', lead, { reason });
    return lead;
  }
  
  /**
   * Cancel all pending leads
   */
  cancelPending(): number {
    let cancelled = 0;
    
    for (const lead of this.leads.values()) {
      if (['PENDING', 'QUEUED', 'RETRY'].includes(lead.status)) {
        lead.status = 'CANCELLED';
        lead.updatedAt = Date.now();
        cancelled++;
      }
    }
    
    this.processingLeadId = null;
    return cancelled;
  }
  
  // --------------------------------------------------------------------------
  // Queue Management
  // --------------------------------------------------------------------------
  
  /**
   * Reorder queue based on priority and ICP score
   */
  reorderQueue(): void {
    this.queue.sort((a, b) => {
      const leadA = this.leads.get(a);
      const leadB = this.leads.get(b);
      
      if (!leadA || !leadB) return 0;
      
      // Priority first
      const priorityDiff = PRIORITY_VALUES[leadB.priority] - PRIORITY_VALUES[leadA.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then ICP score (higher is better)
      const scoreA = leadA.icpScore ?? 0;
      const scoreB = leadB.icpScore ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      
      // Finally, original position
      return leadA.position - leadB.position;
    });
    
    this.updatePositions();
    this.emitEvent('QUEUE_REORDERED');
  }
  
  /**
   * Update position field for all leads
   */
  private updatePositions(): void {
    this.queue.forEach((leadId, index) => {
      const lead = this.leads.get(leadId);
      if (lead) {
        lead.position = index;
      }
    });
  }
  
  /**
   * Get next retry lead that's ready
   */
  private getNextRetryLead(): Lead | null {
    const now = Date.now();
    
    for (const leadId of this.queue) {
      const lead = this.leads.get(leadId);
      if (!lead) continue;
      
      if (lead.status === 'RETRY' && 
          lead.nextRetryAt && 
          lead.nextRetryAt <= now) {
        return lead;
      }
    }
    
    return null;
  }
  
  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetryTime(retryCount: number): number {
    const { retryDelayMs, retryBackoffMultiplier, maxRetryDelayMs } = this.config;
    const delay = Math.min(
      retryDelayMs * Math.pow(retryBackoffMultiplier, retryCount - 1),
      maxRetryDelayMs
    );
    return Date.now() + delay;
  }
  
  /**
   * Set current processing index (for resume)
   */
  setCurrentIndex(index: number): void {
    this.currentIndex = Math.max(0, Math.min(index, this.queue.length));
  }
  
  /**
   * Clear the queue
   */
  clear(): void {
    this.leads.clear();
    this.queue = [];
    this.currentIndex = 0;
    this.processingLeadId = null;
    this.emitEvent('QUEUE_CLEARED');
  }
  
  // --------------------------------------------------------------------------
  // Do-Not-Contact Management
  // --------------------------------------------------------------------------
  
  /**
   * Add entry to do-not-contact list
   */
  addDoNotContact(entry: DoNotContactEntry): void {
    this.doNotContactList.set(entry.identifier.toLowerCase(), entry);
  }
  
  /**
   * Remove entry from do-not-contact list
   */
  removeDoNotContact(identifier: string): boolean {
    return this.doNotContactList.delete(identifier.toLowerCase());
  }
  
  /**
   * Check if a lead is on the do-not-contact list
   */
  isDoNotContact(lead: Lead): boolean {
    const now = Date.now();
    
    // Check email
    if (lead.contact.email) {
      const entry = this.doNotContactList.get(lead.contact.email.toLowerCase());
      if (entry && (!entry.expiresAt || entry.expiresAt > now)) {
        return true;
      }
      
      // Check domain
      const domain = lead.contact.email.split('@')[1];
      if (domain) {
        const domainEntry = this.doNotContactList.get(domain.toLowerCase());
        if (domainEntry && domainEntry.type === 'domain' && 
            (!domainEntry.expiresAt || domainEntry.expiresAt > now)) {
          return true;
        }
      }
    }
    
    // Check LinkedIn URL
    if (lead.contact.linkedinUrl) {
      const entry = this.doNotContactList.get(lead.contact.linkedinUrl.toLowerCase());
      if (entry && (!entry.expiresAt || entry.expiresAt > now)) {
        return true;
      }
    }
    
    // Check Twitter URL
    if (lead.contact.twitterUrl) {
      const entry = this.doNotContactList.get(lead.contact.twitterUrl.toLowerCase());
      if (entry && (!entry.expiresAt || entry.expiresAt > now)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get all do-not-contact entries
   */
  getDoNotContactList(): DoNotContactEntry[] {
    return Array.from(this.doNotContactList.values());
  }
  
  /**
   * Load do-not-contact list
   */
  loadDoNotContactList(entries: DoNotContactEntry[]): void {
    this.doNotContactList.clear();
    for (const entry of entries) {
      this.doNotContactList.set(entry.identifier.toLowerCase(), entry);
    }
  }
  
  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------
  
  /**
   * Get a lead by ID
   */
  getLead(leadId: string): Lead | undefined {
    return this.leads.get(leadId);
  }
  
  /**
   * Get all leads
   */
  getAllLeads(): Lead[] {
    return Array.from(this.leads.values());
  }
  
  /**
   * Get leads by status
   */
  getLeadsByStatus(status: LeadStatus): Lead[] {
    return Array.from(this.leads.values()).filter(l => l.status === status);
  }
  
  /**
   * Get queue in order
   */
  getQueueOrder(): Lead[] {
    return this.queue
      .map(id => this.leads.get(id))
      .filter((l): l is Lead => l !== undefined);
  }
  
  /**
   * Get current processing lead
   */
  getProcessingLead(): Lead | null {
    if (!this.processingLeadId) return null;
    return this.leads.get(this.processingLeadId) ?? null;
  }
  
  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const stats: QueueStats = {
      total: this.leads.size,
      pending: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      retry: 0,
    };
    
    for (const lead of this.leads.values()) {
      switch (lead.status) {
        case 'PENDING':
          stats.pending++;
          break;
        case 'QUEUED':
          stats.queued++;
          break;
        case 'PROCESSING':
          stats.processing++;
          break;
        case 'COMPLETED':
          stats.completed++;
          break;
        case 'FAILED':
          stats.failed++;
          break;
        case 'SKIPPED':
        case 'CANCELLED':
          stats.skipped++;
          break;
        case 'RETRY':
          stats.retry++;
          break;
      }
    }
    
    return stats;
  }
  
  /**
   * Get progress (0-100)
   */
  getProgress(): number {
    const stats = this.getStats();
    if (stats.total === 0) return 0;
    
    const processed = stats.completed + stats.failed + stats.skipped;
    return Math.round((processed / stats.total) * 100);
  }
  
  /**
   * Get current index
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }
  
  /**
   * Check if queue is complete
   */
  isComplete(): boolean {
    const stats = this.getStats();
    return stats.pending === 0 && stats.queued === 0 && 
           stats.processing === 0 && stats.retry === 0;
  }
  
  /**
   * Check if there are retries pending
   */
  hasRetries(): boolean {
    return this.getStats().retry > 0;
  }
  
  /**
   * Get next retry time
   */
  getNextRetryTime(): number | null {
    let earliest: number | null = null;
    
    for (const lead of this.leads.values()) {
      if (lead.status === 'RETRY' && lead.nextRetryAt) {
        if (!earliest || lead.nextRetryAt < earliest) {
          earliest = lead.nextRetryAt;
        }
      }
    }
    
    return earliest;
  }
  
  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------
  
  /**
   * Get queue state (for persistence)
   */
  getState(): QueueState {
    return {
      leads: this.getAllLeads(),
      currentIndex: this.currentIndex,
      processingLead: this.getProcessingLead(),
      stats: this.getStats(),
    };
  }
  
  /**
   * Restore queue state
   */
  restoreState(state: QueueState): void {
    this.leads.clear();
    this.queue = [];
    
    for (const lead of state.leads) {
      this.leads.set(lead.id, lead);
      this.queue.push(lead.id);
    }
    
    this.currentIndex = state.currentIndex;
    
    // If there was a processing lead, mark it for retry
    if (state.processingLead) {
      const lead = this.leads.get(state.processingLead.id);
      if (lead && lead.status === 'PROCESSING') {
        lead.status = 'RETRY';
        lead.nextRetryAt = Date.now();
      }
    }
    
    this.reorderQueue();
  }
  
  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------
  
  /**
   * Subscribe to queue events
   */
  onEvent(handler: QueueEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }
  
  private emitEvent(
    type: QueueEventType, 
    lead?: Lead, 
    details?: Record<string, unknown>
  ): void {
    const event: QueueEvent = {
      type,
      lead,
      timestamp: Date.now(),
      details,
    };
    
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`[Queue] Event handler error:`, error);
      }
    }
  }
  
  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------
  
  updateConfig(config: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  getConfig(): QueueConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

let leadIdCounter = 0;

/**
 * Generate a unique lead ID
 */
export function generateLeadId(): string {
  return `lead_${Date.now()}_${++leadIdCounter}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Create a lead object
 */
export function createLead(
  data: Omit<Lead, 'id' | 'campaignId' | 'status' | 'position' | 'retryCount' | 'createdAt' | 'updatedAt'>,
  campaignId: string
): Lead {
  const now = Date.now();
  return {
    ...data,
    id: generateLeadId(),
    campaignId,
    status: 'PENDING',
    position: 0,
    retryCount: 0,
    maxRetries: data.maxRetries ?? DEFAULT_QUEUE_CONFIG.maxRetries,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a do-not-contact entry
 */
export function createDoNotContactEntry(
  identifier: string,
  type: DoNotContactEntry['type'],
  reason: string,
  options: {
    addedBy?: 'user' | 'system' | 'import';
    expiresAt?: number;
  } = {}
): DoNotContactEntry {
  return {
    id: `dnc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    identifier,
    type,
    reason,
    addedAt: Date.now(),
    addedBy: options.addedBy ?? 'user',
    expiresAt: options.expiresAt,
  };
}
