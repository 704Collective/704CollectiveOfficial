'use client';

import { useRouter } from 'next/navigation';
import { PartyPopper, Check, Calendar, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AddToCalendarButtons } from '@/components/AddToCalendarButtons';

type ThankYouType = 'new_member' | 'member' | 'guest';

interface ThankYouModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ThankYouType;
  event?: {
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    location: string;
  };
}

export function ThankYouModal({ open, onOpenChange, type, event }: ThankYouModalProps) {
  const router = useRouter();

  const handleNavigate = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4">
            {type === 'new_member' ? (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <PartyPopper className="w-8 h-8 text-primary" />
              </div>
            ) : type === 'member' ? (
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-500" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <PartyPopper className="w-8 h-8 text-primary" />
              </div>
            )}
          </div>
          <DialogTitle className="text-2xl text-center">
            {type === 'new_member' && 'Welcome to 704 Collective!'}
            {type === 'member' && 'Thank You for RSVPing!'}
            {type === 'guest' && 'Thank You for Your Purchase!'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-center text-muted-foreground">
            {type === 'new_member' && 'Your membership is active. RSVP for upcoming events now!'}
            {type === 'member' && "We'll see you there! Check out more events happening soon."}
            {type === 'guest' && 'Check out more upcoming events - or become a member for unlimited free access!'}
          </p>

          <div className="flex flex-col gap-3">
            {type === 'new_member' && (
              <>
                <Button 
                  variant="hero" 
                  className="w-full"
                  onClick={() => handleNavigate('/dashboard')}
                >
                  Take Me to My Member Portal
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => handleNavigate('/events')}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Browse Upcoming Events
                </Button>
              </>
            )}

            {type === 'member' && (
              <>
                {event && (
                  <div className="pb-2">
                    <p className="text-sm text-muted-foreground mb-2">Add to your calendar:</p>
                    <AddToCalendarButtons event={event} />
                  </div>
                )}
                <Button 
                  variant="hero" 
                  className="w-full"
                  onClick={() => handleNavigate('/events')}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Browse More Events
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => handleNavigate('/dashboard')}
                >
                  Go to Member Portal
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full"
                  onClick={() => onOpenChange(false)}
                >
                  Done
                </Button>
              </>
            )}

            {type === 'guest' && (
              <>
                <Button 
                  variant="hero" 
                  className="w-full"
                  onClick={() => handleNavigate('/events')}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Browse Upcoming Events
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => handleNavigate('/join')}
                >
                  Become a Member
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full"
                  onClick={() => onOpenChange(false)}
                >
                  Done
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
