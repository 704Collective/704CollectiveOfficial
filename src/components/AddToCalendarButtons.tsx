'use client';

import { Calendar, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export interface CalendarEvent {
  title: string;
  description?: string;
  startTime: Date | string;
  endTime: Date | string;
  location?: string;
}

interface AddToCalendarButtonsProps {
  event: CalendarEvent;
  className?: string;
}

function formatDateForGoogle(date: Date): string {
  return format(date, "yyyyMMdd'T'HHmmss");
}

function formatDateForICS(date: Date): string {
  return format(date, "yyyyMMdd'T'HHmmss");
}

function escapeText(text: string): string {
  return text.replace(/[\\;,\n]/g, (char) => {
    if (char === '\n') return '\\n';
    return '\\' + char;
  });
}

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

function generateGoogleCalendarUrl(event: CalendarEvent): string {
  const startDate = toDate(event.startTime);
  const endDate = toDate(event.endTime);
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatDateForGoogle(startDate)}/${formatDateForGoogle(endDate)}`,
  });

  if (event.description) {
    params.append('details', event.description);
  }
  if (event.location) {
    params.append('location', event.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateICSContent(event: CalendarEvent): string {
  const startDate = toDate(event.startTime);
  const endDate = toDate(event.endTime);
  
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//704 Collective//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `DTSTART:${formatDateForICS(startDate)}`,
    `DTEND:${formatDateForICS(endDate)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }

  lines.push(
    `UID:${crypto.randomUUID()}@704social.com`,
    `DTSTAMP:${formatDateForICS(new Date())}`,
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return lines.join('\r\n');
}

function downloadICSFile(event: CalendarEvent): void {
  const icsContent = generateICSContent(event);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AddToCalendarButtons({ event, className }: AddToCalendarButtonsProps) {
  const handleGoogleCalendar = () => {
    window.open(generateGoogleCalendarUrl(event), '_blank');
  };

  const handleAppleCalendar = () => {
    downloadICSFile(event);
  };

  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground mb-2">Add to your calendar:</p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleGoogleCalendar}
          className="flex-1"
        >
          <Calendar className="w-4 h-4 mr-2" />
          Google
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAppleCalendar}
          className="flex-1"
        >
          <Download className="w-4 h-4 mr-2" />
          Apple / ICS
        </Button>
      </div>
    </div>
  );
}
