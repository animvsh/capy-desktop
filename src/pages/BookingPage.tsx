/**
 * BookingPage - Premium Cal.com-style booking experience
 * Polished, professional, with delightful micro-interactions
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  format,
  addDays,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  isAfter,
  isBefore,
  parseISO,
  setHours,
  setMinutes,
  addMinutes,
} from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import capyLogo from '@/assets/capy-logo.png';

interface SchedulingLink {
  id: string;
  user_id: string;
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

interface TimeSlot {
  time: Date;
  formatted: string;
  available: boolean;
}

interface Booking {
  start_time: string;
  end_time: string;
}

interface BusyTime {
  start: string;
  end: string;
  summary?: string;
}

// Confetti particle component for success celebration
function Confetti() {
  const particles = useMemo(() => {
    const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181', '#AA96DA', '#FCBAD3'];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      color: colors[Math.floor(Math.random() * colors.length)],
      left: `${Math.random() * 100}%`,
      delay: Math.random() * 0.5,
      duration: 2 + Math.random() * 2,
      size: 6 + Math.random() * 8,
      rotation: Math.random() * 360,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti"
          style={{
            left: p.left,
            top: '-20px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti-fall linear forwards;
        }
      `}</style>
    </div>
  );
}

// Animated loading dots
function LoadingDots() {
  return (
    <div className="flex items-center gap-1">
      <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [link, setLink] = useState<SchedulingLink | null>(null);
  const [hostName, setHostName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [existingBookings, setExistingBookings] = useState<Booking[]>([]);
  const [calendarBusyTimes, setCalendarBusyTimes] = useState<BusyTime[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);

  const [use24h, setUse24h] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [bookedDetails, setBookedDetails] = useState<{
    time: string;
    meetLink?: string;
  } | null>(null);

  // Animation states
  const [calendarMounted, setCalendarMounted] = useState(false);

  useEffect(() => {
    loadSchedulingLink();
    // Trigger mount animation
    setTimeout(() => setCalendarMounted(true), 100);
  }, [slug]);

  useEffect(() => {
    if (selectedDate && link) {
      loadBookingsForDate();
    }
  }, [selectedDate, link]);

  const loadSchedulingLink = async () => {
    if (!slug) {
      setError('Invalid booking link');
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('scheduling_links')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (fetchError || !data) {
        setError('This booking link is not available');
        setLoading(false);
        return;
      }

      setLink(data as SchedulingLink);

      // Get host profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, id')
        .eq('id', data.user_id)
        .single();

      if (profile?.full_name) {
        setHostName(profile.full_name);
      } else {
        const name = slug.split('-')[0];
        setHostName(name.charAt(0).toUpperCase() + name.slice(1));
      }
    } catch (err) {
      console.error('Error loading scheduling link:', err);
      setError('Failed to load booking page');
    } finally {
      setLoading(false);
    }
  };

  const loadBookingsForDate = async () => {
    if (!selectedDate || !link) return;
    setLoadingSlots(true);

    try {
      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = addDays(dayStart, 1);

      // Fetch both existing bookings AND the host's calendar busy times
      const [bookingsResult, availabilityResult] = await Promise.all([
        supabase
          .from('bookings')
          .select('start_time, end_time')
          .eq('scheduling_link_id', link.id)
          .eq('status', 'confirmed')
          .gte('start_time', dayStart.toISOString())
          .lt('start_time', dayEnd.toISOString()),
        supabase.functions.invoke('check-availability', {
          body: {
            host_user_id: link.user_id,
            start_date: dayStart.toISOString(),
            end_date: dayEnd.toISOString(),
          },
        }).catch((err) => {
          console.warn('Availability check failed:', err);
          return { data: { busy_times: [], calendar_connected: false } };
        }),
      ]);

      setExistingBookings(bookingsResult.data || []);
      
      // Set calendar busy times if available
      if (availabilityResult?.data) {
        setCalendarBusyTimes(availabilityResult.data.busy_times || []);
        setCalendarConnected(availabilityResult.data.calendar_connected || false);
      }
    } catch (err) {
      console.error('Error loading bookings:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });

    const days: Date[] = [];
    let day = start;
    while (day <= end) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const isDateAvailable = useCallback((date: Date) => {
    if (!link) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isBefore(date, today)) return false;
    if (isAfter(date, addDays(today, 60))) return false;

    return link.availability.days.includes(date.getDay());
  }, [link]);

  const timeSlots = useMemo(() => {
    if (!selectedDate || !link) return [];

    const slots: TimeSlot[] = [];
    const { startHour, endHour } = link.availability;
    const now = new Date();

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotTime = setMinutes(setHours(selectedDate, hour), minute);

        if (isBefore(slotTime, now)) continue;

        const slotEnd = addMinutes(slotTime, link.duration);
        
        // Check against existing bookings in our database
        const isOccupiedByBooking = existingBookings.some((b) => {
          const bookingStart = parseISO(b.start_time);
          const bookingEnd = parseISO(b.end_time);
          return (
            (isAfter(slotTime, bookingStart) && isBefore(slotTime, bookingEnd)) ||
            (isAfter(slotEnd, bookingStart) && isBefore(slotEnd, bookingEnd)) ||
            (isBefore(slotTime, bookingStart) && isAfter(slotEnd, bookingEnd)) ||
            slotTime.getTime() === bookingStart.getTime()
          );
        });

        // Check against host's Google Calendar busy times
        const isOccupiedByCalendar = calendarBusyTimes.some((busy) => {
          try {
            const busyStart = parseISO(busy.start);
            const busyEnd = parseISO(busy.end);
            return (
              (isAfter(slotTime, busyStart) && isBefore(slotTime, busyEnd)) ||
              (isAfter(slotEnd, busyStart) && isBefore(slotEnd, busyEnd)) ||
              (isBefore(slotTime, busyStart) && isAfter(slotEnd, busyEnd)) ||
              slotTime.getTime() === busyStart.getTime()
            );
          } catch {
            return false;
          }
        });

        const isOccupied = isOccupiedByBooking || isOccupiedByCalendar;

        slots.push({
          time: slotTime,
          formatted: use24h ? format(slotTime, 'HH:mm') : format(slotTime, 'h:mm a'),
          available: !isOccupied,
        });
      }
    }

    return slots;
  }, [selectedDate, link, existingBookings, calendarBusyTimes, use24h]);

  const handleBook = async () => {
    if (!link || !selectedSlot || !guestName.trim() || !guestEmail.trim()) return;

    setBooking(true);

    try {
      const startTime = selectedSlot.time;
      const endTime = addMinutes(startTime, link.duration);

      // Create booking in database
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          scheduling_link_id: link.id,
          host_user_id: link.user_id,
          guest_name: guestName,
          guest_email: guestEmail,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          notes: notes || null,
          status: 'confirmed',
        })
        .select()
        .single();

      if (bookingError) {
        console.error('Booking error:', bookingError);
        throw bookingError;
      }

      // Call edge function to create calendar event and send email
      let meetLink: string | undefined;
      try {
        const { data: eventData, error: fnError } = await supabase.functions.invoke('create-booking-event', {
          body: {
            booking_id: bookingData.id,
            host_user_id: link.user_id,
            summary: `${link.title} with ${guestName}`,
            description: `Booked via Capy\n\nGuest: ${guestName} (${guestEmail})${notes ? `\n\nNotes: ${notes}` : ''}`,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            attendee_email: guestEmail,
            guest_name: guestName,
          },
        });

        if (!fnError && eventData?.event?.hangoutLink) {
          meetLink = eventData.event.hangoutLink;
        }
      } catch (calError) {
        console.error('Calendar event error:', calError);
      }

      setBookedDetails({
        time: format(startTime, 'EEEE, MMMM d, yyyy \'at\' h:mm a'),
        meetLink,
      });
      setBooked(true);
      setShowConfetti(true);
      
      // Stop confetti after 3 seconds
      setTimeout(() => setShowConfetti(false), 3000);
      
      toast({ title: 'Meeting booked successfully!' });
    } catch (err) {
      console.error('Booking error:', err);
      toast({ title: 'Failed to book meeting', variant: 'destructive' });
    } finally {
      setBooking(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <img src={capyLogo} alt="Capy" className="w-16 h-16 animate-bounce" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Loading</span>
            <LoadingDots />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center">
          <div className="relative bg-card border border-border rounded-2xl p-8 shadow-lg">
            {/* Logo */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <img src={capyLogo} alt="Capy" className="w-8 h-8 opacity-50" />
              <span className="text-lg font-semibold text-muted-foreground">Capy</span>
            </div>
            
            {/* Error icon */}
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
              <i className="fa-solid fa-link-slash text-2xl text-destructive/60" />
            </div>
            
            <h1 className="text-xl font-semibold text-foreground mb-2">Link Not Found</h1>
            <p className="text-muted-foreground text-sm mb-6">{error}</p>
            
            <Button 
              onClick={() => navigate('/')} 
              variant="outline" 
              className="rounded-xl border-border/50 hover:bg-muted/50 transition-all duration-200"
            >
              <i className="fa-solid fa-home mr-2 text-xs" />
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (booked && bookedDetails) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        {showConfetti && <Confetti />}
        
        <div className="relative max-w-md w-full animate-fade-in">
          {/* Capy Header */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <img src={capyLogo} alt="Capy" className="w-10 h-10" />
            <span className="text-xl font-bold text-foreground">
              Capy
            </span>
          </div>

          <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
            {/* Success Icon with animation */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center">
                <i className="fa-solid fa-check text-3xl text-white animate-scale-in" />
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-foreground mb-2">You're all set!</h1>
              <p className="text-muted-foreground">
                A calendar invitation has been sent to your email
              </p>
            </div>

            {/* Meeting Details Card */}
            <div className="bg-muted/30 rounded-xl p-5 mb-6 border border-border/30">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center text-primary font-bold text-lg">
                  {hostName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-foreground font-semibold">{link?.title}</div>
                  <div className="text-muted-foreground text-sm">with {hostName}</div>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3 text-foreground">
                  <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <i className="fa-regular fa-calendar text-primary" />
                  </div>
                  <span>{bookedDetails.time}</span>
                </div>
                <div className="flex items-center gap-3 text-foreground">
                  <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <i className="fa-regular fa-clock text-primary" />
                  </div>
                  <span>{link?.duration} minutes</span>
                </div>
                {bookedDetails.meetLink && (
                  <a
                    href={bookedDetails.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-blue-400 hover:text-blue-300 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                      <i className="fa-solid fa-video text-blue-400" />
                    </div>
                    <span>Join with Google Meet</span>
                    <i className="fa-solid fa-arrow-up-right-from-square text-xs opacity-60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </a>
                )}
              </div>
            </div>

            {/* Email Notice */}
            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <i className="fa-solid fa-envelope text-primary/60" />
              <span>Confirmation sent to <span className="text-foreground">{guestEmail}</span></span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col items-center gap-3 mt-8">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <span>Powered by</span>
              <img src={capyLogo} alt="Capy" className="w-5 h-5" />
              <span className="font-semibold text-foreground">Capy</span>
            </div>
            <p className="text-xs text-muted-foreground/60">
              AI-powered outreach that books meetings for you
            </p>
          </div>
        </div>
        
        <style>{`
          @keyframes scale-in {
            0% { transform: scale(0); }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); }
          }
          .animate-scale-in {
            animation: scale-in 0.5s ease-out forwards;
          }
        `}</style>
      </div>
    );
  }

  // Main booking UI
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative max-w-5xl mx-auto p-4 py-8 md:py-12">
        {/* Capy Header */}
        <div 
          className={cn(
            "flex items-center justify-center gap-3 mb-8 transition-all duration-500",
            calendarMounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
          )}
        >
          <img src={capyLogo} alt="Capy" className="w-10 h-10 group-hover:scale-110 transition-transform" />
          <span className="text-2xl font-bold text-foreground">
            Capy
          </span>
          <span className="text-xs text-primary/80 bg-primary/10 px-3 py-1 rounded-full font-medium border border-primary/20">
            Scheduling
          </span>
        </div>

        {/* Main Card */}
        <div 
          className={cn(
            "bg-card border border-border rounded-2xl overflow-hidden shadow-lg transition-all duration-700",
            calendarMounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}
        >
          <div className="grid md:grid-cols-[300px_1fr_280px]">
            
            {/* Left Panel - Host Info */}
            <div className="p-6 md:p-8 border-b md:border-b-0 md:border-r border-border/30 bg-muted/10">
              {/* Avatar */}
              <div className="w-14 h-14 mb-6 rounded-xl bg-primary/20 flex items-center justify-center text-xl font-bold text-primary border border-primary/20">
                {hostName.charAt(0).toUpperCase()}
              </div>

              {/* Host Name & Title */}
              <div className="mb-6">
                <p className="text-muted-foreground text-sm mb-1">{hostName}</p>
                <h1 className="text-2xl font-bold text-foreground leading-tight">{link?.title}</h1>
              </div>

              {/* Description */}
              {link?.description && (
                <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                  {link.description}
                </p>
              )}

              {/* Meta Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center">
                    <i className="fa-regular fa-clock text-primary" />
                  </div>
                  <span className="text-foreground font-medium">{link?.duration} minutes</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <i className="fa-solid fa-video text-blue-400" />
                  </div>
                  <span className="text-foreground font-medium">Google Meet</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center">
                    <i className="fa-solid fa-globe text-muted-foreground" />
                  </div>
                  <span className="text-muted-foreground text-xs truncate max-w-[160px]">
                    {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Middle Panel - Calendar */}
            <div className="p-6 md:p-8 border-b md:border-b-0 md:border-r border-border/30">
              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-foreground">
                  {format(currentMonth, 'MMMM yyyy')}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    className="w-9 h-9 rounded-xl bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 group"
                  >
                    <i className="fa-solid fa-chevron-left text-xs text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>
                  <button
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="w-9 h-9 rounded-xl bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 group"
                  >
                    <i className="fa-solid fa-chevron-right text-xs text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div 
                    key={day} 
                    className="text-center text-[11px] text-muted-foreground/60 py-2 font-semibold uppercase tracking-wider"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isAvailable = isDateAvailable(day);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={i}
                      onClick={() => isAvailable && isCurrentMonth && setSelectedDate(day)}
                      disabled={!isAvailable || !isCurrentMonth}
                      className={cn(
                        'aspect-square rounded-xl text-sm font-medium transition-all duration-200 relative',
                        !isCurrentMonth && 'text-muted-foreground/20 cursor-default',
                        isCurrentMonth && !isAvailable && 'text-muted-foreground/30 cursor-not-allowed',
                        isCurrentMonth && isAvailable && !isSelected && 'text-foreground hover:bg-primary/10 hover:text-primary cursor-pointer hover:scale-105 active:scale-95',
                        isSelected && 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-105',
                        isToday && !isSelected && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-card'
                      )}
                    >
                      {format(day, 'd')}
                      {isAvailable && isCurrentMonth && !isSelected && (
                        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary/40" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Panel - Time Slots or Form */}
            <div className="p-6 md:p-8 bg-muted/5">
              {!selectedDate ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 min-h-[320px]">
                  <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                    <i className="fa-regular fa-calendar text-3xl text-muted-foreground/30" />
                  </div>
                  <p className="text-muted-foreground/60 text-sm font-medium">Select a date to see available times</p>
                </div>
              ) : selectedSlot ? (
                /* Guest Form */
                <div className="space-y-5 animate-fade-in">
                  <button
                    onClick={() => setSelectedSlot(null)}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-all duration-200 group"
                  >
                    <i className="fa-solid fa-arrow-left text-xs group-hover:-translate-x-1 transition-transform" />
                    <span>Back to times</span>
                  </button>

                  {/* Selected Time Badge */}
                  <div className="py-4 border-b border-border/30">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg border border-primary/20">
                      <i className="fa-regular fa-clock text-xs text-primary" />
                      <span className="text-sm font-medium text-foreground">
                        {format(selectedSlot.time, 'EEE, MMM d')} · {selectedSlot.formatted}
                      </span>
                    </div>
                  </div>

                  {/* Form */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Your Name <span className="text-primary">*</span>
                      </Label>
                      <Input
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="John Doe"
                        className="h-11 rounded-xl bg-muted/30 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Email <span className="text-primary">*</span>
                      </Label>
                      <Input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="h-11 rounded-xl bg-muted/30 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Notes <span className="text-muted-foreground/50">(optional)</span>
                      </Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Share anything that'll help prepare for our meeting"
                        className="h-24 resize-none rounded-xl bg-muted/30 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleBook}
                    disabled={!guestName.trim() || !guestEmail.trim() || booking}
                    className="w-full h-12 font-semibold rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300 disabled:opacity-50 disabled:shadow-none"
                  >
                    {booking ? (
                      <span className="flex items-center gap-2">
                        <i className="fa-solid fa-spinner fa-spin" />
                        Scheduling...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <i className="fa-regular fa-calendar-check" />
                        Confirm Booking
                      </span>
                    )}
                  </Button>
                </div>
              ) : (
                /* Time Slots */
                <div className="space-y-5 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground">{format(selectedDate, 'EEEE')}</div>
                      <div className="text-muted-foreground text-sm">{format(selectedDate, 'MMMM d, yyyy')}</div>
                    </div>
                    <div className="flex text-xs rounded-lg overflow-hidden border border-border/50">
                      <button
                        onClick={() => setUse24h(false)}
                        className={cn(
                          'px-3 py-1.5 transition-all duration-200',
                          !use24h 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        12h
                      </button>
                      <button
                        onClick={() => setUse24h(true)}
                        className={cn(
                          'px-3 py-1.5 transition-all duration-200',
                          use24h 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted/30 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        24h
                      </button>
                    </div>
                  </div>

                  {loadingSlots ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full border-2 border-primary/20" />
                        <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      </div>
                      <span className="text-muted-foreground text-sm">Loading times...</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 scrollbar-hide">
                      {timeSlots.filter(s => s.available).length === 0 ? (
                        <div className="text-center py-16">
                          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-muted/30 flex items-center justify-center">
                            <i className="fa-regular fa-calendar-xmark text-2xl text-muted-foreground/30" />
                          </div>
                          <p className="text-muted-foreground font-medium">No times available</p>
                          <p className="text-muted-foreground/60 text-sm mt-1">Try selecting another date</p>
                        </div>
                      ) : (
                        timeSlots.filter(s => s.available).map((slot, index) => (
                          <button
                            key={slot.formatted}
                            onClick={() => setSelectedSlot(slot)}
                            className="w-full group relative"
                            style={{ animationDelay: `${index * 30}ms` }}
                          >
                            <div className="absolute inset-0 bg-primary/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                            <div className="relative py-3 px-4 rounded-xl border border-border/40 group-hover:border-primary/50 text-foreground group-hover:text-primary transition-all duration-200 text-sm font-medium flex items-center justify-between">
                              <span>{slot.formatted}</span>
                              <i className="fa-solid fa-arrow-right text-xs opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div 
          className={cn(
            "flex flex-col items-center gap-3 mt-10 pb-6 transition-all duration-700 delay-300",
            calendarMounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
        >
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span>Powered by</span>
            <img src={capyLogo} alt="Capy" className="w-5 h-5" />
            <span className="font-semibold text-foreground">Capy</span>
          </div>
          <p className="text-xs text-muted-foreground/60 text-center">
            AI-powered outreach that books meetings for you
          </p>
          <a 
            href="https://capy.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors group"
          >
            <span>Get your own scheduling link</span>
            <i className="fa-solid fa-arrow-right text-[10px] group-hover:translate-x-0.5 transition-transform" />
          </a>
        </div>
      </div>
    </div>
  );
}
