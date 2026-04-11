const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function getToken(): string | null {
  try {
    const stored = localStorage.getItem('auth');
    return stored ? JSON.parse(stored).token : null;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers });
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
  const token = getToken();
  const form = new FormData();
  form.append('image', file);

  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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

export interface UserProfile { name?: string | null; bio?: string | null; avatarUrl?: string | null }

export const userApi = {
  me: () => request<{ uuid: string; email: string; role: string; profile: UserProfile }>('/users/me'),
  updateProfile: (data: UserProfile) =>
    request<UserProfile>('/users/me/profile', { method: 'PATCH', body: JSON.stringify(data) }),
};
