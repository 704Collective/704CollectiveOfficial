'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Plus, MoreHorizontal, Trash2, X, Loader2, ArrowLeft,
  FileText, ChevronUp, ChevronDown, Copy,
  ToggleLeft, Settings,
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
type FieldType = 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'heading' | 'divider';
type FormType = 'general' | 'business_application' | 'contact' | 'event_interest' | 'survey';

interface FormField {
  id: string;
  field_order: number;
  field_type: FieldType;
  label: string;
  placeholder: string;
  help_text: string;
  options: string[];
  is_required: boolean;
  maps_to_field: string;
}

interface CrmForm {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  form_type: FormType;
  status: string;
  submit_button_text: string;
  success_message: string;
  redirect_url: string | null;
  notify_email: string | null;
  auto_create_contact: boolean;
  created_at: string | null;
  submission_count?: number;
}

/* ─── Constants ─── */
const FORM_TYPES: { value: FormType; label: string }[] = [
  { value: 'general',              label: 'General' },
  { value: 'business_application', label: 'Business Application' },
  { value: 'contact',              label: 'Contact Form' },
  { value: 'event_interest',       label: 'Event Interest' },
  { value: 'survey',               label: 'Survey' },
];

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Short Text' },
  { value: 'email',    label: 'Email' },
  { value: 'phone',    label: 'Phone' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'radio',    label: 'Multiple Choice' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date',     label: 'Date' },
  { value: 'heading',  label: 'Section Heading' },
  { value: 'divider',  label: 'Divider' },
];

const MAPS_TO_OPTIONS = [
  { value: '', label: '— None —' },
  { value: 'email',     label: 'Contact: Email' },
  { value: 'full_name', label: 'Contact: Full Name' },
  { value: 'phone',     label: 'Contact: Phone' },
  { value: 'company',   label: 'Contact: Company' },
];

const DEFAULT_BIZ_FIELDS: Omit<FormField, 'id'>[] = [
  { field_order: 1, field_type: 'text',     label: 'Full Name',         placeholder: 'Your full name',        help_text: '', options: [], is_required: true,  maps_to_field: 'full_name' },
  { field_order: 2, field_type: 'email',    label: 'Email Address',     placeholder: 'you@example.com',       help_text: '', options: [], is_required: true,  maps_to_field: 'email' },
  { field_order: 3, field_type: 'phone',    label: 'Phone Number',      placeholder: '704-555-0100',          help_text: '', options: [], is_required: true,  maps_to_field: 'phone' },
  { field_order: 4, field_type: 'text',     label: 'Company / Business',placeholder: 'Your company name',     help_text: '', options: [], is_required: false, maps_to_field: 'company' },
  { field_order: 5, field_type: 'select',   label: 'Industry',          placeholder: '',                      help_text: '', options: ['Technology','Finance','Real Estate','Healthcare','Marketing','Legal','Consulting','Retail','Food & Beverage','Media','Construction','Education','Nonprofit','Other'], is_required: true, maps_to_field: '' },
  { field_order: 6, field_type: 'textarea', label: 'Why do you want to join 704 Business?', placeholder: 'Tell us about yourself and what you\'re looking for…', help_text: '', options: [], is_required: true, maps_to_field: '' },
  { field_order: 7, field_type: 'textarea', label: 'What do you do professionally?', placeholder: 'Describe your role and business…', help_text: '', options: [], is_required: true, maps_to_field: '' },
];

function uid() { return Math.random().toString(36).slice(2, 10); }
function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

/* ─── Field Preview ─── */
function FieldPreview({ field }: { field: FormField }) {
  if (field.field_type === 'heading') return <p className="font-semibold text-foreground text-base">{field.label}</p>;
  if (field.field_type === 'divider') return <hr className="border-border" />;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-foreground">{field.label}</label>
        {field.is_required && <span className="text-red-400 text-xs">*</span>}
      </div>
      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      {field.field_type === 'textarea' ? (
        <div className="w-full h-20 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground/50">{field.placeholder || 'Long text…'}</div>
      ) : field.field_type === 'select' ? (
        <div className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 flex items-center text-xs text-muted-foreground/50">Select an option…</div>
      ) : field.field_type === 'radio' ? (
        <div className="space-y-1.5">
          {(field.options.length ? field.options : ['Option 1', 'Option 2']).map((o, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-3.5 h-3.5 rounded-full border border-border" />{o}
            </div>
          ))}
        </div>
      ) : field.field_type === 'checkbox' ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-3.5 h-3.5 rounded border border-border" />{field.label}
        </div>
      ) : (
        <div className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 flex items-center text-xs text-muted-foreground/50">{field.placeholder || field.label}</div>
      )}
    </div>
  );
}

