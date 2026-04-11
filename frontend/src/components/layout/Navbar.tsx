import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Menu, X, Sun, Moon, PenLine, LogOut, LogIn, User } from 'lucide-react';
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
            className="absolute right-0 top-10 z-50 min-w-[200px] rounded-xl border bg-card p-1 shadow-lg"
          >
            <div className="px-3 py-2.5 border-b border-border mb-1">
              <p className="text-sm font-medium truncate">{user.profile?.name || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              {isAdmin && (
                <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
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
    <nav className="sticky top-0 z-50 w-full [-webkit-backdrop-filter:blur(12px)] backdrop-blur-md bg-background/80 border-b border-border/50">
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center space-x-2">
          <span className="font-sans text-xl font-bold tracking-tight">Scriptory</span>
        </Link>

        <div className="hidden md:flex md:items-center md:space-x-6">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`relative text-sm transition-colors hover:text-primary ${
                  isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
                }`}
              >
                {link.name}
                {isActive && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-primary rounded-full"
                  />
                )}
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              to="/write"
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <PenLine size={14} />
              Write
            </Link>
          )}

          <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-9 w-9 px-0" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <UserMenu />
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-9 w-9 px-0" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost" size="sm" className="h-9 w-9 px-0"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </Container>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -8 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            className="border-b bg-background md:hidden"
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
                  <Link to="/write" className="flex items-center gap-1.5 text-sm font-medium text-primary">
                    <PenLine size={14} />
                    Write
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
