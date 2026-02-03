/**
 * Event Types and Run State Definitions
 * Central type definitions for the Copilot Runtime system
 */

// ============================================================================
// Run States
// ============================================================================

export type RunState = 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED';

export const RUN_STATE_TRANSITIONS: Record<RunState, RunState[]> = {
  IDLE: ['RUNNING'],
  RUNNING: ['PAUSED', 'STOPPED'],
  PAUSED: ['RUNNING', 'STOPPED'],
  STOPPED: ['IDLE'],
};

// ============================================================================
// Action Types
// ============================================================================

export type ActionKind =
  | 'navigate'
  | 'click'
  | 'type'
  | 'scroll'
  | 'extract'
  | 'screenshot'
  | 'wait'
  | 'hover'
  | 'select'
  | 'send_message'    // Requires approval
  | 'connect'         // Requires approval
  | 'post'            // Requires approval
  | 'follow';         // Requires approval

export const ACTIONS_REQUIRING_APPROVAL: ActionKind[] = [
  'send_message',
  'connect',
  'post',
  'follow',
];

export interface BaseAction {
  id: string;
  kind: ActionKind;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface NavigateAction extends BaseAction {
  kind: 'navigate';
  url: string;
}

export interface ClickAction extends BaseAction {
  kind: 'click';
  selector: string;
  fallbackSelectors?: string[];
}

export interface TypeAction extends BaseAction {
  kind: 'type';
  selector: string;
  text: string;
  delay?: number; // ms between keystrokes
}

export interface ScrollAction extends BaseAction {
  kind: 'scroll';
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  selector?: string; // scroll within element
}

export interface ExtractAction extends BaseAction {
  kind: 'extract';
  schema: ExtractionSchema;
}

export interface ScreenshotAction extends BaseAction {
  kind: 'screenshot';
  fullPage?: boolean;
  selector?: string;
}

export interface WaitAction extends BaseAction {
  kind: 'wait';
  ms?: number;
  selector?: string; // wait for element
  condition?: 'visible' | 'hidden' | 'attached' | 'detached';
}

export interface HoverAction extends BaseAction {
  kind: 'hover';
  selector: string;
}

export interface SelectAction extends BaseAction {
  kind: 'select';
  selector: string;
  value: string | string[];
}

export interface SendMessageAction extends BaseAction {
  kind: 'send_message';
  recipient: string;
  message: string;
  platform: 'linkedin' | 'twitter' | 'email';
}

export interface ConnectAction extends BaseAction {
  kind: 'connect';
  profileUrl: string;
  note?: string;
  platform: 'linkedin';
}

export interface PostAction extends BaseAction {
  kind: 'post';
  content: string;
  platform: 'linkedin' | 'twitter';
}

export interface FollowAction extends BaseAction {
  kind: 'follow';
  profileUrl: string;
  platform: 'linkedin' | 'twitter';
}

export type Action =
  | NavigateAction
  | ClickAction
  | TypeAction
  | ScrollAction
  | ExtractAction
  | ScreenshotAction
  | WaitAction
  | HoverAction
  | SelectAction
  | SendMessageAction
  | ConnectAction
  | PostAction
  | FollowAction;

// ============================================================================
// Extraction Schema
// ============================================================================

export interface ExtractionField {
  name: string;
  selector: string;
  type: 'text' | 'attribute' | 'html' | 'list';
  attribute?: string;
  transform?: 'trim' | 'lowercase' | 'uppercase';
}

export interface ExtractionSchema {
  fields: ExtractionField[];
  multiple?: boolean;
  containerSelector?: string;
}

export interface ExtractionResult {
  success: boolean;
  data: Record<string, unknown> | Record<string, unknown>[];
  errors?: string[];
}

// ============================================================================
// Event Types
// ============================================================================

export type EventType =
  // Run lifecycle
  | 'RUN_STARTED'
  | 'RUN_FINISHED'
  | 'RUN_FAILED'
  | 'RUN_PAUSED'
  | 'RUN_RESUMED'
  
