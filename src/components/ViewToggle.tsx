'use client';

import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ViewToggleProps {
  view: 'grid' | 'list';
  onViewChange: (view: 'grid' | 'list') => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onViewChange('grid')}
        className={`h-8 w-8 p-0 ${
          view === 'grid' 
            ? 'bg-background shadow-sm text-foreground' 
            : 'text-muted-foreground hover:text-foreground hover:bg-transparent'
        }`}
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onViewChange('list')}
        className={`h-8 w-8 p-0 ${
          view === 'list' 
            ? 'bg-background shadow-sm text-foreground' 
            : 'text-muted-foreground hover:text-foreground hover:bg-transparent'
        }`}
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}
