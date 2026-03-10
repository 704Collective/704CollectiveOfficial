'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Check, Crown, CreditCard, Loader2, Settings, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface MembershipStatusBarProps {
  isActiveMember: boolean;
  memberSince: string | null;
  subscriptionEnd: string | null;
  subscriptionEndsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  membershipOverride: boolean;
  subscriptionStatus?: string;
  onManageBilling: () => void;
  isPortalLoading: boolean;
}

export function MembershipStatusBar({
  isActiveMember,
  memberSince,
  subscriptionEnd,
  subscriptionEndsAt,
  cancelAtPeriodEnd,
  membershipOverride,
  subscriptionStatus,
  onManageBilling,
  isPortalLoading,
}: MembershipStatusBarProps) {
  const isCanceling = cancelAtPeriodEnd === true;
  const endDate = subscriptionEndsAt || subscriptionEnd;

  if (!isActiveMember) {
    return (
      <div className="card-elevated p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
        <div className="flex items-center gap-3">
          <Crown className="w-5 h-5 text-primary" />
          <div>
            <p className="font-medium text-sm">Unlock Member Benefits</p>
            <p className="text-xs text-muted-foreground">Join for $30/month — events, perks & more</p>
          </div>
        </div>
        <Button variant="hero" size="sm" asChild>
          <a href="https://buy.stripe.com/704collective" target="_blank" rel="noopener noreferrer">
            <Crown className="w-3.5 h-3.5" />
            Become a Member
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="card-elevated p-4 sm:p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          {isCanceling ? (
            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/30">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Canceling
            </Badge>
          ) : (
            <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
              <Check className="w-3 h-3 mr-1" />
              Active
            </Badge>
          )}
          {memberSince && (
            <span className="text-sm text-muted-foreground">
              Member since {format(new Date(memberSince), 'MMM yyyy')}
            </span>
          )}
          {endDate && !membershipOverride && (
            <span className="text-xs text-muted-foreground">
              {isCanceling
                ? `Access until ${format(new Date(endDate), 'MMM d, yyyy')}`
                : `Renews ${format(new Date(endDate), 'MMM d, yyyy')}`}
            </span>
          )}
          {membershipOverride && (
            <span className="text-xs text-muted-foreground italic">Admin-managed</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!membershipOverride && (
            <>
              {isCanceling ? (
                <Button variant="hero" size="sm" asChild>
                  <a href="https://buy.stripe.com/704collective" target="_blank" rel="noopener noreferrer">
                    <Crown className="w-3.5 h-3.5" />
                    Reactivate
                  </a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={onManageBilling} disabled={isPortalLoading}>
                  {isPortalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                  Billing
                </Button>
              )}
            </>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/settings">
              <Settings className="w-3.5 h-3.5" />
              Settings
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
