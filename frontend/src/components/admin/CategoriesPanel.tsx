import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { categoriesApi, type AdminCategory } from '../../lib/api';
import {
  Layers, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X,
  AlertCircle, Loader2, AlertTriangle,
} from 'lucide-react';

/**
 * Taxonomy management.
 *
 * Categories are the site's advertised structure, so the destructive and
 * link-breaking actions are the ones that need care here:
 *
 *   - Deleting never removes articles. The database relation is ON DELETE SET
 *     NULL, so a deleted category unfiles its articles and leaves them
 *     published. The confirmation says exactly how many that is, because "3
 *     articles move to uncategorised" is a very different decision from
 *     "nothing happens".
 *
 *   - Renaming is safe; changing a slug is not. Articles reference the category
 *     by id, so neither detaches anything — but the slug appears in
 *     `?category=` URLs, so changing it breaks any link someone already has.
 *     The form says so before it is sent.
 *
 *   - Reordering sends the whole list in one request, so readers never see a
 *     half-applied order.
 */

interface DraftFields {
  name: string;
  slug: string;
  description: string;
}

const emptyDraft: DraftFields = { name: '', slug: '', description: '' };

export const CategoriesPanel = () => {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<DraftFields>(emptyDraft);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftFields>(emptyDraft);
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    categoriesApi
      .listForAdmin()
      .then((data) => {
        setCategories(data);
        setError('');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load categories'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  /** Runs an action, surfacing its error inline instead of throwing it away. */
  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = () =>
    run('create', async () => {
      const created = await categoriesApi.create({
        name: newDraft.name.trim(),
        // Sent only when the admin typed one; otherwise the server derives it
        // from the name, which is the normal path.
        ...(newDraft.slug.trim() ? { slug: newDraft.slug.trim() } : {}),
        description: newDraft.description.trim() || null,
      });
      setNewDraft(emptyDraft);
      setCreating(false);
      setNotice(`Added "${created.name}" to the end of the learning path.`);
      load();
    });

  const handleUpdate = (slug: string) =>
    run(`edit-${slug}`, async () => {
      const result = await categoriesApi.update(slug, {
        name: editDraft.name.trim(),
        slug: editDraft.slug.trim(),
        description: editDraft.description.trim() || null,
      });
      setEditingSlug(null);
      setNotice(
        result.slugChanged
          ? `Updated. Any existing link using "?category=${result.previousSlug}" will no longer match.`
          : 'Category updated.'
      );
      load();
    });

  const handleDelete = (slug: string) =>
    run(`delete-${slug}`, async () => {
      const result = await categoriesApi.remove(slug);
      setConfirmSlug(null);
      setNotice(
        result.unfiled
          ? `Deleted "${result.name}". ${result.unfiled} article${result.unfiled === 1 ? '' : 's'} moved to uncategorised — none were deleted.`
          : `Deleted "${result.name}".`
      );
      load();
    });

  /** Swaps a category with its neighbour and sends the whole resulting order. */
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    // Optimistic: the list reorders immediately, and `load()` reconciles with
    // whatever the server actually committed.
    setCategories(next);

    return run(`move-${categories[index].slug}`, async () => {
      const saved = await categoriesApi.reorder(next.map((c) => c.slug));
      setCategories(saved);
    });
  };

  const startEdit = (category: AdminCategory) => {
    setConfirmSlug(null);
    setEditingSlug(category.slug);
    setEditDraft({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
    });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-2xl p-5">
            <Skeleton className="mb-2 h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          The order below is the learning path readers see. Categories are always optional —
          an article can be published without one.
        </p>
        <Button
          variant="brand"
          size="sm"
          onClick={() => {
            setCreating((v) => !v);
            setError('');
            setNotice('');
          }}
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? 'Cancel' : 'New category'}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm">
          <Check className="h-4 w-4 shrink-0 text-brand" />
          {notice}
        </div>
      )}

      {creating && (
        <div className="glass space-y-3 rounded-2xl p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
              <Input
                autoFocus
                placeholder="e.g. Databases"
                value={newDraft.name}
                onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Slug <span className="font-normal">(optional)</span>
              </label>
              <Input
                placeholder="auto-generated from the name"
                value={newDraft.slug}
                onChange={(e) => setNewDraft({ ...newDraft, slug: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Description <span className="font-normal">(optional)</span>
            </label>
            <Input
              placeholder="What belongs in this category"
              value={newDraft.description}
              onChange={(e) => setNewDraft({ ...newDraft, description: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="brand"
              disabled={newDraft.name.trim().length < 2 || busy === 'create'}
              onClick={handleCreate}
            >
              {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Create
            </Button>
            <span className="text-xs text-muted-foreground">Added at the end of the path.</span>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center gap-3 rounded-2xl py-16 text-center text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-brand">
            <Layers className="h-5 w-5" />
          </div>
          No categories yet. Articles publish fine without them.
        </div>
      ) : (
        <ul className="space-y-3">
          {categories.map((category, index) => {
            const isEditing = editingSlug === category.slug;
            const isConfirming = confirmSlug === category.slug;

            return (
              <li key={category.slug} className="glass rounded-2xl p-4 sm:p-5">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
                        <Input
                          autoFocus
                          value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Slug</label>
                        <Input
                          value={editDraft.slug}
                          onChange={(e) => setEditDraft({ ...editDraft, slug: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        Description
                      </label>
                      <Input
                        value={editDraft.description}
                        onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                      />
                    </div>

                    {editDraft.slug.trim() !== category.slug && (
                      <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Changing the slug breaks existing links to
                        <code className="rounded bg-muted px-1">?category={category.slug}</code>.
                        Filed articles are unaffected.
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="brand"
                        disabled={editDraft.name.trim().length < 2 || busy === `edit-${category.slug}`}
                        onClick={() => handleUpdate(category.slug)}
                      >
                        {busy === `edit-${category.slug}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingSlug(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    {/* Reorder controls. Disabled at the ends so the path
                        cannot be nudged out of bounds. */}
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      <button
                        aria-label={`Move ${category.name} earlier`}
                        disabled={index === 0 || busy !== null}
                        onClick={() => move(index, -1)}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-brand disabled:opacity-30 disabled:hover:text-muted-foreground"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        aria-label={`Move ${category.name} later`}
                        disabled={index === categories.length - 1 || busy !== null}
                        onClick={() => move(index, 1)}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-brand disabled:opacity-30 disabled:hover:text-muted-foreground"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>

                    <span className="mt-0.5 w-5 shrink-0 text-sm font-bold text-brand">{index + 1}</span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{category.name}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {category.slug}
                        </code>
                      </div>
                      {category.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
                      )}
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {category.publishedCount} published
                        {category.articleCount > category.publishedCount &&
                          ` · ${category.articleCount - category.publishedCount} draft`}
                      </p>

                      {isConfirming && (
                        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
                          <p className="flex items-start gap-2 text-destructive">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              Delete <strong>{category.name}</strong>?
                              {category.articleCount > 0 ? (
                                <>
                                  {' '}
                                  {category.articleCount} article
                                  {category.articleCount === 1 ? '' : 's'} will move to
                                  uncategorised. <strong>No articles are deleted.</strong>
                                </>
                              ) : (
                                ' It has no articles.'
                              )}
                            </span>
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="brand"
                              disabled={busy === `delete-${category.slug}`}
                              onClick={() => handleDelete(category.slug)}
                            >
                              {busy === `delete-${category.slug}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              Delete
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmSlug(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        aria-label={`Edit ${category.name}`}
                        onClick={() => startEdit(category)}
                        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        aria-label={`Delete ${category.name}`}
                        onClick={() => {
                          setEditingSlug(null);
                          setConfirmSlug(isConfirming ? null : category.slug);
                        }}
                        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