  // Step lifecycle
  | 'STEP_STARTED'
  | 'STEP_COMPLETED'
  | 'STEP_FAILED'
  | 'STEP_SKIPPED'
  
  // Browser events
  | 'BROWSER_FRAME'
  | 'BROWSER_NAVIGATION'
  | 'BROWSER_ERROR'
  
  // Action events
  | 'ACTION_QUEUED'
  | 'ACTION_STARTED'
  | 'ACTION_COMPLETED'
  | 'ACTION_FAILED'
  | 'ACTION_RETRYING'
  
  // Data events
  | 'EXTRACTION_RESULT'
  | 'SCREENSHOT_CAPTURED'
  
  // Approval events
  | 'NEEDS_APPROVAL'
  | 'APPROVAL_GRANTED'
  | 'APPROVAL_DENIED'
  | 'APPROVAL_TIMEOUT'
  
  // Control events
  | 'USER_TAKEOVER_ON'
  | 'USER_TAKEOVER_OFF'
  | 'STOP_REQUESTED'
  | 'STOP_ACKNOWLEDGED'
  | 'STOPPED'
  | 'PAUSE_REQUESTED'
  | 'PAUSE_ACKNOWLEDGED'
  
  // Compliance events
  | 'RATE_LIMIT_HIT'
  | 'TIME_WINDOW_BLOCKED'
  | 'CONTACT_BLOCKED'
  | 'MESSAGE_LINT_WARNING';

// ============================================================================
// Event Payloads
// ============================================================================

export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: number;
  runId: string;
}

export interface RunStartedEvent extends BaseEvent {
  type: 'RUN_STARTED';
  taskDescription: string;
  totalSteps?: number;
}

export interface RunFinishedEvent extends BaseEvent {
  type: 'RUN_FINISHED';
  summary: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    durationMs: number;
  };
}

export interface RunFailedEvent extends BaseEvent {
  type: 'RUN_FAILED';
  error: string;
  lastStep?: string;
}

export interface RunPausedEvent extends BaseEvent {
  type: 'RUN_PAUSED';
  reason: 'user_request' | 'approval_needed' | 'rate_limit' | 'error';
}

export interface RunResumedEvent extends BaseEvent {
  type: 'RUN_RESUMED';
}

export interface StepStartedEvent extends BaseEvent {
  type: 'STEP_STARTED';
  stepIndex: number;
  stepDescription: string;
  action: Action;
}

export interface StepCompletedEvent extends BaseEvent {
  type: 'STEP_COMPLETED';
  stepIndex: number;
  durationMs: number;
  result?: unknown;
}

export interface StepFailedEvent extends BaseEvent {
  type: 'STEP_FAILED';
  stepIndex: number;
  error: string;
  retryable: boolean;
}

export interface StepSkippedEvent extends BaseEvent {
  type: 'STEP_SKIPPED';
  stepIndex: number;
  reason: string;
}

export interface BrowserFrameEvent extends BaseEvent {
  type: 'BROWSER_FRAME';
  imageData: string; // base64
  width: number;
  height: number;
}

export interface BrowserNavigationEvent extends BaseEvent {
  type: 'BROWSER_NAVIGATION';
  url: string;
  title?: string;
}

export interface BrowserErrorEvent extends BaseEvent {
  type: 'BROWSER_ERROR';
  error: string;
  url?: string;
}

export interface ExtractionResultEvent extends BaseEvent {
  type: 'EXTRACTION_RESULT';
  result: ExtractionResult;
}

export interface ScreenshotCapturedEvent extends BaseEvent {
  type: 'SCREENSHOT_CAPTURED';
  imageData: string; // base64
  fullPage: boolean;
}

