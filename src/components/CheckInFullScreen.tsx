'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { ArrowLeft, Camera, Check, Search, WifiOff } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOfflineCheckIn } from '@/hooks/useOfflineCheckIn';
import { OfflineIndicator } from '@/components/OfflineIndicator';

interface Attendee {
  ticketId: string;
  userId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  checkedInAt: string | null;
  ticketType: string;
}

interface RecentCheckIn {
  name: string;
  time: string;
  isWalkIn: boolean;
}

interface CheckInFullScreenProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  adminId: string;
}

export function CheckInFullScreen({ 
  open, 
  onClose, 
  eventId, 
  eventTitle, 
  adminId 
}: CheckInFullScreenProps) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showAttendeeList, setShowAttendeeList] = useState(false);
  const [successOverlay, setSuccessOverlay] = useState<{ name: string; isWalkIn: boolean; isOffline?: boolean } | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scannerContainerId = useRef(`qr-scanner-${Math.random().toString(36).slice(2)}`).current;

  const { 
    isOnline, 
    pendingCount, 
    isSyncing, 
    queueCheckIn, 
    isInPendingQueue,
    syncPendingCheckIns 
  } = useOfflineCheckIn({ eventId, adminId });

  const fetchAttendees = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        id,
        user_id,
        checked_in_at,
        ticket_type,
        guest_email,
        guest_name,
        profiles!tickets_user_id_fkey (
          id,
          email,
          full_name,
          avatar_url
        )
      `)
      .eq('event_id', eventId)
      .eq('status', 'confirmed');

    if (!error && data) {
      type ProfileJoin = { id: string; email: string; full_name: string | null; avatar_url: string | null } | null;
      const attendeeList: Attendee[] = data.map(ticket => {
        const p = ticket.profiles as ProfileJoin;
        return {
          ticketId: ticket.id,
          userId: ticket.user_id || '',
          email: p ? p.email : ticket.guest_email || '',
          fullName: p ? p.full_name : ticket.guest_name,
          avatarUrl: p ? p.avatar_url : null,
          checkedInAt: ticket.checked_in_at,
          ticketType: ticket.ticket_type,
        };
      });
      setAttendees(attendeeList);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    if (open && eventId) {
      fetchAttendees();
    }
  }, [open, eventId, fetchAttendees]);

  useEffect(() => {
    if (!open) {
      stopScanner();
      return;
    }

    if (showAttendeeList) {
      stopScanner();
      return;
    }

    // Start scanner with delay to ensure DOM is ready
    const timer = setTimeout(() => {
      startScanner();
    }, 500);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [open, showAttendeeList]);

  const startScanner = async () => {
    if (scannerRef.current) return;
    if (!containerRef.current) return;
    
    // Create scanner element imperatively to avoid React DOM conflicts
    const existingEl = document.getElementById(scannerContainerId);
    if (existingEl) {
      existingEl.remove();
    }
    
    const scannerEl = document.createElement('div');
    scannerEl.id = scannerContainerId;
    scannerEl.style.width = '100%';
    scannerEl.style.height = '100%';
    containerRef.current.appendChild(scannerEl);
    
    try {
      setCameraError(null);
      
      // Request camera permission explicitly first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        stream.getTracks().forEach(track => track.stop());
      } catch (permErr: any) {
        if (permErr.name === 'NotAllowedError') {
          setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
          return;
        } else if (permErr.name === 'NotFoundError') {
          setCameraError('No camera found on this device.');
          return;
        }
        throw permErr;
      }
      
      const scanner = new Html5Qrcode(scannerContainerId);
      scannerRef.current = scanner;
      
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleQRScan(decodedText);
        },
        () => {} // Ignore scan errors
      );
      
      setIsScanning(true);
    } catch (err: any) {
      console.error('Scanner error:', err);
      setCameraError(err.message || 'Failed to start camera.');
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    
    scannerRef.current = null;
    
    try {
      const state = scanner.getState();
      if (state === 2) { // SCANNING state
        await scanner.stop();
      }
    } catch (err) {
      // Ignore stop errors
    }
    
    // Remove the scanner element entirely (outside React's control)
    const scannerEl = document.getElementById(scannerContainerId);
    if (scannerEl) {
      scannerEl.remove();
    }
    
    setIsScanning(false);
  };

  const handleQRScan = async (scannedText: string) => {
    // Pause scanning briefly to prevent duplicate scans
    if (scannerRef.current) {
      try {
        await scannerRef.current.pause(true);
      } catch {}
    }

    try {
      // ── Guest Pass QR code handling ──
      if (scannedText.startsWith("GP-")) {
        if (!isOnline) {
          toast.error('Cannot verify guest passes while offline');
          return;
        }

        const { data: pass, error: passError } = await supabase
          .from('guest_passes')
          .select('*')
          .eq('qr_code', scannedText)
          .single();

        if (passError || !pass) {
          toast.error('Guest pass not found');
          return;
        }

        if (pass.status === 'used') {
          toast.info(`This guest pass was already used${pass.used_at ? ` on ${format(new Date(pass.used_at), 'MMM d')}` : ''}`);
          return;
        }

        if (pass.status === 'cancelled') {
          toast.error('This guest pass has been cancelled');
          return;
        }

        if (pass.status === 'expired' || new Date(pass.expires_at) < new Date()) {
          toast.error('This guest pass has expired');
          return;
        }

        // Check event match if pass is for a specific event
        if (pass.event_id && pass.event_id !== eventId) {
          toast.error('This guest pass is for a different event');
          return;
        }

        // Mark as used
        const { error: updateError } = await supabase
          .from('guest_passes')
          .update({ status: 'used', used_at: new Date().toISOString() })
          .eq('id', pass.id);

        if (updateError) {
          toast.error('Failed to check in guest');
          return;
        }

        // Get member name
        const { data: member } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', pass.member_id)
          .is('deleted_at', null)
          .single();

        const memberName = member?.full_name || 'a member';
        toast.success(`Guest pass valid! Welcome ${pass.guest_name}, invited by ${memberName}`);
        addRecentCheckIn(`${pass.guest_name} (Guest)`, false, false);
        return;
      }

      // ── Standard ticket/member QR code handling ──
      const scannedUserId = scannedText;

      // Check if already in pending queue (offline)
      const inQueue = await isInPendingQueue(scannedUserId);
      if (inQueue) {
        toast.info('Already queued for check-in');
        return;
      }

      // 1. Check for existing ticket
      const existingAttendee = attendees.find(a => a.userId === scannedUserId);
      
      if (existingAttendee) {
        if (existingAttendee.checkedInAt) {
          toast.info(`${existingAttendee.fullName || existingAttendee.email} is already checked in`);
        } else if (!isOnline) {
          // OFFLINE: Queue the check-in
          await queueCheckIn(
            existingAttendee.ticketId,
            scannedUserId,
            existingAttendee.fullName || existingAttendee.email,
            false
          );
          toast.info('Check-in saved offline');
          addRecentCheckIn(existingAttendee.fullName || existingAttendee.email, false, true);
        } else {
          await checkInTicket(existingAttendee.ticketId, existingAttendee.fullName || existingAttendee.email, false);
        }
      } else {
        // 2. No ticket - check if active member for walk-in
        if (!isOnline) {
          toast.error('Cannot verify membership while offline');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, subscription_status')
          .eq('id', scannedUserId)
          .is('deleted_at', null)
          .maybeSingle();

        if (profileError || !profile) {
          toast.error('User not found');
        } else if (profile.subscription_status !== 'active') {
          toast.error(`${profile.full_name || profile.email} is not an active Social member`);
        } else {
          // 3. Create walk-in ticket and check in immediately
          const { error: ticketError } = await supabase
            .from('tickets')
            .insert({
              event_id: eventId,
              user_id: scannedUserId,
              ticket_type: 'walk_in',
              status: 'confirmed',
              checked_in_at: new Date().toISOString(),
              checked_in_by: adminId,
            });

          if (ticketError) {
            toast.error('Failed to create walk-in ticket');
          } else {
            toast.success(`Walk-in: ${profile.full_name || profile.email} checked in!`);
            addRecentCheckIn(profile.full_name || profile.email, true, false);
            fetchAttendees();
          }
        }
      }
    } finally {
      // Resume scanning after a brief delay
      setTimeout(() => {
        if (scannerRef.current) {
          try {
            scannerRef.current.resume();
          } catch {}
        }
      }, 1500);
    }
  };

  const checkInTicket = async (ticketId: string, name: string, isWalkIn: boolean) => {
    const { error } = await supabase
      .from('tickets')
      .update({
        checked_in_at: new Date().toISOString(),
        checked_in_by: adminId,
      })
      .eq('id', ticketId);

    if (error) {
      toast.error('Failed to check in');
      return;
    }

    toast.success(`${name} checked in!`);
    addRecentCheckIn(name, isWalkIn);
    fetchAttendees();
  };

  // Play success sound using Web Audio API
  const playSuccessSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      
      // Create a pleasant two-tone chime
      const playTone = (freq: number, startTime: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      
      const now = ctx.currentTime;
      playTone(880, now, 0.15); // A5
      playTone(1318.5, now + 0.1, 0.2); // E6
    } catch (err) {
      // Audio not supported, ignore
    }
  }, []);

  // Trigger haptic feedback
  const triggerHaptic = useCallback(() => {
    if (navigator.vibrate) {
      navigator.vibrate([50, 30, 100]); // Short-pause-long pattern
    }
  }, []);

  // Show success overlay with animation
  const showSuccessConfirmation = useCallback((name: string, isWalkIn: boolean, isOffline: boolean = false) => {
    setSuccessOverlay({ name, isWalkIn, isOffline });
    playSuccessSound();
    triggerHaptic();
    
    // Hide after 1.5 seconds
    setTimeout(() => {
      setSuccessOverlay(null);
    }, 1500);
  }, [playSuccessSound, triggerHaptic]);

  const addRecentCheckIn = (name: string, isWalkIn: boolean, isOffline: boolean = false) => {
    setRecentCheckIns(prev => [
      { name, time: format(new Date(), 'h:mm a'), isWalkIn },
      ...prev.slice(0, 4), // Keep last 5
    ]);
    showSuccessConfirmation(name, isWalkIn, isOffline);
  };

  const handleManualCheckIn = async (attendee: Attendee) => {
    await checkInTicket(attendee.ticketId, attendee.fullName || attendee.email, false);
    setShowAttendeeList(false);
  };

  const filteredAttendees = attendees.filter(a => 
    !a.checkedInAt && (
      a.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
    )
  );

  const checkedInCount = attendees.filter(a => a.checkedInAt).length;
  const totalCount = attendees.length;
  const progressPercent = totalCount > 0 ? (checkedInCount / totalCount) * 100 : 0;

  if (!open) return null;

  // Use portal to render outside of React tree for better DOM control
  return createPortal(
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Success Overlay */}
      {successOverlay && (
        <div className={`fixed inset-0 z-[60] flex items-center justify-center animate-in fade-in duration-200 ${successOverlay.isOffline ? 'bg-amber-500/10' : 'bg-background/95'}`}>
          <div className="text-center animate-in zoom-in-95 duration-300">
            <div className={`w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center ${successOverlay.isOffline ? 'bg-amber-500' : 'bg-green-500'}`}>
              {successOverlay.isOffline ? (
                <WifiOff className="w-12 h-12 text-white" strokeWidth={3} />
              ) : (
                <Check className="w-12 h-12 text-white" strokeWidth={3} />
              )}
            </div>
            <h2 className="text-2xl font-bold mb-1">{successOverlay.name}</h2>
            <p className="text-lg text-muted-foreground">
              {successOverlay.isOffline 
                ? 'Saved Offline' 
                : successOverlay.isWalkIn 
                  ? 'Walk-in Checked In!' 
                  : 'Checked In!'}
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h2 className="font-semibold">{eventTitle}</h2>
          <p className="text-sm text-muted-foreground">Event Check-in</p>
        </div>
        <OfflineIndicator 
          isOnline={isOnline} 
          pendingCount={pendingCount} 
          isSyncing={isSyncing}
          onManualSync={syncPendingCheckIns}
        />
      </div>

      {showAttendeeList ? (
        /* Attendee List View */
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="ghost" size="sm" onClick={() => setShowAttendeeList(false)}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Scanner
            </Button>
          </div>
          
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search attendees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : filteredAttendees.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {search ? 'No matching attendees' : 'All attendees checked in!'}
              </div>
            ) : (
              filteredAttendees.map(attendee => (
                <div
                  key={attendee.ticketId}
                  className="p-3 rounded-lg border border-border bg-card flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={attendee.avatarUrl || undefined} />
                      <AvatarFallback>
                        {(attendee.fullName || attendee.email).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{attendee.fullName || 'No name'}</p>
                      <p className="text-sm text-muted-foreground">{attendee.email}</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => handleManualCheckIn(attendee)}>
                    Check In
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Scanner View */
        <>
          {/* Scanner Area */}
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <div 
              ref={containerRef}
              className="w-full max-w-sm aspect-square rounded-lg overflow-hidden bg-muted relative"
            >
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-4 z-10">
                  <div className="text-center">
                    <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-destructive text-sm mb-4">{cameraError}</p>
                    <Button onClick={startScanner} variant="outline">
                      Try Again
                    </Button>
                  </div>
                </div>
              )}
              
              {!isScanning && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <div className="text-center">
                    <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-2 animate-pulse" />
                    <p className="text-muted-foreground">Starting camera...</p>
                  </div>
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground text-center mt-4">
              Point camera at member's QR code
            </p>

            {/* Stats */}
            <div className="w-full max-w-sm mt-6 p-4 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold">
                  {checkedInCount} / {totalCount}
                </span>
                <span className="text-sm text-muted-foreground">Checked In</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          </div>

          {/* Recent Check-ins */}
          {recentCheckIns.length > 0 && (
            <div className="p-4 border-t border-border">
              <p className="text-sm font-medium mb-2">Recent Check-ins</p>
              <div className="space-y-1">
                {recentCheckIns.map((checkIn, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="flex-1">
                      {checkIn.name}
                      {checkIn.isWalkIn && (
                        <span className="ml-2 text-xs bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded">
                          Walk-in
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">{checkIn.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="p-4 border-t border-border">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setShowAttendeeList(true)}
            >
              <Search className="w-4 h-4 mr-2" />
              Search & Manual Check-in
            </Button>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
