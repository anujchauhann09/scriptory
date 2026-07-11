import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Menu, X, Sun, Moon, PenLine, LogOut, LogIn, User, Inbox, Search } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Container } from '../ui/Container';
import { Button } from '../ui/Button';

const UserMenu = () => {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) {
    return (
      <Link
        to="/login"
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <LogIn size={15} />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  const displayName = user.profile?.name || user.email;
  const avatarUrl = user.profile?.avatarUrl;
  const initials = (user.profile?.name || user.email)
    .split(/[\s@]/)[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80"
        aria-label="User menu"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="h-8 w-8 rounded-full object-cover ring-2 ring-border" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground ring-2 ring-border">
            {initials}
          </div>
        )}
        <span className="hidden max-w-[120px] truncate text-sm text-muted-foreground lg:block">
          {displayName}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="glass absolute right-0 top-11 z-50 min-w-[210px] rounded-2xl p-1.5 shadow-xl shadow-black/10"
          >
            <div className="px-3 py-2.5 border-b border-border mb-1">
              <p className="text-sm font-medium truncate">{user.profile?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              {isAdmin && (
                <span className="mt-1 inline-block rounded-full bg-brand-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
                  Admin
                </span>
              )}
            </div>

            {isAdmin && (
              <Link
                to="/write"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <PenLine size={14} />
                Write article
              </Link>
            )}

            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Inbox size={14} />
                Inbox
              </Link>
            )}

            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <User size={14} />
              Profile
            </Link>

            <button
              onClick={() => { logout(); setOpen(false); navigate('/'); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { isAdmin, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => { setIsOpen(false); }, [location]);

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Articles', path: '/articles' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="glass mx-auto flex h-14 w-full max-w-6xl items-center justify-between rounded-full px-4 shadow-lg shadow-black/5 sm:px-6">
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="h-4 w-4 rotate-45 rounded-[4px] bg-brand shadow-sm shadow-brand/40 transition-transform duration-300 group-hover:rotate-[135deg]" />
          <span className="font-display text-xl font-extrabold tracking-tight">Scriptory</span>
        </Link>

        <div className="hidden md:flex md:items-center md:gap-7">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`relative text-sm transition-colors hover:text-foreground ${
                  isActive ? 'text-foreground font-semibold' : 'text-muted-foreground'
                }`}
              >
                {link.name}
                {isActive && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-1.5 left-0 right-0 h-0.5 rounded-full bg-brand"
                  />
                )}
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              to="/write"
              className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-foreground shadow-sm shadow-brand/25 transition-all hover:brightness-110 active:scale-95"
            >
              <PenLine size={14} />
              Write
            </Link>
          )}

          <button
            onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
            className="hidden items-center gap-2 rounded-full border border-border bg-background/40 py-1.5 pl-3 pr-2 text-sm text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground lg:flex"
            aria-label="Search (Command K)"
          >
            <Search className="h-3.5 w-3.5" />
            <kbd className="rounded border border-border px-1.5 text-[10px] font-medium">⌘K</kbd>
          </button>

          <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-9 w-9 rounded-full px-0" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <UserMenu />
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-9 w-9 rounded-full px-0" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost" size="sm" className="h-9 w-9 rounded-full px-0"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -8 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            className="glass mx-auto mt-2 max-w-6xl rounded-2xl shadow-lg shadow-black/5 md:hidden"
          >
            <Container className="py-4">
              <div className="flex flex-col space-y-4">
                {/* User info on mobile */}
                {user && (
                  <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {(user.profile?.name || user.email).split(/[\s@]/)[0].slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.profile?.name || 'User'}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                )}

                {navLinks.map((link) => {
                  const isActive = location.pathname === link.path;
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      className={`text-sm transition-colors hover:text-primary ${
                        isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {link.name}
                    </Link>
                  );
                })}

                {isAdmin && (
                  <Link to="/write" className="flex items-center gap-1.5 text-sm font-semibold text-brand">
                    <PenLine size={14} />
                    Write
                  </Link>
                )}

                {isAdmin && (
                  <Link to="/admin" className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Inbox size={14} />
                    Inbox
                  </Link>
                )}

                {user && (
                  <Link to="/profile" className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <User size={14} />
                    Profile
                  </Link>
                )}

                {user ? (
                  <button
                    onClick={() => { logout(); navigate('/'); setIsOpen(false); }}
                    className="flex items-center gap-1.5 text-left text-sm text-muted-foreground"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                ) : (
                  <Link to="/login" className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <LogIn size={14} />
                    Sign in
                  </Link>
                )}
              </div>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
