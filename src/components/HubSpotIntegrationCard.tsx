'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Link as LinkIcon, Check, Loader2, RefreshCw, Unplug, Users, Building2, UserPlus, Calendar } from 'lucide-react';

interface HubSpotSettings {
  last_synced_at: string | null;
  sync_counts: {
    members?: number;
    prospects?: number;
    sponsors?: number;
    activities?: number;
  };
}

interface Integration {
  id: string;
  provider: string;
  account_name: string | null;
  settings: HubSpotSettings | null;
  updated_at: string | null;
}

export function HubSpotIntegrationCard() {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    fetchIntegration();
  }, []);

  useEffect(() => {
    if (searchParams.get('hubspot') === 'connected') {
      toast.success('HubSpot connected successfully!');
      searchParams.delete('hubspot');
      setSearchParams(searchParams, { replace: true });
      fetchIntegration();
    }
  }, [searchParams]);

  const fetchIntegration = async () => {
    const { data, error } = await supabase
      .from('integrations')
      .select('id, provider, account_name, settings, updated_at')
      .eq('provider', 'hubspot')
      .maybeSingle();

    if (!error && data) {
      setIntegration(data as unknown as Integration);
    } else {
      setIntegration(null);
    }
    setLoading(false);
  };

  const handleConnect = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const authorizeUrl = `${supabaseUrl}/functions/v1/hubspot-oauth-callback?action=authorize&origin=${encodeURIComponent(window.location.origin)}`;
    window.open(authorizeUrl, '_blank', 'width=600,height=700');
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('You must be logged in');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hubspot-sync`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      toast.success(
        `Synced: ${result.members} members, ${result.prospects} prospects, ${result.sponsors} sponsors, ${result.activities} activities`
      );
      fetchIntegration();
    } catch (err: any) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect HubSpot? This will remove the integration but won\'t delete data from HubSpot.')) return;

    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from('integrations')
        .delete()
        .eq('provider', 'hubspot');

      if (error) throw error;

      toast.success('HubSpot disconnected');
      setIntegration(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const settings = integration?.settings as HubSpotSettings | null;
  const isConnected = !!integration;

  return (
    <div className="card-elevated p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isConnected ? 'bg-green-500/10' : 'bg-orange-500/10'}`}>
          <LinkIcon className={`w-5 h-5 ${isConnected ? 'text-green-500' : 'text-orange-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">HubSpot</h3>
            {isConnected && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                <Check className="w-3 h-3" />
                Connected
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Sync member data to HubSpot CRM for marketing and relationship management.
          </p>

          {loading ? (
            <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : isConnected ? (
            <div className="mt-4 space-y-4">
              {/* Account Info */}
              <div className="text-sm">
                <span className="text-muted-foreground">Account: </span>
                <span className="font-medium">{integration.account_name || 'HubSpot Account'}</span>
              </div>

              {/* Sync Stats */}
              {settings?.sync_counts && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/50">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>{settings.sync_counts.members ?? 0} members</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/50">
                    <UserPlus className="w-4 h-4 text-muted-foreground" />
                    <span>{settings.sync_counts.prospects ?? 0} prospects</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/50">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span>{settings.sync_counts.sponsors ?? 0} sponsors</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/50">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>{settings.sync_counts.activities ?? 0} activities</span>
                  </div>
                </div>
              )}

              {/* Last Synced */}
              {settings?.last_synced_at && (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(settings.last_synced_at).toLocaleString()}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  {syncing ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-1" />
                  )}
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-destructive hover:text-destructive"
                >
                  {disconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Unplug className="w-4 h-4 mr-1" />
                  )}
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <Button variant="outline" onClick={handleConnect}>
                Connect HubSpot
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                You'll be redirected to HubSpot to authorize the connection.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
