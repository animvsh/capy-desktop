/**
 * ActionConfirmDialog - Confirmation dialog for actions in ask-first mode
 * 
 * Shows a confirmation dialog before executing actions like:
 * - Sending emails
 * - Starting campaigns
 * - Deleting data
 * - Any action that modifies state
 */

import React from 'react';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface PendingAction {
  action: string;
  params?: Record<string, any>;
  description?: string;
  messageContent?: string;
}

interface ActionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingAction: PendingAction | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// Map action types to user-friendly descriptions
function getActionInfo(action: string): { icon: string; title: string; severity: 'info' | 'warning' | 'danger' } {
  const actionLower = action.toLowerCase();
  
  if (actionLower.includes('send') || actionLower.includes('email')) {
    return { icon: 'fa-paper-plane', title: 'Send Email', severity: 'warning' };
  }
  if (actionLower.includes('delete') || actionLower.includes('remove')) {
    return { icon: 'fa-trash', title: 'Delete', severity: 'danger' };
  }
  if (actionLower.includes('start') || actionLower.includes('launch') || actionLower.includes('trigger')) {
    return { icon: 'fa-rocket', title: 'Start Campaign', severity: 'warning' };
  }
  if (actionLower.includes('queue')) {
    return { icon: 'fa-list-check', title: 'Queue Action', severity: 'info' };
  }
  if (actionLower.includes('create')) {
    return { icon: 'fa-plus', title: 'Create', severity: 'info' };
  }
  if (actionLower.includes('update') || actionLower.includes('edit')) {
    return { icon: 'fa-pen', title: 'Update', severity: 'info' };
  }
  if (actionLower.includes('draft')) {
    return { icon: 'fa-file-pen', title: 'Draft', severity: 'info' };
  }
  if (actionLower.includes('agent')) {
    return { icon: 'fa-robot', title: 'Agent Action', severity: 'warning' };
  }
  
  return { icon: 'fa-bolt', title: 'Execute Action', severity: 'info' };
}

const severityStyles = {
  info: {
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  warning: {
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  danger: {
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-500',
    badge: 'bg-red-100 text-red-700 border-red-200',
  },
};

export function ActionConfirmDialog({
  open,
  onOpenChange,
  pendingAction,
  onConfirm,
  onCancel,
}: ActionConfirmDialogProps) {
  if (!pendingAction) return null;

  const actionInfo = getActionInfo(pendingAction.action);
  const styles = severityStyles[actionInfo.severity];

  // Format params for display
  const formatParams = (params?: Record<string, any>) => {
    if (!params || Object.keys(params).length === 0) return null;
    
    const displayParams: { key: string; value: string }[] = [];
    
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      
      let displayValue = String(value);
      if (typeof value === 'object') {
        displayValue = JSON.stringify(value);
      }
      if (displayValue.length > 50) {
        displayValue = displayValue.substring(0, 50) + '...';
      }
      
      // Convert camelCase to readable format
      const readableKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      displayParams.push({ key: readableKey, value: displayValue });
    }
    
    return displayParams;
  };

  const params = formatParams(pendingAction.params);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            {/* Action Icon */}
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', styles.iconBg)}>
              <i className={cn('fa-solid', actionInfo.icon, styles.iconColor)} />
            </div>
            
            <div className="flex-1">
              <AlertDialogTitle className="flex items-center gap-2">
                {actionInfo.title}
                <Badge variant="outline" className={cn('text-xs', styles.badge)}>
                  Ask First Mode
                </Badge>
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-2">
                {pendingAction.description || 'Do you want to proceed with this action?'}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {/* Action Details */}
        <div className="space-y-3 py-2">
          {/* Action ID */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Action:</span>
            <code className="px-2 py-0.5 rounded bg-muted text-xs font-mono">
              {pendingAction.action}
            </code>
          </div>

          {/* Message content preview */}
          {pendingAction.messageContent && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Message Preview:</p>
              <p className="text-sm line-clamp-3">{pendingAction.messageContent}</p>
            </div>
          )}

          {/* Parameters */}
          {params && params.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Parameters:</p>
              <div className="grid gap-1">
                {params.map(({ key, value }) => (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground min-w-[80px]">{key}:</span>
                    <span className="font-medium break-all">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            <i className="fa-solid fa-xmark mr-2" />
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className={cn(
              actionInfo.severity === 'danger' && 'bg-red-600 hover:bg-red-700',
              actionInfo.severity === 'warning' && 'bg-amber-600 hover:bg-amber-700',
            )}
          >
            <i className={cn('fa-solid mr-2', actionInfo.icon)} />
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ActionConfirmDialog;
