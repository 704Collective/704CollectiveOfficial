'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import {
  Plus, Settings, X,
  Users, DollarSign, TrendingUp, Mail, BarChart2,
  Activity, Target, Star, GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

/* ─── Types ─── */
type WidgetType =
  | 'members_total' | 'members_new' | 'mrr' | 'contacts_total'
  | 'email_open_rate' | 'email_click_rate' | 'pipeline_value'
  | 'member_growth_chart' | 'revenue_chart' | 'top_campaigns'
  | 'conversion_rate' | 'active_drips' | 'survey_responses';

interface Widget {
  id: string;
  widget_type: WidgetType;
  title: string;
  config: Record<string, any>;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

interface Dashboard {
  id: string;
  name: string;
  is_default: boolean;
  is_shared: boolean;
  layout: Widget[];
}

/* ─── Widget Catalog ─── */
const WIDGET_CATALOG: { type: WidgetType; label: string; desc: string; icon: React.ElementType; defaultWidth: number; defaultHeight: number }[] = [
  { type: 'members_total',       label: 'Total Members',        desc: 'Current active member count',          icon: Users,       defaultWidth: 3, defaultHeight: 1 },
  { type: 'members_new',         label: 'New Members',          desc: 'New members this month',               icon: TrendingUp,  defaultWidth: 3, defaultHeight: 1 },
  { type: 'mrr',                 label: 'MRR',                  desc: 'Monthly recurring revenue',            icon: DollarSign,  defaultWidth: 3, defaultHeight: 1 },
  { type: 'contacts_total',      label: 'Total Contacts',       desc: 'All CRM contacts',                     icon: Users,       defaultWidth: 3, defaultHeight: 1 },
  { type: 'email_open_rate',     label: 'Email Open Rate',      desc: 'Avg open rate across campaigns',       icon: Mail,        defaultWidth: 3, defaultHeight: 1 },
  { type: 'pipeline_value',      label: 'Pipeline Value',       desc: 'Total open deal value',                icon: Target,      defaultWidth: 3, defaultHeight: 1 },
  { type: 'member_growth_chart', label: 'Member Growth',        desc: 'New members over time (line chart)',   icon: TrendingUp,  defaultWidth: 6, defaultHeight: 2 },
  { type: 'revenue_chart',       label: 'Revenue Chart',        desc: 'Monthly revenue (bar chart)',          icon: BarChart2,   defaultWidth: 6, defaultHeight: 2 },
  { type: 'top_campaigns',       label: 'Top Campaigns',        desc: 'Best performing email campaigns',      icon: Mail,        defaultWidth: 6, defaultHeight: 2 },
  { type: 'active_drips',        label: 'Active Drips',         desc: 'Active drip campaign enrollments',     icon: Activity,    defaultWidth: 3, defaultHeight: 1 },
  { type: 'survey_responses',    label: 'Survey Responses',     desc: 'Recent survey response count',         icon: Star,        defaultWidth: 3, defaultHeight: 1 },
];

function uid() { return Math.random().toString(36).slice(2, 10); }

/* ─── Widget Data Hook ─── */
function useWidgetData(type: WidgetType) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        switch (type) {
          case 'members_total': {
            const { count } = await supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .is('deleted_at', null)
              .in('subscription_status', ['active', 'trialing']);
            setData(count ?? 0);
            break;
          }
          case 'members_new': {
            const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true })
              .gte('created_at', startOfMonth(new Date()).toISOString()).is('deleted_at', null);
            setData(count ?? 0);
            break;
          }
          case 'mrr': {
            const { data: payments } = await supabase.from('payments').select('amount').eq('status', 'succeeded').gte('created_at', startOfMonth(new Date()).toISOString());
            setData((payments ?? []).reduce((s, p) => s + p.amount, 0));
            break;
          }
          case 'contacts_total': {
            const { count } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('status', 'active');
            setData(count ?? 0);
            break;
          }
          case 'pipeline_value': {
            const { data: deals } = await supabase.from('crm_deals').select('value').not('stage', 'in', '("denied","lost")');
            setData((deals ?? []).reduce((s, d) => s + (d.value ?? 0), 0));
            break;
          }
          case 'active_drips': {
            const { count } = await supabase.from('drip_enrollments').select('id', { count: 'exact', head: true }).eq('status', 'active');
            setData(count ?? 0);
            break;
          }
          case 'survey_responses': {
            const { count } = await supabase.from('crm_survey_responses').select('id', { count: 'exact', head: true }).gte('submitted_at', startOfMonth(new Date()).toISOString());
            setData(count ?? 0);
            break;
          }
          case 'email_open_rate': {
            const { data: campaigns } = await supabase.from('email_campaigns').select('sent_count, open_count').eq('status', 'sent').gt('sent_count', 0);
            const totSent = (campaigns ?? []).reduce((s, c) => s + c.sent_count, 0);
            const totOpen = (campaigns ?? []).reduce((s, c) => s + c.open_count, 0);
            setData(totSent > 0 ? Math.round((totOpen / totSent) * 100) : 0);
            break;
          }
          case 'email_click_rate': {
            const { data: campaigns } = await supabase.from('email_campaigns').select('sent_count, click_count').eq('status', 'sent').gt('sent_count', 0);
            const totSent = (campaigns ?? []).reduce((s, c) => s + c.sent_count, 0);
            const totClick = (campaigns ?? []).reduce((s, c) => s + c.click_count, 0);
            setData(totSent > 0 ? Math.round((totClick / totSent) * 100) : 0);
            break;
          }
          case 'member_growth_chart': {
            const months = Array.from({ length: 6 }, (_, i) => {
              const d = subMonths(new Date(), 5 - i);
              return { month: format(d, 'MMM'), start: startOfMonth(d).toISOString(), end: endOfMonth(d).toISOString() };
            });
            const chartData = await Promise.all(months.map(async m => {
              const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', m.start).lte('created_at', m.end).is('deleted_at', null);
              return { month: m.month, members: count ?? 0 };
            }));
            setData(chartData);
            break;
          }
          case 'revenue_chart': {
            const months = Array.from({ length: 6 }, (_, i) => {
              const d = subMonths(new Date(), 5 - i);
              return { month: format(d, 'MMM'), start: startOfMonth(d).toISOString(), end: endOfMonth(d).toISOString() };
            });
            const chartData = await Promise.all(months.map(async m => {
              const { data: payments } = await supabase.from('payments').select('amount').eq('status', 'succeeded').gte('created_at', m.start).lte('created_at', m.end);
              return { month: m.month, revenue: (payments ?? []).reduce((s, p) => s + p.amount, 0) };
            }));
            setData(chartData);
            break;
          }
          case 'top_campaigns': {
            const { data: campaigns } = await supabase.from('email_campaigns').select('name, sent_count, open_count, click_count').eq('status', 'sent').order('sent_count', { ascending: false }).limit(5);
            setData(campaigns ?? []);
            break;
          }
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    fetch();
  }, [type]);

  return { data, loading };
}

