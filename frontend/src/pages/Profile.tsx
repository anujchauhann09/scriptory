import React, { useState, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../context/AuthContext';
import { userApi, uploadApi } from '../lib/api';
import { Container } from '../components/ui/Container';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Camera, Loader2 } from 'lucide-react';

export const Profile = () => {
  const { user, updateProfile } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.profile?.name || '');
  const [bio, setBio] = useState(user?.profile?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.profile?.avatarUrl || '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  const initials = (user.profile?.name || user.email)
    .split(/[\s@]/)[0]
    .slice(0, 2)
    .toUpperCase();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setAvatarUploading(true);
    setError('');
    try {
      const result = await uploadApi.avatar(file);
      setAvatarUrl(result.url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Avatar upload failed');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const updated = await userApi.updateProfile({
        name: name.trim() || null,
        bio: bio.trim() || null,
        avatarUrl: avatarUrl || null,
      });
      updateProfile(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Helmet><title>Profile | Scriptory</title></Helmet>

      <Container className="max-w-lg py-12">
        <h1 className="mb-8 text-2xl font-bold">Your profile</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name || user.email}
                  className="h-24 w-24 rounded-full object-cover ring-2 ring-border"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground ring-2 ring-border">
                  {initials}
                </div>
              )}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-background border border-border shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
                aria-label="Change avatar"
              >
                {avatarUploading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Camera size={14} />
                }
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{user.email}</p>
              <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground capitalize">
                {user.role.toLowerCase()}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Display name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={100}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us a bit about yourself…"
                rows={4}
                maxLength={500}
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">{bio.length}/500</p>
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          {success && (
            <p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400">
              Profile saved.
            </p>
          )}

          <Button type="submit" disabled={saving || avatarUploading} className="w-full">
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </Container>
    </>
  );
};
