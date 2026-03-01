'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Check, Crown, CreditCard, Loader2, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WalletButtons } from '@/components/WalletButtons';

interface MembershipStatusBarProps {
  isMember: boolean;
  memberSince: string | null;
  subscriptionEnd: string | null;
  membershipOverride: boolean;
  onManageBilling: () => void;
  isPortalLoading: boolean;
}

export function MembershipStatusBar({
  isMember,
  memberSince,
  subscriptionEnd,
  membershipOverride,
  onManageBilling,
  isPortalLoading,
}: MembershipStatusBarProps) {
  if (!isMember) {
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
          <Link href="/join">
            <Crown className="w-3.5 h-3.5" />
            Become a Member
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="card-elevated p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className="bg-green-500/10 text-green-500 border-green-500/30">
            <Check className="w-3 h-3 mr-1" />
            Active
          </Badge>
          {memberSince && (
            <span className="text-sm text-muted-foreground">
              Member since {format(new Date(memberSince), 'MMM yyyy')}
            </span>
          )}
          {subscriptionEnd && !membershipOverride && (
            <span className="text-xs text-muted-foreground">
              Renews {format(new Date(subscriptionEnd), 'MMM d, yyyy')}
            </span>
          )}
          {membershipOverride && (
            <span className="text-xs text-muted-foreground italic">Admin-managed</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!membershipOverride && (
            <Button
              variant="outline"
              size="sm"
              onClick={onManageBilling}
              disabled={isPortalLoading}
            >
              {isPortalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
              Billing
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings">
              <Settings className="w-3.5 h-3.5" />
              Settings
            </Link>
          </Button>
        </div>
      </div>
      <div id="wallet-section">
        <WalletButtons />
      </div>
    </div>
  );
}
