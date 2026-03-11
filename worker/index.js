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

async function fetchWines(env) {
  const token = env.ALFRED_TOKEN;
  if (!token) throw new Error('Token not configured');

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

  if (!apiRes.ok) throw new Error('Alfred API error ' + apiRes.status);

  const raw = await apiRes.json();
  const products = (raw.data && raw.data.data) || raw.data || [];

  return products.map((w) => ({
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
}

async function handleWines(request, env) {
  const wines = await fetchWines(env);
  return jsonResponse(wines, 200, request, {
    'Cache-Control': 'private, max-age=300',
  });
}

const SOMMELIER_PROMPT = `Tu es un sommelier expert et chaleureux, le sommelier personnel de l'utilisateur. Tu connais ses gouts et sa cave intimement.

Quand on te decrit un plat ou un repas, recommande 1 a 3 vins de cette cave qui s'y marieraient bien. Pour chaque vin recommande:
- Le nom exact et le millesime tel qu'il apparait dans l'inventaire
- Une breve explication de pourquoi ce vin convient a ce plat

Regles:
- Ne recommande QUE des vins presents dans l'inventaire ci-dessous
- Prefere les vins dont la maturite indique "pret" ou "au pic" (annee actuelle: ${new Date().getFullYear()})
- Si plusieurs bouteilles sont disponibles, mentionne-le
- Si aucun vin ne convient parfaitement, suggere le meilleur compromis et explique pourquoi
- Reponds en francais, de facon concise et chaleureuse
- Tu peux aussi repondre a des questions generales sur le vin et la cave
- Tiens compte des PREFERENCES PERSONNELLES ci-dessous pour tes recommandations

DETECTION DE PREFERENCES:
Quand l'utilisateur exprime une preference (ex: "j'adore les vins corses", "je n'aime pas les blancs boises", "le Barolo est mon prefere", "retiens que..."), tu dois l'extraire et l'ajouter a la fin de ta reponse dans un bloc JSON invisible:
<!--PREFS_UPDATE:{"add":["preference en texte court"]}-->
Pour supprimer une preference existante:
<!--PREFS_UPDATE:{"remove":["texte exact de la preference a retirer"]}-->
Si l'utilisateur demande de voir ses preferences ou son profil, liste-les.
N'ajoute le bloc PREFS_UPDATE que quand une NOUVELLE preference est clairement exprimee. Ne le mets pas si c'est juste une question ou un commentaire ponctuel.
`;

const GUIDE_PROMPT = `Tu es un sommelier expert qui aide l'utilisateur a definir son profil de gouts. Tu dois mener une conversation guidee et chaleureuse pour decouvrir ses preferences.

IMPORTANT: Pose UNE SEULE question a la fois. Attends la reponse avant de passer a la suivante.

Voici les themes a explorer (dans l'ordre):
1. **Couleurs preferees** - Rouge, blanc, rose, ou un melange? Y a-t-il une couleur qu'il n'aime pas du tout?
2. **Profil de gout** - Prefere-t-il les vins legers et fruites, ou les vins corses et charpentes? Les tanins prononces ou souples?
3. **Regions / pays favoris** - Y a-t-il des regions vitivinicoles ou des pays qu'il affectionne?
4. **Cepages** - A-t-il des cepages preferes (cabernet, pinot noir, chardonnay, etc.)?
5. **Boise / elevage** - Aime-t-il les vins boises, ou prefere-t-il les vins non boises plus frais?
6. **Occasions** - Boit-il principalement en mangeant? Pour quel type d'occasion?
7. **Ce qu'il n'aime PAS** - Y a-t-il des styles ou des saveurs qu'il evite?

Commence par te presenter comme son sommelier personnel et pose la PREMIERE question sur les couleurs preferees. Sois chaleureux et decontracte.

A chaque reponse de l'utilisateur:
- Reformule brevement pour confirmer que tu as bien compris
- Enregistre la preference avec un bloc <!--PREFS_UPDATE:{"add":["..."]}-->
- Puis pose la question suivante

Quand tu as couvert tous les themes (ou que l'utilisateur dit qu'il a fini), fais un bref resume de son profil.

Regles:
- Reponds en francais
- Sois concis mais chaleureux
- UNE question par message
- Enregistre chaque preference detectee avec PREFS_UPDATE
`;


async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, request);
  }

  if (!body.message) {
    return jsonResponse({ error: 'Message requis' }, 400, request);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'Anthropic API key not configured' }, 500, request);
  }

  const isGuideMode = body.message === '__GUIDE_PROFIL__';

  // Load preferences and wines in parallel
  const [wines, prefsRaw] = await Promise.all([
    fetchWines(env),
    env.API_KEYS.get('taste_profile'),
  ]);
  const prefs = prefsRaw ? JSON.parse(prefsRaw) : [];

  const inventory = wines.map((w) => {
    const parts = [w.name];
    if (w.vintage) parts.push(w.vintage);
    parts.push(w.color);
    if (w.country) parts.push(w.country);
    if (w.regions) parts.push(w.regions);
    parts.push(w.bottles + ' bout.');
    if (w.maturityStart || w.maturityPeak || w.maturityEnd) {
      parts.push('maturite: ' + [w.maturityStart, w.maturityPeak, w.maturityEnd].filter(Boolean).join('-'));
    }
    return parts.join(' | ');
  }).join('\n');

  const prefsSection = prefs.length > 0
    ? '\nPREFERENCES PERSONNELLES ACTUELLES:\n' + prefs.map((p) => '- ' + p).join('\n') + '\n'
    : '\nPREFERENCES PERSONNELLES: (aucune pour le moment)\n';

  const basePrompt = isGuideMode ? GUIDE_PROMPT : SOMMELIER_PROMPT;
  const systemPrompt = basePrompt + prefsSection + '\nINVENTAIRE DE LA CAVE:\n' + inventory;

  const messages = [];
  if (body.history && Array.isArray(body.history)) {
    for (const msg of body.history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }
  const userMessage = isGuideMode
    ? 'Je veux definir mon profil de gouts. Guide-moi!'
    : body.message;
  messages.push({ role: 'user', content: userMessage });

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    return jsonResponse({ error: 'Erreur IA: ' + claudeRes.status, detail: errText }, 502, request);
  }

  const claudeData = await claudeRes.json();
  let reply = claudeData.content && claudeData.content[0] ? claudeData.content[0].text : '';

  // Extract and apply preference updates
  const prefsMatch = reply.match(/<!--PREFS_UPDATE:(.*?)-->/);
  if (prefsMatch) {
    try {
      const update = JSON.parse(prefsMatch[1]);
      let updated = [...prefs];
      if (update.add) {
        for (const p of update.add) {
          if (!updated.includes(p)) updated.push(p);
        }
      }
      if (update.remove) {
        updated = updated.filter((p) => !update.remove.includes(p));
      }
      await env.API_KEYS.put('taste_profile', JSON.stringify(updated));
    } catch {}
    reply = reply.replace(/<!--PREFS_UPDATE:.*?-->/g, '').trim();
  }

  return jsonResponse({ reply, preferences: prefs.length + (prefsMatch ? 1 : 0) }, 200, request);
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

    // Get/update taste preferences
    if (path === '/preferences') {
      if (!(await isAuthorized(request, env))) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      if (request.method === 'GET') {
        const raw = await env.API_KEYS.get('taste_profile');
        return jsonResponse({ preferences: raw ? JSON.parse(raw) : [] }, 200, request);
      }
      if (request.method === 'POST') {
        const body = await request.json();
        if (body.preferences && Array.isArray(body.preferences)) {
          await env.API_KEYS.put('taste_profile', JSON.stringify(body.preferences));
        }
        return jsonResponse({ ok: true }, 200, request);
      }
    }

    // Chat with sommelier AI (requires session auth)
    if (request.method === 'POST' && path === '/chat') {
      if (!(await isAuthorized(request, env))) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      try {
        return await handleChat(request, env);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500, request);
      }
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
