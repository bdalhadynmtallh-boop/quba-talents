import type { ApiErrorBody } from '@quba/shared';
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function apiResponse(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET') {
    let result: Response;
    try {
      result = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
    } catch {
      throw new ApiError(0, 'تعذر الاتصال بالخادم. حاول مجددًا.');
    }
    if (!result.ok) throw new ApiError(result.status, 'تعذر تجهيز الطلب الآمن.');
    const data: unknown = await result.json();
    if (!data || typeof data !== 'object' || !('token' in data) || typeof data.token !== 'string')
      throw new ApiError(500, 'استجابة غير صالحة من الخادم.');
    headers.set('x-csrf-token', data.token);
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'تعذر الاتصال بالخادم. تحقق من تشغيله ثم حاول مجددًا.');
  }
  if (!response.ok) {
    const error = (await response
      .json()
      .catch(() => ({ message: 'تعذر إكمال الطلب.' }))) as Partial<ApiErrorBody>;
    throw new ApiError(response.status, error.message ?? 'تعذر إكمال الطلب.');
  }
  return response;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiResponse(path, options);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function downloadPdf(path: string, filename: string, options: RequestInit = {}) {
  const response = await apiResponse(path, options);
  if (!response.headers.get('content-type')?.includes('application/pdf'))
    throw new ApiError(502, 'لم يرجع الخادم ملف PDF صالحًا.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'تعذر إكمال العملية.';
