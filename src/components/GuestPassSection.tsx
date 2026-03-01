'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Gift, Send, X, RotateCcw, ChevronDown, ChevronUp, Check, Clock, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GuestPass {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  event_id: string | null;
  qr_code: string;
  status: string;
  created_at: string;
  used_at: string | null;
  expires_at: string;
  month_year: string;
}

interface UpcomingEvent {
  id: string;
  title: string;
  start_time: string;
}

interface GuestPassSectionProps {
  userId: string;
}

export function GuestPassSection({ userId }: GuestPassSectionProps) {
  const [passes, setPasses] = useState<GuestPass[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Form state
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [eventId, setEventId] = useState<string>('general');

  const currentMonthYear = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const currentMonthLabel = format(new Date(), 'MMMM yyyy');

  const currentMonthPass = passes.find(
    (p) => p.month_year === currentMonthYear && p.status !== 'cancelled'
  );
  const passUsedThisMonth = !!currentMonthPass;
  const pastPasses = passes.filter(
    (p) => p.month_year !== currentMonthYear || p.status === 'cancelled'
  );

  useEffect(() => {
    fetchData();
  }, [userId]);

  const fetchData = async () => {
    setLoading(true);
    const [passesRes, eventsRes] = await Promise.all([
      supabase
        .from('guest_passes')
        .select('*')
        .eq('member_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('events')
        .select('id, title, start_time')
        .gte('start_time', new Date().toISOString())
        .eq('allows_guest_passes', true)
        .order('start_time', { ascending: true })
        .limit(20),
    ]);

    if (passesRes.data) setPasses(passesRes.data as GuestPass[]);
    if (eventsRes.data) setEvents(eventsRes.data);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!guestName.trim() || !guestEmail.trim()) {
      toast.error('Please enter guest name and email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guestEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-guest-pass', {
        body: {
          guest_name: guestName.trim(),
          guest_email: guestEmail.trim(),
          guest_phone: guestPhone.trim() || null,
          event_id: eventId === 'general' ? null : eventId,
        },
      });

      if (error) {
        toast.error('Failed to send guest pass');
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success(`Guest pass sent to ${guestName}!`);
      setGuestName('');
      setGuestEmail('');
      setGuestPhone('');
      setEventId('general');
      fetchData();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async (passId: string) => {
    const { error } = await supabase
      .from('guest_passes')
      .update({ status: 'cancelled' })
      .eq('id', passId);

    if (error) {
      toast.error('Failed to cancel pass');
      return;
    }

    toast.success('Guest pass cancelled');
    fetchData();
  };

  const handleResend = async (pass: GuestPass) => {
    try {
      // Fetch event details if needed
      let eventName = null;
      let eventDate = null;
      let eventTime = null;
      let eventLocation = null;

      if (pass.event_id) {
        const { data: event } = await supabase
          .from('events')
          .select('title, start_time, end_time, location_name, location_address')
          .eq('id', pass.event_id)
          .single();

        if (event) {
          eventName = event.title;
          const startDate = new Date(event.start_time);
          eventDate = startDate.toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          });
          eventTime = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          eventLocation = [event.location_name, event.location_address].filter(Boolean).join(', ');
        }
      }

      // Get member name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .is('deleted_at', null)
        .single();

      const expiresDate = new Date(pass.expires_at).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });

      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: pass.guest_email,
          template: 'guest-pass',
          data: {
            guestName: pass.guest_name,
            memberName: profile?.full_name || 'A member',
            eventName,
            eventDate,
            eventTime,
            eventLocation,
            passCode: pass.qr_code,
            expiresDate,
          },
        },
      });

      if (error) {
        toast.error('Failed to resend email');
        return;
      }

      toast.success(`Email resent to ${pass.guest_email}`);
    } catch {
      toast.error('Something went wrong');
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'used':
        return <Badge variant="outline" className="text-green-600 border-green-300"><Check className="w-3 h-3 mr-1" />Used</Badge>;
      case 'expired':
        return <Badge variant="outline" className="text-muted-foreground"><XCircle className="w-3 h-3 mr-1" />Expired</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-red-600 border-red-300"><X className="w-3 h-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div id="guest-pass-section" className="card-elevated p-4 sm:p-5 space-y-4">
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-2">
        <Gift className="w-3.5 h-3.5" />
        Invite a Friend
      </h3>
        {/* Usage indicator */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {passUsedThisMonth ? '1/1' : '0/1'} used in {currentMonthLabel}
          </p>
          {passUsedThisMonth && currentMonthPass?.status === 'pending' && (
            <Badge variant="secondary" className="text-xs">Pass Active</Badge>
          )}
        </div>

        {passUsedThisMonth && currentMonthPass ? (
          /* Show current pass details */
          <div className="space-y-3">
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{currentMonthPass.guest_name}</p>
                  <p className="text-sm text-muted-foreground">{currentMonthPass.guest_email}</p>
                </div>
                {statusBadge(currentMonthPass.status)}
              </div>

              {currentMonthPass.status === 'pending' && (
                <div className="flex justify-center py-2">
                  <QRCodeSVG value={currentMonthPass.qr_code} size={120} />
                </div>
              )}

              <p className="text-xs text-center text-muted-foreground font-mono">
                {currentMonthPass.qr_code}
              </p>

              {currentMonthPass.status === 'pending' && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleResend(currentMonthPass)}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Resend Email
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => handleCancel(currentMonthPass.id)}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              )}

              {currentMonthPass.status === 'used' && currentMonthPass.used_at && (
                <p className="text-xs text-muted-foreground text-center">
                  Used on {format(new Date(currentMonthPass.used_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Your guest pass resets next month.
            </p>
          </div>
        ) : (
          /* Show invite form */
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share a free guest pass with a friend! They'll get a QR code to show at check-in.
            </p>

            <div className="space-y-2">
              <Label htmlFor="guest-name" className="text-sm">Guest Name *</Label>
              <Input
                id="guest-name"
                placeholder="Their full name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="guest-email" className="text-sm">Guest Email *</Label>
              <Input
                id="guest-email"
                type="email"
                placeholder="friend@email.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="guest-phone" className="text-sm">Phone (optional)</Label>
              <Input
                id="guest-phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Which event?</Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an event (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Pass (any event this month)</SelectItem>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title} — {format(new Date(event.start_time), 'MMM d')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              onClick={handleSend}
              disabled={sending}
            >
              <Send className="w-4 h-4 mr-2" />
              {sending ? 'Sending...' : 'Send Guest Pass'}
            </Button>
          </div>
        )}

        {/* Pass history */}
        {pastPasses.length > 0 && (
          <Collapsible open={showHistory} onOpenChange={setShowHistory}>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-full justify-center pt-2">
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Past Guest Passes ({pastPasses.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-2">
              {pastPasses.map((pass) => (
                <div
                  key={pass.id}
                  className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0"
                >
                  <div>
                    <span className="font-medium">{pass.guest_name}</span>
                    <span className="text-muted-foreground ml-2">
                      {format(new Date(pass.created_at), 'MMM yyyy')}
                    </span>
                  </div>
                  {statusBadge(pass.status)}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
    </div>
  );
}
