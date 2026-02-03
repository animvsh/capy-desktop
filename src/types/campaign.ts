/**
 * Campaign System Types
 */

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  goal: 'book_calls' | 'signups' | 'partnerships' | 'awareness';
  targeting: CampaignTargeting;
  channels: string[];
  sequence_id?: string;
  status: CampaignStatus;
  guardrails: CampaignGuardrails;
  metrics: CampaignMetrics;
  active_agents: string[];
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export type CampaignStatus = 
  | 'drafting'
  | 'sourcing'
  | 'enriching'
  | 'writing'
  | 'reviewing'
  | 'sending'
  | 'paused'
  | 'completed'
  | 'error';

export interface CampaignTargeting {
  roles?: string[];
  industries?: string[];
  locations?: string[];
  company_sizes?: string[];
  keywords?: string[];
  business_type?: string;
}

export interface CampaignGuardrails {
  max_per_day: number;
  warmup_mode: boolean;
  require_approval_before_send: boolean;
  compliance_mode: 'standard' | 'strict';
}

export interface CampaignMetrics {
  leads_found: number;
  leads_verified: number;
  leads_enriched: number;
  emails_drafted: number;
  emails_sent: number;
  emails_delivered: number;
  emails_opened: number;
  emails_replied: number;
  emails_bounced: number;
  meetings_booked: number;
}

export interface CampaignAgent {
  id: string;
  campaign_id: string;
  agent_type: AgentType;
  scope?: string;
  task_description?: string;
  status: AgentStatus;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  progress: number;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export type AgentType = 
  | 'scout'
  | 'verifier'
  | 'enricher'
  | 'writer'
  | 'sender'
  | 'watcher';

export type AgentStatus = 
  | 'pending'
  | 'running'
  | 'waiting'
  | 'blocked'
  | 'failed'
  | 'completed';

export interface AgentLog {
  id: string;
  agent_id: string;
  campaign_id: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface CampaignEvent {
  id: string;
  campaign_id: string;
  event_type: string;
  data: Record<string, any>;
  display_message?: string;
  created_at: string;
}

export interface Sequence {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  tone: 'casual' | 'direct' | 'formal' | 'consultative';
  cta_style: 'reply' | 'calendar_link' | 'question';
  steps: SequenceStep[];
  personalization_vars: string[];
  metrics: {
    times_used: number;
    avg_open_rate: number;
    avg_reply_rate: number;
  };
  is_approved: boolean;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  step: number;
  subject: string;
  body: string;
  delay_days: number;
  variants?: SequenceStep[];
}

// UI State types
export interface CampaignWithAgents extends Campaign {
  campaign_agents?: CampaignAgent[];
}

// Agent display helpers
export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  scout: '🔍 Scout',
  verifier: '✅ Verifier',
  enricher: '🎯 Enricher',
  writer: '✍️ Writer',
  sender: '📤 Sender',
  watcher: '👀 Watcher',
};

export const AGENT_TYPE_DESCRIPTIONS: Record<AgentType, string> = {
  scout: 'Finding target companies and contacts',
  verifier: 'Verifying emails and cleaning the list',
  enricher: 'Gathering personalization data',
  writer: 'Drafting email sequences',
  sender: 'Sending emails with throttling',
  watcher: 'Monitoring for replies',
};

export const STATUS_COLORS: Record<CampaignStatus, string> = {
  drafting: 'bg-gray-500',
  sourcing: 'bg-blue-500',
  enriching: 'bg-purple-500',
  writing: 'bg-yellow-500',
  reviewing: 'bg-orange-500',
  sending: 'bg-green-500',
  paused: 'bg-gray-400',
  completed: 'bg-green-600',
  error: 'bg-red-500',
};

export const AGENT_STATUS_COLORS: Record<AgentStatus, string> = {
  pending: 'text-gray-400',
  running: 'text-blue-500 animate-pulse',
  waiting: 'text-yellow-500',
  blocked: 'text-orange-500',
  failed: 'text-red-500',
  completed: 'text-green-500',
};
