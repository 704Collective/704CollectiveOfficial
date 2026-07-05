'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell, Heart, MessageCircle, UserPlus, Calendar, Star, Info, X, CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AppNotification {
  id: string;
  user_id: string;
  message: string;
  notification_type: string | null;
  action_url: string | null;
  is_dismissed: boolean;
  is_read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Icon per notification type
// ---------------------------------------------------------------------------
function NotificationIcon({ type }: { type: string | null }) {
  const cls = 'w-4 h-4 shrink-0';
  switch (type) {
    case 'like':         return <Heart className={cn(cls, 'text-rose-500')} />;
    case 'comment':      return <MessageCircle className={cn(cls, 'text-blue-500')} />;
    case 'follow':       return <UserPlus className={cn(cls, 'text-green-500')} />;
    case 'event':        return <Calendar className={cn(cls, 'text-primary')} />;
    case 'achievement':  return <Star className={cn(cls, 'text-yellow-500')} />;
    default:             return <Info className={cn(cls, 'text-muted-foreground')} />;
  }
}

// ---------------------------------------------------------------------------
// NotificationDropdown
// ---------------------------------------------------------------------------
interface NotificationDropdownProps {
  user: User;
}

export function NotificationDropdown({ user }: NotificationDropdownProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, user_id, message, notification_type, action_url, is_dismissed, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const rows = (data ?? []) as AppNotification[];
    setNotifications(rows);
    setUnreadCount(rows.filter(n => !n.is_read).length);
  };

  // Load on mount + realtime subscription
  useEffect(() => {
    fetchNotifications();

    channelRef.current = supabase
      .channel(`notifications-dropdown:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchNotifications())
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('notifications').update({ is_dismissed: true, is_read: true }).eq('id', id);
    setNotifications(p => p.map(n => n.id === id ? { ...n, is_dismissed: true, is_read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await supabase
      .from('notifications')
      .update({ is_dismissed: true, is_read: true })
      .eq('user_id', user.id)
      .eq('is_dismissed', false);
    setNotifications(p => p.map(n => ({ ...n, is_dismissed: true, is_read: true })));
    setUnreadCount(0);
  };

  const markVisibleAsSeen = async () => {
    let unreadIds: string[] = [];
    setNotifications(prev => {
      unreadIds = prev.filter(n => !n.is_read).map(n => n.id);
      if (unreadIds.length === 0) return prev;
      return prev.map(n =>
        unreadIds.includes(n.id) ? { ...n, is_read: true } : n
      );
    });
    setUnreadCount(0);
    if (unreadIds.length === 0) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) void markVisibleAsSeen();
    setOpen(next);
  };

  const handleClick = async (n: AppNotification) => {
    if (!n.is_dismissed) {
      await supabase.from('notifications').update({ is_dismissed: true, is_read: true }).eq('id', n.id);
      setNotifications(p => p.map(x => x.id === n.id ? { ...x, is_dismissed: true, is_read: true } : x));
      setUnreadCount(c => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.action_url) router.push(n.action_url);
  };

  const activeNotifications = notifications.filter(n => !n.is_dismissed);
  const dismissedNotifications = notifications.filter(n => n.is_dismissed);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[360px] p-0 overflow-hidden"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={markAllRead}>
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[420px]">
          {notifications.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div>
              {/* Unread / active */}
              {activeNotifications.map(n => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onClick={() => handleClick(n)}
                  onDismiss={(e) => dismiss(n.id, e)}
                />
              ))}

              {/* Separator */}
              {activeNotifications.length > 0 && dismissedNotifications.length > 0 && (
                <div className="px-4 py-2 border-t border-border/50">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Earlier</p>
                </div>
              )}

              {/* Dismissed / read */}
              {dismissedNotifications.slice(0, 20).map(n => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onClick={() => handleClick(n)}
                  onDismiss={(e) => dismiss(n.id, e)}
                  dimmed
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Single notification row
// ---------------------------------------------------------------------------
function NotificationRow({
  notification: n,
  onClick,
  onDismiss,
  dimmed = false,
}: {
  notification: AppNotification;
  onClick: () => void;
  onDismiss: (e: React.MouseEvent) => void;
  dimmed?: boolean;
}) {
  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 border-b border-border/30 last:border-0',
        !n.is_dismissed && 'bg-primary/5',
        dimmed && 'opacity-60'
      )}
      onClick={onClick}
    >
      <div className="mt-0.5 shrink-0">
        <NotificationIcon type={n.notification_type} />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm leading-snug">{n.message}</p>
        <p className="text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </p>
      </div>
      {!n.is_dismissed && (
        <button
          onClick={onDismiss}
          className="shrink-0 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity mt-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
