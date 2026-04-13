'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { GitPullRequest, Users, DollarSign, TrendingUp } from 'lucide-react';

interface Referral {
  id: string;
  referrer_name: string | null;
  referrer_email: string | null;
  referred_name: string | null;
  referred_email: string | null;
  status: string | null;
  reward_amount: number | null;
  created_at: string | null;
}

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasTable, setHasTable] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await (supabase as any)
          .from('referrals')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) {
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            setHasTable(false);
          }
          setReferrals([]);
        } else {
          setReferrals(data ?? []);
        }
      } catch {
        setHasTable(false);
        setReferrals([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalReferrals = referrals.length;
  const approvedReferrals = referrals.filter(r => r.status === 'approved' || r.status === 'completed').length;
  const totalRewards = referrals.reduce((sum, r) => sum + (r.reward_amount ?? 0), 0);

  return (
    <AdminLayout title="Referrals">
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Business</p>
        <h1 className="text-2xl font-bold text-foreground">Business Referrals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track member and partner referrals and rewards
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
              <div className="h-4 w-24 bg-muted rounded mb-3" />
              <div className="h-8 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : !hasTable || referrals.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mx-auto mb-4">
            <GitPullRequest className="w-6 h-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">No referrals yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {!hasTable
              ? 'The referrals system is not yet set up. Create a referrals table in your database to get started.'
              : 'When members refer others, they will appear here. Share your referral program to get started.'}
          </p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/70">Total Referrals</span>
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold text-foreground">{totalReferrals}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/70">Approved</span>
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold text-foreground">{approvedReferrals}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/70">Total Rewards</span>
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold text-foreground">${totalRewards.toFixed(2)}</p>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 text-left font-normal">Referrer</th>
                    <th className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 text-left font-normal">Referred</th>
                    <th className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 text-left font-normal">Status</th>
                    <th className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 text-left font-normal">Reward</th>
                    <th className="text-xs uppercase tracking-wider text-muted-foreground/70 px-4 py-3 text-left font-normal">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map(r => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm text-foreground font-medium">{r.referrer_name ?? '-'}</p>
                        <p className="text-xs text-muted-foreground">{r.referrer_email ?? ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-foreground">{r.referred_name ?? '-'}</p>
                        <p className="text-xs text-muted-foreground">{r.referred_email ?? ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                          ${r.status === 'approved' || r.status === 'completed'
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : r.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            : 'bg-muted text-muted-foreground border-border'
                          }`}>
                          {r.status ?? 'unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {r.reward_amount != null ? `$${r.reward_amount.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
    </AdminLayout>
  );
}
