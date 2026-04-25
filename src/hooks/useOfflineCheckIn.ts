'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  addPendingCheckIn, 
  getPendingCheckIns, 
  markAsSynced, 
  clearSyncedCheckIns,
  getPendingCount,
  isUserPendingCheckIn,
  PendingCheckIn 
} from '@/lib/offlineStorage';
import { toast } from 'sonner';

interface UseOfflineCheckInProps {
  eventId: string;
  adminId: string;
}

export const useOfflineCheckIn = ({ eventId, adminId }: UseOfflineCheckInProps) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Update pending count
  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount(eventId);
    setPendingCount(count);
  }, [eventId]);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Add check-in to offline queue
  const queueCheckIn = useCallback(async (
    ticketId: string | null,
    userId: string,
    name: string,
    isWalkIn: boolean
  ): Promise<PendingCheckIn> => {
    const record = await addPendingCheckIn({
      ticketId,
      userId,
      eventId,
      adminId,
      name,
      isWalkIn,
      timestamp: new Date().toISOString(),
    });
    await refreshPendingCount();
    return record;
  }, [eventId, adminId, refreshPendingCount]);

  // Check if user is already in pending queue
  const isInPendingQueue = useCallback(async (userId: string): Promise<boolean> => {
    return isUserPendingCheckIn(eventId, userId);
  }, [eventId]);

  // Sync pending check-ins to database
  const syncPendingCheckIns = useCallback(async (): Promise<number> => {
    if (isSyncing || !isOnline) return 0;

    setIsSyncing(true);
    let syncedCount = 0;

    try {
      const pending = await getPendingCheckIns(eventId);

      for (const checkIn of pending) {
        try {
          // TODO: offline check-in currently only supports ticket rows.
          // Public RSVPs (event_public_rsvps) require online connectivity to check in —
          // the manual attendee list in CheckInFullScreen shows a "Cannot verify membership
          // while offline" guard. A future improvement would store the source ('ticket' |
          // 'public_rsvp') in the PendingCheckIn record and dispatch to the correct table
          // during sync.
          if (checkIn.isWalkIn && !checkIn.ticketId) {
            // Resolve ticket_type at sync time — 'walk_in' is not a valid enum value
            const [{ data: walkInEvent }, { data: walkInProf }] = await Promise.all([
              supabase.from('events').select('access_type').eq('id', checkIn.eventId).single(),
              supabase.from('profiles').select('subscription_status, membership_override, deleted_at').eq('id', checkIn.userId).maybeSingle(),
            ]);

            const isMember = !!walkInProf
              && walkInProf.deleted_at == null
              && (walkInProf.subscription_status === 'active'
                  || walkInProf.subscription_status === 'trialing'
                  || walkInProf.membership_override === true);

            let resolvedTicketType: string;
            if (isMember) {
              resolvedTicketType = 'member_free';
            } else if (walkInEvent?.access_type === 'public_free') {
              resolvedTicketType = 'public_free';
            } else {
              resolvedTicketType = 'comp';
            }

            // Create walk-in ticket
            const { error: ticketError } = await supabase
              .from('tickets')
              .insert([{
                event_id: checkIn.eventId,
                user_id: checkIn.userId,
                ticket_type: resolvedTicketType,
                status: 'confirmed',
                source: 'walk_in',
                amount_paid_cents: 0,
                checked_in_at: checkIn.timestamp,
                checked_in_by: checkIn.adminId,
              }]);

            if (ticketError) throw ticketError;
          } else if (checkIn.ticketId) {
            // Update existing ticket
            const { error } = await supabase
              .from('tickets')
              .update({
                checked_in_at: checkIn.timestamp,
                checked_in_by: checkIn.adminId,
              })
              .eq('id', checkIn.ticketId);

            if (error) throw error;
          }

          await markAsSynced(checkIn.id);
          syncedCount++;
        } catch (err) {
          console.error('Failed to sync check-in:', checkIn.id, err);
          // Continue with other check-ins
        }
      }

      // Clean up synced records
      await clearSyncedCheckIns();
      await refreshPendingCount();

      return syncedCount;
    } finally {
      setIsSyncing(false);
    }
  }, [eventId, isOnline, isSyncing, refreshPendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      syncPendingCheckIns().then(count => {
        if (count > 0) {
          toast.success(`Synced ${count} offline check-in${count > 1 ? 's' : ''}`);
        }
      });
    }
  }, [isOnline, pendingCount, isSyncing, syncPendingCheckIns]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    queueCheckIn,
    isInPendingQueue,
    syncPendingCheckIns,
    refreshPendingCount,
  };
};
