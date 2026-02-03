/**
 * Event Bus - Central Event System
 * 
 * Typed EventEmitter for the Copilot Runtime with:
 * - Type-safe event emission and subscription
 * - Event history with replay capability
 * - Wildcard subscriptions
 * - Event filtering
 */

import { EventEmitter } from 'events';
import { RuntimeEvent, EventType } from '../types/events';

// ============================================================================
// Types
// ============================================================================

export type EventHandler<T extends RuntimeEvent = RuntimeEvent> = (event: T) => void;
export type WildcardHandler = (event: RuntimeEvent) => void;
export type EventFilter = (event: RuntimeEvent) => boolean;

export interface EventSubscription {
  unsubscribe: () => void;
}

export interface EventBusOptions {
  maxHistorySize?: number;
  enableHistory?: boolean;
}

// ============================================================================
// Event Bus Implementation
// ============================================================================

export class EventBus {
  private emitter: EventEmitter;
  private history: RuntimeEvent[] = [];
  private maxHistorySize: number;
  private enableHistory: boolean;
  private wildcardListeners: Set<WildcardHandler> = new Set();
  private runListeners: Map<string, Set<WildcardHandler>> = new Map();

  constructor(options: EventBusOptions = {}) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100); // Allow many subscribers
    this.maxHistorySize = options.maxHistorySize ?? 1000;
    this.enableHistory = options.enableHistory ?? true;
  }

  // --------------------------------------------------------------------------
  // Emit
  // --------------------------------------------------------------------------

  /**
   * Emit an event to all subscribers
   */
  emit<T extends RuntimeEvent>(event: T): void {
    // Add to history
    if (this.enableHistory) {
      this.history.push(event);
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }
    }

    // Emit to type-specific listeners
    this.emitter.emit(event.type, event);

    // Emit to wildcard listeners
    for (const handler of this.wildcardListeners) {
      try {
        handler(event);
      } catch (error) {
        console.error(`[EventBus] Wildcard handler error:`, error);
      }
    }

    // Emit to run-specific listeners
    const runHandlers = this.runListeners.get(event.runId);
    if (runHandlers) {
      for (const handler of runHandlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`[EventBus] Run handler error:`, error);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Subscribe
  // --------------------------------------------------------------------------

  /**
   * Subscribe to a specific event type
   */
  on<T extends RuntimeEvent>(
    type: T['type'],
    handler: EventHandler<T>
  ): EventSubscription {
    this.emitter.on(type, handler);
    return {
      unsubscribe: () => this.emitter.off(type, handler),
    };
  }

  /**
   * Subscribe to a specific event type, triggered only once
   */
  once<T extends RuntimeEvent>(
    type: T['type'],
    handler: EventHandler<T>
  ): EventSubscription {
    this.emitter.once(type, handler);
    return {
      unsubscribe: () => this.emitter.off(type, handler),
    };
  }

  /**
   * Subscribe to all events (wildcard)
   */
  onAny(handler: WildcardHandler): EventSubscription {
    this.wildcardListeners.add(handler);
    return {
      unsubscribe: () => this.wildcardListeners.delete(handler),
    };
  }

  /**
   * Subscribe to all events for a specific run
   */
  onRun(runId: string, handler: WildcardHandler): EventSubscription {
    if (!this.runListeners.has(runId)) {
      this.runListeners.set(runId, new Set());
    }
    this.runListeners.get(runId)!.add(handler);
    return {
      unsubscribe: () => {
        const handlers = this.runListeners.get(runId);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            this.runListeners.delete(runId);
          }
        }
      },
    };
  }

  /**
   * Subscribe to multiple event types
   */
  onMany(
    types: EventType[],
    handler: WildcardHandler
  ): EventSubscription {
    const subscriptions = types.map((type) =>
      this.on(type as RuntimeEvent['type'], handler as EventHandler<RuntimeEvent>)
    );
    return {
      unsubscribe: () => subscriptions.forEach((sub) => sub.unsubscribe()),
    };
  }

  /**
   * Subscribe with a filter function
   */
  onFiltered(
    filter: EventFilter,
    handler: WildcardHandler
  ): EventSubscription {
    const wrappedHandler: WildcardHandler = (event) => {
      if (filter(event)) {
        handler(event);
      }
    };
    return this.onAny(wrappedHandler);
  }

  // --------------------------------------------------------------------------
  // Unsubscribe
  // --------------------------------------------------------------------------

  /**
   * Remove a specific listener
   */
  off(type: EventType, handler: EventHandler): void {
    this.emitter.off(type, handler);
  }

  /**
   * Remove all listeners for a type
   */
  removeAllListeners(type?: EventType): void {
    if (type) {
      this.emitter.removeAllListeners(type);
    } else {
      this.emitter.removeAllListeners();
      this.wildcardListeners.clear();
      this.runListeners.clear();
    }
  }

  // --------------------------------------------------------------------------
  // History
  // --------------------------------------------------------------------------

  /**
   * Get all events in history
   */
  getHistory(): RuntimeEvent[] {
    return [...this.history];
  }

  /**
   * Get events for a specific run
   */
  getRunHistory(runId: string): RuntimeEvent[] {
    return this.history.filter((event) => event.runId === runId);
  }

  /**
   * Get events of a specific type
   */
  getEventsByType<T extends RuntimeEvent>(type: T['type']): T[] {
    return this.history.filter((event) => event.type === type) as T[];
  }

  /**
   * Get events matching a filter
   */
  getFilteredHistory(filter: EventFilter): RuntimeEvent[] {
    return this.history.filter(filter);
  }

  /**
   * Get events within a time range
   */
  getHistoryInRange(startTime: number, endTime: number): RuntimeEvent[] {
    return this.history.filter(
      (event) => event.timestamp >= startTime && event.timestamp <= endTime
    );
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Clear history for a specific run
   */
  clearRunHistory(runId: string): void {
    this.history = this.history.filter((event) => event.runId !== runId);
  }

  // --------------------------------------------------------------------------
  // Replay
  // --------------------------------------------------------------------------

  /**
   * Replay all events from history
   */
  replay(handler: WildcardHandler): void {
    for (const event of this.history) {
      handler(event);
    }
  }

  /**
   * Replay events for a specific run
   */
  replayRun(runId: string, handler: WildcardHandler): void {
    const events = this.getRunHistory(runId);
    for (const event of events) {
      handler(event);
    }
  }

  /**
   * Replay events from a specific point
   */
  replayFrom(eventId: string, handler: WildcardHandler): void {
    const index = this.history.findIndex((e) => e.id === eventId);
    if (index === -1) return;
    
    for (let i = index; i < this.history.length; i++) {
      handler(this.history[i]);
    }
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  /**
   * Wait for a specific event
   */
  waitFor<T extends RuntimeEvent>(
    type: T['type'],
    timeoutMs?: number,
    filter?: (event: T) => boolean
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;

      const handler: EventHandler<T> = (event) => {
        if (!filter || filter(event)) {
          if (timeoutId) clearTimeout(timeoutId);
          this.emitter.off(type, handler);
          resolve(event);
        }
      };

      this.emitter.on(type, handler);

      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          this.emitter.off(type, handler);
          reject(new Error(`Timeout waiting for event: ${type}`));
        }, timeoutMs);
      }
    });
  }

  /**
   * Wait for any of multiple events
   */
  waitForAny(
    types: EventType[],
    timeoutMs?: number
  ): Promise<RuntimeEvent> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;
      const handlers: Array<[EventType, EventHandler]> = [];

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        for (const [type, handler] of handlers) {
          this.emitter.off(type, handler);
        }
      };

      for (const type of types) {
        const handler: EventHandler = (event) => {
          cleanup();
          resolve(event);
        };
        handlers.push([type, handler]);
        this.emitter.on(type, handler);
      }

      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`Timeout waiting for events: ${types.join(', ')}`));
        }, timeoutMs);
      }
    });
  }

  /**
   * Get listener count for a type
   */
  listenerCount(type: EventType): number {
    return this.emitter.listenerCount(type);
  }

  /**
   * Get total listener count
   */
  totalListenerCount(): number {
    let count = this.wildcardListeners.size;
    for (const handlers of this.runListeners.values()) {
      count += handlers.size;
    }
    // Add type-specific listeners (approximation)
    count += this.emitter.eventNames().reduce(
      (sum, name) => sum + this.emitter.listenerCount(name),
      0
    );
    return count;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalEventBus: EventBus | null = null;

export function getEventBus(options?: EventBusOptions): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus(options);
  }
  return globalEventBus;
}

export function resetEventBus(): void {
  if (globalEventBus) {
    globalEventBus.removeAllListeners();
    globalEventBus.clearHistory();
    globalEventBus = null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a unique event ID
 */
export function createEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a base event with common fields
 */
export function createBaseEvent<T extends EventType>(
  type: T,
  runId: string
): { id: string; type: T; timestamp: number; runId: string } {
  return {
    id: createEventId(),
    type,
    timestamp: Date.now(),
    runId,
  };
}
