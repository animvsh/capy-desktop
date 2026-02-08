/**
 * PendingEmailsQueue - Shows emails awaiting approval in confirm/read_only mode
 */

import { useState } from 'react';
import { usePendingEmails, PendingEmail } from '@/hooks/usePendingEmails';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/Input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PendingEmailsQueueProps {
  onClose?: () => void;
}

export function PendingEmailsQueue({ onClose }: PendingEmailsQueueProps) {
  const {
    pendingEmails,
    loading,
    approveEmail,
    rejectEmail,
    updateEmail,
  } = usePendingEmails();

  const [selectedEmail, setSelectedEmail] = useState<PendingEmail | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const handleSelect = (email: PendingEmail) => {
    setSelectedEmail(email);
    setEditedSubject(email.subject);
    setEditedBody(email.body);
    setEditMode(false);
  };

  const handleApprove = async () => {
    if (!selectedEmail) return;
    setProcessing('approve');

    const updates = editMode
      ? { subject: editedSubject, body: editedBody }
      : undefined;

    const result = await approveEmail(selectedEmail.id, updates);

    if (result.success) {
      toast.success('Email sent successfully!');
      setSelectedEmail(null);
    } else {
      toast.error(result.error || 'Failed to send email');
    }

    setProcessing(null);
  };

  const handleReject = async () => {
    if (!selectedEmail) return;
    setProcessing('reject');

    const result = await rejectEmail(selectedEmail.id);

    if (result.success) {
      toast.success('Email rejected');
      setSelectedEmail(null);
    } else {
      toast.error(result.error || 'Failed to reject email');
    }

    setProcessing(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedEmail) return;
    setProcessing('save');

    const result = await updateEmail(selectedEmail.id, {
      subject: editedSubject,
      body: editedBody,
    });

    if (result.success) {
      toast.success('Changes saved');
      setEditMode(false);
      // Update local state
      setSelectedEmail({
        ...selectedEmail,
        subject: editedSubject,
        body: editedBody,
      });
    } else {
      toast.error(result.error || 'Failed to save changes');
    }

    setProcessing(null);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <i className="fa-solid fa-spinner fa-spin text-2xl text-muted-foreground" />
      </div>
    );
  }

  if (pendingEmails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <i className="fa-solid fa-check text-xl text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No pending emails</p>
        <p className="text-xs text-muted-foreground">
          Emails awaiting your approval will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Email List */}
      <div className={cn(
        'border-r border-border/40 overflow-hidden',
        selectedEmail ? 'w-72 shrink-0 hidden md:block' : 'flex-1'
      )}>
        <div className="p-3 border-b border-border/40 bg-muted/20">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <i className="fa-solid fa-inbox text-primary" />
            Pending Approval
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
              {pendingEmails.length}
            </span>
          </h3>
        </div>

        <ScrollArea className="h-[calc(100%-48px)]">
          <div className="p-2 space-y-1">
            {pendingEmails.map((email) => (
              <div
                key={email.id}
                onClick={() => handleSelect(email)}
                className={cn(
                  'p-3 rounded-lg cursor-pointer transition-colors',
                  selectedEmail?.id === email.id
                    ? 'bg-primary/10 border border-primary/30'
                    : 'hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium truncate flex-1">
                    {email.leads?.name || email.to_name || email.to_email}
                  </span>
                  {email.status === 'edited' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600">
                      Edited
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate mb-1">
                  {email.subject}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{email.leads?.company || 'Unknown company'}</span>
                  <span>•</span>
                  <span>{formatDate(email.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Email Detail */}
      {selectedEmail && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-border/40 bg-card/50">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedEmail(null)}
                  className="md:hidden mb-2 -ml-2"
                >
                  <i className="fa-solid fa-arrow-left mr-2" />
                  Back
                </Button>
                <h3 className="font-semibold text-sm truncate">
                  To: {selectedEmail.leads?.name || selectedEmail.to_name || selectedEmail.to_email}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {selectedEmail.to_email}
                  {selectedEmail.leads?.company && ` • ${selectedEmail.leads.company}`}
                  {selectedEmail.leads?.title && ` • ${selectedEmail.leads.title}`}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditMode(!editMode)}
                  className="h-8 w-8"
                  title={editMode ? 'Cancel edit' : 'Edit email'}
                >
                  <i className={cn('fa-solid text-sm', editMode ? 'fa-times' : 'fa-edit')} />
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1 p-4">
            {editMode ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Subject
                  </label>
                  <Input
                    value={editedSubject}
                    onChange={(e) => setEditedSubject(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Email Body
                  </label>
                  <Textarea
                    value={editedBody}
                    onChange={(e) => setEditedBody(e.target.value)}
                    className="min-h-[300px] text-sm"
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-4 pb-4 border-b border-border/40">
                  <p className="text-xs text-muted-foreground mb-1">Subject</p>
                  <p className="text-sm font-medium">{selectedEmail.subject}</p>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {selectedEmail.body}
                  </div>
                </div>
                {selectedEmail.ai_generated && (
                  <div className="mt-4 pt-4 border-t border-border/40">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <i className="fa-solid fa-robot" />
                      Generated by Capy AI
                    </p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Actions */}
          <div className="p-4 border-t border-border/40 bg-card/30">
            <div className="flex items-center gap-2">
              {editMode ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditMode(false);
                      setEditedSubject(selectedEmail.subject);
                      setEditedBody(selectedEmail.body);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={processing === 'save'}
                    className="flex-1"
                  >
                    {processing === 'save' ? (
                      <i className="fa-solid fa-spinner fa-spin" />
                    ) : (
                      <>
                        <i className="fa-solid fa-save mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleReject}
                    disabled={!!processing}
                    className="text-destructive hover:text-destructive"
                  >
                    {processing === 'reject' ? (
                      <i className="fa-solid fa-spinner fa-spin" />
                    ) : (
                      <>
                        <i className="fa-solid fa-times mr-2" />
                        Reject
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={!!processing}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {processing === 'approve' ? (
                      <i className="fa-solid fa-spinner fa-spin" />
                    ) : (
                      <>
                        <i className="fa-solid fa-paper-plane mr-2" />
                        Approve & Send
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PendingEmailsQueue;
