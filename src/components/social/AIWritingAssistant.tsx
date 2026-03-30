'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type AIWritingType = 'social_caption';

interface AIWritingAssistantProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: AIWritingType;
  platform: string;
  topic: string;
  tone: string;
  onInsert: (text: string) => void;
}

export function AIWritingAssistant({
  open,
  onOpenChange,
  type,
  platform,
  topic,
  tone,
  onInsert,
}: AIWritingAssistantProps) {
  const [localTopic, setLocalTopic] = useState(topic);
  const [localTone, setLocalTone] = useState(tone);
  const [draft, setDraft] = useState('');

  const generate = () => {
    if (type === 'social_caption') {
      const t = localTopic.trim() || 'our community';
      const toneLine = localTone.trim() || 'warm and professional';
      setDraft(
        `Join us for ${t} — built for Charlotte young professionals. ` +
          `Tone: ${toneLine}. ` +
          `Optimized for ${platform} (edit before publishing). #704Collective`
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>Generate caption</DialogTitle>
          <DialogDescription>
            Placeholder assistant — connect an LLM edge function for production copy. Type: {type}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-muted-foreground">Platform</Label>
            <p className="text-sm text-foreground mt-1">{platform}</p>
          </div>
          <div>
            <Label htmlFor="ai-topic" className="text-muted-foreground">
              Topic
            </Label>
            <Input
              id="ai-topic"
              value={localTopic}
              onChange={e => setLocalTopic(e.target.value)}
              className="mt-1 border-border bg-background"
            />
          </div>
          <div>
            <Label htmlFor="ai-tone" className="text-muted-foreground">
              Tone
            </Label>
            <Input
              id="ai-tone"
              value={localTone}
              onChange={e => setLocalTone(e.target.value)}
              placeholder="e.g. upbeat, professional"
              className="mt-1 border-border bg-background"
            />
          </div>
          <Button type="button" variant="secondary" className="w-full" onClick={generate}>
            Generate draft
          </Button>
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={5}
            className="border-border bg-background resize-none text-sm"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="btn-primary"
            onClick={() => {
              if (draft.trim()) onInsert(draft.trim());
              onOpenChange(false);
            }}
            disabled={!draft.trim()}
          >
            Insert into caption
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
