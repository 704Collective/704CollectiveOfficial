'use client';

import type { CSSProperties } from 'react';
import {
  Wine,
  Users,
  Utensils,
  Coffee,
  Crown,
  Calendar,
  Mountain,
  Dumbbell,
  Gamepad2,
  BookOpen,
  Sparkles,
  HandHeart,
  Music,
  Trophy,
} from 'lucide-react';

export const CATEGORY_CONFIG = {
  coffee: { label: 'Coffee', icon: Coffee },
  happy_hour: { label: 'Happy Hour', icon: Wine },
  networking: { label: 'Networking', icon: Users },
  dinner: { label: 'Dinner', icon: Utensils },
  brunch: { label: 'Brunch', icon: Utensils },
  outdoors: { label: 'Outdoors', icon: Mountain },
  fitness: { label: 'Fitness', icon: Dumbbell },
  games: { label: 'Games', icon: Gamepad2 },
  book_club: { label: 'Book Club', icon: BookOpen },
  wellness: { label: 'Wellness', icon: Sparkles },
  volunteer: { label: 'Volunteer', icon: HandHeart },
  music: { label: 'Music', icon: Music },
  sports: { label: 'Sports', icon: Trophy },
  members_only: { label: 'Members Only', icon: Crown },
  other: { label: 'Event', icon: Calendar },
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

type BadgeTone = 'default' | 'businessPortal';

function bucketCategory(cat: EventCategory): 'games' | 'coffee_social' | 'networking' | 'members_only' | 'neutral' {
  if (cat === 'games') return 'games';
  if (cat === 'networking') return 'networking';
  if (cat === 'members_only') return 'members_only';
  if (
    cat === 'coffee' ||
    cat === 'happy_hour' ||
    cat === 'brunch' ||
    cat === 'dinner'
  ) {
    return 'coffee_social';
  }
  return 'neutral';
}

function defaultBadgeStyle(cat: EventCategory): CSSProperties {
  const b = bucketCategory(cat);
  if (b === 'games') {
    return {
      background: 'rgba(99,102,241,0.2)',
      border: '1px solid rgba(99,102,241,0.3)',
      color: 'rgb(129,140,248)',
    };
  }
  if (b === 'coffee_social') {
    return {
      background: 'rgba(249,115,22,0.2)',
      border: '1px solid rgba(249,115,22,0.3)',
      color: 'rgb(251,146,60)',
    };
  }
  if (b === 'networking') {
    return {
      background: 'rgba(59,130,246,0.2)',
      border: '1px solid rgba(59,130,246,0.3)',
      color: 'rgb(96,165,250)',
    };
  }
  if (b === 'members_only') {
    return {
      background: 'rgba(234,179,8,0.2)',
      border: '1px solid rgba(234,179,8,0.3)',
      color: 'rgb(250,204,21)',
    };
  }
  return {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.55)',
  };
}

function portalBadgeStyle(businessEvent: boolean): CSSProperties {
  if (businessEvent) {
    return {
      background: 'transparent',
      border: '1px solid rgba(245,158,11,0.3)',
      color: 'rgb(251,191,36)',
    };
  }
  return {
    background: 'transparent',
    border: '1px solid rgb(61,61,61)',
    color: 'rgb(161,161,161)',
  };
}

interface CategoryBadgeProps {
  category: EventCategory | string;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
  /** Business portal: amber outline for business events, gray for social. */
  tone?: BadgeTone;
  /** When tone=businessPortal, whether the event is business-only. */
  businessEvent?: boolean;
}

export function CategoryBadge({
  category,
  showIcon = true,
  size = 'md',
  tone = 'default',
  businessEvent = false,
}: CategoryBadgeProps) {
  const config = CATEGORY_CONFIG[category as EventCategory] || CATEGORY_CONFIG.other;
  const Icon = config.icon;
  const isSmall = size === 'sm';

  const style: CSSProperties =
    tone === 'businessPortal'
      ? portalBadgeStyle(businessEvent)
      : defaultBadgeStyle(category as EventCategory);

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
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        ...style,
      }}
    >
      {showIcon && <Icon style={{ width: isSmall ? '10px' : '12px', height: isSmall ? '10px' : '12px' }} />}
      {config.label}
    </span>
  );
}

/** Members-only pill (event detail / rows). */
export function MembersOnlyEventBadge() {
  return (
    <span
      style={{
        fontSize: '0.6875rem',
        fontWeight: 600,
        color: 'rgb(250,204,21)',
        backgroundColor: 'rgba(234,179,8,0.2)',
        padding: '4px 12px',
        borderRadius: '100px',
        border: '1px solid rgba(234,179,8,0.3)',
      }}
    >
      Members Only
    </span>
  );
}

export const EVENT_CATEGORIES = Object.entries(CATEGORY_CONFIG).map(([value, config]) => ({
  value,
  label: config.label,
}));
