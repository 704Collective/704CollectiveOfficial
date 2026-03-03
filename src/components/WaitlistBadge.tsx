'use client';

import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WaitlistBadgeProps {
  position: number;
  onLeaveWaitlist?: () => void;
  onLeave?: () => void;
  loading?: boolean;
  className?: string;
}

export function WaitlistBadge({ position, onLeaveWaitlist, onLeave, loading, className }: WaitlistBadgeProps) {
  const handleLeave = onLeave || onLeaveWaitlist;
  return (
    <div className={cn("space-y-3", className)}>
      <Badge 
        variant="outline" 
        className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-sm py-1.5 px-3"
      >
        <Clock className="w-4 h-4 mr-2" />
        You're #{position} on the waitlist
      </Badge>
      
      <p className="text-xs text-muted-foreground">
        We'll notify you by email if a spot opens up.
      </p>
      
      {handleLeave && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLeave}
          disabled={loading}
          className="text-muted-foreground hover:text-destructive"
        >
          Leave waitlist
        </Button>
      )}
    </div>
  );
}
