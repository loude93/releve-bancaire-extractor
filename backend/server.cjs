const http = require('http');
const { extractFromBase64 } = require('./extractor.cjs');

const port = process.env.BACKEND_PORT || 8787;

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function writeJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return writeJson(res, 200, { ok: true });

  if (req.method === 'GET' && req.url === '/api/health') return writeJson(res, 200, { ok: true });

  if (req.method === 'POST' && req.url === '/api/extract') {
    try {
      const body = await parseJsonBody(req);
      if (!body.base64Pdf) return writeJson(res, 400, { error: 'base64Pdf est requis.' });

      return writeJson(res, 200, extractFromBase64(body.base64Pdf));
    } catch (error) {
      return writeJson(res, 500, { error: `Échec extraction locale: ${error.message}` });
    }
  }

  return writeJson(res, 404, { error: 'Not found' });
});

server.listen(port, () => {
  console.log(`Local backend running on http://localhost:${port}`);
});
