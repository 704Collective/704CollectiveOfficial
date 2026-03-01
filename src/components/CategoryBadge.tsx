'use client';

import { Wine, Users, Utensils, Coffee, Crown, Calendar, Mountain, Dumbbell, Gamepad2, BookOpen, Sparkles, HandHeart, Music, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const CATEGORY_CONFIG = {
  coffee: {
    label: 'Coffee',
    icon: Coffee,
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  happy_hour: {
    label: 'Happy Hour',
    icon: Wine,
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  networking: {
    label: 'Networking',
    icon: Users,
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  dinner: {
    label: 'Dinner',
    icon: Utensils,
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  brunch: {
    label: 'Brunch',
    icon: Utensils,
    className: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  },
  outdoors: {
    label: 'Outdoors',
    icon: Mountain,
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  fitness: {
    label: 'Fitness',
    icon: Dumbbell,
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  games: {
    label: 'Games',
    icon: Gamepad2,
    className: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  },
  book_club: {
    label: 'Book Club',
    icon: BookOpen,
    className: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  },
  wellness: {
    label: 'Wellness',
    icon: Sparkles,
    className: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  },
  volunteer: {
    label: 'Volunteer',
    icon: HandHeart,
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  music: {
    label: 'Music',
    icon: Music,
    className: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  },
  sports: {
    label: 'Sports',
    icon: Trophy,
    className: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  },
  members_only: {
    label: 'Members Only',
    icon: Crown,
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  other: {
    label: 'Event',
    icon: Calendar,
    className: 'bg-muted text-muted-foreground border-border',
  },
} as const;

export type EventCategory = keyof typeof CATEGORY_CONFIG;

// Auto-detect category from event title keywords
const CATEGORY_KEYWORDS: Record<EventCategory, string[]> = {
  coffee: ['coffee', 'cafe', 'latte', 'espresso'],
  happy_hour: ['happy hour', 'drinks', 'bar', 'brewery', 'beer', 'wine'],
  brunch: ['brunch'],
  dinner: ['dinner', 'restaurant', 'food'],
  outdoors: ['hike', 'hiking', 'outdoor', 'park', 'trail'],
  fitness: ['fitness', 'workout', 'gym', 'run', 'yoga', 'pilates'],
  networking: ['networking', 'professional', 'career', 'business'],
  games: ['game', 'games', 'trivia', 'bingo', 'board game'],
  book_club: ['book', 'reading', 'book club'],
  wellness: ['sauna', 'spa', 'wellness', 'cold plunge'],
  volunteer: ['volunteer', 'service', 'community'],
  music: ['music', 'concert', 'live'],
  sports: ['sports', 'watch party'],
  members_only: [],
  other: [],
};

export function detectCategoryFromTitle(title: string): EventCategory | null {
  const titleLower = title.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.length === 0) continue;
    for (const keyword of keywords) {
      if (titleLower.includes(keyword)) {
        return category as EventCategory;
      }
    }
  }
  return null;
}

interface CategoryBadgeProps {
  category: EventCategory | string;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function CategoryBadge({ category, className, showIcon = true, size = 'md' }: CategoryBadgeProps) {
  const config = CATEGORY_CONFIG[category as EventCategory] || CATEGORY_CONFIG.other;
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        config.className, 
        'font-medium',
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs',
        className
      )}
    >
      {showIcon && <Icon className={cn(size === 'sm' ? 'w-2.5 h-2.5 mr-0.5' : 'w-3 h-3 mr-1')} />}
      {config.label}
    </Badge>
  );
}

export const EVENT_CATEGORIES = Object.entries(CATEGORY_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}));
