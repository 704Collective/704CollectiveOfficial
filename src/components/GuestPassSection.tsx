'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Gift, Send, ChevronDown, ChevronUp, Check, Clock, UserCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useGuestPassTickets, useMyRsvpdEvents } from '@/hooks/queries';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface GuestPassSectionProps {
  userId: string;
}

export function GuestPassSection({ userId }: GuestPassSectionProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const { data: passes = [], isLoading: passesLoading } = useGuestPassTickets(userId);
  const { data: rsvpdEvents = [], isLoading: eventsLoading } = useMyRsvpdEvents(userId);

  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Form state
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [eventId, setEventId] = useState<string>('');
  const [personalMessage, setPersonalMessage] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['guestPassTickets', userId] });
  };

  const handleSend = async () => {
    if (!guestFirstName.trim() || !guestLastName.trim()) {
      toast.error('Please enter the guest\'s first and last name');
      return;
    }
    if (!guestEmail.trim()) {
      toast.error('Please enter the guest\'s email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(guestEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (!eventId) {
      toast.error('Please select which event you\'re inviting them to');
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please sign in again'); return; }

      const { data, error } = await supabase.functions.invoke('create-guest-pass', {
        body: {
          guest_first_name: guestFirstName.trim(),
          guest_last_name: guestLastName.trim(),
          guest_email: guestEmail.trim().toLowerCase(),
          event_id: eventId,
          personal_message: personalMessage.trim() || null,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error || data?.error) {
        toast.error(data?.error || 'Failed to send guest pass');
        return;
      }

      toast.success(`Guest pass sent to ${guestFirstName}! They'll receive a QR code by email.`);
      setGuestFirstName('');
      setGuestLastName('');
      setGuestEmail('');
      setEventId('');
      setPersonalMessage('');
      invalidate();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSending(false);
    }
  };

  const statusBadge = (status: string, checkedInAt: string | null) => {
    if (checkedInAt || status === 'checked_in') {
      return <Badge variant="outline" className="text-green-600 border-green-300"><UserCheck className="w-3 h-3 mr-1" />Attended</Badge>;
    }
    switch (status) {
      case 'confirmed': return <Badge variant="outline" className="text-blue-500 border-blue-400"><Clock className="w-3 h-3 mr-1" />Invited</Badge>;
      case 'used':      return <Badge variant="outline" className="text-green-600 border-green-300"><Check className="w-3 h-3 mr-1" />Used</Badge>;
      default:          return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (passesLoading || eventsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const recentPasses = passes.slice(0, 5);
  const olderPasses = passes.slice(5);

  return (
    <div id="guest-pass-section" className="card-elevated p-4 sm:p-5 space-y-4">
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-2">
        <Gift className="w-3.5 h-3.5" />
        Invite a Friend
      </h3>

      <p className="text-sm text-muted-foreground">
        Share a free guest pass! Your friend will receive a QR code by email for event entry.
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="guest-first" className="text-sm">First Name *</Label>
            <Input
              id="guest-first"
              placeholder="Jane"
              value={guestFirstName}
              onChange={(e) => setGuestFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-last" className="text-sm">Last Name *</Label>
            <Input
              id="guest-last"
              placeholder="Smith"
              value={guestLastName}
              onChange={(e) => setGuestLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="guest-email" className="text-sm">Guest Email *</Label>
          <Input
            id="guest-email"
            type="email"
            placeholder="friend@email.com"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Which Event? *</Label>
          {rsvpdEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              You need to RSVP to an event first before inviting a guest.
            </p>
          ) : (
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an event you're attending" />
              </SelectTrigger>
              <SelectContent>
                {rsvpdEvents.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.title} - {format(new Date(event.start_time), 'MMM d')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="personal-message" className="text-sm">
            Personal Message <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="personal-message"
            placeholder="Looking forward to seeing you there!"
            value={personalMessage}
            onChange={(e) => setPersonalMessage(e.target.value.slice(0, 200))}
            rows={2}
            className="resize-none"
          />
          {personalMessage.length > 0 && (
            <p className="text-xs text-muted-foreground text-right">{personalMessage.length}/200</p>
          )}
        </div>

        <Button
          className="w-full"
          onClick={handleSend}
          disabled={sending || rsvpdEvents.length === 0}
        >
          <Send className="w-4 h-4 mr-2" />
          {sending ? 'Sending...' : 'Send Guest Pass'}
        </Button>
      </div>

      {passes.length > 0 && (
        <div className="pt-2 border-t border-border space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Sent Passes</p>
          {recentPasses.map((pass) => (
            <div key={pass.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
              <div className="min-w-0">
                <span className="font-medium truncate block">{pass.guest_name}</span>
                <span className="text-xs text-muted-foreground">
                  {pass.created_at ? format(new Date(pass.created_at), 'MMM d, yyyy') : ''}
                </span>
              </div>
              {statusBadge(pass.status, pass.checked_in_at)}
            </div>
          ))}

          {olderPasses.length > 0 && (
            <Collapsible open={showHistory} onOpenChange={setShowHistory}>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-full justify-center pt-1">
                {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showHistory ? 'Show less' : `Show ${olderPasses.length} more`}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                {olderPasses.map((pass) => (
                  <div key={pass.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                    <div className="min-w-0">
                      <span className="font-medium truncate block">{pass.guest_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {pass.created_at ? format(new Date(pass.created_at), 'MMM d, yyyy') : ''}
                      </span>
                    </div>
                    {statusBadge(pass.status, pass.checked_in_at)}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}
