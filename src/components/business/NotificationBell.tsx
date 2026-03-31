'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell, MessageSquare, Users, Calendar, Megaphone, Clock, X,
} from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  event_id: string | null;
  conversation_id: string | null;
  action_url: string | null;
}

const supabase = createClient();

export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifications((data || []) as Notification[]);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const markAsRead = async (notification: Notification) => {
    if (notification.is_read) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notification.id);
    setNotifications(prev =>
      prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
    );
  };

  const handleNotificationClick = async (notification: Notification) => {
    await markAsRead(notification);
    setOpen(false);

    if (notification.action_url) {
      router.push(notification.action_url);
    } else if (notification.conversation_id) {
      router.push(`/business-portal/messages?conversation=${notification.conversation_id}`);
    } else if (notification.event_id) {
      router.push(`/events/${notification.event_id}`);
    }
  };

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'new_message':   return <MessageSquare className="w-4 h-4" style={{ color: '#C6A664' }} />;
      case 'group_added':   return <Users className="w-4 h-4" style={{ color: '#C6A664' }} />;
      case 'new_event':     return <Calendar className="w-4 h-4" style={{ color: '#60a5fa' }} />;
      case 'event_reminder':return <Clock className="w-4 h-4" style={{ color: '#f59e0b' }} />;
      case 'broadcast':     return <Megaphone className="w-4 h-4" style={{ color: '#a78bfa' }} />;
      default:              return <Bell className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />;
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'relative',
          width: '36px', height: '36px', borderRadius: '8px',
          border: open ? '1px solid rgba(198,166,100,0.4)' : '1px solid rgba(255,255,255,0.1)',
          backgroundColor: open ? 'rgba(198,166,100,0.08)' : 'rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell style={{ width: '16px', height: '16px', color: open ? '#C6A664' : 'rgba(255,255,255,0.5)' }} />
        {unreadCount > 0 && (
          <div style={{
            position: 'absolute', top: '-4px', right: '-4px',
            minWidth: '18px', height: '18px', borderRadius: '9px',
            backgroundColor: '#C6A664', color: '#1A1A1A',
            fontSize: '0.625rem', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', lineHeight: 1,
            border: '2px solid #0a0a0a',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: '360px', maxHeight: '480px',
          backgroundColor: '#2E2E2E',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          zIndex: 100,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div className="flex items-center gap-2">
              <p style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '0.9375rem' }}>
                Notifications
              </p>
              {unreadCount > 0 && (
                <div style={{
                  backgroundColor: 'rgba(198,166,100,0.15)',
                  color: '#C6A664', fontSize: '0.6875rem', fontWeight: 700,
                  padding: '2px 7px', borderRadius: '10px',
                }}>
                  {unreadCount} new
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#C6A664'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'; }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  color: 'rgba(255,255,255,0.3)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '2px',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <X style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '40px 24px', textAlign: 'center',
              }}>
                <Bell style={{ width: '32px', height: '32px', color: 'rgba(255,255,255,0.1)', marginBottom: '12px' }} />
                <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.3)' }}>
                  You&apos;re all caught up
                </p>
              </div>
            ) : (
              notifications.map((n, i) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                    width: '100%', textAlign: 'left',
                    padding: '12px 16px',
                    backgroundColor: n.is_read ? 'transparent' : 'rgba(198,166,100,0.04)',
                    borderBottom: i < notifications.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    border: 'none', cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = n.is_read ? 'transparent' : 'rgba(198,166,100,0.04)'; }}
                >
                  {/* Icon */}
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {getIcon(n.type)}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '0.875rem', fontWeight: n.is_read ? 400 : 600,
                      color: n.is_read ? 'rgba(255,255,255,0.6)' : '#FFFFFF',
                      marginBottom: '2px', lineHeight: 1.3,
                    }}>
                      {n.title}
                    </p>
                    <p style={{
                      fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)',
                      lineHeight: 1.4,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {n.message}
                    </p>
                    <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!n.is_read && (
                    <div style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      backgroundColor: '#C6A664', flexShrink: 0, marginTop: '4px',
                    }} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}