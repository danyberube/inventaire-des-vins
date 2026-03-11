const ALLOWED_ORIGINS = [
  'https://inventaire-des-vins.pages.dev',
  'http://localhost:8765',
];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.find((o) => origin.startsWith(o)) || ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status, request, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json', ...extraHeaders },
  });
}

async function hmacSign(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function createSession(env) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = await hmacSign(`session:${ts}`, env.AUTH_PASSWORD);
  return `${ts}.${sig}`;
}

async function verifySession(token, env) {
  if (!token) return false;
  const [tsStr, sig] = token.split('.');
  if (!tsStr || !sig) return false;
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return false;
  const age = Math.floor(Date.now() / 1000) - ts;
  if (age > 30 * 86400) return false; // 30 days max
  const expected = await hmacSign(`session:${ts}`, env.AUTH_PASSWORD);
  return sig === expected;
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

async function getApiKey(env) {
  const kvKey = await env.API_KEYS.get('current');
  return kvKey || env.API_KEY;
}

async function verifyApiKey(key, env) {
  if (!key) return false;
  const current = await getApiKey(env);
  return current && key === current;
}

async function isAuthorized(request, env) {
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey && await verifyApiKey(apiKey, env)) return true;
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    if (await verifySession(token, env)) return true;
  }
  const sessionToken = getCookie(request, 'session');
  return verifySession(sessionToken, env);
}

async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, request);
  }

  if (!body.password || body.password !== env.AUTH_PASSWORD) {
    return jsonResponse({ error: 'Mot de passe incorrect' }, 401, request);
  }

  const session = await createSession(env);
  return jsonResponse({ ok: true, token: session }, 200, request);
}

function handleLogout(request) {
  return jsonResponse({ ok: true }, 200, request, {
    'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0',
  });
}

async function handleWines(request, env) {
  const token = env.ALFRED_TOKEN;
  if (!token) {
    return jsonResponse({ error: 'Token not configured' }, 500, request);
  }

  const apiRes = await fetch('https://prod.cellars.io/search/catalog', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-app-key': env.APP_KEY,
    },
    body: JSON.stringify({
      identity: {},
      options: {
        offset: 0,
        size: 500,
        scope: 'location:all',
        projection: ':basic +description +producer +mv$last@price +color +category +aging +appellation +geo +bottles',
        sort: 'name',
        cache: false,
      },
    }),
  });

  if (!apiRes.ok) {
    return jsonResponse({ error: 'Alfred API error', status: apiRes.status }, 502, request);
  }

  const raw = await apiRes.json();
  const products = (raw.data && raw.data.data) || raw.data || [];

  const wines = products.map((w) => ({
    name: w.name || '',
    vintage: w.vintage || null,
    color: w.color && w.color.name ? w.color.name.fr || '' : '',
    country: w.geo && w.geo.country && w.geo.country.name ? w.geo.country.name.fr || '' : '',
    regions: w.geo && w.geo.regions
      ? w.geo.regions.map((r) => (r.name && r.name.fr ? r.name.fr : '')).join(', ')
      : '',
    format: w.format || 750,
    bottles: w.totalbottles || 0,
    marketValue: w.mv ? Math.round(w.mv * 100) / 100 : null,
    maturityStart: w.maturityD || null,
    maturityPeak: w.maturityE || null,
    maturityEnd: w.maturityF || null,
  }));

  return jsonResponse(wines, 200, request, {
    'Cache-Control': 'private, max-age=300',
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    // Login route — no auth required
    if (request.method === 'POST' && path === '/login') {
      return handleLogin(request, env);
    }

    // Logout route — no auth required
    if (request.method === 'GET' && path === '/logout') {
      return handleLogout(request);
    }

    // Check session status
    if (request.method === 'GET' && path === '/check') {
      const authed = await isAuthorized(request, env);
      return jsonResponse({ authenticated: authed }, 200, request);
    }

    // Public route with API key in query param
    if (request.method === 'GET' && path === '/public/cellar') {
      const key = url.searchParams.get('key');
      if (!key || !(await verifyApiKey(key, env))) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      try {
        return await handleWines(request, env);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500, request);
      }
    }

    // API info (requires session auth)
    if (request.method === 'GET' && path === '/api-info') {
      if (!(await isAuthorized(request, env))) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      const apiKey = await getApiKey(env);
      return jsonResponse({
        key: apiKey,
        url: url.origin + '/public/cellar?key=' + apiKey,
      }, 200, request);
    }

    // Rotate API key (requires session auth)
    if (request.method === 'POST' && path === '/rotate-key') {
      if (!(await isAuthorized(request, env))) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const newKey = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      await env.API_KEYS.put('current', newKey);
      return jsonResponse({
        key: newKey,
        url: url.origin + '/public/cellar?key=' + newKey,
      }, 200, request);
    }

    // All other routes require auth
    if (request.method === 'GET' && (path === '/' || path === '/wines')) {
      if (!(await isAuthorized(request, env))) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      try {
        return await handleWines(request, env);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500, request);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404, request);
  },
};
