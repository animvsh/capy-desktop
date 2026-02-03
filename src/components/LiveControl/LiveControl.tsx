import React, { useState } from 'react';
import {
  Pause,
  Square,
  MousePointer,
  CheckCircle2,
  Play,
  Globe,
  Clock,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  User,
  Building2,
  Mail,
  Briefcase,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { ScrollArea } from '../ui/ScrollArea';

export interface Step {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  duration?: number; // ms
}

export interface ExtractedData {
  name?: string;
  company?: string;
  role?: string;
  email?: string;
  linkedin?: string;
  [key: string]: string | undefined;
}

export interface PolicyStatus {
  dailyLimit: number;
  dailyUsed: number;
  windowActive: boolean;
  risks: string[];
}

interface LiveControlProps {
  url?: string;
  pageTitle?: string;
  steps: Step[];
  currentStepId?: string;
  extractedData?: ExtractedData;
  draftMessage?: string;
  policyStatus?: PolicyStatus;
  isRunning?: boolean;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onTakeOver?: () => void;
  onApprove?: () => void;
  needsApproval?: boolean;
}

function StepItem({ step, isCurrent }: { step: Step; isCurrent: boolean }) {
  const statusConfig = {
    pending: { icon: <Clock className="w-3.5 h-3.5" />, color: 'text-zinc-500' },
    running: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: 'text-indigo-400' },
    completed: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
    error: { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'text-red-400' },
  };

  const config = statusConfig[step.status];

  return (
    <div
      className={`
        flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
        ${isCurrent ? 'bg-indigo-500/10 border border-indigo-500/30' : 'hover:bg-zinc-800/30'}
      `}
    >
      <span className={config.color}>{config.icon}</span>
      <span className={`text-sm flex-1 ${isCurrent ? 'text-white font-medium' : 'text-zinc-400'}`}>
        {step.label}
      </span>
      {step.duration && (
        <span className="text-xs text-zinc-600">
          {(step.duration / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

function DataField({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="text-zinc-500 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-zinc-200 truncate">{value}</p>
      </div>
    </div>
  );
}

export function LiveControl({
  url,
  pageTitle,
  steps,
  currentStepId,
  extractedData,
  draftMessage,
  policyStatus,
  isRunning = false,
  isPaused = false,
  onPause,
  onResume,
  onStop,
  onTakeOver,
  onApprove,
  needsApproval = false,
}: LiveControlProps) {
  const [inspectorExpanded, setInspectorExpanded] = useState(true);
  const [stepsExpanded, setStepsExpanded] = useState(true);

  const completedSteps = steps.filter((s) => s.status === 'completed').length;
  const totalSteps = steps.length;
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-zinc-900/30">
      {/* Viewport Area */}
      <div className="flex-1 min-h-0 p-4">
        <div className="h-full rounded-xl border border-zinc-800/50 bg-zinc-950/50 overflow-hidden flex flex-col">
          {/* URL Bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 bg-zinc-900/50">
            <Globe className="w-4 h-4 text-zinc-500" />
            <span className="flex-1 text-sm text-zinc-400 truncate">
              {url || 'No page loaded'}
            </span>
            {url && (
              <Button variant="ghost" size="icon-sm" className="text-zinc-500">
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {/* Viewport Placeholder */}
          <div className="flex-1 flex items-center justify-center">
            {isRunning ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4 mx-auto border border-zinc-700/50">
                  <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                </div>
                <p className="text-sm text-zinc-400">{pageTitle || 'Loading...'}</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4 mx-auto border border-zinc-700/50">
                  <Globe className="w-8 h-8 text-zinc-600" />
                </div>
                <p className="text-sm text-zinc-500">Browser viewport will appear here</p>
                <p className="text-xs text-zinc-600 mt-1">Start a task to see live browser</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="border-t border-zinc-800/50 bg-zinc-900/50">
        {/* Progress Bar */}
        {totalSteps > 0 && (
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500">Progress</span>
              <span className="text-xs text-zinc-400">{completedSteps}/{totalSteps} steps</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex items-center justify-center gap-2 p-4">
          {needsApproval ? (
            <Button variant="success" onClick={onApprove} className="flex-1 max-w-[200px]">
              <CheckCircle2 className="w-4 h-4" />
              Approve Action
            </Button>
          ) : isPaused ? (
            <Button variant="default" onClick={onResume} className="flex-1 max-w-[200px]">
              <Play className="w-4 h-4" />
              Resume
            </Button>
          ) : (
            <Button variant="secondary" onClick={onPause} disabled={!isRunning}>
              <Pause className="w-4 h-4" />
              Pause
            </Button>
          )}
          <Button variant="destructive" onClick={onStop} disabled={!isRunning}>
            <Square className="w-4 h-4" />
            Stop
          </Button>
          <Button variant="outline" onClick={onTakeOver}>
            <MousePointer className="w-4 h-4" />
            Take Over
          </Button>
        </div>

        {/* Expandable Sections */}
        <ScrollArea className="max-h-[300px]">
          {/* Steps Section */}
          <div className="border-t border-zinc-800/50">
            <button
              onClick={() => setStepsExpanded(!stepsExpanded)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/30 transition-colors"
            >
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Steps
              </span>
              {stepsExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              )}
            </button>
            {stepsExpanded && steps.length > 0 && (
              <div className="px-2 pb-2 space-y-1">
                {steps.map((step) => (
                  <StepItem
                    key={step.id}
                    step={step}
                    isCurrent={step.id === currentStepId}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Inspector Section */}
          <div className="border-t border-zinc-800/50">
            <button
              onClick={() => setInspectorExpanded(!inspectorExpanded)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/30 transition-colors"
            >
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Extracted Data
              </span>
              {inspectorExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              )}
            </button>
            {inspectorExpanded && extractedData && (
              <div className="px-4 pb-3">
                <DataField icon={<User className="w-3.5 h-3.5" />} label="Name" value={extractedData.name} />
                <DataField icon={<Building2 className="w-3.5 h-3.5" />} label="Company" value={extractedData.company} />
                <DataField icon={<Briefcase className="w-3.5 h-3.5" />} label="Role" value={extractedData.role} />
                <DataField icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={extractedData.email} />
              </div>
            )}
          </div>

          {/* Draft Message Preview */}
          {draftMessage && (
            <div className="border-t border-zinc-800/50 px-4 py-3">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                Draft Message
              </p>
              <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30">
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{draftMessage}</p>
              </div>
            </div>
          )}

          {/* Policy Status */}
          {policyStatus && (
            <div className="border-t border-zinc-800/50 px-4 py-3">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                Policy
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant={policyStatus.dailyUsed >= policyStatus.dailyLimit ? 'destructive' : 'secondary'}>
                  {policyStatus.dailyUsed}/{policyStatus.dailyLimit} daily
                </Badge>
                <Badge variant={policyStatus.windowActive ? 'success' : 'warning'}>
                  {policyStatus.windowActive ? 'Window active' : 'Outside window'}
                </Badge>
                {policyStatus.risks.map((risk, i) => (
                  <Badge key={i} variant="warning">{risk}</Badge>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

export default LiveControl;
