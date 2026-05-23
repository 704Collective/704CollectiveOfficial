'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { ArrowLeft, Camera, Check, Search, WifiOff } from 'lucide-react';
import jsQR from 'jsqr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOfflineCheckIn } from '@/hooks/useOfflineCheckIn';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { AddWalkUpDialog } from '@/components/AddWalkUpDialog';

type AttendeeRow = {
  id: string;
  source: 'ticket' | 'public_rsvp';
  user_id: string | null;
  ticket_type: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  checked_in_at: string | null;
};

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
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);

  // Temporary diagnostic: eruda on-screen console for mobile debugging
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).eruda) return;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/eruda';
    script.onload = () => { (window as any).eruda?.init(); };
    document.body.appendChild(script);
  }, []);
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showAttendeeList, setShowAttendeeList] = useState(false);
  const [walkUpOpen, setWalkUpOpen] = useState(false);
  const [successOverlay, setSuccessOverlay] = useState<{ name: string; isWalkIn: boolean; isOffline?: boolean } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanningActiveRef = useRef(false);
  const scanFrameCountRef = useRef(0);
  const lastScanRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const audioContextRef = useRef<AudioContext | null>(null);

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

    const [ticketsResult, publicRsvpsResult] = await Promise.all([
      supabase
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
        .in('status', ['confirmed', 'rsvp']),
      supabase
        .from('event_public_rsvps')
        .select('id, first_name, last_name, email, phone, checked_in_at, status')
        .eq('event_id', eventId)
        .eq('status', 'rsvp'),
    ]);

    type ProfileJoin = { id: string; email: string; full_name: string | null; avatar_url: string | null } | null;

    const ticketAttendees: AttendeeRow[] = (ticketsResult.data || []).map(t => {
      const p = t.profiles as unknown as ProfileJoin;
      return {
        id: t.id,
        source: 'ticket' as const,
        user_id: t.user_id,
        ticket_type: t.ticket_type,
        full_name: p?.full_name || t.guest_name || 'Unknown',
        email: p?.email || t.guest_email || '',
        avatar_url: p?.avatar_url || null,
        checked_in_at: t.checked_in_at,
      };
    });

    const publicRsvpAttendees: AttendeeRow[] = (publicRsvpsResult.data || []).map(r => ({
      id: r.id,
      source: 'public_rsvp' as const,
      user_id: null,
      ticket_type: 'public_free',
      full_name: `${r.first_name} ${r.last_name}`.trim(),
      email: r.email,
      avatar_url: null,
      checked_in_at: r.checked_in_at,
    }));

    const merged = [...ticketAttendees, ...publicRsvpAttendees].sort((a, b) =>
      (a.full_name || '').localeCompare(b.full_name || '')
    );

    setAttendees(merged);
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

    const timer = setTimeout(() => {
      startScanner();
    }, 500);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [open, showAttendeeList]);

  const startScanner = async () => {
    if (scanningActiveRef.current) return;
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        setCameraError('Camera failed to start. Please tap Try Again.');
        return;
      }
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      scanningActiveRef.current = true;
      setIsScanning(true);
      console.log('[SCAN] camera started, video size:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
      rafRef.current = window.setInterval(scanFrame, 200) as unknown as number;
    } catch (err: any) {
      const name = err?.name || 'Error';
      if (name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings, then tap Try Again.');
      } else if (name === 'NotReadableError') {
        setCameraError('Camera is in use by another app or tab. Close other apps using the camera, then tap Try Again.');
      } else if (name === 'NotFoundError') {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError(`Camera failed to start. [${name}: ${err?.message || 'no detail'}]`);
      }
      setIsScanning(false);
    }
  };

  const scanFrame = () => {
    if (!scanningActiveRef.current) return;
    const video = videoRef.current;
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw > 0 && vh > 0) {
        const cropSize = Math.floor(Math.min(vw, vh) * 0.6);
        const sx = Math.floor((vw - cropSize) / 2);
        const sy = Math.floor((vh - cropSize) / 2);
        canvas.width = cropSize;
        canvas.height = cropSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize);
          const imageData = ctx.getImageData(0, 0, cropSize, cropSize);
          const result = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
          console.log('[SCAN] frame', cropSize, 'x', cropSize, 'readyState', video.readyState, 'jsqr:', result ? result.data : 'null');
          if (result && result.data) {
            const now = Date.now();
            if (result.data !== lastScanRef.current.text || now - lastScanRef.current.at > 3000) {
              lastScanRef.current = { text: result.data, at: now };
              handleQRScan(result.data);
            }
          }
        }
      } else {
        console.log('[SCAN] video has no dimensions yet', vw, vh);
      }
    } else {
      console.log('[SCAN] video not ready, readyState', video?.readyState);
    }
  };

  const stopScanner = () => {
    scanningActiveRef.current = false;
    if (rafRef.current !== null) {
      clearInterval(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setIsScanning(false);
  };

  const retryScanner = async () => {
    setCameraError(null);
    stopScanner();
    setTimeout(() => { startScanner(); }, 300);
  };

  const handleQRScan = async (scannedText: string) => {
    try {
      // Legacy guest_passes table (old GP-XXXXXX format)
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

        if (pass.event_id && pass.event_id !== eventId) {
          toast.error('This guest pass is for a different event');
          return;
        }

        const { error: updateError } = await supabase
          .from('guest_passes')
          .update({ status: 'used', used_at: new Date().toISOString() })
          .eq('id', pass.id);

        if (updateError) {
          toast.error('Failed to check in guest');
          return;
        }

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

      // New guest pass flow - UUID guest_pass_code stored in ticket metadata
      // Try matching a guest_pass ticket by its metadata.guest_pass_code before
      // falling through to the regular member user-ID lookup.
      if (!scannedText.includes('@') && scannedText.length >= 32) {
        if (!isOnline) {
          toast.error('Cannot verify guest passes while offline');
          return;
        }

        const { data: guestTicket } = await supabase
          .from('tickets')
          .select('id, guest_name, guest_email, status, checked_in_at, metadata')
          .eq('source', 'guest_pass')
          .eq('event_id', eventId)
          .filter('metadata->>guest_pass_code', 'eq', scannedText)
          .maybeSingle();

        if (guestTicket) {
          if (guestTicket.checked_in_at) {
            toast.info(`${guestTicket.guest_name || 'Guest'} is already checked in`);
            return;
          }

          const { error: ciError } = await supabase
            .from('tickets')
            .update({ checked_in_at: new Date().toISOString(), checked_in_by: adminId })
            .eq('id', guestTicket.id);

          if (ciError) {
            toast.error('Failed to check in guest');
            return;
          }

          // Look up inviter name for the success message
          const inviterUserId = (guestTicket.metadata as Record<string, unknown> | null)?.inviter_user_id as string | undefined;
          let inviterName = 'a member';
          if (inviterUserId) {
            const { data: inviter } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', inviterUserId)
              .is('deleted_at', null)
              .single();
            if (inviter?.full_name) inviterName = inviter.full_name;
          }

          const guestDisplayName = guestTicket.guest_name || 'Guest';
          toast.success(`Guest pass valid! Welcome ${guestDisplayName}, invited by ${inviterName}`);
          addRecentCheckIn(`${guestDisplayName} (Guest)`, false, false);
          fetchAttendees();
          return;
        }
      }

      // Member check-in by profile UUID
      // MembershipCard encodes the member's profile.id (UUID, 36 chars).
      // Look up the member, find or create their ticket for this event, stamp check-in.
      if (!scannedText.includes('@') && scannedText.length >= 32) {
        if (!isOnline) {
          toast.error('Cannot verify member check-ins while offline');
          return;
        }

        const { data: member } = await supabase
          .from('profiles')
          .select('id, full_name, member_type, subscription_status, membership_override, deleted_at')
          .eq('id', scannedText)
          .maybeSingle();

        if (!member) {
          toast.error('QR code not recognized');
          return;
        }

        if (member.deleted_at) {
          toast.error('This member account is closed');
          return;
        }

        const isActive =
          member.subscription_status === 'active' ||
          member.subscription_status === 'trialing' ||
          member.membership_override === true;

        if (!isActive) {
          // Warn but still allow check-in - admin's discretion
          toast.warning(`${member.full_name || 'Member'} is not currently active`, {
            description: 'You may admit them at your discretion',
          });
        }

        // Find the most recent non-cancelled ticket for this member + event
        const { data: existingTicket } = await supabase
          .from('tickets')
          .select('id, checked_in_at, status')
          .eq('user_id', scannedText)
          .eq('event_id', eventId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingTicket) {
          if (existingTicket.checked_in_at) {
            toast.info(`${member.full_name || 'Member'} is already checked in`, {
              description: `Checked in at ${format(new Date(existingTicket.checked_in_at), 'h:mm a')}`,
            });
            return;
          }
          const { error: ciError } = await supabase
            .from('tickets')
            .update({
              checked_in_at: new Date().toISOString(),
              checked_in_by: adminId,
            })
            .eq('id', existingTicket.id);
          if (ciError) {
            console.error('[CHECK-IN] Member check-in update failed', ciError);
            toast.error('Failed to check in member');
            return;
          }
        } else {
          // No ticket - create a walk-in ticket and check them in immediately
          const { error: insertError } = await supabase
            .from('tickets')
            .insert({
              user_id: scannedText,
              event_id: eventId,
              ticket_type: 'member_free',
              status: 'confirmed',
              source: 'walk_in_qr',
              amount_paid_cents: 0,
              checked_in_at: new Date().toISOString(),
              checked_in_by: adminId,
            });
          if (insertError) {
            console.error('[CHECK-IN] Walk-in ticket insert failed', insertError);
            toast.error('Failed to check in member');
            return;
          }
        }

        // Stamp profile so CRM/analytics know this member attended
        await supabase
          .from('profiles')
          .update({ last_attended_at: new Date().toISOString() })
          .eq('id', scannedText);

        toast.success(`Welcome, ${member.full_name || 'Member'}!`);
        addRecentCheckIn(member.full_name || 'Member', false, false);
        fetchAttendees();
        return;
      }

      // Fallback: nothing matched
      toast.error('QR code not recognized');
    } finally {
      // No pause/resume needed - scanLoop debounce (lastScanRef, 3s) handles re-scan suppression
    }
  };

  const checkInAttendee = async (attendee: AttendeeRow, isWalkIn: boolean = false) => {
    const now = new Date().toISOString();
    const name = attendee.full_name || attendee.email;

    let error;
    if (attendee.source === 'public_rsvp') {
      ({ error } = await supabase
        .from('event_public_rsvps')
        .update({ checked_in_at: now, checked_in_by: adminId })
        .eq('id', attendee.id));
    } else {
      ({ error } = await supabase
        .from('tickets')
        .update({ checked_in_at: now, checked_in_by: adminId })
        .eq('id', attendee.id));
    }

    if (error) {
      toast.error('Failed to check in');
      return;
    }

    toast.success(`${name} checked in!`);
    addRecentCheckIn(name, isWalkIn);
    fetchAttendees();
  };

  const playSuccessSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      
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
      playTone(880, now, 0.15);
      playTone(1318.5, now + 0.1, 0.2);
    } catch (err) {
      // Audio not supported, ignore
    }
  }, []);

  const triggerHaptic = useCallback(() => {
    if (navigator.vibrate) {
      navigator.vibrate([50, 30, 100]);
    }
  }, []);

  const showSuccessConfirmation = useCallback((name: string, isWalkIn: boolean, isOffline: boolean = false) => {
    setSuccessOverlay({ name, isWalkIn, isOffline });
    playSuccessSound();
    triggerHaptic();
    
    setTimeout(() => {
      setSuccessOverlay(null);
    }, 1500);
  }, [playSuccessSound, triggerHaptic]);

  const addRecentCheckIn = (name: string, isWalkIn: boolean, isOffline: boolean = false) => {
    setRecentCheckIns(prev => [
      { name, time: format(new Date(), 'h:mm a'), isWalkIn },
      ...prev.slice(0, 4),
    ]);
    showSuccessConfirmation(name, isWalkIn, isOffline);
  };

  const handleManualCheckIn = async (attendee: AttendeeRow) => {
    await checkInAttendee(attendee, false);
    setShowAttendeeList(false);
  };

  const filteredAttendees = attendees.filter(a =>
    !a.checked_in_at && (
      a.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
    )
  );

  const checkedInCount = attendees.filter(a => a.checked_in_at).length;
  const totalCount = attendees.length;
  const progressPercent = totalCount > 0 ? (checkedInCount / totalCount) * 100 : 0;

  if (!open) return null;

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
        <Button
          onClick={() => setWalkUpOpen(true)}
          variant="outline"
          size="sm"
          style={{ borderColor: '#C6A664', color: '#C6A664', backgroundColor: 'transparent' }}
          className="hover:opacity-90 shrink-0"
        >
          + Walk-up
        </Button>
        <OfflineIndicator
          isOnline={isOnline}
          pendingCount={pendingCount}
          isSyncing={isSyncing}
          onManualSync={syncPendingCheckIns}
        />
      </div>

      {showAttendeeList ? (
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
                  key={attendee.id}
                  className="p-3 rounded-lg border border-border bg-card flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={attendee.avatar_url || undefined} />
                      <AvatarFallback>
                        {(attendee.full_name || attendee.email).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{attendee.full_name || 'No name'}</p>
                      <p className="text-sm text-muted-foreground">{attendee.email}</p>
                      {attendee.source === 'public_rsvp' && (
                        <span className="text-xs text-muted-foreground/60">Public RSVP</span>
                      )}
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
        <>
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm aspect-square rounded-lg overflow-hidden bg-muted relative">
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                muted
                playsInline
              />
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-4 z-10">
                  <div className="text-center">
                    <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-destructive text-sm mb-4">{cameraError}</p>
                    <Button onClick={retryScanner} variant="outline">
                      Try Again
                    </Button>
                    {cameraError && (cameraError.toLowerCase().includes('denied') || cameraError.toLowerCase().includes('permission') || cameraError.toLowerCase().includes('allowed')) && (
                      <p className="text-xs text-muted-foreground mt-3">
                        If you previously blocked the camera, enable it in your browser site settings, then tap Try Again.
                      </p>
                    )}
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

      <AddWalkUpDialog
        open={walkUpOpen}
        onOpenChange={setWalkUpOpen}
        eventId={eventId}
        eventTitle={eventTitle}
        adminId={adminId}
        onCheckedIn={(name) => {
          addRecentCheckIn(name, true, false);
        }}
      />
    </div>,
    document.body
  );
}
