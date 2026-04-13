'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Lightbulb } from 'lucide-react';

interface SuggestEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  email: string;
  fullName: string | null;
}

export function SuggestEventModal({ open, onOpenChange, profileId, email, fullName }: SuggestEventModalProps) {
  const [suggestion, setSuggestion] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestion.trim()) {
      toast.error('Please describe your event idea before submitting.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('event_suggestions').insert({
        suggestion: suggestion.trim(),
        profile_id: profileId,
        email,
        full_name: fullName,
      });

      if (error) throw error;

      toast.success("Thanks for the suggestion! We'll review it soon.");
      setSuggestion('');
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to submit suggestion. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            Suggest an Event
          </DialogTitle>
          <DialogDescription>
            Have an idea for a 704 Collective event? We'd love to hear it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <Textarea
            placeholder="e.g. Rooftop networking happy hour at a Uptown Charlotte venue, Thursday evenings..."
            value={suggestion}
            onChange={e => setSuggestion(e.target.value)}
            rows={5}
            className="resize-none"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Describe your event idea - what, where, when, vibe, anything helps.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !suggestion.trim()}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : 'Submit Idea'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
