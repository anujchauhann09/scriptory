const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/** Requests that outlive this are abandoned rather than left hanging forever. */
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Raised when the API rejects a request as unauthenticated.
 *
 * Callers can tell "your session ended" apart from "that request failed",
 * which is what lets the auth layer sign the user out instead of showing a
 * generic error on every subsequent call.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Your session has ended. Please sign in again.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** Raised when a rate limit is hit, carrying the server's retry hint. */
export class RateLimitedError extends Error {
  retryAfterSeconds?: number;
  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'RateLimitedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Registered by the auth context so a 401 anywhere clears the session once. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

/**
 * Reads a response body defensively.
 *
 * The previous implementation called `res.json()` unconditionally. That throws
 * an opaque `SyntaxError` for any response that is not JSON — a 204, a load
 * balancer's HTML 502, or a proxy timeout page — and the user saw
 * "Unexpected token '<'" instead of anything actionable. Behind a managed load
 * balancer those responses are routine, so this has to be handled, not assumed
 * away.
 */
async function readBody(res: Response): Promise<any> {
  if (res.status === 204 || res.headers.get('content-length') === '0') return {};
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Read and discard so the connection can be reused; never surface the body
    // itself, which may be an infrastructure error page.
    await res.text().catch(() => '');
    return {};
  }
  return res.json().catch(() => ({}));
}

function errorFor(res: Response, body: any): Error {
  const message = typeof body?.message === 'string' ? body.message : null;

  if (res.status === 401) return new UnauthorizedError(message || undefined);

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    return new RateLimitedError(
      message || 'Too many requests. Please wait a moment and try again.',
      Number.isFinite(retryAfter) ? retryAfter : undefined
    );
  }

  if (res.status === 403) {
    return new Error(message || 'You do not have permission to do that.');
  }

  if (res.status >= 500) {
    // 5xx messages are deliberately generic server-side; the request id, when
    // present, is what support can actually trace.
    const requestId = body?.errors?.requestId;
    return new Error(
      requestId
        ? `Something went wrong on our end. Reference: ${requestId}`
        : 'Something went wrong on our end. Please try again shortly.'
    );
  }

  return new Error(message || 'Something went wrong. Please try again.');
}

// auth is carried by an httpOnly cookie (not readable by JS), so every request
// must send credentials
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('The request timed out. Please try again.');
    }
    throw new Error('Unable to connect to the server. Please try again later.');
  } finally {
    clearTimeout(timer);
  }

  const body = await readBody(res);

  if (!res.ok) {
    const error = errorFor(res, body);
    // One place decides what an expired session means, rather than each caller
    // guessing from an error string.
    if (error instanceof UnauthorizedError) onUnauthorized?.();
    throw error;
  }

  return body.data as T;
}

export interface ApiTag { name: string; articleCount?: number }

/** A curated learning category. Distinct from tags: closed set, at most one per article. */
export interface ApiCategory {
  slug: string;
  name: string;
  description?: string | null;
  /** Position in the intended learning progression, ascending. */
  sortOrder: number;
  articleCount: number;
}

/** The category shape embedded in an article payload. */
export interface ApiArticleCategory { slug: string; name: string }

export interface ApiArticle {
  uuid: string;
  title: string;
  subtitle?: string;
  slug: string;
  excerpt?: string;
  content: string;
  coverImage?: string;
  published: boolean;
  readingTime?: number;
  createdAt: string;
  updatedAt: string;
  publishAt?: string | null;
  viewCount: number;
  tags: string[];
  /**
   * Optional by design. The API always sends the key, using null for an article
   * that has not been filed — so this is `null`, never absent, and callers can
   * branch on it directly.
   */
  category?: ApiArticleCategory | null;
  author: {
    uuid: string;
    profile?: { name?: string; avatarUrl?: string };
  };
  // Present on the article-detail response (GET /articles/:slug), omitted from list.
  comments?: ApiComment[];
  series?: {
    title: string;
    slug: string;
    order: number | null;
    articles: { title: string; slug: string; order: number | null }[];
  } | null;
}

