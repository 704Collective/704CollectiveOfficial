'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SmartDateTimePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  label?: string;
}

export function SmartDateTimePicker({ value, onChange, label }: SmartDateTimePickerProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Extract time components from value
  const hours24 = value ? value.getHours() : 18; // Default 6 PM
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
  const minutes = value ? value.getMinutes() : 0;
  const period = hours24 >= 12 ? 'PM' : 'AM';

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    // Preserve time when changing date
    const newDate = new Date(date);
    newDate.setHours(hours24, minutes, 0, 0);
    onChange(newDate);
    setCalendarOpen(false);
  };

  const handleHourChange = (hourStr: string) => {
    const hour = parseInt(hourStr);
    const date = value ? new Date(value) : new Date();
    
    // Convert 12h to 24h
    let hour24 = hour;
    if (period === 'PM' && hour !== 12) {
      hour24 = hour + 12;
    } else if (period === 'AM' && hour === 12) {
      hour24 = 0;
    }
    
    date.setHours(hour24, minutes, 0, 0);
    onChange(date);
  };

  const handleMinuteChange = (minuteStr: string) => {
    const minute = parseInt(minuteStr);
    const date = value ? new Date(value) : new Date();
    date.setMinutes(minute);
    onChange(date);
  };

  const handlePeriodChange = (newPeriod: string) => {
    const date = value ? new Date(value) : new Date();
    let hour24 = date.getHours();
    
    if (newPeriod === 'PM' && hour24 < 12) {
      hour24 += 12;
    } else if (newPeriod === 'AM' && hour24 >= 12) {
      hour24 -= 12;
    }
    
    date.setHours(hour24);
    onChange(date);
  };

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="flex gap-2">
        {/* Date Picker */}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "flex-1 justify-start text-left font-normal",
                !value && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {value ? format(value, "MMM d, yyyy") : "Pick date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={value}
              onSelect={handleDateSelect}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        {/* Hour */}
        <Select value={hours12.toString()} onValueChange={handleHourChange}>
          <SelectTrigger className="w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
              <SelectItem key={h} value={h.toString()}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Minute */}
        <Select value={minutes.toString()} onValueChange={handleMinuteChange}>
          <SelectTrigger className="w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[0, 15, 30, 45].map((m) => (
              <SelectItem key={m} value={m.toString()}>
                {m.toString().padStart(2, '0')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* AM/PM */}
        <Select value={period} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
