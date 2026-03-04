'use client';

import { Wine, Users, Utensils, Coffee, Crown, Calendar, Mountain, Dumbbell, Gamepad2, BookOpen, Sparkles, HandHeart, Music, Trophy } from 'lucide-react';

export const CATEGORY_CONFIG = {
  coffee: { label: 'Coffee', icon: Coffee, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  happy_hour: { label: 'Happy Hour', icon: Wine, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  networking: { label: 'Networking', icon: Users, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  dinner: { label: 'Dinner', icon: Utensils, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  brunch: { label: 'Brunch', icon: Utensils, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  outdoors: { label: 'Outdoors', icon: Mountain, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  fitness: { label: 'Fitness', icon: Dumbbell, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  games: { label: 'Games', icon: Gamepad2, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  book_club: { label: 'Book Club', icon: BookOpen, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  wellness: { label: 'Wellness', icon: Sparkles, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  volunteer: { label: 'Volunteer', icon: HandHeart, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  music: { label: 'Music', icon: Music, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  sports: { label: 'Sports', icon: Trophy, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  members_only: { label: 'Members Only', icon: Crown, color: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)' },
  other: { label: 'Event', icon: Calendar, color: 'rgba(255,255,255,0.35)', bg: 'rgba(255,255,255,0.04)' },
} as const;

export type EventCategory = keyof typeof CATEGORY_CONFIG;

const CATEGORY_KEYWORDS: Record<EventCategory, string[]> = {
  coffee: ['coffee', 'cafe', 'latte', 'espresso'],
  happy_hour: ['happy hour', 'drinks', 'bar', 'brewery', 'beer', 'wine', 'tap in', 'blinders'],
  brunch: ['brunch'],
  dinner: ['dinner', 'restaurant', 'food', 'cooking'],
  outdoors: ['hike', 'hiking', 'outdoor', 'park', 'trail'],
  fitness: ['fitness', 'workout', 'gym', 'run', 'yoga', 'pilates'],
  networking: ['networking', 'professional', 'career', 'business'],
  games: ['game', 'games', 'trivia', 'bingo', 'board game', 'bowling', 'duckpin'],
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
      if (titleLower.includes(keyword)) return category as EventCategory;
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

export function CategoryBadge({ category, showIcon = true, size = 'md' }: CategoryBadgeProps) {
  const config = CATEGORY_CONFIG[category as EventCategory] || CATEGORY_CONFIG.other;
  const Icon = config.icon;
  const isSmall = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? '3px' : '5px',
        padding: isSmall ? '2px 8px' : '4px 10px',
        borderRadius: '100px',
        fontSize: isSmall ? '0.625rem' : '0.6875rem',
        fontWeight: 600,
        color: config.color,
        backgroundColor: config.bg,
        border: '1px solid rgba(255,255,255,0.06)',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
    >
      {showIcon && <Icon style={{ width: isSmall ? '10px' : '12px', height: isSmall ? '10px' : '12px' }} />}
      {config.label}
    </span>
  );
}

export const EVENT_CATEGORIES = Object.entries(CATEGORY_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}));