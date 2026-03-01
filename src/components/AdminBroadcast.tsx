'use client';

import { useState } from 'react';
import { Megaphone, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function AdminBroadcast() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error('Please fill in both title and message');
      return;
    }

    setSending(true);

    try {
      // Get all active members
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id')
        .eq('subscription_status', 'active')
        .is('deleted_at', null);

      if (profilesError) throw profilesError;

      if (!profiles || profiles.length === 0) {
        toast.error('No active members to notify');
        setSending(false);
        return;
      }

      // Create notifications for all members
      const notifications = profiles.map(profile => ({
        user_id: profile.id,
        type: 'broadcast',
        title: title.trim(),
        message: message.trim(),
      }));

      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (insertError) throw insertError;

      toast.success(`Broadcast sent to ${profiles.length} member${profiles.length !== 1 ? 's' : ''}`);
      setOpen(false);
      setTitle('');
      setMessage('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send broadcast');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Megaphone className="w-4 h-4 mr-2" />
          Send Broadcast
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            Send Broadcast Message
          </DialogTitle>
          <DialogDescription>
            This message will be sent to all active members as a notification.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="broadcastTitle">Title</Label>
            <Input
              id="broadcastTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Important Update"
              maxLength={100}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="broadcastMessage">Message</Label>
            <Textarea
              id="broadcastMessage"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your message to all members..."
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/500
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send to All Members
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
