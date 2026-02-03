import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ScheduleMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  leadCompany?: string | null;
  conversationId?: string;
  onSuccess?: () => void;
}

export function ScheduleMeetingModal({
  open,
  onOpenChange,
  leadId,
  leadName,
  leadCompany,
  conversationId,
  onSuccess,
}: ScheduleMeetingModalProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("30");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // Debug log when modal opens
  useEffect(() => {
    if (open) {
      console.log('[ScheduleMeeting] Modal opened for lead:', { leadId, leadName, leadCompany, conversationId });
    }
  }, [open, leadId, leadName, leadCompany, conversationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[ScheduleMeeting] Form submitted - starting booking process');

    if (!date || !time) {
      console.warn('[ScheduleMeeting] Validation failed - missing date or time');
      toast.error("Please select a date and time");
      return;
    }

    setLoading(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

      console.log('[ScheduleMeeting] Calling book-meeting function with:', {
        leadId,
        conversationId,
        scheduledAt,
        durationMinutes: parseInt(duration),
        hasNotes: !!notes.trim(),
      });

      const { data, error } = await supabase.functions.invoke("book-meeting", {
        body: {
          leadId,
          conversationId,
          scheduledAt,
          durationMinutes: parseInt(duration),
          notes: notes.trim() || undefined,
        },
      });

      console.log('[ScheduleMeeting] Response:', { data, error });

      if (error) {
        console.error('[ScheduleMeeting] Function invoke error:', error);
        if (error.message?.includes("429")) {
          toast.error("Rate limited. Please try again in a moment.");
          return;
        }
        if (error.message?.includes("402")) {
          toast.error("Usage limit reached. Please check your account.");
          return;
        }
        if (error.message?.includes("401")) {
          toast.error("Authentication error. Please sign in again.");
          return;
        }
        toast.error(`Function error: ${error.message || 'Unknown error'}`);
        throw error;
      }

      if (data?.error) {
        console.error('[ScheduleMeeting] API error:', data.error);
        toast.error(`API error: ${data.error}`);
        throw new Error(data.error);
      }

      if (!data?.success) {
        console.error('[ScheduleMeeting] Booking failed - no success flag');
        toast.error('Booking failed - please try again');
        return;
      }

      if (data?.meetingLink) {
        toast.success("Meeting booked with Google Meet! 🎉", {
          description: "Calendar event created and confirmation email sent with meeting link",
          duration: 5000,
        });
      } else if (data?.confirmationEmailSent) {
        toast.success("Meeting booked!", {
          description: "Confirmation email sent (connect Google Calendar for automatic Meet links)",
        });
      } else {
        toast.success("Meeting booked!", {
          description: "Meeting scheduled successfully",
        });
      }
      
      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setDate("");
      setTime("10:00");
      setDuration("30");
      setNotes("");
    } catch (error) {
      console.error("Booking error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to book meeting");
    } finally {
      setLoading(false);
    }
  };

  // Get minimum date (today)
  const today = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="fa-solid fa-calendar h-5 w-5 text-forest" />
            Schedule Meeting
          </DialogTitle>
          <DialogDescription>
            Book a meeting with {leadName}
            {leadCompany && ` from ${leadCompany}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={today}
                required
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="45">45 minutes</SelectItem>
                <SelectItem value="60">60 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes for the meeting..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl min-h-[80px]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-full bg-forest hover:bg-forest/90 text-white"
            >
              {loading ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin h-4 w-4 mr-2" />
                  Booking...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-clock h-4 w-4 mr-2" />
                  Book Meeting
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
