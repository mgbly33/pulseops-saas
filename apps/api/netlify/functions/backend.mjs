import { getConnectionString } from '@netlify/database';
import { buildApp } from '../../dist/app.js';

let app;

export default async function backend(request) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
  process.env.NETLIFY_DB_URL ??= getConnectionString();
  app ??= buildApp({ logger: false }).catch(error => { app = undefined; throw error; });
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/backend(?=\/|$)/, '/api');
  const response = await (await app).inject({
    method: request.method,
    url: path + url.search,
    headers: Object.fromEntries(request.headers),
    payload: request.body ? Buffer.from(await request.arrayBuffer()) : undefined,
  });
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (value == null || ['connection', 'transfer-encoding', 'content-length'].includes(key)) continue;
    for (const item of [].concat(value)) headers.append(key, String(item));
  }
  const empty = request.method === 'HEAD' || [204, 205, 304].includes(response.statusCode);
  return new Response(empty ? null : response.rawPayload, { status: response.statusCode, headers });
}
