import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createSupabaseServices } from './supabase-services.js';

async function main() {
  const config = loadConfig();
  const app = buildApp(createSupabaseServices(config), { logger: true });

  const address = await app.listen({ host: config.host, port: config.port });
  console.log(`Lane2 backend listening at ${address}`);

  const stop = async (signal: string) => {
    console.log(`Received ${signal}; closing Lane2 backend.`);
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
