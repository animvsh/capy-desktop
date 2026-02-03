/**
 * LinkedIn Workflow Types
 * 
 * Type definitions for LinkedIn automation workflows.
 * These workflows are finite state machines with deterministic transitions.
 */

import { BaseEvent, Action, ApprovalRequest } from '../../types/events';

// ============================================================================
// Workflow State Types
// ============================================================================

export type WorkflowState =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'STOPPED';

export type StepState =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

// ============================================================================
// Profile Data Types
// ============================================================================

export interface LinkedInProfile {
  url: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  about: string | null;
  photoUrl: string | null;
  connectionDegree: '1st' | '2nd' | '3rd' | 'Out of network' | null;
  connectionCount: number | null;
  currentCompany: string | null;
  isConnected: boolean;
  isPending: boolean;
  canMessage: boolean;
  canConnect: boolean;
}

export interface LinkedInExperience {
  title: string;
  company: string;
  companyUrl: string | null;
  location: string | null;
  duration: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  isCurrent: boolean;
}

export interface LinkedInEducation {
  school: string;
  schoolUrl: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  startYear: string | null;
  endYear: string | null;
  description: string | null;
}

export interface LinkedInSkill {
  name: string;
  endorsementCount: number | null;
}

export interface LinkedInContactInfo {
  email: string | null;
  phone: string | null;
  website: string | null;
  twitter: string | null;
  birthday: string | null;
  address: string | null;
}

export interface FullLinkedInProfile extends LinkedInProfile {
  experience: LinkedInExperience[];
  education: LinkedInEducation[];
  skills: LinkedInSkill[];
  contactInfo: LinkedInContactInfo | null;
  extractedAt: number;
}

// ============================================================================
// Workflow Step Definition
// ============================================================================

export interface WorkflowStep<TContext = unknown> {
  id: string;
  name: string;
  description: string;
  
  /** Execute this step */
  execute: (context: TContext) => Promise<StepResult>;
  
  /** Check if this step should be skipped */
  shouldSkip?: (context: TContext) => boolean;
  
  /** Validate preconditions before execution */
  validate?: (context: TContext) => ValidationResult;
  
  /** Cleanup on failure (optional) */
  cleanup?: (context: TContext, error: Error) => Promise<void>;
  
  /** Maximum retries for this step */
  maxRetries?: number;
  
  /** Timeout in ms */
  timeoutMs?: number;
  
  /** Requires human approval before execution */
  requiresApproval?: boolean;
  
  /** Description for approval prompt */
  approvalPrompt?: string;
}

export interface StepResult {
  success: boolean;
  data?: unknown;
  error?: string;
  shouldRetry?: boolean;
  nextStepId?: string; // Override next step (for branching)
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Workflow Definition
// ============================================================================

export interface WorkflowDefinition<TInput, TOutput, TContext> {
  id: string;
  name: string;
  description: string;
  version: string;
  
  /** Initial context factory */
  createContext: (input: TInput) => TContext;
  
  /** Ordered list of steps */
  steps: WorkflowStep<TContext>[];
  
  /** Extract final output from context */
  getOutput: (context: TContext) => TOutput;
  
  /** Global validation before workflow starts */
  validate?: (input: TInput) => ValidationResult;
}

// ============================================================================
// Workflow Instance State
// ============================================================================

export interface WorkflowInstance<TInput, TOutput, TContext> {
  id: string;
  runId: string;
  workflowId: string;
  
  state: WorkflowState;
  input: TInput;
  context: TContext;
  output: TOutput | null;
  
  currentStepIndex: number;
  stepStates: Map<string, StepState>;
  stepResults: Map<string, StepResult>;
  
  startedAt: number | null;
  completedAt: number | null;
  
  error: string | null;
  retryCount: number;
  
  pendingApproval: ApprovalRequest | null;
}

// ============================================================================
// Workflow Events
// ============================================================================

export interface WorkflowEvent extends BaseEvent {
  workflowId: string;
  workflowName: string;
}

export interface WorkflowStartedEvent extends WorkflowEvent {
  type: 'RUN_STARTED';
  input: unknown;
  totalSteps: number;
}

export interface WorkflowStepEvent extends WorkflowEvent {
  stepId: string;
  stepName: string;
  stepIndex: number;
}

// ============================================================================
// Workflow Input Types
// ============================================================================

export interface VisitProfileInput {
  profileUrl: string;
  timeout?: number;
}

export interface VisitProfileOutput {
  profile: LinkedInProfile;
  pageLoaded: boolean;
}

export interface SendConnectionInput {
  profileUrl: string;
  note?: string;
  personalization?: {
    firstName?: string;
    company?: string;
    customFields?: Record<string, string>;
  };
}

export interface SendConnectionOutput {
  sent: boolean;
  profileUrl: string;
  noteUsed: string | null;
  sentAt: number | null;
}

export interface SendMessageInput {
  profileUrl: string;
  message: string;
  subject?: string; // For InMail
  personalization?: {
    firstName?: string;
    company?: string;
    customFields?: Record<string, string>;
  };
}

export interface SendMessageOutput {
  sent: boolean;
  profileUrl: string;
  messageUsed: string;
  sentAt: number | null;
  wasInMail: boolean;
}

export interface ExtractProfileInput {
  profileUrl: string;
  includeContactInfo?: boolean;
  includeExperience?: boolean;
  includeEducation?: boolean;
  includeSkills?: boolean;
}

export interface ExtractProfileOutput {
  profile: FullLinkedInProfile;
  extractedSections: string[];
  warnings: string[];
}

// ============================================================================
// Personalization Utilities
// ============================================================================

export interface PersonalizationContext {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  company?: string;
  title?: string;
  location?: string;
  customFields?: Record<string, string>;
}

/**
 * Apply personalization tokens to a template string
 * Tokens: {{firstName}}, {{lastName}}, {{company}}, etc.
 */
export function applyPersonalization(
  template: string,
  context: PersonalizationContext
): string {
  let result = template;

  // Standard fields
  if (context.firstName) {
    result = result.replace(/\{\{firstName\}\}/g, context.firstName);
  }
  if (context.lastName) {
    result = result.replace(/\{\{lastName\}\}/g, context.lastName);
  }
  if (context.fullName) {
    result = result.replace(/\{\{fullName\}\}/g, context.fullName);
  }
  if (context.company) {
    result = result.replace(/\{\{company\}\}/g, context.company);
  }
  if (context.title) {
    result = result.replace(/\{\{title\}\}/g, context.title);
  }
  if (context.location) {
    result = result.replace(/\{\{location\}\}/g, context.location);
  }

  // Custom fields
  if (context.customFields) {
    for (const [key, value] of Object.entries(context.customFields)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
  }

  // Remove any remaining unreplaced tokens
  result = result.replace(/\{\{[^}]+\}\}/g, '');

  return result.trim();
}

/**
 * Extract first name from full name
 */
export function extractFirstName(fullName: string): string {
  return fullName.split(' ')[0] || fullName;
}

/**
 * Extract last name from full name
 */
export function extractLastName(fullName: string): string {
  const parts = fullName.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}