/* ─── Widget Renderer ─── */
function WidgetRenderer({ widget, onDelete, editMode }: { widget: Widget; onDelete: (id: string) => void; editMode: boolean }) {
  const { data, loading } = useWidgetData(widget.widget_type);
  const catalog = WIDGET_CATALOG.find(w => w.type === widget.widget_type);
  const Icon = catalog?.icon ?? BarChart2;
  const isChart = ['member_growth_chart', 'revenue_chart', 'top_campaigns'].includes(widget.widget_type);

  const formatValue = (v: any) => {
    if (widget.widget_type === 'mrr' || widget.widget_type === 'pipeline_value') {
      return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
    }
    if (widget.widget_type === 'email_open_rate' || widget.widget_type === 'email_click_rate') return `${v}%`;
    return v?.toLocaleString() ?? '0';
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.value?.toLocaleString()}</p>
        ))}
      </div>
    );
  };

  return (
    <div className={`relative bg-card border border-border rounded-xl overflow-hidden transition-all ${editMode ? 'border-primary/40 shadow-md shadow-primary/5' : ''}`}
      style={{ gridColumn: `span ${Math.min(widget.width, 12)}` }}>
      {editMode && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          <div className="p-1 rounded bg-muted cursor-grab"><GripVertical className="w-3.5 h-3.5 text-muted-foreground" /></div>
          <button type="button" onClick={() => onDelete(widget.id)} className="p-1 rounded bg-muted hover:bg-red-500/20 text-muted-foreground hover:text-red-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="p-5 h-full">
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-24" />
            <div className="h-8 bg-muted rounded w-16" />
          </div>
        ) : isChart ? (
          <div>
            <p className="text-sm font-semibold text-foreground mb-4">{widget.title}</p>
            {widget.widget_type === 'member_growth_chart' && Array.isArray(data) && (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="members" name="Members" stroke="#C6A664" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
            {widget.widget_type === 'revenue_chart' && Array.isArray(data) && (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={40} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" name="Revenue" fill="#C6A664" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {widget.widget_type === 'top_campaigns' && Array.isArray(data) && (
              <div className="space-y-2.5 mt-2">
                {data.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No campaigns sent yet</p>
                ) : data.map((c: any, i: number) => {
                  const openRate = c.sent_count > 0 ? Math.round((c.open_count / c.sent_count) * 100) : 0;
                  return (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <p className="text-xs text-foreground truncate flex-1">{c.name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">{c.sent_count?.toLocaleString()} sent</span>
                        <span className="text-xs text-emerald-400 font-medium">{openRate}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-2">{widget.title}</p>
              <p className="text-2xl font-bold text-foreground">{formatValue(data)}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Add Widget Dialog ─── */
function AddWidgetDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (type: WidgetType) => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg max-h-[80dvh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
          <DialogDescription>Choose a widget to add to your dashboard</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-2">
          {WIDGET_CATALOG.map(w => (
            <button key={w.type} type="button" onClick={() => { onAdd(w.type); onClose(); }}
              className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left">
              <div className="p-2 rounded-lg bg-muted shrink-0"><w.icon className="w-4 h-4 text-muted-foreground" /></div>
              <div>
                <p className="text-sm font-medium text-foreground">{w.label}</p>
                <p className="text-xs text-muted-foreground">{w.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ─── */
export default function CrmReportsPage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeDashboard, setActiveDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: dashData, error } = await supabase.from('crm_dashboards').select('*').order('is_default', { ascending: false });
      if (error) throw error;

      const dashboards = await Promise.all((dashData ?? []).map(async d => {
        const { data: widgets } = await supabase.from('crm_dashboard_widgets').select('*').eq('dashboard_id', d.id).order('position_y').order('position_x');
        return { ...d, layout: widgets?.map(w => ({ ...w, config: w.config ?? {} })) ?? [] };
      }));

      setDashboards(dashboards);
      if (dashboards.length > 0 && !activeDashboard) {
        setActiveDashboard(dashboards.find(d => d.is_default) ?? dashboards[0]);
      } else if (activeDashboard) {
        setActiveDashboard(dashboards.find(d => d.id === activeDashboard.id) ?? dashboards[0]);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddWidget = async (type: WidgetType) => {
    if (!activeDashboard) return;
    const catalog = WIDGET_CATALOG.find(w => w.type === type)!;
    try {
      const { error } = await supabase.from('crm_dashboard_widgets').insert({
        dashboard_id: activeDashboard.id,
        widget_type: type,
        title: catalog.label,
        width: catalog.defaultWidth,
        height: catalog.defaultHeight,
        position_x: 0,
        position_y: activeDashboard.layout.length,
      });
      if (error) throw error;
      toast.success('Widget added');
      load();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
  };

  const handleDeleteWidget = async (widgetId: string) => {
    try {
      const { error } = await supabase.from('crm_dashboard_widgets').delete().eq('id', widgetId);
      if (error) throw error;
      load();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
  };

  const handleCreateDashboard = async () => {
    try {
      const { data, error } = await supabase.from('crm_dashboards').insert({ name: 'New Dashboard', is_default: false, is_shared: true, layout: [] }).select('id').single();
      if (error) throw error;
      toast.success('Dashboard created');
      load();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Customizable reporting dashboards</p>
        </div>
        <div className="flex items-center gap-2">
          {activeDashboard && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditMode(!editMode)} className={`gap-2 ${editMode ? 'bg-primary/10 border-primary/40 text-primary' : ''}`}>
                <Settings className="w-4 h-4" /> {editMode ? 'Done Editing' : 'Edit Layout'}
              </Button>
              {editMode && (
                <Button size="sm" onClick={() => setAddWidgetOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" /> Add Widget
                </Button>
              )}
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleCreateDashboard} className="gap-2">
            <Plus className="w-4 h-4" /> New Dashboard
          </Button>
        </div>
      </div>

      {/* Dashboard tabs */}
      {dashboards.length > 1 && (
        <div className="flex gap-2 border-b border-border pb-0 overflow-x-auto">
          {dashboards.map(d => (
            <button key={d.id} type="button" onClick={() => setActiveDashboard(d)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${activeDashboard?.id === d.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {d.name}
              {d.is_default && <span className="ml-1.5 text-xs text-primary">•</span>}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : !activeDashboard || activeDashboard.layout.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl">
          <BarChart2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm mb-1">No widgets yet</p>
          <p className="text-xs text-muted-foreground/60 mb-4">Add widgets to build your custom reporting dashboard</p>
          <Button size="sm" onClick={() => setAddWidgetOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> Add Your First Widget</Button>
        </div>
      ) : (
        <div className="grid grid-cols-6 lg:grid-cols-12 gap-3">
          {activeDashboard.layout.map(widget => (
            <WidgetRenderer key={widget.id} widget={widget} onDelete={handleDeleteWidget} editMode={editMode} />
          ))}
        </div>
      )}

      <AddWidgetDialog open={addWidgetOpen} onClose={() => setAddWidgetOpen(false)} onAdd={handleAddWidget} />
    </div>
  );
}