/* ─── Field Editor Row ─── */
function FieldEditorRow({
  field, index, total, onChange, onDelete, onMove,
}: {
  field: FormField; index: number; total: number;
  onChange: (f: FormField) => void;
  onDelete: (id: string) => void;
  onMove: (from: number, to: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isStructural = field.field_type === 'heading' || field.field_type === 'divider';
  const hasOptions = field.field_type === 'select' || field.field_type === 'radio';

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-muted/30 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-center w-5 h-5 rounded bg-muted text-xs text-muted-foreground font-medium shrink-0">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{field.label || 'Untitled field'}</p>
          <p className="text-xs text-muted-foreground capitalize">{FIELD_TYPES.find(t => t.value === field.field_type)?.label}</p>
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={() => onMove(index, index - 1)} disabled={index === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30">
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button type="button" onClick={() => onMove(index, index + 1)} disabled={index === total - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30">
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button type="button" onClick={() => onDelete(field.id)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400">
            <X className="w-3.5 h-3.5" />
          </button>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-4 border-t border-border space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Field Type</Label>
              <Select value={field.field_type} onValueChange={v => onChange({ ...field, field_type: v as FieldType })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!isStructural && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Maps to Contact Field</Label>
                <Select value={field.maps_to_field || 'none'} onValueChange={v => onChange({ ...field, maps_to_field: v === 'none' ? '' : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{MAPS_TO_OPTIONS.map(o => <SelectItem key={o.value || 'none'} value={o.value || 'none'}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Label</Label>
            <Input value={field.label} onChange={e => onChange({ ...field, label: e.target.value })} className="h-8 text-sm" />
          </div>
          {!isStructural && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Placeholder</Label>
                <Input value={field.placeholder} onChange={e => onChange({ ...field, placeholder: e.target.value })} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Help Text</Label>
                <Input value={field.help_text} onChange={e => onChange({ ...field, help_text: e.target.value })} placeholder="Optional hint shown below the field" className="h-8 text-sm" />
              </div>
              {hasOptions && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Options (one per line)</Label>
                  <Textarea
                    value={field.options.join('\n')}
                    onChange={e => onChange({ ...field, options: e.target.value.split('\n').filter(Boolean) })}
                    rows={4}
                    className="text-sm resize-none"
                    placeholder="Option 1&#10;Option 2&#10;Option 3"
                  />
                </div>
              )}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`req-${field.id}`}
                  checked={field.is_required}
                  onChange={e => onChange({ ...field, is_required: e.target.checked })}
                  className="rounded border-border w-4 h-4"
                />
                <label htmlFor={`req-${field.id}`} className="text-sm text-foreground cursor-pointer">Required field</label>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Form Builder ─── */
function FormBuilder({
  form, onBack, onSaved,
}: {
  form: CrmForm | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const isNew = !form;
  const [name, setName] = useState(form?.name ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [slug, setSlug] = useState(form?.slug ?? '');
  const [formType, setFormType] = useState<FormType>(form?.form_type ?? 'general');
  const [submitText, setSubmitText] = useState(form?.submit_button_text ?? 'Submit');
  const [successMsg, setSuccessMsg] = useState(form?.success_message ?? 'Thank you! We will be in touch shortly.');
  const [notifyEmail, setNotifyEmail] = useState(form?.notify_email ?? '');
  const [autoCreateContact, setAutoCreateContact] = useState(form?.auto_create_contact ?? true);
  const [fields, setFields] = useState<FormField[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'build' | 'settings' | 'preview'>('build');
  const [loadingFields, setLoadingFields] = useState(!isNew);

  // Auto-generate slug from name
  useEffect(() => {
    if (isNew && name) setSlug(slugify(name));
  }, [name, isNew]);

  // Load existing fields
  useEffect(() => {
    if (!isNew && form) {
      supabase.from('crm_form_fields')
        .select('*')
        .eq('form_id', form.id)
        .order('field_order')
        .then(({ data }) => {
          setFields((data ?? []).map(f => ({ ...f, options: f.options ?? [] })));
          setLoadingFields(false);
        });
    }
  }, [form, isNew]);

  // Load default fields for business application
  useEffect(() => {
    if (isNew && formType === 'business_application' && fields.length === 0) {
      setFields(DEFAULT_BIZ_FIELDS.map(f => ({ ...f, id: uid() })));
    }
  }, [formType]);

  const addField = (type: FieldType) => {
    const newField: FormField = {
      id: uid(),
      field_order: fields.length + 1,
      field_type: type,
      label: FIELD_TYPES.find(t => t.value === type)?.label ?? '',
      placeholder: '',
      help_text: '',
      options: [],
      is_required: false,
      maps_to_field: '',
    };
    setFields(prev => [...prev, newField]);
  };

  const moveField = (from: number, to: number) => {
    if (to < 0 || to >= fields.length) return;
    const next = [...fields];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setFields(next.map((f, i) => ({ ...f, field_order: i + 1 })));
  };

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) { toast.error('Name and slug are required'); return; }
    setSaving(true);
    try {
      let formId = form?.id;

      if (isNew) {
        const { data, error } = await supabase.from('crm_forms').insert({
          name: name.trim(),
          description: description || null,
          slug: slug.trim(),
          form_type: formType,
          submit_button_text: submitText,
          success_message: successMsg,
          notify_email: notifyEmail || null,
          auto_create_contact: autoCreateContact,
          status: 'active',
        }).select('id').single();
        if (error) throw error;
        formId = data.id;
      } else {
        const { error } = await supabase.from('crm_forms').update({
          name: name.trim(),
          description: description || null,
          slug: slug.trim(),
          form_type: formType,
          submit_button_text: submitText,
          success_message: successMsg,
          notify_email: notifyEmail || null,
          auto_create_contact: autoCreateContact,
          updated_at: new Date().toISOString(),
        }).eq('id', form!.id);
        if (error) throw error;
      }

      // Save fields
      if (formId) {
        await supabase.from('crm_form_fields').delete().eq('form_id', formId);
        if (fields.length > 0) {
          const { error } = await supabase.from('crm_form_fields').insert(
            fields.map((f, i) => ({
              form_id: formId,
              field_order: i + 1,
              field_type: f.field_type,
              label: f.label,
              placeholder: f.placeholder || null,
              help_text: f.help_text || null,
              options: f.options.length > 0 ? f.options : null,
              is_required: f.is_required,
              maps_to_field: f.maps_to_field || null,
            }))
          );
          if (error) throw error;
        }
      }

      toast.success(isNew ? 'Form created' : 'Form saved');
      onSaved();
      onBack();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{isNew ? 'New Form' : name}</h1>
            <p className="text-xs text-muted-foreground">{fields.length} field{fields.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isNew ? 'Create Form' : 'Save Changes'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['build', 'settings', 'preview'] as const).map(tab => (
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'settings' && (
        <div className="max-w-xl space-y-4">
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Form Name <span className="text-red-400">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="text-sm" />
          </div>
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="text-sm resize-none" />
          </div>
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Slug <span className="text-red-400">*</span></Label>
            <Input value={slug} onChange={e => setSlug(slugify(e.target.value))} className="text-sm font-mono" />
            <p className="text-xs text-muted-foreground/60 mt-1">Public embed URL: /forms/{slug || 'your-slug'}</p>
          </div>
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Form Type</Label>
            <Select value={formType} onValueChange={v => setFormType(v as FormType)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{FORM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Submit Button Text</Label>
            <Input value={submitText} onChange={e => setSubmitText(e.target.value)} className="text-sm" />
          </div>
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Success Message</Label>
            <Textarea value={successMsg} onChange={e => setSuccessMsg(e.target.value)} rows={2} className="text-sm resize-none" />
          </div>
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Notify Email (on submission)</Label>
            <Input type="email" value={notifyEmail} onChange={e => setNotifyEmail(e.target.value)} placeholder="hello@704collective.com" className="text-sm" />
          </div>
          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl">
            <input type="checkbox" id="auto-contact" checked={autoCreateContact} onChange={e => setAutoCreateContact(e.target.checked)} className="rounded border-border w-4 h-4" />
            <div>
              <label htmlFor="auto-contact" className="text-sm font-medium text-foreground cursor-pointer">Auto-create contact on submission</label>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically add submitter to your Contacts</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'build' && (
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Field palette */}
          <div className="lg:w-44 shrink-0">
            <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Add Field</p>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
              {FIELD_TYPES.map(({ value, label }) => (
                <button key={value} type="button" onClick={() => addField(value)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left text-xs text-muted-foreground hover:text-foreground">
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Field list */}
          <div className="flex-1 space-y-2 max-w-2xl">
            {loadingFields ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />)
            ) : fields.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-xl">
                <FileText className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No fields yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Add fields from the palette</p>
              </div>
            ) : (
              fields.map((field, index) => (
                <FieldEditorRow
                  key={field.id}
                  field={field}
                  index={index}
                  total={fields.length}
                  onChange={updated => setFields(prev => prev.map(f => f.id === updated.id ? updated : f))}
                  onDelete={id => setFields(prev => prev.filter(f => f.id !== id))}
                  onMove={moveField}
                />
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl p-6 space-y-5">
          <div className="text-center pb-2 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">{name || 'Form Preview'}</h2>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          {fields.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Add fields in the Build tab to preview your form</p>
          ) : (
            <div className="space-y-4">
              {fields.map(field => <FieldPreview key={field.id} field={field} />)}
              <button type="button" className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold mt-2">
                {submitText}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function CrmFormsPage() {
  const [forms, setForms] = useState<CrmForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderForm, setBuilderForm] = useState<CrmForm | null | undefined>(undefined);
  const [deleteForm, setDeleteForm] = useState<CrmForm | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_forms')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setForms(data ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleStatus = async (form: CrmForm) => {
    const newStatus = form.status === 'active' ? 'inactive' : 'active';
    try {
      const { error } = await supabase.from('crm_forms').update({ status: newStatus }).eq('id', form.id);
      if (error) throw error;
      toast.success(`Form ${newStatus}`);
      load();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
  };

  const handleDelete = async () => {
    if (!deleteForm) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('crm_forms').delete().eq('id', deleteForm.id);
      if (error) throw error;
      toast.success('Form deleted');
      setDeleteForm(null);
      load();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
    finally { setDeleting(false); }
  };

  if (builderForm !== undefined) {
    return <FormBuilder form={builderForm} onBack={() => setBuilderForm(undefined)} onSaved={load} />;
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Forms</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Build embeddable forms for your website</p>
        </div>
        <Button size="sm" onClick={() => setBuilderForm(null)} className="gap-2">
          <Plus className="w-4 h-4" /> New Form
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-xl">
          <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm mb-1">No forms yet</p>
          <p className="text-xs text-muted-foreground/60 mb-4">Build your first form to capture leads and applications</p>
          <Button size="sm" onClick={() => setBuilderForm(null)} className="gap-2">
            <Plus className="w-4 h-4" /> Create First Form
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map(form => (
            <div key={form.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-foreground">{form.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${form.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-gray-500/15 text-gray-400 border-gray-500/20'}`}>
                    {form.status}
                  </span>
                  <span className="text-xs text-muted-foreground/60 bg-muted/60 px-2 py-0.5 rounded-full capitalize">
                    {FORM_TYPES.find(t => t.value === form.form_type)?.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="font-mono">/forms/{form.slug}</span>
                  {form.created_at && <span>{format(new Date(form.created_at), 'MMM d, yyyy')}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setBuilderForm(form)} className="h-8 text-xs gap-1.5">
                  <Settings className="w-3.5 h-3.5" /> Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open form actions menu">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => handleToggleStatus(form)} className="gap-2 text-sm">
                      <ToggleLeft className="w-4 h-4" /> {form.status === 'active' ? 'Deactivate' : 'Activate'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/forms/${form.slug}`); toast.success('Link copied'); }} className="gap-2 text-sm">
                      <Copy className="w-4 h-4" /> Copy Link
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDeleteForm(form)} className="gap-2 text-sm text-red-400 focus:text-red-400">
                      <Trash2 className="w-4 h-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!deleteForm} onOpenChange={() => setDeleteForm(null)}>
        <DialogContent className="w-full max-w-sm mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>Delete Form</DialogTitle>
            <DialogDescription>Permanently delete "{deleteForm?.name}"? All submissions will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setDeleteForm(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="w-full sm:w-auto">
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}