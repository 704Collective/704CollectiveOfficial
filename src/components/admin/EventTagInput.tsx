'use client';

import { useState, useMemo } from 'react';
import { X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const TAG_SUGGESTIONS: Record<string, string[]> = {
  coffee: ['Coffee', 'Morning'],
  cafe: ['Coffee', 'Morning'],
  latte: ['Coffee', 'Morning'],
  'happy hour': ['Happy Hour', 'Drinks', 'Nightlife'],
  drinks: ['Happy Hour', 'Drinks', 'Nightlife'],
  bar: ['Happy Hour', 'Drinks', 'Nightlife'],
  brewery: ['Happy Hour', 'Drinks', 'Nightlife'],
  brunch: ['Brunch', 'Food', 'Weekend'],
  dinner: ['Dinner', 'Food'],
  restaurant: ['Dinner', 'Food'],
  hike: ['Outdoors', 'Active'],
  hiking: ['Outdoors', 'Active'],
  outdoor: ['Outdoors', 'Active'],
  park: ['Outdoors', 'Active'],
  fitness: ['Fitness', 'Active', 'Wellness'],
  workout: ['Fitness', 'Active', 'Wellness'],
  gym: ['Fitness', 'Active', 'Wellness'],
  run: ['Fitness', 'Active', 'Wellness'],
  yoga: ['Fitness', 'Active', 'Wellness'],
  networking: ['Networking', 'Professional'],
  professional: ['Networking', 'Professional'],
  career: ['Networking', 'Professional'],
  game: ['Games', 'Social'],
  games: ['Games', 'Social'],
  trivia: ['Games', 'Social'],
  bingo: ['Games', 'Social'],
  book: ['Book Club', 'Discussion'],
  reading: ['Book Club', 'Discussion'],
  art: ['Arts & Culture'],
  museum: ['Arts & Culture'],
  gallery: ['Arts & Culture'],
  music: ['Music', 'Nightlife'],
  concert: ['Music', 'Nightlife'],
  live: ['Music', 'Nightlife'],
  sports: ['Sports', 'Social'],
  'watch party': ['Sports', 'Social'],
  volunteer: ['Volunteer', 'Community'],
  service: ['Volunteer', 'Community'],
  sauna: ['Wellness', 'Self-Care'],
  spa: ['Wellness', 'Self-Care'],
  wellness: ['Wellness', 'Self-Care'],
};

const MAX_TAGS = 5;

interface EventTagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  title: string;
}

export function EventTagInput({ tags, onTagsChange, title }: EventTagInputProps) {
  const [manualInput, setManualInput] = useState('');

  const suggestions = useMemo(() => {
    if (!title.trim()) return [];
    const titleLower = title.toLowerCase();
    const suggested = new Set<string>();
    
    for (const [keyword, tagList] of Object.entries(TAG_SUGGESTIONS)) {
      if (titleLower.includes(keyword)) {
        tagList.forEach(t => suggested.add(t));
      }
    }
    
    // Remove already-selected tags
    tags.forEach(t => suggested.delete(t));
    return Array.from(suggested);
  }, [title, tags]);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.length >= MAX_TAGS || tags.includes(trimmed)) return;
    onTagsChange([...tags, trimmed]);
  };

  const removeTag = (tag: string) => {
    onTagsChange(tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (manualInput.trim()) {
        addTag(manualInput);
        setManualInput('');
      }
    }
  };

  return (
    <div className="space-y-3">
      <Label>Tags ({tags.length}/{MAX_TAGS})</Label>
      
      {/* Selected tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-1 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && tags.length < MAX_TAGS && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Suggested tags:</span>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-muted/50 text-muted-foreground border border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
              >
                <Plus className="w-3 h-3" />
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual input */}
      {tags.length < MAX_TAGS && (
        <Input
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a tag and press Enter"
          className="text-sm"
        />
      )}
    </div>
  );
}
