/**
 * BrowserLiveView Component
 * 
 * Shows live browser automation with:
 * - Real-time frame streaming
 * - Current URL/title display
 * - Automation step progress
 * - Approval dialog for human-in-the-loop
 * - Error handling
 */

import { useState, useEffect } from 'react';
import { useBrowserAutomation } from '@/hooks/useBrowserAutomation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function BrowserLiveView() {
  const {
    isInitialized,
    isLoading,
    profiles,
    activeProfileId,
    currentRun,
    pendingApproval,
    liveFrame,
    browserState,
    events,
    error,
    initialize,
    shutdown,
    startStreaming,
    stopStreaming,
    approveAction,
    rejectAction,
    stopRun,
    getOrCreateProfile,
  } = useBrowserAutomation();

  const [selectedPlatform, setSelectedPlatform] = useState<'linkedin' | 'twitter' | 'generic'>('linkedin');
  const [isExpanded, setIsExpanded] = useState(true);

  // Calculate progress
  const progress = currentRun 
    ? (currentRun.currentStepIndex / currentRun.steps.length) * 100 
    : 0;

  const handleStartBrowser = async () => {
    await initialize();
    const profile = await getOrCreateProfile(selectedPlatform);
    if (profile) {
      await startStreaming(profile.id);
    }
  };

  const handleStopBrowser = async () => {
    await stopStreaming();
    await shutdown();
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-blue-500 bg-blue-500/10';
      case 'paused': return 'text-amber-500 bg-amber-500/10';
      case 'complete': return 'text-emerald-500 bg-emerald-500/10';
      case 'failed': return 'text-red-500 bg-red-500/10';
      case 'stopped': return 'text-gray-500 bg-gray-500/10';
      default: return 'text-gray-500 bg-gray-500/10';
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'pending': return 'fa-circle text-gray-400';
      case 'running': return 'fa-spinner fa-spin text-blue-500';
      case 'complete': return 'fa-check-circle text-emerald-500';
      case 'failed': return 'fa-times-circle text-red-500';
      case 'skipped': return 'fa-minus-circle text-gray-400';
      default: return 'fa-circle text-gray-400';
    }
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-robot text-primary" />
            <h3 className="font-semibold text-sm">Browser Automation</h3>
          </div>
          
          {isInitialized && (
            <Badge variant="outline" className={cn('text-[10px]', getStatusColor(currentRun?.status || 'idle'))}>
              {currentRun?.status || 'Ready'}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Platform Selector */}
          {!isInitialized && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              {(['linkedin', 'twitter', 'generic'] as const).map((platform) => (
                <button
                  key={platform}
                  onClick={() => setSelectedPlatform(platform)}
                  className={cn(
                    'px-2 py-1 text-xs rounded-md transition-colors',
                    selectedPlatform === platform
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {platform === 'linkedin' && <i className="fa-brands fa-linkedin mr-1" />}
                  {platform === 'twitter' && <i className="fa-brands fa-twitter mr-1" />}
                  {platform === 'generic' && <i className="fa-solid fa-globe mr-1" />}
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Toggle/Control Buttons */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0"
          >
            <i className={cn('fa-solid', isExpanded ? 'fa-chevron-up' : 'fa-chevron-down')} />
          </Button>
          
          {!isInitialized ? (
            <Button
              size="sm"
              onClick={handleStartBrowser}
              disabled={isLoading}
              className="h-7 text-xs"
            >
              {isLoading ? (
                <i className="fa-solid fa-spinner fa-spin mr-1" />
              ) : (
                <i className="fa-solid fa-play mr-1" />
              )}
              Start
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStopBrowser}
              className="h-7 text-xs"
            >
              <i className="fa-solid fa-stop mr-1" />
              Stop
            </Button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* URL Bar */}
          {browserState && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border/50">
              <i className="fa-solid fa-lock text-emerald-500 text-xs" />
              <span className="text-xs text-muted-foreground truncate flex-1">
                {browserState.url}
              </span>
              <span className="text-xs font-medium truncate max-w-[200px]">
                {browserState.title}
              </span>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex min-h-0">
            {/* Live Frame */}
            <div className="flex-1 min-w-0 bg-black/5 flex items-center justify-center relative">
              {!isInitialized ? (
                <div className="text-center p-6">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <i className="fa-solid fa-robot text-2xl text-primary" />
                  </div>
                  <h4 className="font-medium mb-2">Browser Automation</h4>
                  <p className="text-sm text-muted-foreground max-w-[300px]">
                    Start the browser to automate LinkedIn connections, Twitter follows, and more
                  </p>
                </div>
              ) : liveFrame ? (
                <img 
                  src={liveFrame} 
                  alt="Live browser view" 
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-6">
                  <i className="fa-solid fa-spinner fa-spin text-2xl text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Loading browser view...</p>
                </div>
              )}

              {/* Error Overlay */}
              {error && (
                <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
                  <div className="bg-card rounded-xl p-4 shadow-lg border border-red-500/30 max-w-[300px]">
                    <div className="flex items-center gap-2 text-red-500 mb-2">
                      <i className="fa-solid fa-exclamation-triangle" />
                      <span className="font-medium text-sm">Error</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{error}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Steps Panel */}
            {currentRun && (
              <div className="w-[280px] border-l border-border/50 flex flex-col">
                {/* Progress */}
                <div className="px-4 py-3 border-b border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">
                      {currentRun.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                    <Badge variant="outline" className={cn('text-[10px]', getStatusColor(currentRun.status))}>
                      {currentRun.status}
                    </Badge>
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>

                {/* Target Info */}
                {currentRun.target && (
                  <div className="px-4 py-3 border-b border-border/50 bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <i className="fa-solid fa-user text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{currentRun.target.name}</p>
                        {currentRun.target.headline && (
                          <p className="text-xs text-muted-foreground truncate">{currentRun.target.headline}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Steps List */}
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-3">
                    {currentRun.steps.map((step, index) => (
                      <div key={step.id} className="flex items-start gap-3">
                        <i className={cn('fa-solid text-sm mt-0.5', getStepIcon(step.status))} />
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-sm font-medium',
                            step.status === 'pending' && 'text-muted-foreground',
                            step.status === 'running' && 'text-blue-500',
                            step.status === 'complete' && 'text-emerald-500',
                            step.status === 'failed' && 'text-red-500'
                          )}>
                            {step.name}
                          </p>
                          {step.description && (
                            <p className="text-xs text-muted-foreground">{step.description}</p>
                          )}
                          {step.requiresApproval && step.status === 'running' && (
                            <Badge variant="outline" className="mt-1 text-[10px] text-amber-500 border-amber-500/30">
                              <i className="fa-solid fa-hand mr-1" />
                              Needs Approval
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Action Buttons */}
                <div className="p-3 border-t border-border/50">
                  {currentRun.status === 'running' || currentRun.status === 'paused' ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={stopRun}
                      className="w-full"
                    >
                      <i className="fa-solid fa-stop mr-2" />
                      Stop Automation
                    </Button>
                  ) : currentRun.status === 'complete' ? (
                    <div className="flex items-center justify-center gap-2 py-2 text-emerald-500">
                      <i className="fa-solid fa-check-circle" />
                      <span className="text-sm font-medium">Completed</span>
                    </div>
                  ) : currentRun.status === 'failed' ? (
                    <div className="flex items-center justify-center gap-2 py-2 text-red-500">
                      <i className="fa-solid fa-times-circle" />
                      <span className="text-sm font-medium">Failed</span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval Dialog */}
      <AlertDialog open={!!pendingApproval}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <i className="fa-solid fa-hand text-amber-500" />
              Approval Required
            </AlertDialogTitle>
            <AlertDialogDescription>
              The automation needs your approval to proceed with the following action:
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {pendingApproval && (
            <div className="bg-muted/50 rounded-lg p-4 my-2">
              <div className="flex items-center gap-2 mb-2">
                <Badge>{pendingApproval.action}</Badge>
              </div>
              <p className="text-sm mb-2">
                <span className="text-muted-foreground">Target: </span>
                <span className="font-medium">{pendingApproval.preview.target}</span>
              </p>
              {pendingApproval.preview.content && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Content: </span>
                  <p className="mt-1 p-2 bg-card rounded border border-border text-xs">
                    {pendingApproval.preview.content}
                  </p>
                </div>
              )}
            </div>
          )}
          
          <AlertDialogFooter>
            <AlertDialogCancel onClick={rejectAction}>
              <i className="fa-solid fa-times mr-2" />
              Reject
            </AlertDialogCancel>
            <AlertDialogAction onClick={approveAction}>
              <i className="fa-solid fa-check mr-2" />
              Approve & Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default BrowserLiveView;
