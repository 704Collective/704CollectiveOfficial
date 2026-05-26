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
import { canAttendEvent } from '@/lib/eventEligibility';

type AttendeeRow = {
  id: string;                 // attendance_credentials.id
  credential_type: string;    // member_rsvp | guest_pass | public_rsvp
  person_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;  // always null now; people has no avatar
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

  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showAttendeeList, setShowAttendeeList] = useState(false);
  const [successOverlay, setSuccessOverlay] = useState<{ name: string; isWalkIn: boolean; isOffline?: boolean } | null>(null);
  const [eventTier, setEventTier] = useState<string>('public');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanningActiveRef = useRef(false);
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

    // Attendees now come from attendance_credentials (the canonical table).
    // Event-scoped passes: member_rsvp, guest_pass, public_rsvp, active|used.
    const { data: creds, error: credErr } = await supabase
      .from('attendance_credentials')
      .select('id, person_id, credential_type, checked_in_at')
      .eq('event_id', eventId)
      .in('credential_type', ['member_rsvp', 'guest_pass', 'public_rsvp'])
      .in('status', ['active', 'used']);

    if (credErr || !creds) {
      setAttendees([]);
      setLoading(false);
      return;
    }

    // Resolve people rows for names + emails in one batched query.
    const personIds = Array.from(new Set(creds.map(c => c.person_id).filter(Boolean)));
    const peopleById: Record<string, { full_name: string | null; email: string | null }> = {};
    if (personIds.length > 0) {
      const { data: people } = await supabase
        .from('people')
        .select('id, full_name, email')
        .in('id', personIds);
      for (const p of (people || [])) {
        peopleById[p.id] = { full_name: p.full_name, email: p.email };
      }
    }

    const rows: AttendeeRow[] = creds.map(c => {
      const p = peopleById[c.person_id];
      return {
        id: c.id,
        credential_type: c.credential_type,
        person_id: c.person_id,
        full_name: p?.full_name || 'Unknown',
        email: p?.email || '',
        avatar_url: null,
        checked_in_at: c.checked_in_at,
      };
    }).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

    setAttendees(rows);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    if (open && eventId) {
      fetchAttendees();
    }
  }, [open, eventId, fetchAttendees]);

  useEffect(() => {
    if (!open || !eventId) return;
    (async () => {
      const { data } = await supabase
        .from('events')
        .select('required_tier')
        .eq('id', eventId)
        .maybeSingle();
      setEventTier(data?.required_tier ?? 'public');
    })();
  }, [open, eventId]);

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
          if (result && result.data) {
            const now = Date.now();
            if (result.data !== lastScanRef.current.text || now - lastScanRef.current.at > 3000) {
              lastScanRef.current = { text: result.data, at: now };
              handleQRScan(result.data);
            }
          }
        }
      }
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
    const token = scannedText.trim();

    // Ignore obvious non-tokens (e.g. an email QR).
    if (!token || token.includes('@')) {
      toast.error('Code not recognized');
      return;
    }

    if (!isOnline) {
      // Online connectivity is required to validate a credential against the
      // database. The offline queue path is handled separately (manual list).
      toast.error('Cannot verify passes while offline');
      return;
    }

    // One lookup: find the credential by its token.
    const { data: credential, error: credErr } = await supabase
      .from('attendance_credentials')
      .select('id, person_id, event_id, credential_type, status, checked_in_at')
      .eq('token', token)
      .maybeSingle();

    if (credErr || !credential) {
      toast.error('Code not recognized');
      return;
    }

    // Status checks.
    if (credential.status === 'voided') {
      toast.error('This pass is no longer valid');
      return;
    }
    if (credential.status === 'expired') {
      toast.error('This pass has expired');
      return;
    }
    if (credential.status !== 'active' && credential.status !== 'used') {
      toast.error('This pass is not valid');
      return;
    }

    // Event scoping: an event-specific credential must match THIS event.
    // A general member pass has event_id = null and works at any event.
    if (credential.event_id && credential.event_id !== eventId) {
      toast.error('This pass is for a different event');
      return;
    }

    // Load the person.
    const { data: person, error: personErr } = await supabase
      .from('people')
      .select('id, full_name, member_tier, roles, member_status')
      .eq('id', credential.person_id)
      .maybeSingle();

    if (personErr || !person) {
      toast.error('Code not recognized');
      return;
    }

    const personName = person.full_name || 'Guest';

    // Already checked in?
    if (credential.checked_in_at) {
      toast.info(`${personName} is already checked in`, {
        description: `Checked in at ${format(new Date(credential.checked_in_at), 'h:mm a')}`,
      });
      return;
    }

    // Tier eligibility - one canonical helper, same as the website.
    const eligibility = canAttendEvent(
      { member_tier: person.member_tier, roles: person.roles ?? [] },
      { required_tier: eventTier }
    );
    if (!eligibility.canAttend) {
      toast.error(eligibility.reason || 'Not eligible for this event');
      return;
    }

    // Stamp the check-in.
    const { error: ciErr } = await supabase
      .from('attendance_credentials')
      .update({
        checked_in_at: new Date().toISOString(),
        status: 'used',
      })
      .eq('id', credential.id);

    if (ciErr) {
      console.error('[CHECK-IN] credential update failed', ciErr);
      toast.error('Failed to check in');
      return;
    }

    // checked_in_by expects a person id. adminId is an auth user id; the
    // people row for the admin is found via metadata.profile_id. Best-effort:
    // if it resolves, stamp it; if not, the check-in still succeeded above.
    try {
      const { data: adminPerson } = await supabase
        .from('people')
        .select('id')
        .filter('metadata->>profile_id', 'eq', adminId)
        .maybeSingle();
      if (adminPerson) {
        await supabase
          .from('attendance_credentials')
          .update({ checked_in_by: adminPerson.id })
          .eq('id', credential.id);
      }
    } catch {
      // non-fatal - check-in already recorded
    }

    const label =
      credential.credential_type === 'guest_pass' ? `${personName} (Guest)`
      : credential.credential_type === 'public_rsvp' ? `${personName} (Public RSVP)`
      : personName;

    toast.success(`Welcome, ${personName}!`);
    addRecentCheckIn(label, false, false);
    fetchAttendees();
  };

  const checkInAttendee = async (attendee: AttendeeRow, isWalkIn: boolean = false) => {
    const name = attendee.full_name || attendee.email;

    // Manual check-in stamps the attendance_credential, mirroring the QR path.
    const { error } = await supabase
      .from('attendance_credentials')
      .update({ checked_in_at: new Date().toISOString(), status: 'used' })
      .eq('id', attendee.id);

    if (error) {
      toast.error('Failed to check in');
      return;
    }

    // checked_in_by expects a people id; adminId is an auth user id.
    // Best-effort, same as the QR path - check-in already succeeded above.
    try {
      const { data: adminPerson } = await supabase
        .from('people')
        .select('id')
        .filter('metadata->>profile_id', 'eq', adminId)
        .maybeSingle();
      if (adminPerson) {
        await supabase
          .from('attendance_credentials')
          .update({ checked_in_by: adminPerson.id })
          .eq('id', attendee.id);
      }
    } catch {
      // non-fatal - check-in already recorded
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
                      {attendee.credential_type === 'public_rsvp' && (
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

    </div>,
    document.body
  );
}
