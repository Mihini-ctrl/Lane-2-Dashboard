import 'dotenv/config';

export interface BackendConfig {
  host: string;
  port: number;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
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

  return {
    host: process.env.BACKEND_HOST?.trim() || '127.0.0.1',
    port,
    supabaseUrl: required('SUPABASE_URL'),
    supabasePublishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
    supabaseSecretKey: required('SUPABASE_SECRET_KEY')
  };
}
