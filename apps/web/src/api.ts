let csrf = '';
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(!isForm && options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('portal-session-expired'));
    }
    const result = await response.json().catch(() => ({ message: 'تعذر الاتصال بالخادم' }));
    throw new ApiError(
      Array.isArray(result.message) ? result.message.join('؛ ') : result.message,
      response.status,
    );
  }
  return response.json();
}
export const send = (method: string, body?: any): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
});
export function params(data: Record<string, any>) {
  return new URLSearchParams(
    Object.entries(data)
      .filter(([, v]) => v !== '' && v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
}
export async function download(path: string, name: string) {
  const response = await fetch(`/api${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.message);
  }
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