export interface NeedsApprovalEvent extends BaseEvent {
  type: 'NEEDS_APPROVAL';
  action: Action;
  reason: string;
  approvalId: string;
  timeoutMs: number;
}

export interface ApprovalGrantedEvent extends BaseEvent {
  type: 'APPROVAL_GRANTED';
  approvalId: string;
  grantedBy: 'user' | 'auto';
}

export interface ApprovalDeniedEvent extends BaseEvent {
  type: 'APPROVAL_DENIED';
  approvalId: string;
  reason?: string;
}

export interface ApprovalTimeoutEvent extends BaseEvent {
  type: 'APPROVAL_TIMEOUT';
  approvalId: string;
}

export interface UserTakeoverEvent extends BaseEvent {
  type: 'USER_TAKEOVER_ON' | 'USER_TAKEOVER_OFF';
}

export interface StopRequestedEvent extends BaseEvent {
  type: 'STOP_REQUESTED';
  immediate: boolean;
}

export interface StopAcknowledgedEvent extends BaseEvent {
  type: 'STOP_ACKNOWLEDGED';
}

export interface StoppedEvent extends BaseEvent {
  type: 'STOPPED';
  reason: 'user_request' | 'error' | 'completed';
}

export interface PauseRequestedEvent extends BaseEvent {
  type: 'PAUSE_REQUESTED';
}

export interface PauseAcknowledgedEvent extends BaseEvent {
  type: 'PAUSE_ACKNOWLEDGED';
  pendingActions: number;
}

export interface RateLimitHitEvent extends BaseEvent {
  type: 'RATE_LIMIT_HIT';
  actionKind: ActionKind;
  limit: number;
  windowMs: number;
  resetAt: number;
}

export interface TimeWindowBlockedEvent extends BaseEvent {
  type: 'TIME_WINDOW_BLOCKED';
  windowStart: string;
  windowEnd: string;
  currentTime: string;
}

export interface ContactBlockedEvent extends BaseEvent {
  type: 'CONTACT_BLOCKED';
  contact: string;
  reason: string;
}

export interface MessageLintWarningEvent extends BaseEvent {
  type: 'MESSAGE_LINT_WARNING';
  warnings: string[];
  message: string;
}

export type RuntimeEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunFailedEvent
  | RunPausedEvent
  | RunResumedEvent
  | StepStartedEvent
  | StepCompletedEvent
  | StepFailedEvent
  | StepSkippedEvent
  | BrowserFrameEvent
  | BrowserNavigationEvent
  | BrowserErrorEvent
  | ExtractionResultEvent
  | ScreenshotCapturedEvent
  | NeedsApprovalEvent
  | ApprovalGrantedEvent
  | ApprovalDeniedEvent
  | ApprovalTimeoutEvent
  | UserTakeoverEvent
  | StopRequestedEvent
  | StopAcknowledgedEvent
  | StoppedEvent
  | PauseRequestedEvent
  | PauseAcknowledgedEvent
  | RateLimitHitEvent
  | TimeWindowBlockedEvent
  | ContactBlockedEvent
  | MessageLintWarningEvent;

// ============================================================================
// Task Definition
// ============================================================================

export interface Task {
  id: string;
  description: string;
  actions: Action[];
  createdAt: number;
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Approval Request
// ============================================================================

export interface ApprovalRequest {
  id: string;
  action: Action;
  reason: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  resolvedAt?: number;
  resolvedBy?: 'user' | 'auto' | 'timeout';
}

// ============================================================================
// Step Status
// ============================================================================

export interface StepStatus {
  index: number;
  action: Action;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: unknown;
  retries: number;
}

// ============================================================================
// Run Summary
// ============================================================================

export interface RunSummary {
  id: string;
  taskDescription: string;
  state: RunState;
  startedAt: number;
  endedAt?: number;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  currentStep?: number;
  steps: StepStatus[];
  events: RuntimeEvent[];
  pendingApprovals: ApprovalRequest[];
}
