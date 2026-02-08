/**
 * ArtifactRenderer - Premium artifact cards
 * 
 * Polished cards for leads, emails, stats, and more
 */

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CapyWebArtifact } from './CapyWebArtifact';
import { CampaignProgress } from './CampaignProgress';
import './chat.css';

// Utility function to convert HTML to plain text
function htmlToPlainText(html: string): string {
  if (!html) return '';

  // Remove DOCTYPE, html, head, and body tags
  let text = html
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<html[^>]*>/gi, '')
    .replace(/<\/html>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '')
    .replace(/<\/body>/gi, '');

  // Replace common block elements with line breaks
  text = text
    .replace(/<\/?(div|p|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');

  // Clean up whitespace
  text = text
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to max 2
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
    .trim();

  return text;
}

interface Artifact {
  type: string;
  id: string;
  data: Record<string, any>;
}

interface ArtifactRendererProps {
  artifact: Artifact;
  onAction?: (action: string, params?: Record<string, any>) => void;
}

export function ArtifactRenderer({ artifact, onAction }: ArtifactRendererProps) {
  switch (artifact.type) {
    case 'lead_card':
      return <LeadCardArtifact data={artifact.data} onAction={onAction} />;
    case 'lead_list':
      return <LeadListArtifact data={artifact.data} onAction={onAction} />;
    case 'lead_preview':
      return <LeadPreviewArtifact data={artifact.data} />;
    case 'email_draft':
      return <EmailDraftArtifact data={artifact.data} onAction={onAction} />;
    case 'email_sent':
      return <EmailSentArtifact data={artifact.data} />;
    case 'conversation_thread':
      return <ConversationThreadArtifact data={artifact.data} onAction={onAction} />;
    case 'meeting_card':
      return <MeetingCardArtifact data={artifact.data} onAction={onAction} />;
    case 'meeting_proposal':
      return <MeetingProposalArtifact data={artifact.data} onAction={onAction} />;
    case 'stats_card':
      return <StatsCardArtifact data={artifact.data} />;
    case 'stats_dashboard':
      return <StatsDashboardArtifact data={artifact.data} />;
    case 'funnel_chart':
      return <FunnelChartArtifact data={artifact.data} />;
    case 'activity_feed':
      return <ActivityFeedArtifact data={artifact.data} onAction={onAction} />;
    case 'calendar_view':
      return <CalendarViewArtifact data={artifact.data} onAction={onAction} />;
    case 'linkedin_profile':
      return <LinkedInProfileArtifact data={artifact.data} onAction={onAction} />;
    case 'settings_card':
      return <SettingsCardArtifact data={artifact.data} onAction={onAction} />;
    case 'integration_status':
      return <IntegrationStatusArtifact data={artifact.data} onAction={onAction} />;
    case 'error_card':
      return <ErrorCardArtifact data={artifact.data} onAction={onAction} />;
    case 'confirmation_card':
      return <ConfirmationCardArtifact data={artifact.data} onAction={onAction} />;
    case 'progress_card':
      return <ProgressCardArtifact data={artifact.data} />;
    case 'discovery_results':
      return <DiscoveryResultsArtifact data={artifact.data} onAction={onAction} />;
    case 'discovery_explanation':
      return <DiscoveryExplanationArtifact data={artifact.data} />;
    case 'validation_result':
      return <ValidationResultArtifact data={artifact.data} />;
    case 'capy_web_progress':
    case 'capy_web_results':
      return <CapyWebArtifact artifact={artifact} onAction={onAction} />;
    case 'campaign_progress':
      return <CampaignProgressArtifact data={artifact.data} onAction={onAction} />;
    case 'company_intel':
      return <CompanyIntelArtifact data={artifact.data} onAction={onAction} />;
    case 'setup_required':
      return <SetupRequiredArtifact data={artifact.data} onAction={onAction} />;
    default:
      return (
        <div className="chat-artifact-card p-4">
          <p className="text-sm text-muted-foreground">Unknown artifact: {artifact.type}</p>
        </div>
      );
  }
}

// ============================================
// SETUP REQUIRED ARTIFACT
// ============================================

function SetupRequiredArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  const integrationIcons: Record<string, string> = {
    email: 'fa-envelope',
    calendar: 'fa-calendar',
    meet: 'fa-video',
  };

  const integrationColors: Record<string, string> = {
    email: 'text-red-500 bg-red-50 dark:bg-red-900/20',
    calendar: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
    meet: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20',
  };

  const icon = integrationIcons[data.integration] || 'fa-cog';
  const colorClass = integrationColors[data.integration] || 'text-primary bg-primary/10';

  return (
    <Card className="border-dashed border-2 border-amber-300 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-900/10">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", colorClass)}>
            <i className={cn("fa-solid text-xl", icon)} />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-foreground mb-1">{data.title || 'Setup Required'}</h4>
            <p className="text-sm text-muted-foreground mb-4">{data.description}</p>
            <Button 
              onClick={() => onAction?.('settings.connect')}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
            >
              <i className="fa-solid fa-plug mr-2" />
              Connect Now
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// LEAD ARTIFACTS
// ============================================

function LeadCardArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  };

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
  };

  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="p-4">
        <div className="chat-lead-card">
          <div className="chat-lead-avatar">
            {getInitials(data.name)}
          </div>
          <div className="chat-lead-info">
            <div className="chat-lead-name">
              <span className="truncate">{data.name}</span>
              {data.icpScore && (
                <span className={cn('chat-lead-score', getScoreColor(data.icpScore))}>
                  {data.icpScore}%
                </span>
              )}
            </div>
            <p className="chat-lead-title truncate">{data.title}</p>
            <p className="chat-lead-company truncate">{data.company}</p>
            {data.email && (
              <p className="text-xs text-muted-foreground mt-1.5 truncate flex items-center gap-1.5">
                <i className="fa-solid fa-envelope text-[10px]" />
                {data.email}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Badge 
              variant={data.status === 'contacted' ? 'default' : 'secondary'} 
              className="text-[10px] h-5"
            >
              {data.status || 'pending'}
            </Badge>
            {data.linkedinUrl && (
              <a
                href={data.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0A66C2] hover:text-[#004182] transition-colors"
              >
                <i className="fa-brands fa-linkedin text-lg" />
              </a>
            )}
          </div>
        </div>
      </div>
      
      {onAction && (
        <div className="chat-artifact-actions">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction('email.generate', { leadId: data.id })}
            className="h-8 text-xs rounded-lg gap-1.5"
          >
            <i className="fa-solid fa-envelope" /> Email
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction('leads.score', { leadId: data.id })}
            className="h-8 text-xs rounded-lg gap-1.5"
          >
            <i className="fa-solid fa-star" /> Score
          </Button>
        </div>
      )}
    </div>
  );
}

function LeadListArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  // Safe access to leads array
  const leads = data?.leads || [];
  const count = data?.count || leads.length || 0;
  const totalCount = data?.totalCount;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <i className="fa-solid fa-users text-blue-500 text-sm" />
          </div>
          <div>
            <span className="text-sm font-semibold">
              {count} lead{count !== 1 ? 's' : ''}
            </span>
            {totalCount && totalCount > count && (
              <span className="text-xs text-muted-foreground ml-1">of {totalCount}</span>
            )}
          </div>
        </div>
        {onAction && leads.length > 0 && (
          <Button
            size="sm"
            variant="default"
            onClick={() => onAction('leads.approve', { leadIds: leads.map((l: any) => l.id) })}
            className="h-8 text-xs rounded-lg"
          >
            Approve All
          </Button>
        )}
      </div>
      <div className="space-y-2 max-h-[350px] overflow-y-auto chat-scrollbar">
        {leads.slice(0, 10).map((lead: any) => (
          <LeadCardArtifact key={lead.id || Math.random()} data={lead} onAction={onAction} />
        ))}
        {leads.length > 10 && (
          <p className="text-sm text-muted-foreground text-center py-3 bg-muted/30 rounded-lg">
            +{leads.length - 10} more leads
          </p>
        )}
      </div>
    </div>
  );
}

