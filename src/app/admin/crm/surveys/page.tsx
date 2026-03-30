'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Plus, MoreHorizontal, Trash2, X, Loader2, ArrowLeft,
  ClipboardCheck, ChevronUp, ChevronDown, Star, BarChart2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/* ─── Types ─── */
type QuestionType = 'text' | 'rating' | 'nps' | 'select' | 'multiselect' | 'yesno';
type TriggerType = 'manual' | 'post_event' | 'scheduled';

interface SurveyQuestion {
  id: string;
  question_order: number;
  question_type: QuestionType;
  question_text: string;
  options: string[];
  is_required: boolean;
}

interface Survey {
  id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  status: string;
  send_delay_hours: number;
  created_at: string | null;
  response_count?: number;
}

/* ─── Constants ─── */
const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'text',        label: 'Open Text' },
  { value: 'rating',      label: 'Star Rating (1–5)' },
  { value: 'nps',         label: 'NPS Score (0–10)' },
  { value: 'select',      label: 'Single Choice' },
  { value: 'multiselect', label: 'Multiple Choice' },
  { value: 'yesno',       label: 'Yes / No' },
];

const DEFAULT_POST_EVENT_QUESTIONS: Omit<SurveyQuestion, 'id'>[] = [
  { question_order: 1, question_type: 'rating',  question_text: 'How would you rate this event overall?',             options: [], is_required: true },
  { question_order: 2, question_type: 'yesno',   question_text: 'Would you attend another 704 Collective event?',     options: [], is_required: true },
  { question_order: 3, question_type: 'nps',     question_text: 'How likely are you to recommend 704 Collective to a friend?', options: [], is_required: true },
  { question_order: 4, question_type: 'text',    question_text: 'What did you enjoy most about this event?',          options: [], is_required: false },
  { question_order: 5, question_type: 'text',    question_text: 'Any suggestions for improvement?',                   options: [], is_required: false },
];

function uid() { return Math.random().toString(36).slice(2, 10); }

/* ─── Question Preview ─── */
function QuestionPreview({ q }: { q: SurveyQuestion }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-1.5">
        <p className="text-sm font-medium text-foreground">{q.question_text}</p>
        {q.is_required && <span className="text-red-400 text-xs mt-0.5">*</span>}
      </div>
      {q.question_type === 'rating' && (
        <div className="flex gap-1">{[1,2,3,4,5].map(i => <Star key={i} className="w-5 h-5 text-muted-foreground/30" />)}</div>
      )}
      {q.question_type === 'nps' && (
        <div className="flex gap-1 flex-wrap">
          {Array.from({length:11},(_,i)=>i).map(i => (
            <div key={i} className="w-8 h-8 rounded border border-border flex items-center justify-center text-xs text-muted-foreground">{i}</div>
          ))}
        </div>
      )}
      {q.question_type === 'yesno' && (
        <div className="flex gap-2">
          {['Yes','No'].map(o => <div key={o} className="px-4 py-1.5 rounded-lg border border-border text-xs text-muted-foreground">{o}</div>)}
        </div>
      )}
      {(q.question_type === 'select' || q.question_type === 'multiselect') && (
        <div className="space-y-1.5">
          {(q.options.length ? q.options : ['Option 1','Option 2']).map((o,i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className={`w-3.5 h-3.5 border border-border ${q.question_type === 'select' ? 'rounded-full' : 'rounded'}`} />{o}
            </div>
          ))}
        </div>
      )}
      {q.question_type === 'text' && (
        <div className="w-full h-16 rounded-lg border border-border bg-muted/30" />
      )}
    </div>
  );
}

