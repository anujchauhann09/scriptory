const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, credentials: 'include', headers });
  } catch {
    throw new Error('Unable to connect to the server. Please try again later.');
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Something went wrong. Please try again.');
  return json.data as T;
}

export interface ApiTag { name: string; articleCount?: number }

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
  viewCount: number;
  tags: string[];
  author: {
    uuid: string;
    profile?: { name?: string; avatarUrl?: string };
  };
  // Present on the article-detail response (GET /articles/:slug), omitted from list.
  comments?: ApiComment[];
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
}

export const articlesApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return request<PaginatedArticles>(`/articles${qs}`);
  },
  get: (slug: string) => request<ApiArticle>(`/articles/${slug}`),
  create: (data: ArticlePayload) =>
    request<ApiArticle>('/articles', { method: 'POST', body: JSON.stringify(data) }),
  update: (uuid: string, data: Partial<ArticlePayload>) =>
    request<ApiArticle>(`/articles/${uuid}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (uuid: string) =>
    request<null>(`/articles/${uuid}`, { method: 'DELETE' }),
  incrementView: (id: number) =>
    request<{ count: number }>(`/articles/${id}/views`, { method: 'POST' }),
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

export interface UploadResult { url: string; publicId: string }

async function uploadFile(endpoint: string, file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('image', file);

  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Upload failed');
  return json.data as UploadResult;
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
    const json = await res.json().catch(() => ({} as any));
    if (res.status === 401 && json.twoFactorRequired) throw new TwoFactorRequiredError();
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
