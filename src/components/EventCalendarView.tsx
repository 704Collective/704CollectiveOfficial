'use client';

import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time?: string | null;
  location_name?: string | null;
  is_members_only?: boolean;
  is_business_only?: boolean;
  category?: string | null;
  image_url?: string | null;
}

interface EventCalendarViewProps {
  events: CalendarEvent[];
  isUserMember?: boolean;
  onEventClick: (eventId: string) => void;
  /** Dark theme (public page) or light theme (portal) */
  theme?: 'dark' | 'light';
}

export function EventCalendarView({
  events,
  isUserMember = false,
  onEventClick,
  theme = 'dark',
}: EventCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const isDark = theme === 'dark';

  const colors = {
    bg: isDark ? '#0a0a0a' : 'var(--background)',
    card: isDark ? '#1A1A1A' : 'var(--card)',
    border: isDark ? 'rgba(255,255,255,0.06)' : 'var(--border)',
    text: isDark ? '#FFFFFF' : 'var(--foreground)',
    muted: isDark ? 'rgba(255,255,255,0.35)' : 'var(--muted-foreground)',
    dimmed: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)',
    todayBg: isDark ? 'rgba(198,166,100,0.15)' : 'rgba(198,166,100,0.1)',
    selectedBg: isDark ? '#C6A664' : '#C6A664',
    hoverBg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start with empty cells
  const startPadding = monthStart.getDay(); // 0=Sun

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(ev => {
      const dateKey = format(new Date(ev.start_time), 'yyyy-MM-dd');
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(ev);
    });
    return map;
  }, [events]);

  // Events for selected day
  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    const key = format(selectedDay, 'yyyy-MM-dd');
    return eventsByDate[key] ?? [];
  }, [selectedDay, eventsByDate]);

  const getDayEvents = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    return eventsByDate[key] ?? [];
  };

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => { setCurrentMonth(subMonths(currentMonth, 1)); setSelectedDay(null); }}
          style={{ padding: '8px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: 'transparent', color: colors.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <ChevronLeft style={{ width: '16px', height: '16px' }} />
        </button>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: colors.text }}>
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <button
          type="button"
          onClick={() => { setCurrentMonth(addMonths(currentMonth, 1)); setSelectedDay(null); }}
          style={{ padding: '8px', borderRadius: '8px', border: `1px solid ${colors.border}`, backgroundColor: 'transparent', color: colors.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <ChevronRight style={{ width: '16px', height: '16px' }} />
        </button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
        {WEEKDAYS.map(day => (
          <div key={day} style={{ textAlign: 'center', fontSize: '0.6875rem', fontWeight: 600, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 0' }}>
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {/* Padding cells */}
        {Array.from({ length: startPadding }).map((_, i) => (
          <div key={`pad-${i}`} style={{ aspectRatio: '1', minHeight: '52px' }} />
        ))}

        {/* Day cells */}
        {days.map(day => {
          const dayEvents = getDayEvents(day);
          const hasEvents = dayEvents.length > 0;
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
          const isCurrentDay = isToday(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => {
                if (hasEvents) setSelectedDay(isSelected ? null : day);
              }}
              style={{
                minHeight: '52px',
                padding: '6px 4px',
                borderRadius: '8px',
                border: isSelected
                  ? `1px solid #C6A664`
                  : `1px solid ${isCurrentDay ? 'rgba(198,166,100,0.3)' : 'transparent'}`,
                backgroundColor: isSelected
                  ? 'rgba(198,166,100,0.12)'
                  : isCurrentDay
                  ? colors.todayBg
                  : hasEvents
                  ? colors.hoverBg
                  : 'transparent',
                cursor: hasEvents ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 150ms ease',
              }}
            >
              <span style={{
                fontSize: '0.8125rem',
                fontWeight: isCurrentDay ? 700 : hasEvents ? 600 : 400,
                color: isSelected
                  ? '#C6A664'
                  : isCurrentDay
                  ? '#C6A664'
                  : isCurrentMonth
                  ? hasEvents ? colors.text : colors.muted
                  : colors.dimmed,
              }}>
                {format(day, 'd')}
              </span>

              {/* Event dots - up to 3 */}
              {hasEvents && (
                <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {dayEvents.slice(0, 3).map((ev, i) => (
                    <div key={i} style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      backgroundColor: ev.is_business_only ? '#C6A664' : ev.is_members_only ? '#C6A664' : '#4CAF50',
                      opacity: ev.is_members_only && !isUserMember ? 0.5 : 1,
                    }} />
                  ))}
                  {dayEvents.length > 3 && (
                    <span style={{ fontSize: '0.5rem', color: colors.muted, lineHeight: 1 }}>+{dayEvents.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day events */}
      {selectedDay && selectedDayEvents.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.muted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {format(selectedDay, 'EEEE, MMMM d')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {selectedDayEvents.map(ev => {
              const isPrivate = ev.is_members_only && !isUserMember;
              const startDate = new Date(ev.start_time);
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onEventClick(ev.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px 16px',
                    backgroundColor: colors.card,
                    border: ev.is_business_only
                      ? '1px solid rgba(198,166,100,0.3)'
                      : `1px solid ${colors.border}`,
                    borderRadius: '10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 150ms ease',
                    boxShadow: ev.is_business_only ? '0 0 12px rgba(198,166,100,0.06)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = ev.is_business_only ? 'rgba(198,166,100,0.5)' : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = ev.is_business_only ? 'rgba(198,166,100,0.3)' : colors.border;
                  }}
                >
                  {/* Color bar */}
                  <div style={{
                    width: '3px',
                    height: '36px',
                    borderRadius: '2px',
                    backgroundColor: ev.is_business_only ? '#C6A664' : ev.is_members_only ? 'rgba(198,166,100,0.6)' : '#4CAF50',
                    flexShrink: 0,
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: colors.text, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.title}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: colors.muted }}>
                      {isPrivate
                        ? format(startDate, 'EEE, MMM d')
                        : `${format(startDate, 'h:mm a')}${ev.location_name ? ` · ${ev.location_name}` : ''}`
                      }
                    </p>
                  </div>

                  {isPrivate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.6875rem', color: colors.muted, flexShrink: 0 }}>
                      <Lock style={{ width: '11px', height: '11px' }} />
                      {ev.is_business_only ? 'Business' : 'Members'}
                    </div>
                  )}

                  {ev.is_members_only && isUserMember && (
                    <div style={{ fontSize: '0.6875rem', color: '#C6A664', flexShrink: 0, fontWeight: 600 }}>
                      ✓
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4CAF50' }} />
          <span style={{ fontSize: '0.75rem', color: colors.muted }}>Public event</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#C6A664' }} />
          <span style={{ fontSize: '0.75rem', color: colors.muted }}>Members only</span>
        </div>
      </div>
    </div>
  );
}