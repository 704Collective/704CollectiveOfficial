'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';

// Rich recurrence pattern stored as JSON string in the DB
export interface RecurrencePattern {
  type: 'weekly' | 'monthly';
  // Weekly options
  interval?: number; // 1, 2, or 4 weeks
  days?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  // Monthly options
  mode?: 'day' | 'ordinal'; // "day 15" or "1st Thursday"
  day?: number; // 1-31 for mode='day'
  ordinal?: number; // 1-5 (5 = last) for mode='ordinal'
  weekday?: number; // 0=Sun..6=Sat for mode='ordinal'
}

// Legacy simple rules for backward compatibility
export type RecurrenceRule = 'none' | 'weekly' | 'biweekly' | 'monthly' | string;

export function parseRecurrenceRule(rule: string | null): RecurrencePattern | null {
  if (!rule || rule === 'none') return null;
  // Try JSON first
  try {
    const parsed = JSON.parse(rule);
    if (parsed.type) return parsed as RecurrencePattern;
  } catch {}
  // Legacy simple strings
  if (rule === 'weekly') return { type: 'weekly', interval: 1, days: [] };
  if (rule === 'biweekly') return { type: 'weekly', interval: 2, days: [] };
  if (rule === 'monthly') return { type: 'monthly', mode: 'day' };
  return null;
}

export function serializeRecurrencePattern(pattern: RecurrencePattern | null): string {
  if (!pattern) return 'none';
  return JSON.stringify(pattern);
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINAL_LABELS = [
  { value: '1', label: '1st' },
  { value: '2', label: '2nd' },
  { value: '3', label: '3rd' },
  { value: '4', label: '4th' },
  { value: '5', label: 'Last' },
];

interface RecurrenceSelectorProps {
  recurrenceRule: RecurrenceRule;
  onRecurrenceRuleChange: (value: RecurrenceRule) => void;
  endType: 'occurrences' | 'date';
  onEndTypeChange: (value: 'occurrences' | 'date') => void;
  occurrences: number;
  onOccurrencesChange: (value: number) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  /** Day of week from the event start date (0=Sun) */
  startDayOfWeek?: number;
  /** Day of month from event start date */
  startDayOfMonth?: number;
}

export function RecurrenceSelector({
  recurrenceRule,
  onRecurrenceRuleChange,
  endType,
  onEndTypeChange,
  occurrences,
  onOccurrencesChange,
  endDate,
  onEndDateChange,
  startDayOfWeek,
  startDayOfMonth,
}: RecurrenceSelectorProps) {
  const pattern = parseRecurrenceRule(recurrenceRule);
  const isActive = recurrenceRule !== 'none' && pattern !== null;

  const updatePattern = (updates: Partial<RecurrencePattern>) => {
    const base = pattern || { type: 'weekly', interval: 1, days: startDayOfWeek != null ? [startDayOfWeek] : [] };
    const updated = { ...base, ...updates };
    onRecurrenceRuleChange(serializeRecurrencePattern(updated));
  };

  const handleTypeChange = (value: string) => {
    if (value === 'none') {
      onRecurrenceRuleChange('none');
      return;
    }
    if (value === 'weekly') {
      onRecurrenceRuleChange(serializeRecurrencePattern({
        type: 'weekly',
        interval: 1,
        days: startDayOfWeek != null ? [startDayOfWeek] : [],
      }));
    } else {
      onRecurrenceRuleChange(serializeRecurrencePattern({
        type: 'monthly',
        mode: 'day',
        day: startDayOfMonth || 1,
      }));
    }
  };

  const topLevel = !isActive ? 'none' : pattern?.type || 'weekly';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Repeat</Label>
        <Select value={topLevel} onValueChange={handleTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Does not repeat</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isActive && pattern && (
        <div className="space-y-4 pl-4 border-l-2 border-border">
          {/* Weekly options */}
          {pattern.type === 'weekly' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Every</Label>
                <Select
                  value={String(pattern.interval || 1)}
                  onValueChange={(v) => updatePattern({ interval: parseInt(v) })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 week</SelectItem>
                    <SelectItem value="2">2 weeks</SelectItem>
                    <SelectItem value="4">4 weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">On days</Label>
                <div className="flex flex-wrap gap-1">
                  {DAY_LABELS.map((label, idx) => {
                    const selected = (pattern.days || []).includes(idx);
                    return (
                      <Toggle
                        key={idx}
                        pressed={selected}
                        onPressedChange={() => {
                          const current = pattern.days || [];
                          const updated = selected
                            ? current.filter((d) => d !== idx)
                            : [...current, idx].sort();
                          updatePattern({ days: updated });
                        }}
                        className={cn(
                          "h-9 w-11 text-xs rounded-md",
                          selected && "bg-primary text-primary-foreground"
                        )}
                        size="sm"
                      >
                        {label}
                      </Toggle>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Monthly options */}
          {pattern.type === 'monthly' && (
            <div className="space-y-3">
              <RadioGroup
                value={pattern.mode || 'day'}
                onValueChange={(v) => {
                  if (v === 'day') {
                    updatePattern({ mode: 'day', day: startDayOfMonth || 1, ordinal: undefined, weekday: undefined });
                  } else {
                    updatePattern({ mode: 'ordinal', ordinal: 1, weekday: startDayOfWeek ?? 1, day: undefined });
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="day" id="monthly-day" />
                  <Label htmlFor="monthly-day" className="font-normal flex items-center gap-2">
                    On day
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={pattern.day || startDayOfMonth || 1}
                      onChange={(e) => updatePattern({ day: parseInt(e.target.value) || 1 })}
                      className="w-16 h-8"
                      disabled={pattern.mode !== 'day'}
                    />
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <RadioGroupItem value="ordinal" id="monthly-ordinal" />
                  <Label htmlFor="monthly-ordinal" className="font-normal flex items-center gap-2 flex-wrap">
                    On the
                    <Select
                      value={String(pattern.ordinal || 1)}
                      onValueChange={(v) => updatePattern({ ordinal: parseInt(v) })}
                      disabled={pattern.mode !== 'ordinal'}
                    >
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDINAL_LABELS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(pattern.weekday ?? (startDayOfWeek ?? 1))}
                      onValueChange={(v) => updatePattern({ weekday: parseInt(v) })}
                      disabled={pattern.mode !== 'ordinal'}
                    >
                      <SelectTrigger className="w-24 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_LABELS.map((label, idx) => (
                          <SelectItem key={idx} value={String(idx)}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* End condition */}
          <div className="space-y-3 pt-2">
            <Label className="text-sm text-muted-foreground">Ends</Label>
            <RadioGroup value={endType} onValueChange={(v) => onEndTypeChange(v as 'occurrences' | 'date')}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="occurrences" id="occurrences" />
                <Label htmlFor="occurrences" className="font-normal flex items-center gap-2">
                  After
                  <Input
                    type="number"
                    min={2}
                    max={52}
                    value={occurrences}
                    onChange={(e) => onOccurrencesChange(parseInt(e.target.value) || 2)}
                    className="w-16 h-8"
                    disabled={endType !== 'occurrences'}
                  />
                  occurrences
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <RadioGroupItem value="date" id="enddate" />
                <Label htmlFor="enddate" className="font-normal flex items-center gap-2">
                  On date
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => onEndDateChange(e.target.value)}
                    className="w-40 h-8"
                    disabled={endType !== 'date'}
                  />
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      )}
    </div>
  );
}
