import 'dotenv/config';
import { createClient } from 'redis';
import { RedisStore } from 'rate-limit-redis';
import { createApp } from './app.js';
import { db } from './db.js';
import { assertDatabaseReady } from './migrations.js';
import { logFailure } from './logging.js';

let redisClient;
let server;
let stopping = false;

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (server) {
    const forceClose = setTimeout(() => server.closeAllConnections(), 10_000);
    forceClose.unref();
    await new Promise(resolve => server.close(resolve));
    clearTimeout(forceClose);
  }
  await Promise.allSettled([db?.end(), redisClient?.isOpen ? redisClient.quit() : undefined]);
  process.exitCode = exitCode;
}

try {
  const production = process.env.NODE_ENV === 'production';
  if (production && !db) throw Object.assign(new Error('DATABASE_URL obrigatória'), { code: 'DATABASE_NOT_CONFIGURED' });
  if (db) await assertDatabaseReady(db); // Read only: migrations are an explicit operator command.
  const stores = {};
  if (process.env.REDIS_URL) {
    redisClient = createClient({ url: process.env.REDIS_URL, disableOfflineQueue: true,
      socket: { connectTimeout: 5000, reconnectStrategy: retries => retries < 3 ? 500 : false } });
    redisClient.on('error', error => logFailure(console, 'redis_unavailable', error));
    await redisClient.connect();
    for (const [name, prefix] of [['requests', 'araujo:limit:'], ['orders', 'araujo:orders:']]) {
      stores[name] = new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args), prefix });
    }
  } else if (production) throw new Error('REDIS_URL obrigatória');

  const app = createApp({ stores, readiness: async () => {
    if (!db) return false;
    await assertDatabaseReady(db);
    if (redisClient && await redisClient.ping() !== 'PONG') return false;
    return !production || Boolean(redisClient?.isReady);
  } });
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT inválida');
  server = app.listen(port, () => console.info('ARAUJO IMPORTS: HTTP iniciado.'));
  server.on('error', error => { logFailure(console, 'http_failed', error); void shutdown(1); });
  if (!db) console.warn('DATABASE_URL ausente: pré-pedidos indisponíveis neste ambiente local.');
} catch (error) {
  logFailure(console, 'startup_failed', error);
  console.error('Inicialização recusada. Revise banco/migrações, Redis, origem e proxies conforme CORRIGIR-ERROS-RENDER.md.');
  await shutdown(1);
}

for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void shutdown(); });
