import { publicVersionSchema } from '@konvoez/shared';

export function normalizeServerOrigin(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error('INVALID_URL');
  }

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error('INVALID_URL');
  }

  const isLocalhost = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new Error('INSECURE');
  }

  return url.origin;
}

export async function probeServer(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ version: string }> {
  const res = await fetchImpl(`${origin}/api/v1/public/version`, {
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`HTTP_${res.status}`);
  }

  const body: unknown = await res.json();
  const parsed = publicVersionSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('INVALID_RESPONSE');
  }

  return { version: parsed.data.currentVersion };
}