export interface PaginatedArticles {
  articles: ApiArticle[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface ArticlePayload {
  title: string;
  subtitle?: string;
  content: string;
  excerpt?: string;
  coverImage?: string | null;
  published?: boolean;
  tags?: string[];
  series?: string | null;
  seriesOrder?: number | null;
  publishAt?: string | null;
  /**
   * Category slug, or null to leave the article uncategorised. Omitting the
   * field on an update leaves the existing category untouched; sending null
   * clears it.
   */
  category?: string | null;
}

export const articlesApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request<PaginatedArticles>(`/articles${qs}`);
  },
  get: (slug: string) => request<ApiArticle>(`/articles/${slug}`),
  related: (slug: string) => request<ApiArticle[]>(`/articles/${slug}/related`),
  create: (data: ArticlePayload) =>
    request<ApiArticle>('/articles', { method: 'POST', body: JSON.stringify(data) }),
  update: (uuid: string, data: Partial<ArticlePayload>) =>
    request<ApiArticle>(`/articles/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (uuid: string) =>
    request<null>(`/articles/${uuid}`, { method: 'DELETE' }),
  incrementViewBySlug: (slug: string) =>
    request<{ count: number }>(`/articles/${slug}/views`, { method: 'POST' }),
};

export interface ApiComment {
  uuid: string;
  content: string;
  createdAt: string;
  user: { uuid: string; profile?: { name?: string; avatarUrl?: string } };
}

export const commentsApi = {
  list: (slug: string) => request<ApiComment[]>(`/articles/${slug}/comments`),
  create: (slug: string, content: string) =>
    request<ApiComment>(`/articles/${slug}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  delete: (slug: string, commentUuid: string) =>
    request<null>(`/articles/${slug}/comments/${commentUuid}`, { method: 'DELETE' }),
};

export interface LikeStatus { liked: boolean; likeCount: number }

export const likesApi = {
  status: (slug: string) => request<LikeStatus>(`/articles/${slug}/likes`),
  toggle: (slug: string) =>
    request<LikeStatus>(`/articles/${slug}/likes`, { method: 'POST' }),
};

export const tagsApi = {
  list: () => request<ApiTag[]>('/tags'),
};

/** Admin view: adds draft counts, which readers never see. */
export interface AdminCategory extends ApiCategory {
  /** Every article filed here, drafts included — the number that matters on delete. */
  articleCount: number;
  /** Published only — the number readers see. */
  publishedCount: number;
  createdAt: string;
}

export interface CategoryPayload {
  name: string;
  /** Derived from the name when omitted. */
  slug?: string;
  description?: string | null;
}

export interface DeletedCategory {
  slug: string;
  name: string;
  /** Articles moved to uncategorised. They are never deleted. */
  unfiled: number;
}

/**
 * Reading the taxonomy is public; changing it is admin-only and enforced server
 * side. Note there is deliberately no way to create a category as a side effect
 * of writing an article — that separation is what keeps a typo in the editor
 * from becoming a permanent top-level category.
 */
export const categoriesApi = {
  list: () => request<ApiCategory[]>('/categories'),

  // Admin only — the server enforces the ADMIN role on all of these.
  listForAdmin: () => request<AdminCategory[]>('/categories/manage'),
  create: (data: CategoryPayload) =>
    request<AdminCategory>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (slug: string, data: Partial<CategoryPayload>) =>
    request<ApiCategory & { slugChanged: boolean; previousSlug: string }>(
      `/categories/${encodeURIComponent(slug)}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),
  remove: (slug: string) =>
    request<DeletedCategory>(`/categories/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  /** Sends the complete desired order; applied atomically. */
  reorder: (order: string[]) =>
    request<AdminCategory[]>('/categories/order', {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),
};

export interface SiteStats { articles: number; views: number; topics: number }

export const statsApi = {
  get: () => request<SiteStats>('/stats'),
};

export const bookmarksApi = {
  status: (slug: string) => request<{ bookmarked: boolean }>(`/articles/${slug}/bookmark`),
  toggle: (slug: string) =>
    request<{ bookmarked: boolean }>(`/articles/${slug}/bookmark`, { method: 'POST' }),
  list: () => request<ApiArticle[]>('/bookmarks'),
};

export interface UploadResult { url: string; publicId: string }

/** Mirrors the server's own file limits so an oversized file fails instantly
 *  instead of after a full upload. */
const MAX_UPLOAD_BYTES: Record<string, number> = {
  '/upload/cover': 5 * 1024 * 1024,
  '/upload/inline': 5 * 1024 * 1024,
  '/upload/avatar': 2 * 1024 * 1024,
};

const ACCEPTED_IMAGE_TYPES = /^image\/(jpeg|png|webp|avif|gif)$/;

async function uploadFile(endpoint: string, file: File): Promise<UploadResult> {
  if (!ACCEPTED_IMAGE_TYPES.test(file.type)) {
    throw new Error('Please choose a JPEG, PNG, WebP, AVIF or GIF image.');
  }
  const limit = MAX_UPLOAD_BYTES[endpoint];
  if (limit && file.size > limit) {
    throw new Error(`That image is too large. The maximum is ${Math.round(limit / 1024 / 1024)}MB.`);
  }

  const form = new FormData();
  form.append('image', file);

  const controller = new AbortController();
  // Uploads legitimately take longer than an API call.
  const timer = setTimeout(() => controller.abort(), 60000);

  let res: Response;
  try {
    // No Content-Type header: the browser must set the multipart boundary.
    res = await fetch(`${BASE}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new Error('The upload timed out.');
    throw new Error('Unable to reach the server. Please try again.');
  } finally {
    clearTimeout(timer);
  }

  const body = await readBody(res);
  if (!res.ok) {
    const error = errorFor(res, body);
    if (error instanceof UnauthorizedError) onUnauthorized?.();
    throw error;
  }
  return body.data as UploadResult;
}

export const uploadApi = {
  cover: (file: File) => uploadFile('/upload/cover', file),
  inline: (file: File) => uploadFile('/upload/inline', file),
  avatar: (file: File) => uploadFile('/upload/avatar', file),
};

export interface ContactPayload { name: string; email: string; message: string }

export interface AdminContactMessage {
  uuid: string;
  name: string;
  email: string;
  message: string;
  handled: boolean;
  createdAt: string;
}

export const contactApi = {
  submit: (data: ContactPayload) =>
    request<{ uuid: string; createdAt: string } | null>('/contact', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // Admin only — server enforces ADMIN role
  list: () => request<AdminContactMessage[]>('/contact'),
  setHandled: (uuid: string, handled: boolean) =>
    request<{ uuid: string; handled: boolean }>(`/contact/${uuid}`, {
      method: 'PATCH',
      body: JSON.stringify({ handled }),
    }),
  remove: (uuid: string) => request<null>(`/contact/${uuid}`, { method: 'DELETE' }),
};

export type SubscribeStatus = 'subscribed' | 'resubscribed' | 'already';

export interface AdminSubscriber {
  uuid: string;
  email: string;
  status: 'SUBSCRIBED' | 'UNSUBSCRIBED';
  createdAt: string;
}

export const newsletterApi = {
  subscribe: (email: string) =>
    request<{ status: SubscribeStatus }>('/newsletter/subscribe', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  // Admin only — server enforces ADMIN role
  listSubscribers: () => request<AdminSubscriber[]>('/newsletter/subscribers'),
  removeSubscriber: (uuid: string) =>
    request<null>(`/newsletter/subscribers/${uuid}`, { method: 'DELETE' }),
  sendDigest: () =>
    request<{ sent: number; total: number; message: string }>('/newsletter/digest', { method: 'POST' }),
};

export interface UserProfile { name?: string | null; bio?: string | null; avatarUrl?: string | null }

export const userApi = {
  me: () => request<{ uuid: string; email: string; role: string; profile: UserProfile }>('/users/me'),
  updateProfile: (data: UserProfile) =>
    request<UserProfile>('/users/me/profile', { method: 'PATCH', body: JSON.stringify(data) }),
};

// ---- auth (httpOnly-cookie based)

export interface AuthUserPayload {
  uuid: string;
  email: string;
  role: 'ADMIN' | 'USER';
  twoFactorEnabled?: boolean;
  profile?: { name?: string | null; avatarUrl?: string | null; bio?: string | null };
}

/** thrown by authApi.login when the account has 2FA and no valid code was supplied */
export class TwoFactorRequiredError extends Error {
  constructor() {
    super('Two-factor authentication code required');
    this.name = 'TwoFactorRequiredError';
  }
}

export const authApi = {
  login: async (email: string, password: string, totp?: string): Promise<AuthUserPayload> => {
    let res: Response;
    try {
      res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(totp ? { totp } : {}) }),
      });
    } catch {
      throw new Error('Unable to connect to the server. Please try again later.');
    }
    const json = await readBody(res);
    // A 2FA challenge is a 401, but it is not an expired session — it must not
    // trigger the global sign-out handler.
    if (res.status === 401 && json.twoFactorRequired) throw new TwoFactorRequiredError();
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new RateLimitedError(
        json.message || 'Too many sign-in attempts. Please wait before trying again.',
        Number.isFinite(retryAfter) ? retryAfter : undefined
      );
    }
    if (!res.ok) throw new Error(json.message || 'Login failed');
    return json.data.user as AuthUserPayload;
  },
  register: (email: string, password: string, name?: string) =>
    request<{ user: AuthUserPayload }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }).then((d) => d.user),
  logout: () => request<null>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<null>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  twoFactor: {
    setup: () =>
      request<{ secret: string; otpauthUrl: string; qrDataUrl: string }>('/auth/2fa/setup', {
        method: 'POST',
      }),
    enable: (code: string) =>
      request<null>('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
    disable: (code: string) =>
      request<null>('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) }),
  },
};

export interface AuditEntry {
  uuid: string;
  action: string;
  actorEmail?: string | null;
  ip?: string | null;
  detail?: string | null;
  createdAt: string;
}

export const auditApi = {
  list: () => request<AuditEntry[]>('/audit'),
};

export interface AnalyticsOverview {
  totals: {
    articles: number; published: number; drafts: number;
    views: number; likes: number; comments: number;
    subscribers: number; activeSubscribers: number;
  };
  topArticles: { title: string; slug: string; views: number }[];
  viewsByDay: { date: string; count: number }[];
}

export const analyticsApi = {
  overview: () => request<AnalyticsOverview>('/analytics'),
};
