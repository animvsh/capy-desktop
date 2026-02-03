// ============================================================================
// CAPY WEB - TELEMETRY & CONTROL ENGINE
// Real-time streaming, progress, and control
// ============================================================================

import {
  TelemetryEvent,
  ProgressState,
  ControlCommand,
  NavigationEventType,
  ExecutionStatus,
  StopCondition
} from '../types';
import { generateId, EventEmitter } from '../utils/helpers';

// ============================================================================
// EVENT TYPES FOR EMITTER
// ============================================================================

interface TelemetryEvents {
  event: [TelemetryEvent];
  progress: [ProgressState];
  command: [ControlCommand];
  stop: [StopCondition];
  error: [Error];
  [key: string]: unknown[];
}

// ============================================================================
// TELEMETRY ENGINE
// ============================================================================

export class TelemetryEngine {
  private sessionId: string;
  private events: TelemetryEvent[] = [];
  private progressState: ProgressState;
  private emitter: EventEmitter<TelemetryEvents>;
  private startTime: number = 0;
  private isPaused: boolean = false;
  private isStopped: boolean = false;
  private commandQueue: ControlCommand[] = [];
  
  // Limits
  private maxEvents: number = 10000;
  private maxEventAge: number = 3600 * 1000;  // 1 hour
  
  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.emitter = new EventEmitter();
    this.progressState = {
      status: ExecutionStatus.IDLE,
      currentPhase: 'initializing',
      pagesVisited: 0,
      claimsFound: 0,
      confidence: 0,
      activePaths: 0,
      elapsedMs: 0
    };
  }
  
  /**
   * Start telemetry session
   */
  start(planSummary?: string): void {
    this.startTime = Date.now();
    this.progressState = {
      status: ExecutionStatus.PLANNING,
      planSummary,
      currentPhase: 'planning',
      pagesVisited: 0,
      claimsFound: 0,
      confidence: 0,
      activePaths: 0,
      elapsedMs: 0
    };
    
    this.emit('progress', { ...this.progressState });
    this.recordEvent(NavigationEventType.STRATEGY_SHIFT, { phase: 'start', planSummary });
  }
  
  /**
   * Record a telemetry event
   */
  recordEvent(
    type: NavigationEventType,
    data: Record<string, unknown>,
    pathId?: string
  ): TelemetryEvent {
    const event: TelemetryEvent = {
      id: generateId(),
      timestamp: Date.now(),
      type,
      sessionId: this.sessionId,
      pathId,
      data
    };
    
    // Add to events array
    this.events.push(event);
    
    // Trim if over limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    
    // Emit event
    this.emit('event', event);
    
    return event;
  }
  
  /**
   * Record page load event
   */
  recordPageLoad(
    url: string,
    success: boolean,
    loadTimeMs: number,
    pathId?: string
  ): void {
    this.progressState.pagesVisited++;
    this.progressState.elapsedMs = Date.now() - this.startTime;
    
    this.recordEvent(NavigationEventType.PAGE_LOAD, {
      url,
      success,
      loadTimeMs,
      totalPages: this.progressState.pagesVisited
    }, pathId);
    
    this.emit('progress', { ...this.progressState });
  }
  
  /**
   * Record extraction event
   */
  recordExtraction(
    url: string,
    schemaName: string,
    fieldsExtracted: number,
    pathId?: string
  ): void {
    this.recordEvent(NavigationEventType.EXTRACTION, {
      url,
      schemaName,
      fieldsExtracted
    }, pathId);
  }
  
  /**
   * Record claim found event
   */
  recordClaimFound(
    claimId: string,
    category: string,
    confidence: number,
    sourceUrl: string,
    pathId?: string
  ): void {
    this.progressState.claimsFound++;
    
    this.recordEvent(NavigationEventType.CLAIM_FOUND, {
      claimId,
      category,
      confidence,
      sourceUrl,
      totalClaims: this.progressState.claimsFound
    }, pathId);
  }
  
  /**
   * Record verification event
   */
  recordVerification(
    claimId: string,
    type: 'corroboration' | 'contradiction',
    newConfidence: number,
    sourceUrl: string
  ): void {
    this.recordEvent(NavigationEventType.VERIFICATION, {
      claimId,
      verificationType: type,
      newConfidence,
      sourceUrl
    });
  }
  
  /**
   * Record strategy shift
   */
  recordStrategyShift(
    reason: string,
    from: string,
    to: string,
    details?: Record<string, unknown>
  ): void {
    this.progressState.currentPhase = to;
    
    this.recordEvent(NavigationEventType.STRATEGY_SHIFT, {
      reason,
      from,
      to,
      ...details
    });
    
    this.emit('progress', { ...this.progressState });
  }
  
  /**
   * Record path termination
   */
  recordPathTerminated(
    pathId: string,
    reason: string,
    pagesVisited: number,
    claimsFound: number
  ): void {
    this.progressState.activePaths = Math.max(0, this.progressState.activePaths - 1);
    
    this.recordEvent(NavigationEventType.PATH_TERMINATED, {
      reason,
      pagesVisited,
      claimsFound
    }, pathId);
    
    this.emit('progress', { ...this.progressState });
  }
  
  /**
   * Record error
   */
  recordError(
    error: Error | string,
    url?: string,
    recoverable: boolean = true,
    pathId?: string
  ): void {
    const errorMsg = typeof error === 'string' ? error : error.message;
    
    this.recordEvent(NavigationEventType.ERROR, {
      error: errorMsg,
      url,
      recoverable,
      stack: typeof error !== 'string' ? error.stack : undefined
    }, pathId);
    
    if (!recoverable) {
      this.emit('error', typeof error === 'string' ? new Error(error) : error);
    }
  }
  
  /**
   * Record blocked event
   */
  recordBlocked(
    url: string,
    reason: string,
    pathId?: string
  ): void {
    this.recordEvent(NavigationEventType.BLOCKED, {
      url,
      reason
    }, pathId);
  }
  
  /**
   * Update overall confidence
   */
  updateConfidence(confidence: number, estimatedRemainingMs?: number): void {
    this.progressState.confidence = confidence;
    this.progressState.elapsedMs = Date.now() - this.startTime;
    this.progressState.estimatedRemainingMs = estimatedRemainingMs;
    
    this.emit('progress', { ...this.progressState });
  }
  
  /**
   * Update active paths count
   */
  updateActivePaths(count: number): void {
    this.progressState.activePaths = count;
    this.emit('progress', { ...this.progressState });
  }
  
  /**
   * Update execution status
   */
  updateStatus(status: ExecutionStatus): void {
    this.progressState.status = status;
    this.emit('progress', { ...this.progressState });
  }
  
  /**
   * Emit to listeners
   */
  private emit<K extends keyof TelemetryEvents>(
    event: K,
    ...args: TelemetryEvents[K]
  ): void {
    this.emitter.emit(event, ...args);
  }
  
  // ==========================================================================
  // CONTROL COMMANDS
  // ==========================================================================
  
  /**
   * Pause execution
   */
  pause(): void {
    if (this.isPaused || this.isStopped) return;
    
    this.isPaused = true;
    this.progressState.status = ExecutionStatus.PAUSED;
    
    const command: ControlCommand = {
      type: 'pause',
      timestamp: Date.now()
    };
    
    this.commandQueue.push(command);
    this.emit('command', command);
    this.emit('progress', { ...this.progressState });
  }
  
  /**
   * Resume execution
   */
  resume(): void {
    if (!this.isPaused || this.isStopped) return;
    
    this.isPaused = false;
    this.progressState.status = ExecutionStatus.EXECUTING;
    
    const command: ControlCommand = {
      type: 'resume',
      timestamp: Date.now()
    };
    
    this.commandQueue.push(command);
    this.emit('command', command);
    this.emit('progress', { ...this.progressState });
  }
  
  /**
   * Stop execution (hard kill, <200ms target)
   */
  stop(reason?: string): void {
    if (this.isStopped) return;
    
    const stopStartTime = Date.now();
    
    this.isStopped = true;
    this.progressState.status = ExecutionStatus.STOPPING;
    
    const command: ControlCommand = {
      type: 'stop',
      payload: { reason },
      timestamp: Date.now()
    };
    
    this.commandQueue.push(command);
    this.emit('command', command);
    
    const stopCondition: StopCondition = {
      reason: 'user_stop',
      details: reason || 'User requested stop',
      finalConfidence: this.progressState.confidence,
      timestamp: Date.now()
    };
    
    this.emit('stop', stopCondition);
    
    // Log stop time
    const stopTime = Date.now() - stopStartTime;
    this.recordEvent(NavigationEventType.STRATEGY_SHIFT, {
      phase: 'stopped',
      stopTimeMs: stopTime,
      targetMs: 200,
      success: stopTime < 200
    });
    
    this.progressState.status = ExecutionStatus.COMPLETED;
    this.emit('progress', { ...this.progressState });
  }
  
  /**
   * Check if paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }
  
  /**
   * Check if stopped
   */
  isStoppedState(): boolean {
    return this.isStopped;
  }
  
  /**
   * Get pending commands
   */
  getPendingCommands(): ControlCommand[] {
    const commands = [...this.commandQueue];
    this.commandQueue = [];
    return commands;
  }
  
  /**
   * Check for pending stop command
   */
  hasPendingStop(): boolean {
    return this.commandQueue.some(c => c.type === 'stop') || this.isStopped;
  }
  
  // ==========================================================================
  // SUBSCRIPTIONS
  // ==========================================================================
  
  /**
   * Subscribe to all events
   */
  onEvent(callback: (event: TelemetryEvent) => void): () => void {
    this.emitter.on('event', callback);
    return () => this.emitter.off('event', callback);
  }
  
  /**
   * Subscribe to progress updates
   */
  onProgress(callback: (progress: ProgressState) => void): () => void {
    this.emitter.on('progress', callback);
    return () => this.emitter.off('progress', callback);
  }
  
  /**
   * Subscribe to control commands
   */
  onCommand(callback: (command: ControlCommand) => void): () => void {
    this.emitter.on('command', callback);
    return () => this.emitter.off('command', callback);
  }
  
  /**
   * Subscribe to stop events
   */
  onStop(callback: (stop: StopCondition) => void): () => void {
    this.emitter.on('stop', callback);
    return () => this.emitter.off('stop', callback);
  }
  
  /**
   * Subscribe to errors
   */
  onError(callback: (error: Error) => void): () => void {
    this.emitter.on('error', callback);
    return () => this.emitter.off('error', callback);
  }
  
  // ==========================================================================
  // QUERIES
  // ==========================================================================
  
  /**
   * Get current progress state
   */
  getProgress(): ProgressState {
    return { ...this.progressState };
  }
  
  /**
   * Get all events
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }
  
  /**
   * Get events by type
   */
  getEventsByType(type: NavigationEventType): TelemetryEvent[] {
    return this.events.filter(e => e.type === type);
  }
  
  /**
   * Get events for a path
   */
  getEventsForPath(pathId: string): TelemetryEvent[] {
    return this.events.filter(e => e.pathId === pathId);
  }
  
  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): TelemetryEvent[] {
    return this.events.slice(-limit);
  }
  
  /**
   * Get session statistics
   */
  getStats(): {
    sessionId: string;
    duration: number;
    eventCount: number;
    eventsByType: Record<string, number>;
    errorsCount: number;
    blockedCount: number;
  } {
    const eventsByType: Record<string, number> = {};
    
    for (const event of this.events) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    }
    
    return {
      sessionId: this.sessionId,
      duration: Date.now() - this.startTime,
      eventCount: this.events.length,
      eventsByType,
      errorsCount: eventsByType[NavigationEventType.ERROR] || 0,
      blockedCount: eventsByType[NavigationEventType.BLOCKED] || 0
    };
  }
  
  /**
   * Cleanup old events
   */
  cleanup(): number {
    const cutoff = Date.now() - this.maxEventAge;
    const originalLength = this.events.length;
    this.events = this.events.filter(e => e.timestamp > cutoff);
    return originalLength - this.events.length;
  }
  
  /**
   * Clear all state
   */
  clear(): void {
    this.events = [];
    this.commandQueue = [];
    this.isPaused = false;
    this.isStopped = false;
    this.emitter.clear();
  }
  
  /**
   * Export for persistence
   */
  export(): {
    sessionId: string;
    events: TelemetryEvent[];
    progressState: ProgressState;
    startTime: number;
  } {
    return {
      sessionId: this.sessionId,
      events: [...this.events],
      progressState: { ...this.progressState },
      startTime: this.startTime
    };
  }
}

// Export factory function
export function createTelemetry(sessionId: string): TelemetryEngine {
  return new TelemetryEngine(sessionId);
}
