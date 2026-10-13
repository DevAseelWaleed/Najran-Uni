export function mailProvider() {
  const provider = process.env.MAIL_PROVIDER || 'smtp';
  if (!['smtp', 'brevo'].includes(provider)) throw new Error('MAIL_PROVIDER must be smtp or brevo');
  return provider;
}

export function storageProvider() {
  const provider = process.env.STORAGE_PROVIDER || 'local';
  if (!['local', 'supabase'].includes(provider))
    throw new Error('STORAGE_PROVIDER must be local or supabase');
  return provider;
}

export function supabaseStorageConfig() {
  const origin = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'portal-documents';
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('SUPABASE_URL is required');
  }
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('SUPABASE_URL must be an HTTPS origin');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  if (!/^[a-zA-Z0-9_-]+$/.test(bucket)) throw new Error('Invalid SUPABASE_STORAGE_BUCKET');
  return { origin: url.origin, key, bucket };
}

export function validateCloudConfig() {
  if (storageProvider() === 'supabase') supabaseStorageConfig();
  if (mailProvider() === 'brevo' && (!process.env.BREVO_API_KEY || !process.env.SMTP_FROM))
    throw new Error('Brevo requires BREVO_API_KEY and a verified SMTP_FROM');
  if (process.env.NODE_ENV === 'production') {
    let origin: URL;
    try {
      origin = new URL(process.env.APP_ORIGIN || '');
    } catch {
      throw new Error('APP_ORIGIN is required');
    }
    if (origin.protocol !== 'https:' || origin.origin !== process.env.APP_ORIGIN)
      throw new Error('Production requires an HTTPS APP_ORIGIN without a trailing slash');
    if (
      mailProvider() === 'smtp' &&
      (!process.env.SMTP_HOST ||
        ['localhost', 'mailpit', '127.0.0.1'].includes(process.env.SMTP_HOST))
    )
      throw new Error('Production requires real SMTP or Brevo');
    if (process.env.RENDER && (storageProvider() !== 'supabase' || mailProvider() !== 'brevo'))
      throw new Error('This Render deployment requires Supabase storage and Brevo email');
  }
}
