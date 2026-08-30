const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

loadEnv(path.join(__dirname, '.env'));

const config = {
  clientId: process.env.ZUMO_CLIENT_ID,
  clientSecret: process.env.ZUMO_CLIENT_SECRET,
  organisationId: process.env.ZUMO_ORGANISATION_ID,
  apiUrl: process.env.ZUMO_API_URL || 'https://api.sandbox.zumo.tech/v1',
  webAppUrl: process.env.ZUMO_WEBAPP_URL || 'https://webapp.sandbox.zumo.tech/financial-promotions/',
  port: Number(process.env.PORT || 3000),
};

for (const [key, value] of Object.entries(config)) {
  if (value === undefined || value === '') throw new Error(`Missing configuration: ${key}`);
}

const publicDir = path.join(__dirname, 'public');

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') return sendFile(res, 'index.html', 'text/html; charset=utf-8');
    if (req.method === 'GET' && req.url === '/styles.css') return sendFile(res, 'styles.css', 'text/css; charset=utf-8');
    if (req.method === 'GET' && req.url === '/app.js') return sendFile(res, 'app.js', 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && req.url === '/api/health') {
      return json(res, 200, { ok: true, environment: 'sandbox', configured: true });
    }
    if (req.method === 'POST' && req.url === '/api/users') {
      const accessToken = await getMachineToken();
      const user = await createSandboxUser(accessToken);
      return json(res, 201, {
        id: user.id,
        firstName: user.profile?.firstName,
        lastName: user.profile?.lastName,
        email: user.profile?.email,
        verificationStatus: user.verificationStatus,
        financialPromotionsStatus: user.financialPromotionsStatus,
      });
    }
    if (req.method === 'POST' && req.url === '/api/launch') {
      const { userId } = await readJson(req);
      if (!isUuid(userId)) return json(res, 400, { error: 'Enter a valid Zumo user UUID.' });

      const codeVerifier = crypto.randomBytes(64).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      const accessToken = await getMachineToken();
      const authorizationCode = await getAuthorizationCode(accessToken, userId, codeChallenge);

      const launchUrl = new URL(config.webAppUrl);
      launchUrl.searchParams.set('authCode', authorizationCode);
      launchUrl.searchParams.set('codeVerifier', codeVerifier);
      launchUrl.searchParams.set('organisationId', config.organisationId);
      launchUrl.searchParams.set('userId', userId);

      return json(res, 200, { launchUrl: launchUrl.toString() });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.publicMessage || 'Unable to launch the Zumo sandbox flow.' });
  }
});

async function getMachineToken() {
  const response = await fetch(`${config.apiUrl}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  const body = await safeJson(response);
  if (!response.ok || !body.access_token) throw zumoError(response, body, 'Zumo rejected the application credentials.');
  return body.access_token;
}

async function getAuthorizationCode(accessToken, userId, codeChallenge) {
  const response = await fetch(`${config.apiUrl}/auth/authorize`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      response_type: 'code',
      user_id: userId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }),
  });
  const body = await safeJson(response);
  if (!response.ok || !body.code) throw zumoError(response, body, 'Zumo could not authorize this user. Check that the user exists in the sandbox organisation.');
  return body.code;
}

async function createSandboxUser(accessToken) {
  const uniqueId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const response = await fetch(`${config.apiUrl}/users`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      integratorId: `codex-sandbox-${uniqueId}`,
      profile: {
        firstName: 'Sandbox',
        lastName: 'Tester',
        email: `sandbox.${uniqueId}@example.com`,
      },
    }),
  });
  const body = await safeJson(response);
  if (!response.ok || !body.id) throw zumoError(response, body, 'Zumo could not create the sandbox user.');
  return body;
}

function zumoError(response, body, fallback) {
  const error = new Error(`Zumo API ${response.status}: ${JSON.stringify(body)}`);
  error.status = response.status >= 400 && response.status < 500 ? 400 : 502;
  error.publicMessage = body?.message ? `${fallback} Zumo says: ${body.message}` : fallback;
  return error;
}

async function safeJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { message: text || response.statusText }; }
}

function loadEnv(filename) {
  if (!fs.existsSync(filename)) return;
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

function sendFile(res, filename, contentType) {
  const body = fs.readFileSync(path.join(publicDir, filename));
  res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400, publicMessage: 'Invalid request.' })); }
    });
    req.on('error', reject);
  });
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

server.listen(config.port, '127.0.0.1', () => {
  console.log(`Zumo sandbox launcher running at http://127.0.0.1:${config.port}`);
});
