'use client';

import { WifiOff, RefreshCw, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onManualSync?: () => void;
}

export const OfflineIndicator = ({ 
  isOnline, 
  pendingCount, 
  isSyncing,
  onManualSync 
}: OfflineIndicatorProps) => {
  if (isOnline && pendingCount === 0) return null;

  return (
    <div 
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        !isOnline 
          ? "bg-destructive/15 text-destructive border border-destructive/30" 
          : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
      )}
      onClick={isOnline && pendingCount > 0 && !isSyncing ? onManualSync : undefined}
      role={isOnline && pendingCount > 0 ? "button" : undefined}
    >
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4" />
          <span>Offline mode</span>
          {pendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-destructive/20 rounded text-xs">
              {pendingCount} pending
            </span>
          )}
        </>
      ) : isSyncing ? (
        <>
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Syncing...</span>
        </>
      ) : (
        <>
          <Cloud className="w-4 h-4" />
          <span>{pendingCount} pending sync</span>
          <span className="text-xs opacity-70">(tap to sync)</span>
        </>
      )}
    </div>
  );
};
