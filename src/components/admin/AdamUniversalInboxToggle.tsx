'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { updateAdamUniversalInbox } from '@/app/actions/adminPartnerActions';

const ADAM = 'adam@cltbucketlist.com';

export function AdamUniversalInboxToggle({ email }: { email: string | undefined }) {
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (email?.toLowerCase() !== ADAM) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('see_all_cross_conversations')
        .eq('id', user.id)
        .maybeSingle();
      setOn((data as { see_all_cross_conversations?: boolean } | null)?.see_all_cross_conversations === true);
      setLoading(false);
    })();
  }, [email]);

  if (email?.toLowerCase() !== ADAM) return null;

  return (
    <div className="card-elevated p-4 sm:p-6 border border-amber-500/20 bg-amber-500/5">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">
        Super secret
      </p>
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="adam-universal-inbox" className="text-base font-medium">
            Universal inbox explorer
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            When enabled, the Team Inbox shows an &quot;All conversations&quot; section to search admin and member threads
            (service-backed; adam@ only).
          </p>
        </div>
        <Switch
          id="adam-universal-inbox"
          checked={on}
          disabled={loading}
          onCheckedChange={async (v) => {
            const res = await updateAdamUniversalInbox(v);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            setOn(v);
            toast.success(v ? 'Enabled' : 'Disabled');
          }}
        />
      </div>
    </div>
  );
}
