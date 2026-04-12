'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SmartDateTimePicker } from '@/components/SmartDateTimePicker';
import { RecurrenceSelector, RecurrenceRule, parseRecurrenceRule } from '@/components/RecurrenceSelector';
import { EventCategory, CATEGORY_CONFIG, detectCategoryFromTitle } from '@/components/CategoryBadge';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { AddMembersToEventDialog } from '@/components/admin/AddMembersToEventDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, getDay, getDate } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Calendar, Plus, Pencil, Trash2, Search, Copy, Lock,
  ChevronLeft, ChevronRight, MoreHorizontal, ArrowLeft, Upload, X as XIcon, Gift, Mail, Check, UserPlus, Bell, ExternalLink, Send, Loader2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  location_name: string | null;
  location_address: string | null;
  image_url: string | null;
  capacity: number | null;
  is_members_only: boolean;
  is_business_only: boolean;
  ticket_price: number;
  created_at: string;
  category: string | null;
  recurrence_rule: string | null;
  parent_event_id: string | null;
  tags: string[] | null;
  allows_guest_passes: boolean;
  eventbrite_event_id: string | null;
  eventbrite_published: boolean | null;
  eventbrite_url: string | null;
}

interface EventForm {
  title: string;
  description: string;
  start_time: Date | undefined;
  end_time: Date | undefined;
  location_name: string;
  location_address: string;
  image_url: string;
  capacity: string;
  visibility: 'public' | 'members_only' | 'business_only';
  ticket_price: string;
  category: EventCategory;
  recurrence_rule: RecurrenceRule;
  recurrence_end_type: 'occurrences' | 'date';
  recurrence_occurrences: number;
  recurrence_end_date: string;
  tags: string[];
  allows_guest_passes: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const getDefaultStartTime = (): Date => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; };
const getDefaultEndTime = (s: Date): Date => { const e = new Date(s); e.setHours(e.getHours() + 2); return e; };
const getDefaultEventForm = (): EventForm => ({
  title: '', description: '', start_time: getDefaultStartTime(), end_time: getDefaultEndTime(getDefaultStartTime()),
  location_name: '', location_address: '', image_url: '', capacity: '', visibility: 'members_only' as const, ticket_price: '0',
  category: 'other', recurrence_rule: 'none', recurrence_end_type: 'occurrences', recurrence_occurrences: 4,
  recurrence_end_date: '', tags: [], allows_guest_passes: true,
});

const PAGE_SIZE = 20;
const EVENTS_STALE_TIME = 5 * 60 * 1000;

// ── Data fetching ────────────────────────────────────────────────────────────
async function fetchEventsData(page: number, filter: 'all' | 'upcoming' | 'past') {
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;
  const now = new Date().toISOString();

  let query = supabase.from('events').select('*', { count: 'exact' }).order('start_time', { ascending: filter !== 'past' });
  if (filter === 'upcoming') query = query.gte('start_time', now);
  else if (filter === 'past') query = query.lt('start_time', now);

  const { data, error, count } = await query.range(start, end);
  if (error) throw error;

  const events = (data || []) as Event[];
  const ids = events.map(e => e.id);
  const rsvpCounts: Record<string, number> = {};
  const followupCounts: Record<string, number> = {};

  if (ids.length > 0) {
    const [ticketsRes, followupsRes] = await Promise.all([
      supabase.from('tickets').select('event_id').in('event_id', ids).in('status', ['confirmed', 'rsvp']),
      supabase.from('guest_passes').select('event_id').in('event_id', ids).eq('status', 'used').is('followup_sent_at' as any, null),
    ]);
    (ticketsRes.data || []).forEach(t => { if (t.event_id) rsvpCounts[t.event_id] = (rsvpCounts[t.event_id] || 0) + 1; });
    (followupsRes.data || []).forEach(g => { if (g.event_id) followupCounts[g.event_id] = (followupCounts[g.event_id] || 0) + 1; });
  }

  return { events, totalCount: count || 0, rsvpCounts, followupCounts };
}

interface AdminEventsTabProps {
  onNavigateToDashboard: () => void;
}

