/**
 * MeetingsPanel - Clean, spacious Calendly-style meetings view
 * Premium aesthetic with generous whitespace
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfDay,
  isSameDay,
  parseISO,
  setHours,
  setMinutes,
  addMinutes,
  differenceInMinutes,
} from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// Types
interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  hangoutLink?: string;
  attendees?: { email: string; responseStatus?: string }[];
}

interface SchedulingLink {
  id: string;
  slug: string;
  title: string;
  description?: string;
  duration: number;
  availability: {
    days: number[];
    startHour: number;
    endHour: number;
  };
  is_active: boolean;
}

type ViewMode = 'day' | 'week';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 48; // Slightly smaller for cleaner look

export function MeetingsPanel() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Core state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);

  // Booking links
  const [schedulingLinks, setSchedulingLinks] = useState<SchedulingLink[]>([]);
  const [linkCopied, setLinkCopied] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingLink, setEditingLink] = useState<SchedulingLink | null>(null);
  
  // Link form
  const [linkTitle, setLinkTitle] = useState('');
  const [linkSlug, setLinkSlug] = useState('');
  const [linkDuration, setLinkDuration] = useState('30');
  const [linkDays, setLinkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [linkStartHour, setLinkStartHour] = useState('9');
  const [linkEndHour, setLinkEndHour] = useState('17');
  const [savingLink, setSavingLink] = useState(false);

  // New event
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);
  const [newEventTime, setNewEventTime] = useState('09:00');
  const [newEventDuration, setNewEventDuration] = useState('30');
  const [newEventAttendee, setNewEventAttendee] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);

  // Effects
  useEffect(() => {
    if (user) checkConnection();
  }, [user]);

  useEffect(() => {
    if (isCalendarConnected) loadEvents();
  }, [isCalendarConnected, currentDate, viewMode]);

  useEffect(() => {
    if (user && !checkingConnection) loadSchedulingLinks();
  }, [user, checkingConnection]);

  // API functions
  const checkConnection = async () => {
    setCheckingConnection(true);
    try {
      const { data } = await supabase.functions.invoke('composio-connect', {
        body: { action: 'status' },
      });
      setIsCalendarConnected(data?.calendar_connected === true);
    } catch (err) {
      console.error('Connection check error:', err);
    } finally {
      setCheckingConnection(false);
    }
  };

  const connectCalendar = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('composio-connect', {
        body: { action: 'connect', type: 'googlecalendar' },
      });
      if (error) throw error;
      if (data?.redirectUrl) window.location.href = data.redirectUrl;
    } catch (err) {
      toast({ title: 'Failed to connect calendar', variant: 'destructive' });
    }
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      const startDate = viewMode === 'day' 
        ? startOfDay(currentDate) 
        : startOfWeek(currentDate, { weekStartsOn: 0 });
      const endDate = viewMode === 'day' 
        ? addDays(startDate, 1) 
        : addDays(endOfWeek(currentDate, { weekStartsOn: 0 }), 1);

      const [calendarResult, bookingsResult] = await Promise.all([
        supabase.functions.invoke('composio-connect', {
          body: { action: 'calendar_events', start_date: startDate.toISOString(), end_date: endDate.toISOString() },
        }),
        supabase.from('bookings').select('*').eq('host_user_id', user?.id)
          .gte('start_time', startDate.toISOString()).lt('start_time', endDate.toISOString()).eq('status', 'confirmed')
      ]);

      const calendarEvents: CalendarEvent[] = [];

      if (calendarResult.data?.events) {
        for (const e of calendarResult.data.events) {
          calendarEvents.push({
            id: e.id,
            summary: e.summary || 'Untitled',
            description: e.description,
            start: e.start?.dateTime || e.start?.date || e.start,
            end: e.end?.dateTime || e.end?.date || e.end,
            hangoutLink: e.hangoutLink,
            attendees: e.attendees,
          });
        }
      } else if (calendarResult.data?.message === 'Calendar not connected') {
        setIsCalendarConnected(false);
      }

      if (bookingsResult.data) {
        for (const booking of bookingsResult.data) {
          if (!booking.calendar_event_id || !calendarEvents.some(e => e.id === booking.calendar_event_id)) {
            calendarEvents.push({
              id: booking.id,
              summary: `Meeting with ${booking.guest_name || booking.guest_email}`,
              description: booking.notes,
              start: booking.start_time,
              end: booking.end_time,
              hangoutLink: booking.meet_link,
              attendees: booking.guest_email ? [{ email: booking.guest_email }] : [],
            });
          }
        }
      }

      setEvents(calendarEvents);
    } catch (err: any) {
      console.error('Load events error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSchedulingLinks = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from('scheduling_links').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
      setSchedulingLinks(data || []);
    } catch (err) {
      console.error('Scheduling links error:', err);
    }
  };

  // Link helpers
  const sanitizeSlug = (input: string): string => {
    return input.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  };

  const openLinkModal = (link?: SchedulingLink) => {
    if (link) {
      setEditingLink(link);
      setLinkTitle(link.title);
      setLinkSlug(link.slug);
      setLinkDuration(String(link.duration));
      setLinkDays(link.availability?.days || [1, 2, 3, 4, 5]);
      setLinkStartHour(String(link.availability?.startHour || 9));
      setLinkEndHour(String(link.availability?.endHour || 17));
    } else {
      setEditingLink(null);
      setLinkTitle('');
      setLinkSlug('');
      setLinkDuration('30');
      setLinkDays([1, 2, 3, 4, 5]);
      setLinkStartHour('9');
      setLinkEndHour('17');
    }
    setShowLinkModal(true);
  };

  const saveLink = async () => {
    if (!user || !linkTitle.trim() || !linkSlug.trim()) return;
    setSavingLink(true);

    try {
      const slug = sanitizeSlug(linkSlug);
      const linkData = {
        slug,
        title: linkTitle.trim(),
        duration: parseInt(linkDuration),
        availability: { days: linkDays, startHour: parseInt(linkStartHour), endHour: parseInt(linkEndHour) },
        is_active: true,
      };

      if (editingLink) {
        const { error } = await supabase.from('scheduling_links').update(linkData).eq('id', editingLink.id);
        if (error) throw error;
        setSchedulingLinks(prev => prev.map(l => l.id === editingLink.id ? { ...l, ...linkData } : l));
        toast({ title: 'Link updated' });
      } else {
        const { data: existing } = await supabase.from('scheduling_links').select('id').eq('user_id', user.id).eq('slug', slug).maybeSingle();
        if (existing) {
          toast({ title: 'URL already in use', variant: 'destructive' });
          setSavingLink(false);
          return;
        }
        const { data, error } = await supabase.from('scheduling_links').insert({ ...linkData, user_id: user.id }).select().single();
        if (error) throw error;
        setSchedulingLinks(prev => [...prev, data]);
        
        // Auto-copy new link
        const url = `${window.location.origin}/book/${slug}`;
        navigator.clipboard.writeText(url);
        toast({ title: 'Link created & copied!' });
      }
      setShowLinkModal(false);
    } catch (err: any) {
      toast({ title: 'Error saving link', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingLink(false);
    }
  };

  const copyLink = useCallback((link: SchedulingLink) => {
    const url = `${window.location.origin}/book/${link.slug}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(link.id);
    toast({ title: 'Link copied!' });
    setTimeout(() => setLinkCopied(null), 2000);
  }, [toast]);

  const deleteLink = async (link: SchedulingLink) => {
    const { error } = await supabase.from('scheduling_links').delete().eq('id', link.id);
    if (!error) {
      setSchedulingLinks(prev => prev.filter(l => l.id !== link.id));
      toast({ title: 'Link deleted' });
    }
  };

  const createEvent = async () => {
    if (!newEventDate || !newEventTitle.trim()) return;
    setCreatingEvent(true);

    try {
      const [hours, minutes] = newEventTime.split(':').map(Number);
      const startTime = setMinutes(setHours(newEventDate, hours), minutes);
      const endTime = addMinutes(startTime, parseInt(newEventDuration));

      // Remove milliseconds from ISO string for Composio compatibility
      const startTimeISO = startTime.toISOString().split('.')[0] + 'Z';
      const endTimeISO = endTime.toISOString().split('.')[0] + 'Z';

      console.log('[MeetingsPanel] Creating event with:', {
        summary: newEventTitle,
        start_time: startTimeISO,
        end_time: endTimeISO,
        attendees: newEventAttendee ? [newEventAttendee] : [],
      });

      const { data, error } = await supabase.functions.invoke('composio-connect', {
        body: {
          action: 'create_event',
          summary: newEventTitle,
          start_time: startTimeISO,
          end_time: endTimeISO,
          attendees: newEventAttendee ? [newEventAttendee] : [],
          create_meet_link: true,
        },
      });

      console.log('[MeetingsPanel] Response:', { data, error });

      if (error) {
        console.error('[MeetingsPanel] Function invoke error:', error);
        toast({
          title: 'Failed to create meeting',
          description: error.message || 'Unknown error',
          variant: 'destructive'
        });
        return;
      }

      if (data?.error) {
        console.error('[MeetingsPanel] API error:', data.error);
        const errorMessage = typeof data.error === 'string'
          ? data.error
          : data.error?.message || JSON.stringify(data.error);
        toast({
          title: 'Failed to create meeting',
          description: errorMessage,
          variant: 'destructive'
        });
        return;
      }

      toast({ title: 'Meeting created!' });
      setShowNewEvent(false);
      setNewEventTitle('');
      setNewEventAttendee('');
      loadEvents();
    } catch (err) {
      console.error('[MeetingsPanel] Exception:', err);
      toast({
        title: 'Failed to create meeting',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive'
      });
    } finally {
      setCreatingEvent(false);
    }
  };

  // Computed
  const viewDays = useMemo(() => {
    if (viewMode === 'day') return [currentDate];
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate, viewMode]);

  const getEventsForDay = useCallback((date: Date) => {
    return events.filter(event => {
      try {
        return isSameDay(parseISO(event.start), date);
      } catch {
        return false;
      }
    });
  }, [events]);

  const getEventPosition = useCallback((event: CalendarEvent) => {
    try {
      const start = parseISO(event.start);
      const end = parseISO(event.end);
      const top = (start.getHours() + start.getMinutes() / 60) * HOUR_HEIGHT;
      const height = Math.max(differenceInMinutes(end, start) / 60 * HOUR_HEIGHT, 20);
      return { top, height };
    } catch {
      return { top: 0, height: HOUR_HEIGHT };
    }
  }, []);

  // Navigation
  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => setCurrentDate(viewMode === 'day' ? subDays(currentDate, 1) : subDays(currentDate, 7));
  const goNext = () => setCurrentDate(viewMode === 'day' ? addDays(currentDate, 1) : addDays(currentDate, 7));

  // Loading
  if (checkingConnection) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Main render
  return (
    <div className="flex flex-col h-full bg-background">
      {/* ========== BOOKING LINKS SECTION ========== */}
      <div className="px-6 py-6 border-b border-border/40">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Booking Links</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Share these links to let people book time with you
            </p>
          </div>
          <Button onClick={() => openLinkModal()} size="sm" className="h-9 px-4">
            <i className="fa-solid fa-plus mr-2 text-xs" />
            New Link
          </Button>
        </div>

        {/* Links */}
        {schedulingLinks.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border/60 rounded-xl bg-muted/20">
            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <i className="fa-solid fa-link text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No booking links yet</p>
            <Button onClick={() => openLinkModal()} variant="link" size="sm" className="mt-2 text-primary">
              Create your first link
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {schedulingLinks.map(link => (
              <div
                key={link.id}
                className="group flex items-center justify-between p-4 rounded-xl border border-border/50 bg-card hover:border-border hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    link.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    <i className="fa-solid fa-calendar text-sm" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{link.title}</span>
                      <span className="text-xs text-muted-foreground">{link.duration} min</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {window.location.origin}/book/{link.slug}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant={linkCopied === link.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => copyLink(link)}
                    className={cn(
                      "h-8 px-3 text-xs",
                      linkCopied === link.id && "bg-emerald-500 hover:bg-emerald-600 border-emerald-500"
                    )}
                  >
                    <i className={cn("fa-solid mr-1.5", linkCopied === link.id ? "fa-check" : "fa-copy")} />
                    {linkCopied === link.id ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openLinkModal(link)}
                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                  >
                    <i className="fa-solid fa-pen text-xs text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteLink(link)}
                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                  >
                    <i className="fa-solid fa-trash text-xs text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========== CALENDAR SECTION ========== */}
      {!isCalendarConnected ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
              <i className="fa-brands fa-google text-2xl text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Connect Google Calendar</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Sync your calendar to see events and add Google Meet links automatically
            </p>
            <Button onClick={connectCalendar} className="px-6">
              <i className="fa-brands fa-google mr-2" />
              Connect Calendar
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Calendar Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={goToday} className="h-8 text-xs">
                Today
              </Button>
              <div className="flex">
                <Button variant="ghost" size="sm" onClick={goPrev} className="h-8 w-8 p-0">
                  <i className="fa-solid fa-chevron-left text-xs" />
                </Button>
                <Button variant="ghost" size="sm" onClick={goNext} className="h-8 w-8 p-0">
                  <i className="fa-solid fa-chevron-right text-xs" />
                </Button>
              </div>
              <span className="text-sm font-medium">
                {viewMode === 'day'
                  ? format(currentDate, 'MMMM d, yyyy')
                  : `${format(viewDays[0], 'MMM d')} – ${format(viewDays[6], 'MMM d, yyyy')}`}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex border border-border rounded-lg overflow-hidden">
                {(['day', 'week'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                      viewMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                onClick={() => { setNewEventDate(currentDate); setShowNewEvent(true); }}
                className="h-8 px-3 text-xs"
              >
                <i className="fa-solid fa-plus mr-1.5" />
                New Event
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Day Headers */}
            <div className="flex shrink-0 border-b border-border/40">
              <div className="w-14 shrink-0" />
              <div className="flex-1 flex">
                {viewDays.map(day => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'flex-1 py-3 text-center border-l border-border/30 first:border-l-0',
                      isSameDay(day, new Date()) && 'bg-primary/5'
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {format(day, 'EEE')}
                    </div>
                    <div className={cn(
                      'text-lg font-medium mt-0.5',
                      isSameDay(day, new Date()) && 'text-primary'
                    )}>
                      {format(day, 'd')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Time Grid */}
            <ScrollArea className="flex-1">
              <div className="flex" style={{ height: HOUR_HEIGHT * 24 }}>
                {/* Time Labels */}
                <div className="w-14 shrink-0 relative">
                  {HOURS.map(hour => (
                    <div
                      key={hour}
                      className="absolute w-full text-[10px] text-muted-foreground/60 text-right pr-2"
                      style={{ top: hour * HOUR_HEIGHT - 5 }}
                    >
                      {hour === 0 ? '' : format(setHours(new Date(), hour), 'h a')}
                    </div>
                  ))}
                </div>

                {/* Days */}
                <div className="flex-1 flex">
                  {viewDays.map(day => (
                    <div
                      key={day.toISOString()}
                      className="flex-1 border-l border-border/30 first:border-l-0 relative"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const hour = Math.floor(y / HOUR_HEIGHT);
                        setNewEventDate(day);
                        setNewEventTime(`${hour.toString().padStart(2, '0')}:00`);
                        setShowNewEvent(true);
                      }}
                    >
                      {/* Hour lines */}
                      {HOURS.map(hour => (
                        <div
                          key={hour}
                          className="absolute w-full border-t border-border/20"
                          style={{ top: hour * HOUR_HEIGHT }}
                        />
                      ))}

                      {/* Current time line */}
                      {isSameDay(day, new Date()) && (
                        <div
                          className="absolute w-full flex items-center z-10 pointer-events-none"
                          style={{ top: (new Date().getHours() + new Date().getMinutes() / 60) * HOUR_HEIGHT }}
                        >
                          <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                          <div className="flex-1 h-0.5 bg-red-500" />
                        </div>
                      )}

                      {/* Events */}
                      {getEventsForDay(day).map(event => {
                        const { top, height } = getEventPosition(event);
                        return (
                          <div
                            key={event.id}
                            className={cn(
                              'absolute left-1 right-1 rounded-md px-2 py-1 text-[11px] cursor-pointer overflow-hidden',
                              'bg-primary/15 border-l-2 border-primary hover:bg-primary/25 transition-colors'
                            )}
                            style={{ top, height: Math.max(height, 22) }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (event.hangoutLink) window.open(event.hangoutLink, '_blank');
                            }}
                          >
                            <div className="font-medium truncate">{event.summary}</div>
                            {height > 30 && (
                              <div className="text-muted-foreground truncate">
                                {format(parseISO(event.start), 'h:mm a')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </div>
        </>
      )}

      {/* ========== MODALS ========== */}
      
      {/* New Event Modal */}
      <Dialog open={showNewEvent} onOpenChange={setShowNewEvent}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Event</DialogTitle>
            <DialogDescription>
              Create a new calendar event with Google Meet link
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Meeting title"
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={newEventDate ? format(newEventDate, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setNewEventDate(parseISO(e.target.value))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Input
                  type="time"
                  value={newEventTime}
                  onChange={(e) => setNewEventTime(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Duration</Label>
              <Select value={newEventDuration} onValueChange={setNewEventDuration}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 30, 45, 60, 90].map(d => (
                    <SelectItem key={d} value={String(d)}>{d} minutes</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Invite (optional)</Label>
              <Input
                type="email"
                value={newEventAttendee}
                onChange={(e) => setNewEventAttendee(e.target.value)}
                placeholder="email@example.com"
                className="mt-1.5"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              <i className="fa-brands fa-google text-blue-500" />
              Google Meet link will be added automatically
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowNewEvent(false)}>Cancel</Button>
              <Button onClick={createEvent} disabled={!newEventTitle.trim() || creatingEvent}>
                {creatingEvent ? 'Creating...' : 'Create Event'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link Settings Modal */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLink ? 'Edit Link' : 'New Booking Link'}</DialogTitle>
            <DialogDescription>
              {editingLink ? 'Update your booking link settings' : 'Create a shareable booking link for easy scheduling'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input
                value={linkTitle}
                onChange={(e) => {
                  setLinkTitle(e.target.value);
                  if (!editingLink) {
                    const base = user?.email?.split('@')[0] || 'meeting';
                    const suffix = e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                    setLinkSlug(sanitizeSlug(`${base}-${suffix}`));
                  }
                }}
                placeholder="30 Minute Meeting"
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">URL</Label>
              <div className="flex mt-1.5">
                <span className="px-3 py-2 text-sm text-muted-foreground bg-muted border border-r-0 rounded-l-md">
                  /book/
                </span>
                <Input
                  value={linkSlug}
                  onChange={(e) => setLinkSlug(sanitizeSlug(e.target.value))}
                  className="rounded-l-none"
                  placeholder="my-meeting"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Duration</Label>
              <div className="flex gap-2 mt-1.5">
                {[15, 30, 45, 60].map(d => (
                  <button
                    key={d}
                    onClick={() => setLinkDuration(String(d))}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                      linkDuration === String(d)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted'
                    )}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Available Days</Label>
              <div className="flex gap-1 mt-1.5">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                  <button
                    key={i}
                    onClick={() => setLinkDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i].sort())}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-xs font-medium border transition-colors',
                      linkDays.includes(i)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Start Time</Label>
                <Select value={linkStartHour} onValueChange={setLinkStartHour}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {format(setHours(new Date(), i), 'h:mm a')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">End Time</Label>
                <Select value={linkEndHour} onValueChange={setLinkEndHour}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {format(setHours(new Date(), i), 'h:mm a')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {linkSlug && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <p className="text-[10px] text-muted-foreground mb-1">Your booking link</p>
                <code className="text-xs">{window.location.origin}/book/{linkSlug}</code>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowLinkModal(false)}>Cancel</Button>
              <Button onClick={saveLink} disabled={!linkTitle.trim() || !linkSlug.trim() || savingLink}>
                {savingLink ? 'Saving...' : editingLink ? 'Save Changes' : 'Create Link'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MeetingsPanel;
