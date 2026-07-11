import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import {
  contactApi,
  newsletterApi,
  auditApi,
  analyticsApi,
  type AdminContactMessage,
  type AdminSubscriber,
  type AuditEntry,
  type AnalyticsOverview,
} from '../lib/api';
import {
  Mail, Users, Inbox, RefreshCw, AlertCircle, Check, CircleCheck,
  Trash2, Download, Loader2, Activity, LayoutDashboard, Eye, Heart,
  MessageSquare, FileText, TrendingUp, Send,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

type Tab = 'overview' | 'messages' | 'subscribers' | 'activity';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

// Quote a CSV cell and neutralise spreadsheet formula injection.
const csvCell = (value: string) => {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
};

export const Admin = () => {
  const shouldReduceMotion = useReducedMotion();
  const [tab, setTab] = useState<Tab>('overview');
  const [messages, setMessages] = useState<AdminContactMessage[]>([]);
  const [subscribers, setSubscribers] = useState<AdminSubscriber[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([contactApi.list(), newsletterApi.listSubscribers(), auditApi.list(), analyticsApi.overview()])
      .then(([m, s, a, o]) => {
        setMessages(m);
        setSubscribers(s);
        setAudit(a);
        setAnalytics(o);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleHandled = async (m: AdminContactMessage) => {
    setBusyId(m.uuid);
    setError('');
    try {
      await contactApi.setHandled(m.uuid, !m.handled);
      setMessages((prev) =>
        prev.map((x) => (x.uuid === m.uuid ? { ...x, handled: !m.handled } : x))
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update message');
    } finally {
      setBusyId(null);
    }
  };

  const deleteMessage = async (uuid: string) => {
    setBusyId(uuid);
    setError('');
    try {
      await contactApi.remove(uuid);
      setMessages((prev) => prev.filter((x) => x.uuid !== uuid));
      setConfirmId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    } finally {
      setBusyId(null);
    }
  };

  const deleteSubscriber = async (uuid: string) => {
    setBusyId(uuid);
    setError('');
    try {
      await newsletterApi.removeSubscriber(uuid);
      setSubscribers((prev) => prev.filter((x) => x.uuid !== uuid));
      setConfirmId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete subscriber');
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const rows = [['Email', 'Status', 'Subscribed At']];
    subscribers.forEach((s) => rows.push([s.email, s.status, new Date(s.createdAt).toISOString()]));
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scriptory-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeSubscribers = subscribers.filter((s) => s.status === 'SUBSCRIBED').length;
  const unhandledCount = messages.filter((m) => !m.handled).length;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number | null }[] = [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" />, count: null },
    { key: 'messages', label: 'Messages', icon: <Mail className="h-4 w-4" />, count: messages.length },
    { key: 'subscribers', label: 'Subscribers', icon: <Users className="h-4 w-4" />, count: subscribers.length },
    { key: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" />, count: audit.length },
  ];

  return (
    <>
      <Helmet><title>Admin Inbox | Scriptory</title></Helmet>

      <Section>
        <Container className="max-w-4xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand">
                <Inbox className="h-3.5 w-3.5" /> Admin
              </span>
              <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Inbox</h1>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 rounded-full border border-border bg-background/40 px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-brand/40 hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Tabs */}
          <div className="mb-8 flex flex-wrap gap-2">
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setConfirmId(null); }}
                  className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    active
                      ? 'bg-brand text-brand-foreground shadow-sm shadow-brand/25'
                      : 'border border-border bg-background/40 text-muted-foreground hover:border-brand/40 hover:text-foreground'
                  }`}
                >
                  {t.icon}
                  {t.label}
                  {t.count !== null && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        active ? 'bg-black/20 text-brand-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass rounded-2xl p-5">
                  <Skeleton className="mb-3 h-4 w-40" />
                  <Skeleton className="mb-2 h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : (
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
            >
              {tab === 'overview' ? (
                <OverviewPanel data={analytics} />
              ) : tab === 'messages' ? (
                <MessagesList
                  messages={messages}
                  unhandledCount={unhandledCount}
                  busyId={busyId}
                  confirmId={confirmId}
                  onToggleHandled={toggleHandled}
                  onRequestDelete={setConfirmId}
                  onConfirmDelete={deleteMessage}
                />
              ) : tab === 'subscribers' ? (
                <SubscribersList
                  subscribers={subscribers}
                  activeCount={activeSubscribers}
                  busyId={busyId}
                  confirmId={confirmId}
                  onExport={exportCsv}
                  onRequestDelete={setConfirmId}
                  onConfirmDelete={deleteSubscriber}
                />
              ) : (
                <ActivityList entries={audit} />
              )}
            </motion.div>
          )}
        </Container>
      </Section>
    </>
  );
};

const EmptyState = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <div className="glass flex flex-col items-center justify-center gap-3 rounded-2xl py-16 text-center text-muted-foreground">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-brand">{icon}</div>
    <p className="text-sm">{text}</p>
  </div>
);

interface MessagesListProps {
  messages: AdminContactMessage[];
  unhandledCount: number;
  busyId: string | null;
  confirmId: string | null;
  onToggleHandled: (m: AdminContactMessage) => void;
  onRequestDelete: (uuid: string | null) => void;
  onConfirmDelete: (uuid: string) => void;
}

const MessagesList = ({
  messages, unhandledCount, busyId, confirmId,
  onToggleHandled, onRequestDelete, onConfirmDelete,
}: MessagesListProps) => {
  if (messages.length === 0) {
    return <EmptyState icon={<Mail className="h-5 w-5" />} text="No contact messages yet." />;
  }
  return (
    <div className="space-y-4">
      <p className="px-1 text-xs text-muted-foreground">
        {unhandledCount} unhandled · {messages.length} total
      </p>
      {messages.map((m) => {
        const busy = busyId === m.uuid;
        const confirming = confirmId === m.uuid;
        return (
          <article key={m.uuid} className={`card-premium rounded-2xl p-5 ${m.handled ? 'opacity-70' : ''}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-bold tracking-tight">{m.name}</span>
                <a href={`mailto:${m.email}`} className="text-sm text-brand transition-colors hover:underline">
                  {m.email}
                </a>
                {m.handled && (
                  <Badge variant="outline" className="border-green-500/40 text-green-600 dark:text-green-400">
                    <CircleCheck className="mr-1 h-3 w-3" /> Handled
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{formatDate(m.createdAt)}</span>
            </div>

            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{m.message}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <button
                onClick={() => onToggleHandled(m)}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-brand/40 hover:text-foreground disabled:opacity-50"
              >
                {busy && !confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {m.handled ? 'Mark unhandled' : 'Mark handled'}
              </button>

              {confirming ? (
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => onConfirmDelete(m.uuid)}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Confirm delete
                  </button>
                  <button
                    onClick={() => onRequestDelete(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => onRequestDelete(m.uuid)}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-destructive/50 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};

interface SubscribersListProps {
  subscribers: AdminSubscriber[];
  activeCount: number;
  busyId: string | null;
  confirmId: string | null;
  onExport: () => void;
  onRequestDelete: (uuid: string | null) => void;
  onConfirmDelete: (uuid: string) => void;
}

const SubscribersList = ({
  subscribers, activeCount, busyId, confirmId,
  onExport, onRequestDelete, onConfirmDelete,
}: SubscribersListProps) => {
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestMsg, setDigestMsg] = useState('');

  const sendDigest = async () => {
    if (!window.confirm('Send the latest-posts digest email to all active subscribers?')) return;
    setDigestBusy(true);
    setDigestMsg('');
    try {
      const r = await newsletterApi.sendDigest();
      setDigestMsg(r.message);
    } catch (err: unknown) {
      setDigestMsg(err instanceof Error ? err.message : 'Failed to send digest');
    } finally {
      setDigestBusy(false);
    }
  };

  if (subscribers.length === 0) {
    return <EmptyState icon={<Users className="h-5 w-5" />} text="No subscribers yet." />;
  }
  return (
    <div className="card-premium overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <span className="text-xs font-medium text-muted-foreground">
          {subscribers.length} total · {activeCount} active
          {digestMsg && <span className="ml-2 text-green-600 dark:text-green-400">· {digestMsg}</span>}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={sendDigest}
            disabled={digestBusy}
            className="flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-brand/40 hover:text-foreground disabled:opacity-50"
          >
            {digestBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send digest
          </button>
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-brand-foreground shadow-sm shadow-brand/25 transition-all hover:brightness-110 active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {subscribers.map((s) => {
          const busy = busyId === s.uuid;
          const confirming = confirmId === s.uuid;
          return (
            <li key={s.uuid} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
              <a href={`mailto:${s.email}`} className="text-sm font-medium transition-colors hover:text-brand">
                {s.email}
              </a>
              <div className="flex items-center gap-3">
                <Badge variant={s.status === 'SUBSCRIBED' ? 'brand' : 'outline'}>
                  {s.status === 'SUBSCRIBED' ? 'Subscribed' : 'Unsubscribed'}
                </Badge>
                <span className="hidden text-xs text-muted-foreground sm:inline">{formatDate(s.createdAt)}</span>
                {confirming ? (
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => onConfirmDelete(s.uuid)}
                      disabled={busy}
                      className="flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-xs font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      Confirm
                    </button>
                    <button onClick={() => onRequestDelete(null)} className="text-xs text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => onRequestDelete(s.uuid)}
                    className="text-muted-foreground/60 transition-colors hover:text-destructive"
                    aria-label="Delete subscriber"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const StatTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="card-premium rounded-2xl p-4">
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <span className="text-brand">{icon}</span>
      <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
    </div>
    <p className="mt-1.5 font-display text-2xl font-bold tracking-tight">{value.toLocaleString()}</p>
  </div>
);

const OverviewPanel = ({ data }: { data: AnalyticsOverview | null }) => {
  if (!data) {
    return <EmptyState icon={<LayoutDashboard className="h-5 w-5" />} text="No analytics available." />;
  }
  const { totals, topArticles, viewsByDay } = data;
  const maxV = Math.max(1, ...viewsByDay.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon={<FileText className="h-4 w-4" />} label="Articles" value={totals.articles} />
        <StatTile icon={<Eye className="h-4 w-4" />} label="Views" value={totals.views} />
        <StatTile icon={<Heart className="h-4 w-4" />} label="Likes" value={totals.likes} />
        <StatTile icon={<MessageSquare className="h-4 w-4" />} label="Comments" value={totals.comments} />
        <StatTile icon={<Users className="h-4 w-4" />} label="Subscribers" value={totals.activeSubscribers} />
        <StatTile icon={<FileText className="h-4 w-4" />} label="Drafts" value={totals.drafts} />
      </div>

      <div className="card-premium rounded-2xl p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-brand" />
          <h3 className="font-semibold">Views · last 30 days</h3>
        </div>
        {viewsByDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">No views recorded yet.</p>
        ) : (
          <div className="flex h-32 items-end gap-1">
            {viewsByDay.map((d) => (
              <div
                key={d.date}
                className="group relative flex-1"
                title={`${d.date}: ${d.count} view${d.count === 1 ? '' : 's'}`}
              >
                <div
                  className="w-full rounded-t bg-brand/70 transition-colors group-hover:bg-brand"
                  style={{ height: `${Math.max(4, (d.count / maxV) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card-premium overflow-hidden rounded-2xl">
        <div className="border-b border-border px-5 py-3 text-xs font-medium text-muted-foreground">
          Top articles by views
        </div>
        {topArticles.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No articles yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {topArticles.map((a, i) => (
              <li key={a.slug} className="flex items-center justify-between gap-3 px-5 py-3">
                <a href={`/articles/${a.slug}`} className="flex min-w-0 items-center gap-3 text-sm font-medium transition-colors hover:text-brand">
                  <span className="text-muted-foreground">{i + 1}</span>
                  <span className="truncate">{a.title}</span>
                </a>
                <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" />{a.views.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const ACTION_LABELS: Record<string, string> = {
  'auth.login.success': 'Signed in',
  'auth.login.failure': 'Failed sign-in',
  'auth.register': 'Account created',
  'auth.password.change': 'Password changed',
  'auth.2fa.enable': '2FA enabled',
  'auth.2fa.disable': '2FA disabled',
  'article.create': 'Article created',
  'article.update': 'Article updated',
  'article.delete': 'Article deleted',
};

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

const ActivityList = ({ entries }: { entries: AuditEntry[] }) => {
  if (entries.length === 0) {
    return <EmptyState icon={<Activity className="h-5 w-5" />} text="No recorded activity yet." />;
  }
  return (
    <div className="card-premium overflow-hidden rounded-2xl">
      <ul className="divide-y divide-border">
        {entries.map((e) => {
          const failure = e.action === 'auth.login.failure';
          return (
            <li key={e.uuid} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${failure ? 'bg-destructive' : 'bg-brand'}`} />
                <div>
                  <span className="text-sm font-medium">{ACTION_LABELS[e.action] || e.action}</span>
                  {e.detail && <span className="ml-2 text-xs text-muted-foreground">{e.detail}</span>}
                  <div className="text-xs text-muted-foreground">
                    {e.actorEmail || 'anonymous'}{e.ip ? ` · ${e.ip}` : ''}
                  </div>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
