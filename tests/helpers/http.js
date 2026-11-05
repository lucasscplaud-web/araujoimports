import { once } from 'node:events';
import { createApp } from '../../server/app.js';

export async function serve(t, options = {}) {
  const logs = [];
  const app = createApp({ env: { NODE_ENV: 'test', TRUST_PROXY: '0', PUBLIC_ORIGIN: 'http://shop.test' },
    database: null, logger: { error: line => logs.push(line) }, ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { logs, app, base,
    async post(path, payload, headers = {}) {
      const response = await fetch(base + path, { method: 'POST', headers: {
        Origin: 'http://shop.test', 'Content-Type': 'application/json', ...headers
      }, body: JSON.stringify(payload) });
      return { status: response.status, headers: response.headers, body: await response.json() };
    }
  };
}
