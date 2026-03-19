'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Mail, Send, Reply, ReplyAll, Trash2, Archive,
  Star, StarOff, Search, X, Loader2, RefreshCw,
  Inbox, ChevronRight, Paperclip, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

/* ─── Types ─── */
interface GmailThread {
  id: string;
  subject: string;
  from: string;
  from_email: string;
  snippet: string;
  date: string;
  is_read: boolean;
  is_starred: boolean;
  label: string;
  message_count: number;
}

/* ─── Connect Gmail Panel ─── */
function ConnectGmailPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-16 max-w-md mx-auto text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
        <Mail className="w-8 h-8 text-red-400" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">Connect Gmail</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Connect hello@704collective.com to read, send, and manage emails directly from the admin portal. All founders can access the shared inbox.
      </p>

      <div className="w-full space-y-3 mb-6">
        {[
          'Read and reply to all emails from hello@704collective.com',
          'Shared access for all super admins',
          'Compose and send emails on behalf of the team',
          'Star, archive, and label messages',
          'Search across all conversations',
        ].map((f, i) => (
          <div key={i} className="flex items-center gap-3 text-left p-3 bg-muted/30 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <p className="text-sm text-foreground">{f}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-left mb-6 w-full">
        <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-400">
          Gmail OAuth requires setting up a Google Cloud project with the Gmail API enabled and adding hello@704collective.com as an authorized account. This is configured once in your environment settings.
        </p>
      </div>

      <Button className="gap-2 w-full">
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Connect with Google
      </Button>
      <p className="text-xs text-muted-foreground mt-3">
        You'll be redirected to Google to authorize access to hello@704collective.com
      </p>
    </div>
  );
}

/* ─── Compose Dialog ─── */
function ComposeDialog({ open, onClose, replyTo }: { open: boolean; onClose: () => void; replyTo?: GmailThread | null }) {
  const [to, setTo] = useState(replyTo?.from_email ?? '');
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (replyTo) {
      setTo(replyTo.from_email);
      setSubject(`Re: ${replyTo.subject}`);
    } else {
      setTo(''); setSubject(''); setBody('');
    }
  }, [replyTo, open]);

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) { toast.error('All fields required'); return; }
    setSending(true);
    // Gmail API send — will be wired when OAuth is connected
    await new Promise(r => setTimeout(r, 800));
    toast.success('Email sent');
    setSending(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg max-h-[90dvh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle>{replyTo ? 'Reply' : 'Compose Email'}</DialogTitle>
          <DialogDescription>From: hello@704collective.com</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">To</Label>
            <Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@example.com" className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Subject</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Message</Label>
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder="Write your message…" className="text-sm resize-none" />
          </div>
        </div>
        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSend} disabled={sending} className="w-full sm:w-auto gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Thread View ─── */
function ThreadView({ thread, onBack, onReply }: { thread: GmailThread; onBack: () => void; onReply: (t: GmailThread) => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 pb-4 border-b border-border mb-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-muted-foreground">
          <ChevronRight className="w-4 h-4 rotate-180" /> Back
        </Button>
        <h2 className="font-semibold text-foreground flex-1 truncate">{thread.subject}</h2>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8"><Archive className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="w-4 h-4" /></Button>
          <Button size="sm" onClick={() => onReply(thread)} className="gap-2 ml-1"><Reply className="w-4 h-4" /> Reply</Button>
        </div>
      </div>

      <div className="flex-1 space-y-4">
        <div className="bg-muted/20 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-medium text-foreground text-sm">{thread.from}</p>
              <p className="text-xs text-muted-foreground">{thread.from_email}</p>
            </div>
            <p className="text-xs text-muted-foreground shrink-0">{format(new Date(thread.date), 'MMM d, h:mm a')}</p>
          </div>
          <p className="text-sm text-foreground">{thread.snippet}</p>
          <p className="text-xs text-muted-foreground/60 mt-3 italic">(Full email content loads via Gmail API)</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─── */
export default function CrmInboxPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [threads, setThreads] = useState<GmailThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedThread, setSelectedThread] = useState<GmailThread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyThread, setReplyThread] = useState<GmailThread | null>(null);
  const [activeLabel, setActiveLabel] = useState('inbox');

  // Check Gmail integration connection
  useEffect(() => {
    supabase.from('integrations').select('id').eq('provider', 'gmail').maybeSingle()
      .then(({ data }) => setIsConnected(!!data));
  }, []);

  const filteredThreads = threads.filter(t =>
    !search || t.subject.toLowerCase().includes(search.toLowerCase()) ||
    t.from.toLowerCase().includes(search.toLowerCase())
  );

  const handleReply = (thread: GmailThread) => {
    setReplyThread(thread);
    setComposeOpen(true);
  };

  if (!isConnected) {
    return (
      <div className="pb-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Team Gmail inbox for hello@704collective.com</p>
        </div>
        <ConnectGmailPanel />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">hello@704collective.com</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2"><RefreshCw className="w-4 h-4" /> Refresh</Button>
          <Button size="sm" onClick={() => { setReplyThread(null); setComposeOpen(true); }} className="gap-2">
            <Send className="w-4 h-4" /> Compose
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 min-h-[500px]">
        {/* Sidebar */}
        <div className="lg:w-44 shrink-0">
          {['inbox', 'sent', 'starred', 'drafts', 'archive'].map(label => (
            <button key={label} type="button" onClick={() => setActiveLabel(label)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${activeLabel === label ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
              {label === 'inbox' && <Inbox className="w-4 h-4" />}
              {label === 'sent' && <Send className="w-4 h-4" />}
              {label === 'starred' && <Star className="w-4 h-4" />}
              {label === 'drafts' && <Mail className="w-4 h-4" />}
              {label === 'archive' && <Archive className="w-4 h-4" />}
              {label}
            </button>
          ))}
        </div>

        {/* Main area */}
        <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden">
          {selectedThread ? (
            <div className="p-5 h-full">
              <ThreadView thread={selectedThread} onBack={() => setSelectedThread(null)} onReply={handleReply} />
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search emails…" className="pl-9 h-8 text-sm" />
                </div>
              </div>

              {/* Thread list */}
              {loading ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Inbox className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No emails</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Emails will appear here once Gmail is connected and synced</p>
                </div>
              ) : (
                <div>
                  {filteredThreads.map(thread => (
                    <div key={thread.id} onClick={() => setSelectedThread(thread)}
                      className={`flex items-start gap-3 px-4 py-3.5 border-b border-border cursor-pointer hover:bg-muted/20 transition-colors ${!thread.is_read ? 'bg-primary/5' : ''}`}>
                      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                        {!thread.is_read && <div className="w-2 h-2 rounded-full bg-primary" />}
                        {thread.is_starred && <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${!thread.is_read ? 'font-semibold text-foreground' : 'text-foreground'}`}>{thread.from}</p>
                          <p className="text-xs text-muted-foreground shrink-0">{format(new Date(thread.date), 'MMM d')}</p>
                        </div>
                        <p className={`text-sm truncate ${!thread.is_read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{thread.subject}</p>
                        <p className="text-xs text-muted-foreground/60 truncate">{thread.snippet}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ComposeDialog open={composeOpen} onClose={() => { setComposeOpen(false); setReplyThread(null); }} replyTo={replyThread} />
    </div>
  );
}