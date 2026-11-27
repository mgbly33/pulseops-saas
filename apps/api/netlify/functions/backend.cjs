const { buildApp } = require('../../dist/app.js');
let app;

exports.handler = async (event) => {
  if (!process.env.JWT_SECRET || !process.env.NETLIFY_DB_URL) {
    throw new Error('Missing Netlify API configuration');
  }
  app ??= await buildApp({ logger: false });
  const url = new URL(event.rawUrl);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/backend(?=\/|$)/, '/api');
  const response = await app.inject({
    method: event.httpMethod,
    url: path + url.search,
    headers: event.headers,
    payload: event.body == null ? undefined : Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'),
  });
  const multiValueHeaders = {};
  for (const [key, value] of Object.entries(response.headers)) {
    if (value != null && !['transfer-encoding', 'connection', 'content-length'].includes(key)) {
      multiValueHeaders[key] = [].concat(value).map(String);
    }
  }
  return { statusCode: response.statusCode, multiValueHeaders, body: response.rawPayload.toString('base64'), isBase64Encoded: true };
};