export function AdminEventsTab({ onNavigateToDashboard }: AdminEventsTabProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  // UI state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [form, setForm] = useState<EventForm>(getDefaultEventForm());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteInEditOpen, setDeleteInEditOpen] = useState(false);
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [addMembersEvent, setAddMembersEvent] = useState<Event | null>(null);
  const [sentReminders, setSentReminders] = useState<Record<string, boolean>>({});
  // Tracks which event IDs are currently mid-toggle to show loading state
  const [eventbriteLoading, setEventbriteLoading] = useState<Record<string, boolean>>({});

  // Message Attendees dialog state
  const [messageEvent, setMessageEvent] = useState<Event | null>(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  // ── React Query ──────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-events', page, filter],
    queryFn: () => fetchEventsData(page, filter),
    staleTime: EVENTS_STALE_TIME,
  });

  const events = data?.events ?? [];
  const totalCount = data?.totalCount ?? 0;
  const rsvpCounts = data?.rsvpCounts ?? {};
  const followupCounts = data?.followupCounts ?? {};
  const [sentFollowups, setSentFollowups] = useState<Record<string, boolean>>({});

  const invalidateEvents = () => queryClient.invalidateQueries({ queryKey: ['admin-events'] });

  // ── Eventbrite toggle mutation ───────────────────────────────────────────
  const eventbriteMutation = useMutation({
    mutationFn: async ({ event_id, action }: { event_id: string; action: 'publish' | 'unpublish' }) => {
      const { data, error } = await supabase.functions.invoke('eventbrite-publish', {
        body: { event_id, action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; action: string; eventbrite_url?: string };
    },
    onSuccess: (result, { action }) => {
      if (action === 'publish') {
        toast.success(
          result.eventbrite_url
            ? 'Published to Eventbrite'
            : 'Published to Eventbrite',
          result.eventbrite_url
            ? { description: result.eventbrite_url, action: { label: 'View', onClick: () => window.open(result.eventbrite_url, '_blank') } }
            : undefined
        );
      } else {
        toast.success('Unpublished from Eventbrite');
      }
      invalidateEvents();
    },
    onError: (err, { event_id }) => {
      toast.error('Eventbrite error: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setEventbriteLoading(prev => ({ ...prev, [event_id]: false }));
    },
    onSettled: (_, __, { event_id }) => {
      setEventbriteLoading(prev => ({ ...prev, [event_id]: false }));
    },
  });

  const handleEventbriteToggle = (event: Event, e: React.MouseEvent) => {
    e.stopPropagation();
    const action = event.eventbrite_published ? 'unpublish' : 'publish';
    setEventbriteLoading(prev => ({ ...prev, [event.id]: true }));
    eventbriteMutation.mutate({ event_id: event.id, action });
  };

  // ── Mutations ────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Event deleted');
      invalidateEvents();
      setDialogOpen(false);
    },
    onError: () => toast.error('Failed to delete event'),
    onSettled: () => { setDeleteDialogOpen(false); setDeleteInEditOpen(false); setDeleteId(null); },
  });

  const submitMutation = useMutation({
    mutationFn: async ({ eventData, isEdit, editId, isRecurring, recurringEvents }: {
      eventData: ReturnType<typeof buildEventData>;
      isEdit: boolean;
      editId?: string;
      isRecurring: boolean;
      recurringEvents?: ReturnType<typeof buildEventData>[];
    }) => {
      if (isEdit && editId) {
        const { error } = await supabase.from('events').update(eventData).eq('id', editId);
        if (error) throw error;
        return { type: 'updated' as const, count: 1 };
      }

      if (isRecurring && recurringEvents && recurringEvents.length > 0) {
        const { data: parent, error: pErr } = await supabase.from('events').insert([recurringEvents[0]]).select().single();
        if (pErr) throw pErr;
        if (recurringEvents.length > 1) {
          const children = recurringEvents.slice(1).map(e => ({ ...e, parent_event_id: parent.id }));
          const { error: cErr } = await supabase.from('events').insert(children);
          if (cErr) throw new Error('Created first event but failed to create recurring instances');
        }
        return { type: 'created-recurring' as const, count: recurringEvents.length };
      }

      const { error } = await supabase.from('events').insert([eventData]);
      if (error) throw error;
      return { type: 'created' as const, count: 1 };
    },
    onSuccess: (result) => {
      if (result.type === 'updated') toast.success('Event updated');
      else if (result.type === 'created-recurring') toast.success(`Created ${result.count} recurring events`);
      else toast.success('Event created');
      setDialogOpen(false);
      invalidateEvents();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save event'),
  });

  const bulkEditMutation = useMutation({
    mutationFn: async ({ scope, editingEvent: ev, eventData, bulkFields }: {
      scope: 'this' | 'future' | 'all';
      editingEvent: Event;
      eventData: ReturnType<typeof buildEventData>;
      bulkFields: ReturnType<typeof buildBulkUpdateFields>;
    }) => {
      const { error } = await supabase.from('events').update(eventData).eq('id', ev.id);
      if (error) throw error;

      if (scope === 'this') return 1;

      const parentId = ev.parent_event_id || ev.id;
      let query = supabase.from('events').select('id, start_time').neq('id', ev.id);
      if (ev.parent_event_id) {
        query = query.or(`parent_event_id.eq.${parentId},id.eq.${parentId}`);
      } else { query = query.eq('parent_event_id', ev.id); }
      if (scope === 'future') query = query.gte('start_time', ev.start_time);

      const { data: siblings } = await query;
      if (siblings && siblings.length > 0) {
        const timeChg = form.start_time ? new Date(ev.start_time).getTime() !== form.start_time.getTime() : false;
        const newStart = form.start_time!;
        const updates = siblings.map((sib) => {
          const updateData: Record<string, unknown> = { ...bulkFields };
          if (timeChg) {
            const sibStart = new Date(sib.start_time);
            sibStart.setHours(newStart.getHours(), newStart.getMinutes(), newStart.getSeconds(), 0);
            updateData.start_time = sibStart.toISOString();
            if (form.end_time && form.start_time) {
              const dur = form.end_time.getTime() - form.start_time.getTime();
              updateData.end_time = new Date(sibStart.getTime() + dur).toISOString();
            }
          }
          return supabase.from('events').update(updateData).eq('id', sib.id);
        });
        await Promise.all(updates);
        return siblings.length + 1;
      }
      return 1;
    },
    onSuccess: (count) => {
      toast.success(count > 1 ? `Updated ${count} events in the series` : 'Event updated');
      setDialogOpen(false);
      setRecurringDialogOpen(false);
      invalidateEvents();
    },
    onError: () => toast.error('Failed to update event'),
  });

  const followupMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await supabase.functions.invoke('guest-followup', {
        body: { event_id: eventId, origin: window.location.origin },
      });
      if (res.error) throw res.error;
      return res.data as { sent: number; errors: number };
    },
    onSuccess: (result, eventId) => {
      toast.success(`Sent ${result.sent} follow-up email${result.sent !== 1 ? 's' : ''}`);
      setSentFollowups(prev => ({ ...prev, [eventId]: true }));
      invalidateEvents();
    },
    onError: () => toast.error('Failed to send follow-up emails'),
  });

  const reminderMutation = useMutation({
    mutationFn: async (event: Event) => {
      const res = await supabase.functions.invoke('notify-event-change', {
        body: { event_id: event.id, type: 'reminder', origin: window.location.origin },
      });
      if (res.error) throw res.error;
      return res.data as { sent: number };
    },
    onSuccess: (result, event) => {
      toast.success(`Sent reminder to ${result?.sent ?? 0} member${result?.sent !== 1 ? 's' : ''}`);
      setSentReminders(prev => ({ ...prev, [event.id]: true }));
    },
    onError: () => toast.error('Failed to send reminders'),
  });

  const handleSendMessage = async () => {
    if (!messageEvent || !messageSubject.trim() || !messageBody.trim()) {
      toast.error('Please fill in both subject and message');
      return;
    }
    setMessageSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/admin/message-attendees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_id: messageEvent.id, subject: messageSubject.trim(), message: messageBody.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      toast.success(`Message sent to ${json.sent} attendee${json.sent !== 1 ? 's' : ''}`);
      setMessageEvent(null);
      setMessageSubject('');
      setMessageBody('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send message';
      toast.error(msg);
    } finally {
      setMessageSending(false);
    }
  };

  // ── Form helpers ─────────────────────────────────────────────────────────
  const openCreate = () => { setEditingEvent(null); setForm(getDefaultEventForm()); setDialogOpen(true); };

  const openEdit = (event: Event) => {
    setEditingEvent(event);
    const price = event.ticket_price != null ? (event.ticket_price / 100).toString() : '0';
    setForm({
      title: event.title, description: event.description || '', start_time: new Date(event.start_time),
      end_time: event.end_time ? new Date(event.end_time) : undefined, location_name: event.location_name || '',
      location_address: event.location_address || '', image_url: event.image_url || '',
      capacity: event.capacity?.toString() || '',
      visibility: event.is_business_only ? 'business_only' : event.is_members_only ? 'members_only' : 'public' as const,
      ticket_price: price,
      category: (event.category && event.category !== 'other') ? event.category as EventCategory : detectCategoryFromTitle(event.title) || 'other',
      recurrence_rule: (event.recurrence_rule as RecurrenceRule) || 'none',
      recurrence_end_type: 'occurrences', recurrence_occurrences: 4, recurrence_end_date: '', tags: event.tags || [],
      allows_guest_passes: event.allows_guest_passes ?? true,
    });
    setDialogOpen(true);
  };

  const handleStartTimeChange = (d: Date | undefined) => {
    if (!d) return;
    setForm(prev => ({ ...prev, start_time: d, end_time: getDefaultEndTime(d) }));
  };

  const duplicate = (event: Event) => {
    const price = event.ticket_price ? (event.ticket_price / 100).toString() : '0';
    setEditingEvent(null);
    setForm({
      title: event.title, description: event.description || '', start_time: getDefaultStartTime(),
      end_time: getDefaultEndTime(getDefaultStartTime()), location_name: event.location_name || '',
      location_address: event.location_address || '', image_url: event.image_url || '',
      capacity: event.capacity?.toString() || '',
      visibility: event.is_business_only ? 'business_only' : event.is_members_only ? 'members_only' : 'public' as const,
      ticket_price: price,
      category: (event.category as EventCategory) || 'other', recurrence_rule: 'none',
      recurrence_end_type: 'occurrences', recurrence_occurrences: 4, recurrence_end_date: '', tags: event.tags || [],
      allows_guest_passes: event.allows_guest_passes ?? true,
    });
    setDialogOpen(true);
  };

  // ── Build data ───────────────────────────────────────────────────────────
  const buildEventData = () => {
    const priceInCents = Math.round((parseFloat(form.ticket_price) || 0) * 100);
    const is_business_only = form.visibility === 'business_only';
    const is_members_only = form.visibility === 'members_only' || is_business_only;
    return {
      title: form.title.trim(), description: form.description.trim() || null,
      start_time: form.start_time ? form.start_time.toISOString() : new Date().toISOString(),
      end_time: form.end_time ? form.end_time.toISOString() : null,
      location_name: form.location_name.trim() || null, location_address: form.location_address.trim() || null,
      image_url: form.image_url.trim() || null,
      capacity: form.capacity ? Math.min(Math.max(parseInt(form.capacity, 10), 0), 10000) : null,
      is_members_only, is_business_only, ticket_price: priceInCents,
      category: form.category, recurrence_rule: form.recurrence_rule === 'none' ? null : form.recurrence_rule,
      tags: form.tags.length > 0 ? form.tags : null,
      allows_guest_passes: form.allows_guest_passes,
    };
  };

  const buildBulkUpdateFields = () => {
    const priceInCents = Math.round((parseFloat(form.ticket_price) || 0) * 100);
    const is_business_only = form.visibility === 'business_only';
    const is_members_only = form.visibility === 'members_only' || is_business_only;
    return {
      title: form.title.trim(), description: form.description.trim() || null,
      location_name: form.location_name.trim() || null, location_address: form.location_address.trim() || null,
      image_url: form.image_url.trim() || null,
      capacity: form.capacity ? Math.min(Math.max(parseInt(form.capacity, 10), 0), 10000) : null,
      is_members_only, is_business_only, ticket_price: priceInCents,
      category: form.category, tags: form.tags.length > 0 ? form.tags : null,
      allows_guest_passes: form.allows_guest_passes,
    };
  };

  // ── Recurring helpers ────────────────────────────────────────────────────
  const isPartOfSeries = (e: Event | null) => e ? !!(e.recurrence_rule || e.parent_event_id) : false;
  const dateChanged = (e: Event | null) => {
    if (!e || !form.start_time) return false;
    return new Date(e.start_time).getTime() !== form.start_time.getTime();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateRecurringEvents = (baseData: any, startTime: Date, endTime: Date | undefined): any[] => {
    const result: any[] = [];
    const pattern = parseRecurrenceRule(form.recurrence_rule);
    if (!pattern) return [{ ...baseData, start_time: startTime.toISOString(), end_time: endTime?.toISOString() || null, occurrence_index: 0 }];

    const occurrences = form.recurrence_occurrences;
    const endDate = form.recurrence_end_date ? new Date(form.recurrence_end_date) : null;
    const endType = form.recurrence_end_type;
    const duration = endTime ? endTime.getTime() - startTime.getTime() : 0;

    const getNthWeekdayOfMonth = (year: number, month: number, weekday: number, ordinal: number): Date => {
      const firstDay = new Date(year, month, 1);
      const diff = (weekday - firstDay.getDay() + 7) % 7;
      const first = new Date(year, month, 1 + diff);
      if (ordinal === 5) {
        let last = first; let next = new Date(last); next.setDate(next.getDate() + 7);
        while (next.getMonth() === month) { last = next; next = new Date(last); next.setDate(next.getDate() + 7); }
        return last;
      }
      const r = new Date(first); r.setDate(first.getDate() + (ordinal - 1) * 7);
      return r.getMonth() === month ? r : first;
    };

    if (pattern.type === 'weekly') {
      const interval = pattern.interval || 1;
      const days = pattern.days && pattern.days.length > 0 ? pattern.days : [getDay(startTime)];
      const weekStart = new Date(startTime); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
      let index = 0;
      outer: for (let w = 0; w < 200; w++) {
        for (const dayOfWeek of days) {
          const eventDate = new Date(weekStart); eventDate.setDate(eventDate.getDate() + dayOfWeek);
          eventDate.setHours(startTime.getHours(), startTime.getMinutes(), startTime.getSeconds(), 0);
          if (eventDate < startTime) continue;
          if (endType === 'occurrences' && index >= occurrences) break outer;
          if (endType === 'date' && endDate && eventDate > endDate) break outer;
          if (index > 52) break outer;
          const eventEnd = duration > 0 ? new Date(eventDate.getTime() + duration) : null;
          result.push({ ...baseData, start_time: eventDate.toISOString(), end_time: eventEnd?.toISOString() || null, occurrence_index: index });
          index++;
        }
        weekStart.setDate(weekStart.getDate() + 7 * interval);
      }
    } else if (pattern.type === 'monthly') {
      let currentMonth = startTime.getMonth(); let currentYear = startTime.getFullYear(); let index = 0;
      for (let m = 0; m < 60; m++) {
        let eventDate: Date;
        if (pattern.mode === 'ordinal' && pattern.ordinal != null && pattern.weekday != null) {
          eventDate = getNthWeekdayOfMonth(currentYear, currentMonth, pattern.weekday, pattern.ordinal);
        } else {
          const day = Math.min(pattern.day || getDate(startTime), new Date(currentYear, currentMonth + 1, 0).getDate());
          eventDate = new Date(currentYear, currentMonth, day);
        }
        eventDate.setHours(startTime.getHours(), startTime.getMinutes(), startTime.getSeconds(), 0);
        if (eventDate < startTime) { currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; } continue; }
        if (endType === 'occurrences' && index >= occurrences) break;
        if (endType === 'date' && endDate && eventDate > endDate) break;
        if (index > 52) break;
        const eventEnd = duration > 0 ? new Date(eventDate.getTime() + duration) : null;
        result.push({ ...baseData, start_time: eventDate.toISOString(), end_time: eventEnd?.toISOString() || null, occurrence_index: index });
        index++; currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      }
    }
    return result.length > 0 ? result : [{ ...baseData, start_time: startTime.toISOString(), end_time: endTime?.toISOString() || null, occurrence_index: 0 }];
  };

  // ── Bulk edit (recurring) ────────────────────────────────────────────────
  const applyBulkEdit = (scope: 'this' | 'future' | 'all') => {
    if (!editingEvent) return;
    bulkEditMutation.mutate({ scope, editingEvent, eventData: buildEventData(), bulkFields: buildBulkUpdateFields() });
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!form.title.trim()) { toast.error('Event title is required'); return; }
    if (form.title.trim().length > 200) { toast.error('Event title must be under 200 characters'); return; }
    if (!form.start_time) { toast.error('Start time is required'); return; }
    if (form.end_time && form.start_time && form.end_time <= form.start_time) { toast.error('End time must be after start time'); return; }
    const price = parseFloat(form.ticket_price);
    if (isNaN(price) || price < 0) { toast.error('Ticket price cannot be negative'); return; }
    if (form.image_url.trim() && !/^https?:\/\/.+/i.test(form.image_url.trim())) { toast.error('Image URL must be a valid URL'); return; }

    if (editingEvent && isPartOfSeries(editingEvent)) { setRecurringDialogOpen(true); return; }

    const eventData = buildEventData();

    if (editingEvent) {
      submitMutation.mutate({ eventData, isEdit: true, editId: editingEvent.id, isRecurring: false });
    } else {
      if (form.recurrence_rule !== 'none' && form.start_time) {
        const recurringEvents = generateRecurringEvents(
          { ...eventData, recurrence_rule: form.recurrence_rule },
          form.start_time, form.end_time
        );
        submitMutation.mutate({ eventData, isEdit: false, isRecurring: true, recurringEvents });
      } else {
        submitMutation.mutate({ eventData, isEdit: false, isRecurring: false });
      }
    }
  };

  const submitting = submitMutation.isPending || bulkEditMutation.isPending;
  const filtered = events.filter(e => e.title.toLowerCase().includes(search.toLowerCase()));

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in-0 duration-200">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" aria-label="Back to admin overview" onClick={onNavigateToDashboard}><ArrowLeft className="w-4 h-4" /></Button>
        <h2 className="text-xl font-semibold">Event Management</h2>
      </div>

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search events..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          {(['all', 'upcoming', 'past'] as const).map(f => (
            <Button key={f} variant={filter === f ? 'filterActive' : 'filterInactive'} size="sm" onClick={() => { setFilter(f); setPage(1); }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
        <Button onClick={openCreate} className="ml-auto"><Plus className="w-4 h-4 mr-2" />Create Event</Button>
      </div>

      {isError ? (
        <div className="text-center py-12">
          <p className="text-sm text-destructive mb-2">Failed to load events.</p>
          <Button variant="outline" size="sm" onClick={() => invalidateEvents()}>Retry</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 && totalCount === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-1">No events found</h3>
          <p className="text-sm text-muted-foreground mb-4">{search ? 'Try a different search term.' : 'Create your first event.'}</p>
          {!search && <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Create Event</Button>}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          {!isMobile && (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs uppercase tracking-wider">Event</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Date</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Time</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">RSVPs</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Eventbrite</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No events match your search.</TableCell></TableRow>
                  ) : filtered.map(event => {
                    const isUpcoming = new Date(event.start_time) > new Date();
                    const rsvpCount = rsvpCounts[event.id] || 0;
                    const ebLoading = eventbriteLoading[event.id] ?? false;
                    const ebPublished = event.eventbrite_published ?? false;
                    return (
                      <TableRow key={event.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(event)}>
                        <TableCell className="font-medium py-3 max-w-[250px]"><span className="truncate block">{event.title}</span></TableCell>
                        <TableCell className="py-3 text-muted-foreground whitespace-nowrap">{format(new Date(event.start_time), 'MMM d')}</TableCell>
                        <TableCell className="py-3 text-muted-foreground whitespace-nowrap">{format(new Date(event.start_time), 'h:mm a')}</TableCell>
                        <TableCell className="py-3 text-muted-foreground whitespace-nowrap">{rsvpCount}/{event.capacity ?? '∞'}</TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-1.5">
                            {isUpcoming
                            ? <span className="bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5 text-xs font-medium">Upcoming</span>
                            : <span className="bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5 text-xs">Past</span>}
                            {event.is_business_only && <Badge className="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs">Business</Badge>}
                            {event.is_members_only && !event.is_business_only && <Lock className="w-3 h-3 text-muted-foreground" aria-label="Members only" />}
                          </div>
                        </TableCell>
                        <TableCell className="py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={ebPublished}
                              disabled={ebLoading}
                              onCheckedChange={() => handleEventbriteToggle(event, { stopPropagation: () => {} } as React.MouseEvent)}
                              aria-label="Publish to Eventbrite"
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {ebLoading ? 'Updating...' : ebPublished ? 'Live' : 'Off'}
                            </span>
                            {ebPublished && event.eventbrite_url && (
                              <a href={event.eventbrite_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open event actions menu"><MoreHorizontal className="w-4 h-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); openEdit(event); }}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); duplicate(event); }}><Copy className="w-4 h-4 mr-2" /> Duplicate</DropdownMenuItem>
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); setAddMembersEvent(event); }}><UserPlus className="w-4 h-4 mr-2" /> Add Members</DropdownMenuItem>
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); setMessageEvent(event); setMessageSubject(''); setMessageBody(''); }}><Send className="w-4 h-4 mr-2" /> Message Attendees</DropdownMenuItem>
                              {isUpcoming && (
                                <DropdownMenuItem
                                  disabled={sentReminders[event.id] || reminderMutation.isPending}
                                  onClick={e => { e.stopPropagation(); reminderMutation.mutate(event); }}
                                >
                                  {sentReminders[event.id] ? <Check className="w-4 h-4 mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
                                  {sentReminders[event.id] ? 'Reminder Sent' : 'Send Reminder'}
                                </DropdownMenuItem>
                              )}
                              {!isUpcoming && (followupCounts[event.id] || 0) > 0 && (
                                <DropdownMenuItem
                                  disabled={sentFollowups[event.id] || followupMutation.isPending}
                                  onClick={e => { e.stopPropagation(); followupMutation.mutate(event.id); }}
                                >
                                  {sentFollowups[event.id] ? <Check className="w-4 h-4 mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                                  {sentFollowups[event.id] ? 'Follow-Ups Sent' : `Send Follow-Ups (${followupCounts[event.id]})`}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={e => { e.stopPropagation(); setDeleteId(event.id); setDeleteDialogOpen(true); }}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Mobile Card Layout */}
          {isMobile && (
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No events match your search.</p>
              ) : filtered.map(event => {
                const isUpcoming = new Date(event.start_time) > new Date();
                const rsvpCount = rsvpCounts[event.id] || 0;
                const ebLoading = eventbriteLoading[event.id] ?? false;
                const ebPublished = event.eventbrite_published ?? false;
                return (
                  <Card key={event.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => openEdit(event)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium truncate">{event.title}</h4>
                          <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(event.start_time), 'MMM d · h:mm a')}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs">{rsvpCount}/{event.capacity ?? '∞'}</Badge>
                          {isUpcoming
                            ? <span className="bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5 text-xs font-medium">Upcoming</span>
                            : <span className="bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5 text-xs">Past</span>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        {/* Eventbrite toggle on mobile */}
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <Switch
                            checked={ebPublished}
                            disabled={ebLoading}
                            onCheckedChange={() => handleEventbriteToggle(event, { stopPropagation: () => {} } as React.MouseEvent)}
                          />
                          <span className="text-xs text-muted-foreground">
                            {ebLoading ? 'Updating...' : ebPublished ? 'On Eventbrite' : 'Eventbrite off'}
                          </span>
                          {ebPublished && event.eventbrite_url && (
                            <a href={event.eventbrite_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                              <ExternalLink className="w-3 h-3 text-muted-foreground" />
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); openEdit(event); }}><Pencil className="w-3 h-3 mr-1" /> Edit</Button>
                          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setAddMembersEvent(event); }}><UserPlus className="w-3 h-3 mr-1" /> Add</Button>
                          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setMessageEvent(event); setMessageSubject(''); setMessageBody(''); }}><Send className="w-3 h-3 mr-1" /> Msg</Button>
                          {isUpcoming && (
                            <Button variant="ghost" size="sm" disabled={sentReminders[event.id]} onClick={e => { e.stopPropagation(); reminderMutation.mutate(event); }}>
                              <Bell className="w-3 h-3 mr-1" /> {sentReminders[event.id] ? 'Sent' : 'Remind'}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); setDeleteId(event.id); setDeleteDialogOpen(true); }}><Trash2 className="w-3 h-3 mr-1" /> Delete</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4 mr-1" /> Previous</Button>
                <Button variant="outline" size="sm" disabled={page * PAGE_SIZE >= totalCount} onClick={() => setPage(p => p + 1)}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Event Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
            <DialogDescription>{editingEvent ? 'Update the event details below.' : 'Fill in the details to create a new event.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" value={form.title} onChange={e => {
                const t = e.target.value; const d = detectCategoryFromTitle(t);
                setForm(prev => ({ ...prev, title: t, ...(d && prev.category === 'other' ? { category: d } : {}) }));
              }} placeholder="Event title" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(prev => ({ ...prev, category: v as EventCategory }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}><div className="flex items-center gap-2"><config.icon className="w-4 h-4" />{config.label}</div></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Event description" rows={3} />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2"><Label>Start Time *</Label><SmartDateTimePicker value={form.start_time} onChange={handleStartTimeChange} /></div>
              <div className="space-y-2"><Label>End Time</Label><SmartDateTimePicker value={form.end_time} onChange={v => setForm(prev => ({ ...prev, end_time: v }))} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="location_name">Venue Name</Label><Input id="location_name" value={form.location_name} onChange={e => setForm(prev => ({ ...prev, location_name: e.target.value }))} placeholder="e.g. Tipsy Pickle" /></div>
            <div className="space-y-2"><Label htmlFor="location_address">Address</Label><Input id="location_address" value={form.location_address} onChange={e => setForm(prev => ({ ...prev, location_address: e.target.value }))} placeholder="123 Main St, Charlotte, NC" /></div>
            <div className="space-y-2">
              <Label>Event Image</Label>
              {form.image_url ? (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden border border-border h-40 w-full">
                    <Image
                      src={form.image_url}
                      alt="Event preview"
                      fill
                      className="object-cover"
                      sizes="(max-width:768px) 100vw, 600px"
                      unoptimized={!form.image_url?.includes('supabase')}
                    />
                    <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7" aria-label="Remove event image" onClick={() => setForm(prev => ({ ...prev, image_url: '' }))}>
                      <XIcon className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${imageUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">{imageUploading ? 'Uploading...' : 'Click to upload image'}</span>
                  <span className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP up to 5MB</span>
                  <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
                    setImageUploading(true);
                    const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                    const { error } = await supabase.storage.from('public-assets').upload(filename, file, { contentType: file.type });
                    if (error) { toast.error('Upload failed: ' + error.message); setImageUploading(false); return; }
                    const { data: urlData } = supabase.storage.from('public-assets').getPublicUrl(filename);
                    setForm(prev => ({ ...prev, image_url: urlData.publicUrl }));
                    setImageUploading(false);
                    toast.success('Image uploaded');
                  }} />
                </label>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2"><Label htmlFor="capacity">Capacity</Label><Input id="capacity" type="number" value={form.capacity} onChange={e => setForm(prev => ({ ...prev, capacity: e.target.value }))} placeholder="Leave empty for unlimited" /></div>
              <div className="space-y-2"><Label htmlFor="ticket_price">Ticket Price ($)</Label><Input id="ticket_price" type="number" step="0.01" value={form.ticket_price} onChange={e => setForm(prev => ({ ...prev, ticket_price: e.target.value }))} /></div>
            </div>
            <div className="space-y-2">
              <Label>Event Visibility</Label>
              <Select value={form.visibility} onValueChange={v => setForm(prev => ({ ...prev, visibility: v as 'public' | 'members_only' | 'business_only' }))}>
                <SelectTrigger><SelectValue placeholder="Select visibility" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public — Anyone can see and attend</SelectItem>
                  <SelectItem value="members_only">Members Only — Social + Business members</SelectItem>
                  <SelectItem value="business_only">Business Only — Business members only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="allows_guest_passes" checked={form.allows_guest_passes} onCheckedChange={c => setForm(prev => ({ ...prev, allows_guest_passes: c }))} />
              <Label htmlFor="allows_guest_passes" className="flex items-center gap-2"><Gift className="w-4 h-4" /> Allow Guest Passes</Label>
            </div>
            {!editingEvent && (
              <RecurrenceSelector
                recurrenceRule={form.recurrence_rule} onRecurrenceRuleChange={v => setForm(prev => ({ ...prev, recurrence_rule: v }))}
                endType={form.recurrence_end_type} onEndTypeChange={v => setForm(prev => ({ ...prev, recurrence_end_type: v }))}
                occurrences={form.recurrence_occurrences} onOccurrencesChange={v => setForm(prev => ({ ...prev, recurrence_occurrences: v }))}
                endDate={form.recurrence_end_date} onEndDateChange={v => setForm(prev => ({ ...prev, recurrence_end_date: v }))}
                startDayOfWeek={form.start_time ? form.start_time.getDay() : undefined}
                startDayOfMonth={form.start_time ? form.start_time.getDate() : undefined}
              />
            )}
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
            {editingEvent ? (
              <Button variant="destructive" onClick={() => setDeleteInEditOpen(true)} disabled={submitting || deleteMutation.isPending} className="w-full sm:w-auto">
                <Trash2 className="w-4 h-4 mr-2" /> Delete Event
              </Button>
            ) : <div />}
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 sm:flex-none">Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1 sm:flex-none">
                {submitting ? 'Saving...' : editingEvent ? 'Update' : 'Create'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recurring Bulk Edit Scope */}
      <AlertDialog open={recurringDialogOpen} onOpenChange={setRecurringDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Update recurring event</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This event is part of a recurring series. Which events should be updated?
              {dateChanged(editingEvent) && <span className="block mt-2 text-xs text-amber-400">Note: Time changes will be applied to the selected scope. Date changes only affect this event.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex flex-col gap-2 w-full">
              <Button variant="outline" className="w-full" disabled={submitting} onClick={() => applyBulkEdit('this')}>This event only</Button>
              <Button variant="outline" className="w-full" disabled={submitting} onClick={() => applyBulkEdit('future')}>This & future events</Button>
              <Button className="w-full" disabled={submitting} onClick={() => applyBulkEdit('all')}>{submitting ? 'Updating...' : 'All events in series'}</Button>
            </div>
            <AlertDialogCancel disabled={submitting} className="w-full mt-1">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete from list */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={open => { setDeleteDialogOpen(open); if (!open) setDeleteId(null); }}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Delete Event"
        description="Are you sure you want to delete this event? This action cannot be undone."
        loading={deleteMutation.isPending}
      />

      {/* Delete from inside edit dialog */}
      <DeleteConfirmDialog
        open={deleteInEditOpen}
        onOpenChange={setDeleteInEditOpen}
        onConfirm={() => editingEvent && deleteMutation.mutate(editingEvent.id)}
        title="Delete Event"
        description="Are you sure you want to delete this event? This action cannot be undone."
        loading={deleteMutation.isPending}
      />

      {/* Add Members to Event Dialog */}
      {addMembersEvent && (
        <AddMembersToEventDialog
          open={!!addMembersEvent}
          onOpenChange={(open) => { if (!open) setAddMembersEvent(null); }}
          eventId={addMembersEvent.id}
          eventTitle={addMembersEvent.title}
        />
      )}

      {/* Message Attendees Dialog */}
      <Dialog open={!!messageEvent} onOpenChange={(open) => { if (!open) setMessageEvent(null); }}>
        <DialogContent className="w-full max-w-lg mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Message Attendees</DialogTitle>
            <DialogDescription>
              Send an email to all confirmed attendees of <strong>{messageEvent?.title}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="msgSubject">Subject</Label>
              <Input
                id="msgSubject"
                value={messageSubject}
                onChange={e => setMessageSubject(e.target.value)}
                placeholder="e.g. Important update about tonight's event"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="msgBody">Message</Label>
              <Textarea
                id="msgBody"
                rows={6}
                value={messageBody}
                onChange={e => setMessageBody(e.target.value)}
                placeholder="Your message to attendees…"
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageEvent(null)} disabled={messageSending}>Cancel</Button>
            <Button onClick={handleSendMessage} disabled={messageSending || !messageSubject.trim() || !messageBody.trim()}>
              {messageSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</> : <><Send className="w-4 h-4 mr-2" />Send to Attendees</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}