'use client';

import { useState } from 'react';
import { SOCIAL_PLATFORMS } from '@/lib/social/constants';
import { connectSocialAccount } from '@/lib/social/queries';
import { PlatformIcon, platformLabel } from '@/components/social/PlatformIcons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const BLURBS: Record<string, string> = {
  instagram: 'Requires Meta Business Suite and Graph API app review. Business or creator account recommended.',
  facebook: 'Uses Meta Marketing API with a connected Facebook Page.',
  linkedin: 'OAuth to a LinkedIn Company Page via Community Management API.',
  tiktok: 'TikTok for Business and Content Posting API access.',
  youtube: 'Google OAuth; reuse your Google Cloud project credentials.',
  pinterest: 'Pinterest API access requires app approval for production.',
  snapchat: 'Snap Kit developer account and marketing product access.',
  twitter: 'X Developer account — paid tiers may apply for posting volume.',
};

export function ConnectAccountModal({
  open,
  onOpenChange,
  workspaceId,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  onConnected: () => void;
}) {
  const [platform, setPlatform] = useState<string>('instagram');
  const [access, setAccess] = useState('');
  const [refresh, setRefresh] = useState('');
  const [busy, setBusy] = useState(false);

  const handleMockConnect = async () => {
    setBusy(true);
    try {
      await connectSocialAccount(
        workspaceId,
        platform,
        {
          account_id: `mock_${platform}_${Date.now()}`,
          account_name: `${platformLabel(platform)} (demo)`,
          account_handle: `@demo_${platform}`,
        },
        {
          access_token: access || `mock_token_${platform}`,
          refresh_token: refresh || null,
          token_expires_at: new Date(Date.now() + 86400000 * 60).toISOString(),
        }
      );
      toast.success('Connected (demo tokens — replace with OAuth in production)');
      onConnected();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle>Connect social account</DialogTitle>
          <DialogDescription>
            OAuth flows require platform developer apps. Use demo connect to explore the CRM, then swap in real tokens.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {SOCIAL_PLATFORMS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                platform === p ? 'border-primary bg-primary/10' : 'border-border bg-muted/20 hover:bg-muted/40'
              }`}
            >
              <PlatformIcon platform={p} />
              <span className="font-medium">{platformLabel(p)}</span>
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed border border-border rounded-md p-3 bg-muted/10">
          {BLURBS[platform]}
        </p>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Access token (optional manual entry)</Label>
          <Input
            value={access}
            onChange={e => setAccess(e.target.value)}
            placeholder="Paste OAuth access token"
            className="border-border bg-background font-mono text-xs"
          />
          <Label className="text-muted-foreground">Refresh token (optional)</Label>
          <Input
            value={refresh}
            onChange={e => setRefresh(e.target.value)}
            placeholder="Refresh token"
            className="border-border bg-background font-mono text-xs"
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="btn-primary" disabled={busy} onClick={handleMockConnect}>
            {busy ? 'Connecting…' : 'Connect (demo OAuth)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