function LeadPreviewArtifact({ data }: { data: any }) {
  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="chat-artifact-icon lead">
          <i className="fa-solid fa-users" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm">{data.totalCount} {data.totalCount === 1 ? 'Lead' : 'Leads'} Found</h4>
          <p className="text-xs text-muted-foreground">{data.source}</p>
        </div>
      </div>
      
      <div className="chat-artifact-content space-y-3">
        {/* Stats row */}
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 text-emerald-600">
            <i className="fa-solid fa-envelope text-xs" />
            {data.discoveredCount} with email
          </span>
          {data.pendingEmailCount > 0 && (
            <span className="flex items-center gap-1.5 text-amber-600">
              <i className="fa-solid fa-hourglass text-xs" />
              {data.pendingEmailCount} pending
            </span>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {data.topCompanies?.slice(0, 2).map((company: string) => (
            <Badge key={company} variant="secondary" className="text-xs">
              {company}
            </Badge>
          ))}
          {data.topTitles?.slice(0, 1).map((title: string) => (
            <Badge key={title} variant="secondary" className="text-xs">
              {title}
            </Badge>
          ))}
          {data.locations?.slice(0, 1).map((location: string) => (
            <Badge key={location} variant="outline" className="text-xs gap-1">
              <i className="fa-solid fa-location-dot text-[10px]" />
              {location}
            </Badge>
          ))}
          {data.avgIcpScore != null && (
            <Badge 
              variant={data.avgIcpScore >= 70 ? 'default' : 'secondary'} 
              className="text-xs"
            >
              Avg: {data.avgIcpScore}%
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// EMAIL ARTIFACTS
// ============================================

function EmailDraftArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  // Convert HTML email body to plain text for preview
  const emailPreview = htmlToPlainText(data.body);

  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="chat-artifact-icon email">
          <i className="fa-solid fa-envelope" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">
            Email to {data.leadName || data.leadEmail || 'Lead'}
          </h4>
          {data.tokens && (
            <p className="text-xs text-muted-foreground">~{data.tokens} tokens</p>
          )}
        </div>
      </div>

      <div className="chat-artifact-content space-y-3">
        <div className="chat-email-draft">
          <div className="chat-email-subject">
            <span className="text-muted-foreground font-normal">Subject: </span>
            {data.subject}
          </div>
          <div className="chat-email-body">{emailPreview}</div>
        </div>
      </div>
      
      {onAction && (
        <div className="chat-artifact-actions">
          <Button
            size="sm"
            onClick={() => onAction('email.send', {
              leadId: data.leadId,
              subject: data.subject,
              content: data.body,
            })}
            className="h-8 text-xs rounded-lg gap-1.5"
          >
            <i className="fa-solid fa-paper-plane" /> Send
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction('email.generate', { leadId: data.leadId })}
            className="h-8 text-xs rounded-lg gap-1.5"
          >
            <i className="fa-solid fa-rotate" /> Regenerate
          </Button>
        </div>
      )}
    </div>
  );
}

function EmailSentArtifact({ data }: { data: any }) {
  return (
    <div className="chat-artifact-card bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <i className="fa-solid fa-check text-white text-lg" />
          </div>
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">Email Sent!</p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              To: {data.recipientName || data.recipient}
            </p>
            <p className="text-xs text-emerald-500 mt-0.5">
              {new Date(data.sentAt).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// CONVERSATION ARTIFACTS
// ============================================

function ConversationThreadArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="chat-artifact-icon email">
          <i className="fa-solid fa-comments" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">
            Conversation with {data.lead?.name || 'Lead'}
          </h4>
          {data.lead && (
            <p className="text-xs text-muted-foreground truncate">
              {data.lead.title} at {data.lead.company}
            </p>
          )}
        </div>
        <Badge variant={data.status === 'active' ? 'default' : 'secondary'} className="text-xs">
          {data.status || 'active'}
        </Badge>
      </div>
      
      <div className="chat-artifact-content">
        <div className="space-y-2 max-h-[200px] overflow-y-auto chat-scrollbar">
          {data.messages.map((msg: any) => (
            <div
              key={msg.id}
              className={cn(
                "p-3 rounded-xl text-sm",
                msg.direction === 'outbound'
                  ? "bg-primary/10 ml-6 rounded-br-md"
                  : "bg-muted mr-6 rounded-bl-md"
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2">
                <span>{new Date(msg.sentAt).toLocaleString()}</span>
                {msg.openCount > 0 && (
                  <span className="text-emerald-600">
                    <i className="fa-solid fa-eye mr-1" />
                    Opened {msg.openCount}x
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>
      
      {onAction && (
        <div className="chat-artifact-actions">
          <Button
            size="sm"
            onClick={() => onAction('email.reply', { conversationId: data.conversationId })}
            className="h-8 text-xs rounded-lg gap-1.5"
          >
            <i className="fa-solid fa-reply" /> Reply
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction('conversation.analyze', { conversationId: data.conversationId })}
            className="h-8 text-xs rounded-lg gap-1.5"
          >
            <i className="fa-solid fa-chart-line" /> Analyze
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================
// MEETING ARTIFACTS
// ============================================

function MeetingCardArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  const meetingDate = new Date(data.scheduledAt);

  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex flex-col items-center justify-center">
            <span className="text-xs text-primary font-medium">
              {meetingDate.toLocaleDateString('en-US', { weekday: 'short' })}
            </span>
            <span className="text-2xl font-bold text-primary">
              {meetingDate.getDate()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Meeting with {data.lead?.name}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              <i className="fa-solid fa-clock mr-1.5" />
              {meetingDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              {' '}&bull;{' '}{data.duration} min
            </p>
            {data.lead?.company && (
              <p className="text-sm text-muted-foreground">
                <i className="fa-solid fa-building mr-1.5" />
                {data.lead.company}
              </p>
            )}
            {data.meetLink && (
              <a
                href={data.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-2"
              >
                <i className="fa-solid fa-video" /> Join Meeting
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MeetingProposalArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="chat-artifact-icon meeting">
          <i className="fa-solid fa-calendar-check" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">Meeting Times</h4>
          <p className="text-xs text-muted-foreground">for {data.lead?.name}</p>
        </div>
      </div>
      
      <div className="chat-artifact-content space-y-2">
        {data.times.map((time: string, i: number) => (
          <div
            key={i}
            className="p-3 bg-muted/50 rounded-xl flex items-center justify-between hover:bg-muted/70 transition-colors"
          >
            <span className="text-sm">{new Date(time).toLocaleString()}</span>
            {onAction && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction('meeting.book', {
                  leadId: data.lead?.id,
                  datetime: time,
                })}
                className="h-7 text-xs rounded-lg"
              >
                Select
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// STATS ARTIFACTS
// ============================================

function StatsCardArtifact({ data }: { data: any }) {
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return { icon: 'fa-arrow-up', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
      case 'down': return { icon: 'fa-arrow-down', color: 'text-red-500', bg: 'bg-red-500/10' };
      default: return { icon: 'fa-minus', color: 'text-gray-500', bg: 'bg-gray-500/10' };
    }
  };

  const trend = data.trend ? getTrendIcon(data.trend) : null;

  return (
    <div className="chat-artifact-card p-4">
      <div className="chat-stats-card">
        <div className={cn('chat-stats-icon', trend?.bg || 'bg-primary/10')}>
          {trend ? (
            <i className={cn('fa-solid', trend.icon, trend.color)} />
          ) : (
            <i className="fa-solid fa-chart-simple text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="chat-stats-value">{data.value}</span>
            {data.change && (
              <span className={cn('chat-stats-trend', data.trend)}>
                {data.change}
              </span>
            )}
          </div>
          <p className="chat-stats-label">{data.label}</p>
          {data.description && (
            <p className="text-xs text-muted-foreground mt-1">{data.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsDashboardArtifact({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      {data.period && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <i className="fa-solid fa-calendar" />
          <span>Period: {data.period}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {data.metrics.map((metric: any, i: number) => (
          <StatsCardArtifact key={i} data={metric} />
        ))}
      </div>
    </div>
  );
}

function FunnelChartArtifact({ data }: { data: any }) {
  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="chat-artifact-icon stats">
          <i className="fa-solid fa-filter" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">Conversion Funnel</h4>
          {data.conversionRate !== undefined && (
            <p className="text-xs text-muted-foreground">
              Overall: {data.conversionRate}% conversion
            </p>
          )}
        </div>
      </div>
      
      <div className="chat-artifact-content space-y-3">
        {data.stages.map((stage: any, i: number) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{stage.label}</span>
              <span className="text-muted-foreground">{stage.count}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
                style={{ width: `${stage.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// ACTIVITY ARTIFACTS
// ============================================

function ActivityFeedArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  const getActivityStyle = (type: string) => {
    const styles: Record<string, { icon: string; color: string; bg: string }> = {
      'email_sent': { icon: 'fa-paper-plane', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      'email_opened': { icon: 'fa-envelope-open', color: 'text-blue-500', bg: 'bg-blue-500/10' },
      'reply_received': { icon: 'fa-reply', color: 'text-violet-500', bg: 'bg-violet-500/10' },
      'meeting_booked': { icon: 'fa-calendar-check', color: 'text-amber-500', bg: 'bg-amber-500/10' },
      'lead_discovered': { icon: 'fa-user-plus', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
      'interest_detected': { icon: 'fa-fire', color: 'text-orange-500', bg: 'bg-orange-500/10' },
    };
    return styles[type] || { icon: 'fa-circle-check', color: 'text-gray-500', bg: 'bg-gray-500/10' };
  };

  return (
    <div className="space-y-2">
      {data.activities.map((activity: any) => {
        const style = getActivityStyle(activity.type);
        return (
          <div
            key={activity.id}
            className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', style.bg)}>
              <i className={cn('fa-solid text-sm', style.icon, style.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{activity.title}</p>
              {activity.description && (
                <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {activity.createdAt
                  ? new Date(activity.createdAt).toLocaleString()
                  : 'Just now'}
              </p>
            </div>
          </div>
        );
      })}
      {data.hasMore && onAction && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full h-9 text-xs rounded-lg"
          onClick={() => onAction('activity.loadMore')}
        >
          Load More
        </Button>
      )}
    </div>
  );
}

function CalendarViewArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="chat-artifact-icon meeting">
          <i className="fa-solid fa-calendar" />
        </div>
        <h4 className="font-semibold text-sm">Upcoming Meetings</h4>
      </div>
      
      <div className="chat-artifact-content">
        {data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No upcoming meetings
          </p>
        ) : (
          <div className="space-y-2">
            {data.events.map((event: any) => (
              <div
                key={event.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/30"
              >
                <div className="w-12 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">
                    {new Date(event.startTime).toLocaleDateString('en-US', { weekday: 'short' })}
                  </p>
                  <p className="text-xl font-bold">
                    {new Date(event.startTime).getDate()}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                {event.meetLink && (
                  <a
                    href={event.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Join
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// LINKEDIN ARTIFACTS
// ============================================

function LinkedInProfileArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-[#0A66C2] flex items-center justify-center">
            <i className="fa-brands fa-linkedin text-white text-2xl" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{data.name}</p>
            <p className="text-sm text-muted-foreground">{data.title}</p>
            <p className="text-sm text-muted-foreground">{data.company}</p>
            {data.headline && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{data.headline}</p>
            )}
            {data.location && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <i className="fa-solid fa-location-dot" />
                {data.location}
              </p>
            )}
          </div>
        </div>
        
        {data.message && (
          <div className="mt-4 p-3 bg-muted/50 rounded-xl">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Connection Message:</p>
            <p className="text-sm">{data.message}</p>
          </div>
        )}
      </div>
      
      <div className="chat-artifact-actions">
        {data.linkedinUrl && (
          <Button
            size="sm"
            variant="outline"
            asChild
            className="h-8 text-xs rounded-lg gap-1.5"
          >
            <a href={data.linkedinUrl} target="_blank" rel="noopener noreferrer">
              <i className="fa-brands fa-linkedin" /> View Profile
            </a>
          </Button>
        )}
        {onAction && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction('linkedin.message', { leadId: data.id })}
              className="h-8 text-xs rounded-lg gap-1.5"
            >
              <i className="fa-solid fa-rotate" /> New Message
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction('linkedin.markSent', { leadId: data.id })}
              className="h-8 text-xs rounded-lg"
            >
              Mark Sent
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================
// SETTINGS ARTIFACTS
// ============================================

function SettingsCardArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  const settings = Array.isArray(data?.settings) ? data.settings : [];

  const getTitle = () => {
    if (!data?.title) return 'Settings';
    if (typeof data.title === 'string') return data.title;
    if (typeof data.title === 'object' && data.title.label) return data.title.label;
    return 'Settings';
  };

  const getValue = (setting: any) => {
    if (setting.type === 'boolean') {
      return setting.value ? 'Yes' : 'No';
    }
    if (!setting.value) return 'Not set';
    if (typeof setting.value === 'string') return setting.value;
    if (typeof setting.value === 'number') return String(setting.value);
    if (typeof setting.value === 'object') {
      if (setting.value.label) return setting.value.label;
      if (setting.value.name) return setting.value.name;
      return JSON.stringify(setting.value);
    }
    return String(setting.value);
  };

  const getLabel = (setting: any) => {
    if (!setting.label) return 'Unknown';
    if (typeof setting.label === 'string') return setting.label;
    return String(setting.label);
  };

  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="w-8 h-8 rounded-lg bg-gray-500/10 flex items-center justify-center">
          <i className="fa-solid fa-gear text-gray-500 text-sm" />
        </div>
        <h4 className="font-semibold text-sm">{getTitle()}</h4>
      </div>
      
      <div className="chat-artifact-content">
        {settings.length > 0 ? (
          <div className="space-y-0">
            {settings.map((setting: any, index: number) => (
              <div key={setting.key || index} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                <span className="text-sm">{getLabel(setting)}</span>
                <span className="text-sm font-medium text-muted-foreground">
                  {getValue(setting)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No settings to display</p>
        )}
      </div>
    </div>
  );
}

function IntegrationStatusArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  const integrations = [
    { key: 'gmail', label: 'Gmail', icon: 'fa-envelope', connected: data.gmail },
    { key: 'calendar', label: 'Calendar', icon: 'fa-calendar', connected: data.calendar },
    { key: 'meet', label: 'Google Meet', icon: 'fa-video', connected: data.meet },
  ];

  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <i className="fa-solid fa-plug text-violet-500 text-sm" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">Integration Status</h4>
          {data.connectedEmail && (
            <p className="text-xs text-muted-foreground">{data.connectedEmail}</p>
          )}
        </div>
      </div>
      
      <div className="chat-artifact-content space-y-2">
        {integrations.map((int) => (
          <div
            key={int.key}
            className="flex items-center justify-between p-3 rounded-xl bg-muted/30"
          >
            <div className="flex items-center gap-2.5">
              <i className={cn("fa-solid text-muted-foreground", int.icon)} />
              <span className="text-sm font-medium">{int.label}</span>
            </div>
            <Badge variant={int.connected ? 'default' : 'secondary'} className="text-xs">
              {int.connected ? (
                <><i className="fa-solid fa-check mr-1" /> Connected</>
              ) : (
                'Not Connected'
              )}
            </Badge>
          </div>
        ))}
        
        {!data.gmail && onAction && (
          <Button
            size="sm"
            className="w-full mt-2 h-9 text-xs rounded-lg"
            onClick={() => onAction('settings.connect')}
          >
            <i className="fa-brands fa-google mr-1.5" /> Connect Gmail
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================
// STATUS ARTIFACTS
// ============================================

function ErrorCardArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  return (
    <div className="chat-artifact-card bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center shrink-0 shadow-lg shadow-red-500/20">
            <i className="fa-solid fa-exclamation text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-800 dark:text-red-200">{data.error}</p>
            {data.suggestion && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{data.suggestion}</p>
            )}
          </div>
        </div>
        {data.retryAction && onAction && (
          <Button
            size="sm"
            variant="outline"
            className="mt-4 h-8 text-xs rounded-lg border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30"
            onClick={() => onAction(data.retryAction)}
          >
            <i className="fa-solid fa-rotate mr-1.5" /> Try Again
          </Button>
        )}
      </div>
    </div>
  );
}

function ConfirmationCardArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  return (
    <div className="chat-artifact-card bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
            <i className="fa-solid fa-question text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-800 dark:text-amber-200">{data.title}</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">{data.description}</p>
          </div>
        </div>
        {onAction && (
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              variant={data.destructive ? 'destructive' : 'default'}
              onClick={() => onAction(data.confirmAction)}
              className="h-8 text-xs rounded-lg"
            >
              {data.confirmLabel}
            </Button>
            {data.cancelAction && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction(data.cancelAction)}
                className="h-8 text-xs rounded-lg"
              >
                {data.cancelLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressCardArtifact({ data }: { data: any }) {
  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed': return { icon: 'fa-check', color: 'text-emerald-500' };
      case 'running': return { icon: 'fa-spinner fa-spin', color: 'text-primary' };
      case 'failed': return { icon: 'fa-xmark', color: 'text-red-500' };
      default: return { icon: 'fa-circle', color: 'text-muted-foreground' };
    }
  };

  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <i className="fa-solid fa-spinner fa-spin text-primary text-sm" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">{data.operation}</h4>
            <span className="text-xs text-muted-foreground font-medium">{data.progress}%</span>
          </div>
        </div>
      </div>
      
      <div className="chat-artifact-content space-y-3">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500 relative"
            style={{ width: `${data.progress}%` }}
          >
            <div className="absolute inset-0 chat-progress-shimmer" />
          </div>
        </div>
        
        <div className="space-y-2">
          {data.steps?.map((step: any, i: number) => {
            const stepStyle = getStepIcon(step.status);
            return (
              <div key={i} className="flex items-center gap-2.5 text-sm">
                <div className="w-5 flex justify-center">
                  <i className={cn('fa-solid text-xs', stepStyle.icon, stepStyle.color)} />
                </div>
                <span className={cn(
                  step.status === 'completed' && 'text-muted-foreground line-through',
                  step.status === 'running' && 'font-medium',
                  step.status === 'failed' && 'text-red-500'
                )}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================
// DISCOVERY ARTIFACTS
// ============================================

function DiscoveryResultsArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  const companies = data.companies || [];
  const contacts = data.contacts || [];
  const totalCompanies = data.totalFound?.companies || companies.length;
  const totalContacts = data.totalFound?.contacts || contacts.length;
  const confidence = data.confidence || 0;
  const executionTime = data.executionTime || 0;
  const sources = data.sources || [];

  const getConfidenceColor = (conf: number) => {
    if (conf >= 80) return 'text-emerald-500';
    if (conf >= 60) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <i className="fa-solid fa-magnifying-glass-chart text-emerald-500 text-sm" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Discovery Results</h4>
            <Badge variant="outline" className={cn("text-xs", getConfidenceColor(confidence))}>
              {confidence}% confidence
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalCompanies} companies • {totalContacts} contacts • {(executionTime / 1000).toFixed(1)}s
          </p>
        </div>
      </div>

      <div className="chat-artifact-content space-y-3">
        {/* Summary */}
        {data.summary && (
          <p className="text-sm text-muted-foreground">{data.summary}</p>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-foreground">{totalCompanies}</div>
            <div className="text-xs text-muted-foreground">Companies</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-foreground">{totalContacts}</div>
            <div className="text-xs text-muted-foreground">Contacts</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-foreground">{data.totalFound?.decisionMakers || 0}</div>
            <div className="text-xs text-muted-foreground">Decision Makers</div>
          </div>
        </div>

        {/* Top Companies Preview */}
        {companies.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Companies</h5>
            <div className="space-y-1.5">
              {companies.slice(0, 5).map((company: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-xs font-medium">
                      {company.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <div className="text-sm font-medium truncate max-w-[180px]">{company.name}</div>
                      {company.industry && (
                        <div className="text-xs text-muted-foreground">{company.industry}</div>
                      )}
                    </div>
                  </div>
                  {company.employeeCount && (
                    <Badge variant="outline" className="text-xs">{company.employeeCount} emp</Badge>
                  )}
                </div>
              ))}
              {companies.length > 5 && (
                <p className="text-xs text-muted-foreground text-center">+{companies.length - 5} more companies</p>
              )}
            </div>
          </div>
        )}

        {/* Top Contacts Preview */}
        {contacts.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Contacts</h5>
            <div className="space-y-1.5">
              {contacts.slice(0, 5).map((contact: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                      {contact.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?'}
                    </div>
                    <div>
                      <div className="text-sm font-medium truncate max-w-[150px]">{contact.name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[150px]">{contact.title}</div>
                    </div>
                  </div>
                  {contact.email && (
                    <i className="fa-solid fa-envelope text-emerald-500 text-xs" title="Has email" />
                  )}
                </div>
              ))}
              {contacts.length > 5 && (
                <p className="text-xs text-muted-foreground text-center">+{contacts.length - 5} more contacts</p>
              )}
            </div>
          </div>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Sources:</span>
            {sources.map((source: string, i: number) => (
              <Badge key={i} variant="secondary" className="text-xs">{source}</Badge>
            ))}
          </div>
        )}

        {/* Recommendations */}
        {data.recommendations && data.recommendations.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <h5 className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
              <i className="fa-solid fa-lightbulb" />
              Recommendations
            </h5>
            <ul className="text-xs text-muted-foreground space-y-1">
              {data.recommendations.slice(0, 3).map((rec: string, i: number) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-500">•</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 pt-0 flex gap-2">
        <Button
          size="sm"
          onClick={() => onAction?.('leads.import', { companies, contacts })}
          className="flex-1 h-8 text-xs"
        >
          <i className="fa-solid fa-download mr-1.5" />
          Import All
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAction?.('leads.discover', { refine: true })}
          className="h-8 text-xs"
        >
          Refine Search
        </Button>
      </div>
    </div>
  );
}

function DiscoveryExplanationArtifact({ data }: { data: any }) {
  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <i className="fa-solid fa-brain text-blue-500 text-sm" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm">Discovery Strategy</h4>
          <p className="text-xs text-muted-foreground mt-0.5">How I'll find your leads</p>
        </div>
      </div>

      <div className="chat-artifact-content space-y-3">
        {/* Query Understanding */}
        {data.understanding && (
          <div className="space-y-1.5">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Understanding</h5>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              {data.understanding.summary || data.query}
            </div>
          </div>
        )}

        {/* Reasoning */}
        {data.reasoning && (
          <div className="space-y-1.5">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Approach</h5>
            <p className="text-sm text-muted-foreground">{data.reasoning}</p>
          </div>
        )}

        {/* Strategy Steps */}
        {data.strategy?.steps && data.strategy.steps.length > 0 && (
          <div className="space-y-1.5">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Steps</h5>
            <div className="space-y-1">
              {data.strategy.steps.map((step: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        {data.sources && data.sources.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Will search:</span>
            {data.sources.map((source: any, i: number) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {typeof source === 'string' ? source : source.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ValidationResultArtifact({ data }: { data: any }) {
  const isValid = data.valid;

  return (
    <div className="chat-artifact-card overflow-hidden">
      <div className="chat-artifact-header">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          isValid ? "bg-emerald-500/10" : "bg-amber-500/10"
        )}>
          <i className={cn(
            "fa-solid text-sm",
            isValid ? "fa-check text-emerald-500" : "fa-triangle-exclamation text-amber-500"
          )} />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm">
            {isValid ? 'Query Validated' : 'Query Needs Refinement'}
          </h4>
          {data.confidence && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.confidence}% confidence
            </p>
          )}
        </div>
      </div>

      <div className="chat-artifact-content space-y-3">
        {/* Issues */}
        {data.issues && data.issues.length > 0 && (
          <div className="space-y-1.5">
            <h5 className="text-xs font-medium text-red-500 uppercase tracking-wide">Issues Found</h5>
            <ul className="space-y-1">
              {data.issues.map((issue: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                  <i className="fa-solid fa-xmark text-red-500 text-xs mt-1" />
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggestions */}
        {data.suggestions && data.suggestions.length > 0 && (
          <div className="space-y-1.5">
            <h5 className="text-xs font-medium text-amber-500 uppercase tracking-wide">Suggestions</h5>
            <ul className="space-y-1">
              {data.suggestions.map((sug: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                  <i className="fa-solid fa-lightbulb text-amber-500 text-xs mt-1" />
                  {sug}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Improvements */}
        {data.improvements && data.improvements.length > 0 && (
          <div className="space-y-1.5">
            <h5 className="text-xs font-medium text-blue-500 uppercase tracking-wide">Try Instead</h5>
            <div className="space-y-1">
              {data.improvements.map((imp: string, i: number) => (
                <div key={i} className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-sm">
                  "{imp}"
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// COMPANY INTEL ARTIFACT
// Shows company research with key people
// ============================================

function CompanyIntelArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  const company = data || {};
  const findings = data?.findings || [];
  
  return (
    <div className="chat-artifact-card overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg font-bold">
            {company.name?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold truncate">{company.name || 'Company Research'}</h3>
            {company.industry && (
              <p className="text-xs text-muted-foreground">{company.industry}</p>
            )}
          </div>
          {company.website && (
            <a 
              href={company.website} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <i className="fa-solid fa-external-link" />
              Website
            </a>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Description */}
        {company.description && (
          <p className="text-sm text-muted-foreground">{company.description}</p>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2">
          {company.size && (
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-sm font-medium text-foreground">{company.size}</div>
              <div className="text-xs text-muted-foreground">Size</div>
            </div>
          )}
          {company.location && (
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-sm font-medium text-foreground truncate">{company.location}</div>
              <div className="text-xs text-muted-foreground">Location</div>
            </div>
          )}
          {findings.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-sm font-medium text-foreground">{findings.length}</div>
              <div className="text-xs text-muted-foreground">Insights</div>
            </div>
          )}
        </div>

        {/* Products/Services */}
        {company.products && company.products.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Products & Services</h5>
            <div className="flex flex-wrap gap-1.5">
              {company.products.slice(0, 6).map((product: string, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {product}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Tech Stack */}
        {company.techStack && company.techStack.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tech Stack</h5>
            <div className="flex flex-wrap gap-1.5">
              {company.techStack.slice(0, 8).map((tech: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {tech}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Key Findings */}
        {findings.length > 0 && (
          <div className="space-y-2">
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Key Insights</h5>
            <div className="space-y-1.5">
              {findings.slice(0, 5).map((finding: any, i: number) => (
                <div key={i} className="flex items-start gap-2 bg-muted/30 rounded-lg px-3 py-2">
                  <i className={`fa-solid ${
                    finding.category === 'products' ? 'fa-box' :
                    finding.category === 'size' ? 'fa-users' :
                    finding.category === 'features' ? 'fa-star' :
                    'fa-circle-info'
                  } text-xs text-primary mt-1`} />
                  <p className="text-sm text-foreground/80 line-clamp-2">{finding.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {onAction && (
          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 text-xs"
              onClick={() => onAction('research.company', { company: company.name + ' competitors' })}
            >
              <i className="fa-solid fa-diagram-project mr-1.5" />
              Research Competitors
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 text-xs"
              onClick={() => onAction('leads.discover', { query: `employees at ${company.name}` })}
            >
              <i className="fa-solid fa-user-plus mr-1.5" />
              Find More People
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// CAMPAIGN PROGRESS ARTIFACT
// ============================================

function CampaignProgressArtifact({ data, onAction }: { data: any; onAction?: (action: string, params?: Record<string, any>) => void }) {
  return (
    <CampaignProgress
      campaignId={data.campaignId}
      campaignName={data.campaignName}
      onViewDetails={() => onAction?.('campaign.view', { campaignId: data.campaignId })}
    />
  );
}