/* ─── Question Editor ─── */
function QuestionEditor({
  q, index, total, onChange, onDelete, onMove,
}: {
  q: SurveyQuestion; index: number; total: number;
  onChange: (q: SurveyQuestion) => void;
  onDelete: (id: string) => void;
  onMove: (from: number, to: number) => void;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const hasOptions = q.question_type === 'select' || q.question_type === 'multiselect';

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span className="text-xs font-bold text-muted-foreground w-5 text-center">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{q.question_text || 'Untitled question'}</p>
          <p className="text-xs text-muted-foreground">{QUESTION_TYPES.find(t => t.value === q.question_type)?.label}</p>
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={() => onMove(index, index - 1)} disabled={index === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /></button>
          <button type="button" onClick={() => onMove(index, index + 1)} disabled={index === total - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /></button>
          <button type="button" onClick={() => onDelete(q.id)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      {expanded && (
        <div className="px-4 py-4 border-t border-border space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Question Type</Label>
            <Select value={q.question_type} onValueChange={v => onChange({ ...q, question_type: v as QuestionType })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{QUESTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Question</Label>
            <Input value={q.question_text} onChange={e => onChange({ ...q, question_text: e.target.value })} className="text-sm" />
          </div>
          {hasOptions && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Options (one per line)</Label>
              <Textarea value={q.options.join('\n')} onChange={e => onChange({ ...q, options: e.target.value.split('\n').filter(Boolean) })} rows={3} className="text-sm resize-none" />
            </div>
          )}
          <div className="flex items-center gap-3">
            <input type="checkbox" id={`req-${q.id}`} checked={q.is_required} onChange={e => onChange({ ...q, is_required: e.target.checked })} className="rounded border-border w-4 h-4" />
            <label htmlFor={`req-${q.id}`} className="text-sm text-foreground cursor-pointer">Required</label>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Survey Builder ─── */
function SurveyBuilder({ survey, onBack, onSaved }: { survey: Survey | null; onBack: () => void; onSaved: () => void }) {
  const isNew = !survey;
  const [name, setName] = useState(survey?.name ?? '');
  const [description, setDescription] = useState(survey?.description ?? '');
  const [triggerType, setTriggerType] = useState<TriggerType>(survey?.trigger_type ?? 'post_event');
  const [sendDelay, setSendDelay] = useState(survey?.send_delay_hours ?? 2);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'questions' | 'settings' | 'preview'>('questions');

  useEffect(() => {
    if (isNew && triggerType === 'post_event' && questions.length === 0) {
      setQuestions(DEFAULT_POST_EVENT_QUESTIONS.map(q => ({ ...q, id: uid() })));
    }
  }, [triggerType]);

  useEffect(() => {
    if (!isNew && survey) {
      supabase.from('crm_survey_questions').select('*').eq('survey_id', survey.id).order('question_order')
        .then(({ data }) => setQuestions((data ?? []).map(q => ({ ...q, options: q.options ?? [] }))));
    }
  }, [survey, isNew]);

  const addQuestion = (type: QuestionType) => {
    setQuestions(prev => [...prev, { id: uid(), question_order: prev.length + 1, question_type: type, question_text: '', options: [], is_required: false }]);
  };

  const moveQuestion = (from: number, to: number) => {
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setQuestions(next.map((q, i) => ({ ...q, question_order: i + 1 })));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Survey name required'); return; }
    setSaving(true);
    try {
      let surveyId = survey?.id;
      if (isNew) {
        const { data, error } = await supabase.from('crm_surveys').insert({ name: name.trim(), description: description || null, trigger_type: triggerType, send_delay_hours: sendDelay, status: 'draft' }).select('id').single();
        if (error) throw error;
        surveyId = data.id;
      } else {
        const { error } = await supabase.from('crm_surveys').update({ name: name.trim(), description: description || null, trigger_type: triggerType, send_delay_hours: sendDelay, updated_at: new Date().toISOString() }).eq('id', survey!.id);
        if (error) throw error;
      }
      if (surveyId && questions.length > 0) {
        await supabase.from('crm_survey_questions').delete().eq('survey_id', surveyId);
        const { error } = await supabase.from('crm_survey_questions').insert(questions.map((q, i) => ({ survey_id: surveyId, question_order: i + 1, question_type: q.question_type, question_text: q.question_text, options: q.options.length > 0 ? q.options : null, is_required: q.is_required })));
        if (error) throw error;
      }
      toast.success(isNew ? 'Survey created' : 'Survey saved');
      onSaved();
      onBack();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-muted-foreground"><ArrowLeft className="w-4 h-4" /> Back</Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{isNew ? 'New Survey' : name}</h1>
            <p className="text-xs text-muted-foreground">{questions.length} question{questions.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}{isNew ? 'Create Survey' : 'Save'}
        </Button>
      </div>

      <div className="flex border-b border-border">
        {(['questions', 'settings', 'preview'] as const).map(tab => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <div className="max-w-xl space-y-4">
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Survey Name <span className="text-red-400">*</span></Label><Input value={name} onChange={e => setName(e.target.value)} className="text-sm" /></div>
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="text-sm resize-none" /></div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Trigger</Label>
            <Select value={triggerType} onValueChange={v => setTriggerType(v as TriggerType)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="post_event">After Event</SelectItem>
                <SelectItem value="manual">Manual Send</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {triggerType === 'post_event' && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Send {sendDelay} hours after event ends</Label>
              <input type="range" min={1} max={48} value={sendDelay} onChange={e => setSendDelay(parseInt(e.target.value))} className="w-full" />
            </div>
          )}
        </div>
      )}

      {activeTab === 'questions' && (
        <div className="flex flex-col lg:flex-row gap-5">
          <div className="lg:w-44 shrink-0">
            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Add Question</p>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
              {QUESTION_TYPES.map(({ value, label }) => (
                <button key={value} type="button" onClick={() => addQuestion(value)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left text-xs text-muted-foreground hover:text-foreground">
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-2 max-w-2xl">
            {questions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-xl">
                <ClipboardCheck className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No questions yet</p>
              </div>
            ) : questions.map((q, index) => (
              <QuestionEditor key={q.id} q={q} index={index} total={questions.length}
                onChange={updated => setQuestions(prev => prev.map(x => x.id === updated.id ? updated : x))}
                onDelete={id => setQuestions(prev => prev.filter(x => x.id !== id))}
                onMove={moveQuestion}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl p-6 space-y-6">
          <div className="text-center pb-2 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">{name || 'Survey Preview'}</h2>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          {questions.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Add questions to preview your survey</p>
          ) : (
            <div className="space-y-6">
              {questions.map((q, i) => <div key={q.id}><span className="text-xs text-muted-foreground mb-2 block">Question {i + 1}</span><QuestionPreview q={q} /></div>)}
              <button type="button" className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">Submit Survey</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Page ─── */
export default function CrmSurveysPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderSurvey, setBuilderSurvey] = useState<Survey | null | undefined>(undefined);
  const [deleteSurvey, setDeleteSurvey] = useState<Survey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('crm_surveys').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setSurveys(data ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteSurvey) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('crm_surveys').delete().eq('id', deleteSurvey.id);
      if (error) throw error;
      toast.success('Survey deleted');
      setDeleteSurvey(null);
      load();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
    finally { setDeleting(false); }
  };

  const handleActivate = async (survey: Survey) => {
    const newStatus = survey.status === 'active' ? 'closed' : 'active';
    try {
      const { error } = await supabase.from('crm_surveys').update({ status: newStatus }).eq('id', survey.id);
      if (error) throw error;
      toast.success(`Survey ${newStatus}`);
      load();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
  };

  if (builderSurvey !== undefined) {
    return <SurveyBuilder survey={builderSurvey} onBack={() => setBuilderSurvey(undefined)} onSaved={load} />;
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Surveys</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Post-event surveys and NPS tracking</p>
        </div>
        <Button size="sm" onClick={() => setBuilderSurvey(null)} className="gap-2">
          <Plus className="w-4 h-4" /> New Survey
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : surveys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl">
          <ClipboardCheck className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm mb-1">No surveys yet</p>
          <p className="text-xs text-muted-foreground/60 mb-4">Collect post-event feedback and NPS scores automatically</p>
          <Button size="sm" onClick={() => setBuilderSurvey(null)} className="gap-2"><Plus className="w-4 h-4" /> Create First Survey</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {surveys.map(survey => (
            <div key={survey.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-foreground">{survey.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${survey.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : survey.status === 'closed' ? 'bg-gray-500/15 text-gray-400 border-gray-500/20' : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20'}`}>
                    {survey.status}
                  </span>
                  <span className="text-xs text-muted-foreground/60 bg-muted/60 px-2 py-0.5 rounded-full capitalize">
                    {survey.trigger_type === 'post_event' ? 'Post-Event' : survey.trigger_type === 'manual' ? 'Manual' : 'Scheduled'}
                  </span>
                </div>
                {survey.description && <p className="text-xs text-muted-foreground mt-0.5">{survey.description}</p>}
                {survey.created_at && <p className="text-xs text-muted-foreground/60 mt-1">{format(new Date(survey.created_at), 'MMM d, yyyy')}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setBuilderSurvey(survey)} className="h-8 text-xs">Edit</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open survey actions menu"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => handleActivate(survey)} className="text-sm">{survey.status === 'active' ? 'Close Survey' : 'Activate'}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDeleteSurvey(survey)} className="text-sm text-red-400 focus:text-red-400 gap-2"><Trash2 className="w-4 h-4" /> Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!deleteSurvey} onOpenChange={() => setDeleteSurvey(null)}>
        <DialogContent className="w-full max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Delete Survey</DialogTitle>
            <DialogDescription>Permanently delete "{deleteSurvey?.name}"? All responses will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setDeleteSurvey(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="w-full sm:w-auto">{deleting ? 'Deleting…' : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}