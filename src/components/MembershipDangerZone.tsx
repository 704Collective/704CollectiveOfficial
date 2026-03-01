'use client';

import { useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MembershipDangerZoneProps {
  userId: string;
  isMember: boolean;
  hasStripeSubscription: boolean;
}

export function MembershipDangerZone({ userId, isMember, hasStripeSubscription }: MembershipDangerZoneProps) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelConfirmation, setCancelConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCancelMembership = async () => {
    if (cancelConfirmation !== 'CANCEL') {
      toast.error('Please type CANCEL to confirm');
      return;
    }

    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription');
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success('Membership cancelled. You will retain access until the end of your billing period.');
      setCancelDialogOpen(false);
      setCancelConfirmation('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel membership');
    } finally {
      setLoading(false);
    }
  };

  if (!isMember || !hasStripeSubscription) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm font-medium">Danger Zone</span>
      </div>
      
      <Button
        variant="destructive"
        className="w-full sm:w-auto"
        onClick={() => setCancelDialogOpen(true)}
      >
        <X className="w-4 h-4 mr-2" />
        Cancel Membership
      </Button>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Cancel Membership</DialogTitle>
            <DialogDescription>
              This action cannot be undone. You will lose access to all member benefits
              including free event tickets and exclusive experiences.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
              <p className="font-medium text-destructive mb-2">You will lose:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Free access to all events</li>
                <li>Member-only experiences</li>
                <li>Your digital membership card</li>
                <li>Calendar subscription</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="cancelConfirm">
                Type <strong>CANCEL</strong> to confirm
              </Label>
              <Input
                id="cancelConfirm"
                value={cancelConfirmation}
                onChange={(e) => setCancelConfirmation(e.target.value)}
                placeholder="Type CANCEL"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Membership
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleCancelMembership} 
              disabled={loading || cancelConfirmation !== 'CANCEL'}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Membership'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
