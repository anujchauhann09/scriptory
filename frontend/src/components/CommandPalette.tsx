import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { articlesApi, tagsApi, categoriesApi, type ApiArticle, type ApiTag, type ApiCategory } from '../lib/api';
import {
  Search, Home, FileText, User, Mail, PenLine, Inbox, Sun, Moon, Hash, UserCircle, CornerDownLeft, Layers,
} from 'lucide-react';

interface Item {
  id: string;
  label: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<ApiArticle[]>([]);
  const [tags, setTags] = useState<ApiTag[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [active, setActive] = useState(0);

  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, isAdmin } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Toggle with ⌘K / Ctrl+K, close with Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onOpen);
    };
  }, []);

  // Reset + focus on open; lock body scroll.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      if (tags.length === 0) tagsApi.list().then(setTags).catch(() => {});
      if (categories.length === 0) categoriesApi.list().then(setCategories).catch(() => {});
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      document.body.style.overflow = 'hidden';
      return () => { clearTimeout(t); document.body.style.overflow = ''; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open || !debounced) { setResults([]); return; }
    let cancelled = false;
    articlesApi.list({ search: debounced, limit: 6 })
      .then((r) => { if (!cancelled) setResults(r.articles); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [debounced, open]);

  const run = (action: () => void) => { action(); setOpen(false); };

  const q = query.trim().toLowerCase();

  const pages: Item[] = [
    { id: 'home', label: 'Home', icon: Home, action: () => navigate('/') },
    { id: 'articles', label: 'Articles', icon: FileText, action: () => navigate('/articles') },
    { id: 'about', label: 'About', icon: User, action: () => navigate('/about') },
    { id: 'contact', label: 'Contact', icon: Mail, action: () => navigate('/contact') },
    ...(user ? [{ id: 'profile', label: 'Profile', icon: UserCircle, action: () => navigate('/profile') }] : []),
    ...(isAdmin ? [
      { id: 'write', label: 'Write article', icon: PenLine, action: () => navigate('/write') },
      { id: 'inbox', label: 'Admin Inbox', icon: Inbox, action: () => navigate('/admin') },
    ] : []),
    { id: 'theme', label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`, icon: theme === 'dark' ? Sun : Moon, action: toggleTheme },
  ].filter((p) => !q || p.label.toLowerCase().includes(q));

  const tagItems: Item[] = tags
    .filter((t) => q && t.name.toLowerCase().includes(q))
    .slice(0, 5)
    .map((t) => ({ id: `tag-${t.name}`, label: `#${t.name}`, icon: Hash, action: () => navigate(`/articles?tag=${encodeURIComponent(t.name)}`) }));

  // Categories stay listed even with no query typed — they are the site's
  // structure, so the palette doubles as a table of contents for the path.
  const categoryItems: Item[] = categories
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .slice(0, 6)
    .map((c) => ({
      id: `cat-${c.slug}`,
      label: c.name,
      sub: 'Category',
      icon: Layers,
      action: () => navigate(`/articles?category=${encodeURIComponent(c.slug)}`),
    }));

  const articleItems: Item[] = results.map((a) => ({
    id: `art-${a.uuid}`, label: a.title, sub: 'Article', icon: FileText,
    action: () => navigate(`/articles/${a.slug}`),
  }));

  const groups = [
    { heading: 'Pages & actions', items: pages },
    ...(categoryItems.length ? [{ heading: 'Learning path', items: categoryItems }] : []),
    ...(tagItems.length ? [{ heading: 'Tags', items: tagItems }] : []),
    ...(articleItems.length ? [{ heading: 'Articles', items: articleItems }] : []),
  ].filter((g) => g.items.length > 0);
  const flat = groups.flatMap((g) => g.items);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[active]) run(flat[active].action); }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh]" onMouseDown={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50 [backdrop-filter:blur(4px)]" />
      <div
        className="glass relative w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl shadow-black/30"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search articles, jump to a page…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {flat.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No results found.</p>
          ) : (
            groups.map((g) => (
              <div key={g.heading} className="mb-1">
                <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{g.heading}</p>
                {g.items.map((it) => {
                  const idx = flat.indexOf(it);
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.id}
                      data-idx={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => run(it.action)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        active === idx ? 'bg-brand text-brand-foreground' : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${active === idx ? 'text-brand-foreground' : 'text-muted-foreground'}`} />
                      <span className="flex-1 truncate">{it.label}</span>
                      {active === idx && <CornerDownLeft className="h-3.5 w-3.5 opacity-70" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
