import 'dotenv/config';

export interface BackendConfig {
  host: string;
  port: number;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseJwksUrl: string;
  supabaseSecretKey?: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Copy .env.example to .env and set it.`);
  return value;
}

export function loadConfig(): BackendConfig {
  const port = Number(process.env.BACKEND_PORT || process.env.PORT || 3100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('BACKEND_PORT must be an integer between 1 and 65535.');
  }

  const supabaseUrl = required('SUPABASE_URL').replace(/\/$/, '');
  const supabaseJwksUrl = process.env.SUPABASE_JWKS_URL?.trim()
    || `${supabaseUrl}/auth/v1/.well-known/jwks.json`;

  try {
    const parsedJwksUrl = new URL(supabaseJwksUrl);
    if (parsedJwksUrl.protocol !== 'https:' && parsedJwksUrl.hostname !== 'localhost' && parsedJwksUrl.hostname !== '127.0.0.1') {
      throw new Error('non-loopback JWKS URLs must use HTTPS');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid URL';
    throw new Error(`SUPABASE_JWKS_URL is invalid: ${reason}.`);
  }

  return {
    host: process.env.BACKEND_HOST?.trim() || '127.0.0.1',
    port,
    supabaseUrl,
    supabasePublishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
    supabaseJwksUrl,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY?.trim() || undefined
  };
}
