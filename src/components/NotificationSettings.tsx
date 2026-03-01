'use client';

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface NotificationSettingsProps {
  userId: string;
  initialSettings?: {
    notify_event_reminders: boolean;
    notify_new_events: boolean;
    notify_announcements: boolean;
  };
}

export function NotificationSettings({ userId, initialSettings }: NotificationSettingsProps) {
  const [eventReminders, setEventReminders] = useState(initialSettings?.notify_event_reminders ?? true);
  const [newEvents, setNewEvents] = useState(initialSettings?.notify_new_events ?? true);
  const [announcements, setAnnouncements] = useState(initialSettings?.notify_announcements ?? true);
  const [saving, setSaving] = useState(false);

  const updateSetting = async (field: string, value: boolean) => {
    setSaving(true);
    
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', userId);

    if (error) {
      toast.error('Failed to update setting');
      // Revert the UI change
      if (field === 'notify_event_reminders') setEventReminders(!value);
      if (field === 'notify_new_events') setNewEvents(!value);
      if (field === 'notify_announcements') setAnnouncements(!value);
    }
    
    setSaving(false);
  };

  const handleEventRemindersChange = (checked: boolean) => {
    setEventReminders(checked);
    updateSetting('notify_event_reminders', checked);
  };

  const handleNewEventsChange = (checked: boolean) => {
    setNewEvents(checked);
    updateSetting('notify_new_events', checked);
  };

  const handleAnnouncementsChange = (checked: boolean) => {
    setAnnouncements(checked);
    updateSetting('notify_announcements', checked);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="eventReminders" className="text-sm font-medium">
            Event Reminders
          </Label>
          <p className="text-xs text-muted-foreground">
            Get notified before events you're attending
          </p>
        </div>
        <Switch
          id="eventReminders"
          checked={eventReminders}
          onCheckedChange={handleEventRemindersChange}
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="newEvents" className="text-sm font-medium">
            New Event Announcements
          </Label>
          <p className="text-xs text-muted-foreground">
            Get notified when new events are published
          </p>
        </div>
        <Switch
          id="newEvents"
          checked={newEvents}
          onCheckedChange={handleNewEventsChange}
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="announcements" className="text-sm font-medium">
            Admin Announcements
          </Label>
          <p className="text-xs text-muted-foreground">
            Receive important updates and announcements
          </p>
        </div>
        <Switch
          id="announcements"
          checked={announcements}
          onCheckedChange={handleAnnouncementsChange}
          disabled={saving}
        />
      </div>
    </div>
  );
}
