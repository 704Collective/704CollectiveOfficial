'use client';

import { useEffect, useState } from 'react';
import { getBestTimeToPost } from '@/lib/social/queries';
import { PlatformIcon, platformLabel } from '@/components/social/PlatformIcons';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FALLBACK: Record<string, string> = {
  instagram: 'Tue–Fri 9am–11am and 7pm–9pm',
  facebook: 'Tue–Thu 1pm–4pm',
  linkedin: 'Tue–Thu 8am–10am',
  tiktok: 'Tue, Thu, Fri 7am–9am and 7pm–9pm',
  youtube: 'Afternoons local time (test with Shorts analytics)',
  pinterest: 'Evenings and weekends',
  snapchat: 'Late afternoon to evening',
  twitter: 'Mon–Wed 8am–10am and 6pm–9pm',
};

interface AccountLite {
  id: string;
  platform: string;
  account_name: string;
}

export function BestTimeRecommendations({ accounts }: { accounts: AccountLite[] }) {
  const [slots, setSlots] = useState<Record<string, { day: number; hour: number; score: number }[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, { day: number; hour: number; score: number }[]> = {};
      for (const a of accounts) {
        const rows = await getBestTimeToPost(a.id);
        if (cancelled) return;
        next[a.id] = (rows ?? [])
          .sort((x, y) => Number(y.engagement_score) - Number(x.engagement_score))
          .slice(0, 3)
          .map(r => ({ day: r.day_of_week, hour: r.hour_of_day, score: Number(r.engagement_score) }));
      }
      if (!cancelled) setSlots(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts]);

  if (!accounts.length) {
    return (
      <p className="text-xs text-muted-foreground border border-border rounded-lg p-3 bg-muted/20">
        Connect accounts to see best-time recommendations.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.map(a => {
        const top = slots[a.id] ?? [];
        const hasData = top.length > 0;
        return (
          <div key={a.id} className="border border-border rounded-lg p-3 bg-card">
            <div className="flex items-center gap-2 mb-2">
              <PlatformIcon platform={a.platform} />
              <span className="text-sm font-medium text-foreground">{platformLabel(a.platform)}</span>
              <span className="text-xs text-muted-foreground truncate">— {a.account_name}</span>
            </div>
            {hasData ? (
              <ul className="text-xs text-muted-foreground space-y-1">
                {top.map((s, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {DAYS[s.day]} · {s.hour}:00 UTC — score {s.score.toFixed(1)}
                    </span>
                  </li>
                ))}
                <li className="text-[10px] text-muted-foreground/80 pt-1">Based on your last 30 posts (when metrics exist).</li>
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Post more to get personalized recommendations. General guidance for {platformLabel(a.platform)}:{' '}
                {FALLBACK[a.platform] ?? 'Experiment with morning and early evening slots.'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
