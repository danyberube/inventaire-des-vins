const ALLOWED_ORIGINS = [
  'https://inventaire-des-vins.pages.dev',
  'http://localhost:8765',
];

// --- User configuration ---
const USERS = {
  dany: { type: 'cellar', displayName: 'Dany', envPassword: 'AUTH_PASSWORD' },
  saq: { type: 'saq', displayName: 'Invité SAQ', envPassword: 'AUTH_PASSWORD_SAQ' },
};

function userKey(username, key) {
  return `user:${username}:${key}`;
}

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

async function createSession(username, env) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = await hmacSign(`session:${username}:${ts}`, env.SESSION_SECRET);
  return `${username}.${ts}.${sig}`;
}

async function verifySession(token, env) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 3) return null;
  const username = parts.slice(0, -2).join('.');
  const tsStr = parts[parts.length - 2];
  const sig = parts[parts.length - 1];
  if (!username || !tsStr || !sig) return null;
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return null;
  const age = Math.floor(Date.now() / 1000) - ts;
  if (age > 30 * 86400) return null; // 30 days max
  const expected = await hmacSign(`session:${username}:${ts}`, env.SESSION_SECRET);
  if (sig !== expected) return null;
  const user = USERS[username];
  if (!user) return null;
  return { username, type: user.type, displayName: user.displayName };
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

async function getApiKey(username, env) {
  const kvKey = await env.API_KEYS.get(userKey(username, 'api_key'));
  return kvKey || env.API_KEY;
}

async function verifyApiKey(key, env) {
  if (!key) return null;
  // Check all cellar users' API keys
  for (const [username, config] of Object.entries(USERS)) {
    if (config.type !== 'cellar') continue;
    const current = await env.API_KEYS.get(userKey(username, 'api_key'));
    if (current && key === current) return { username, type: config.type, displayName: config.displayName };
  }
  // Fallback to legacy env API_KEY
  if (env.API_KEY && key === env.API_KEY) {
    return { username: 'dany', type: 'cellar', displayName: 'Dany' };
  }
  return null;
}

async function isAuthorized(request, env) {
  // API key auth
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey) {
    const user = await verifyApiKey(apiKey, env);
    if (user) return user;
  }
  // Bearer token auth
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const user = await verifySession(token, env);
    if (user) return user;
  }
  // Cookie auth (legacy)
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

  const username = (body.username || '').toLowerCase().trim();
  const user = USERS[username];

  if (!user) {
    return jsonResponse({ error: 'Identifiants incorrects' }, 401, request);
  }

  const expectedPassword = env[user.envPassword];
  if (!expectedPassword || !body.password || body.password !== expectedPassword) {
    return jsonResponse({ error: 'Identifiants incorrects' }, 401, request);
  }

  const session = await createSession(username, env);
  return jsonResponse({
    ok: true,
    token: session,
    username,
    type: user.type,
    displayName: user.displayName,
  }, 200, request);
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

// --- SAQ Adobe LiveSearch Integration ---

const SAQ_GQL_ENDPOINT = 'https://catalog-service.adobe.io/graphql';
const SAQ_GQL_HEADERS = {
  'Content-Type': 'application/json',
  'Magento-Environment-Id': '2ce24571-9db9-4786-84a9-5f129257ccbb',
  'Magento-Store-View-Code': 'fr',
  'Magento-Website-Code': 'main_website',
  'Magento-Store-Code': 'main_website_store',
  'Magento-Customer-Group': 'b6589fc6ab0dc82cf12099d1c2d40ab994e8410c',
  'x-api-key': 'search_gql',
};

async function searchSAQ(params) {
  // Build search phrase enriched with filter hints
  const phraseParts = [params.query || ''];
  if (params.color) phraseParts.push(params.color);
  if (params.grape) phraseParts.push(params.grape);
  if (params.country) phraseParts.push(params.country);
  const phrase = phraseParts.filter(Boolean).join(' ');

  const gqlQuery = `query($phrase: String!, $pageSize: Int, $currentPage: Int, $filter: [SearchClauseInput!]) {
    productSearch(phrase: $phrase, page_size: $pageSize, current_page: $currentPage, filter: $filter) {
      total_count
      items {
        product { sku price_range { minimum_price { final_price { value currency } } } }
        productView { name sku urlKey inStock attributes { name value } }
      }
    }
  }`;

  const baseFilter = [{ attribute: 'visibility', in: ['Search', 'Catalog, Search'] }];

  // Two parallel requests: page 1 (name matches) + deep page (grape/attribute matches)
  const fetchPage = async (page, size) => {
    const res = await fetch(SAQ_GQL_ENDPOINT, {
      method: 'POST',
      headers: SAQ_GQL_HEADERS,
      body: JSON.stringify({
        query: gqlQuery,
        variables: { phrase, pageSize: size, currentPage: page, filter: baseFilter },
      }),
    });
    if (!res.ok) throw new Error('SAQ API error ' + res.status);
    const data = await res.json();
    if (data.errors) throw new Error('SAQ GraphQL error: ' + data.errors[0].message);
    return data.data?.productSearch || { items: [], total_count: 0 };
  };

  // Fetch page 1 first to get total_count, then deep page for grape matches
  const page1 = await fetchPage(1, 100);
  const totalCount = page1.total_count || 0;
  const maxPage = Math.floor(totalCount / 100);
  // Deep page: ~75% through results to find grape-only matches, skip if too few results
  const deepPageNum = Math.min(Math.max(Math.floor(maxPage * 0.75), 2), maxPage);
  const deepPage = maxPage >= 2 ? await fetchPage(deepPageNum, 100) : { items: [] };

  // Merge and deduplicate by SKU
  const seen = new Set();
  const allItems = [];
  for (const item of [...page1.items, ...deepPage.items]) {
    const sku = item.productView?.sku || item.product?.sku;
    if (sku && !seen.has(sku)) {
      seen.add(sku);
      allItems.push(item);
    }
  }
  const items = allItems;

  // Filter and transform results
  return items
    .map((item) => {
      const pv = item.productView;
      const prod = item.product || {};
      const attrs = {};
      for (const a of pv.attributes || []) {
        if (a.value && a.value !== '') attrs[a.name] = a.value;
      }
      // Parse availability_front (can be string or array)
      let availability = attrs.availability_front || '';
      if (typeof availability === 'string' && availability.startsWith('[')) {
        try { availability = JSON.parse(availability.replace(/'/g, '"')); } catch {}
      }
      if (!Array.isArray(availability)) availability = availability ? [availability] : [];
      // Parse store_availability_list
      let stores = attrs.store_availability_list || '';
      if (typeof stores === 'string' && stores.startsWith('[')) {
        try { stores = JSON.parse(stores.replace(/'/g, '"')); } catch {}
      }
      if (!Array.isArray(stores)) stores = stores ? [stores] : [];
      // Parse grape (can be array or string)
      let grape = attrs.cepage || '';
      if (typeof grape === 'string' && grape.startsWith('[')) {
        try { grape = JSON.parse(grape.replace(/'/g, '"')); } catch {}
      }
      if (Array.isArray(grape)) grape = grape.join(', ');

      const price = prod.price_range?.minimum_price?.final_price?.value || null;

      return {
        name: pv.name || '',
        sku: pv.sku || '',
        url: 'https://www.saq.com/fr/' + (pv.urlKey || pv.sku),
        color: attrs.couleur || '',
        grape,
        country: attrs.pays_origine || attrs.pays || '',
        region: attrs.region_origine || attrs.region || '',
        vintage: attrs.millesime_produit || attrs.millesime || '',
        format: attrs.format_contenant_ml || attrs.format || '',
        alcohol: attrs.taux_alcool || '',
        price,
        pastille: attrs.pastille_gout || '',
        availability,
        stores,
        inStock: pv.inStock || false,
      };
    })
    .filter((w) => w.color && !w.url.includes('blog') && !w.url.includes('recette'));
}

const SAQ_TOOLS = [{
  name: 'search_saq',
  description: 'Rechercher des vins dans le catalogue de la SAQ. Utilise cet outil pour trouver des vins disponibles a la SAQ. La recherche est textuelle, combine les mots-cles pour de meilleurs resultats.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Texte de recherche principal (ex: "bordeaux rouge", "chablis", "pinot noir italie")' },
      color: { type: 'string', description: 'Couleur du vin (rouge, blanc, rose) - sera ajoute a la recherche' },
      grape: { type: 'string', description: 'Cepage (ex: Merlot, Chardonnay, Pinot Noir)' },
      country: { type: 'string', description: 'Pays (ex: France, Italie, Espagne)' },
    },
    required: ['query'],
  },
}];

// --- Sommelier Prompts ---

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

const SAQ_SOMMELIER_PROMPT = `Tu es un sommelier expert et chaleureux. L'utilisateur n'a pas de cave personnelle, mais tu l'aides a choisir des vins disponibles a la SAQ (Societe des alcools du Quebec).

Quand on te decrit un plat, une occasion ou un style de vin recherche:
1. Reflechis au type de vin ideal (couleur, cepage, region, gamme de prix)
2. Utilise l'outil search_saq pour chercher des vins correspondants a la SAQ
3. Recommande 1 a 3 vins parmi les resultats avec:
   - Le nom exact du vin et son prix
   - Une breve explication de pourquoi ce vin convient
   - Le lien SAQ pour l'acheter

Regles:
- Ne recommande QUE des vins trouves via search_saq (disponibles a la SAQ)
- Tiens compte des PREFERENCES PERSONNELLES ci-dessous
- Reponds en francais, de facon concise et chaleureuse
- Tu peux faire plusieurs recherches si la premiere ne donne pas de bons resultats
- Si on te demande un vin specifique, cherche-le par nom
- Tu peux aussi repondre a des questions generales sur le vin

DETECTION DE PREFERENCES:
Quand l'utilisateur exprime une preference (ex: "j'adore les vins corses", "je n'aime pas les blancs boises", "retiens que..."), tu dois l'extraire et l'ajouter a la fin de ta reponse dans un bloc JSON invisible:
<!--PREFS_UPDATE:{"add":["preference en texte court"]}-->
Pour supprimer une preference existante:
<!--PREFS_UPDATE:{"remove":["texte exact de la preference a retirer"]}-->
N'ajoute le bloc PREFS_UPDATE que quand une NOUVELLE preference est clairement exprimee.
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

// --- Chat Handler ---

async function handleChat(request, env, user) {
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
  const isCellar = user.type === 'cellar';

  // Load preferences, cepages, and SAQ store for this user
  const kvKeys = [
    env.API_KEYS.get(userKey(user.username, 'taste_profile')),
    env.API_KEYS.get(userKey(user.username, 'taste_cepages')),
  ];
  if (!isCellar) kvKeys.push(env.API_KEYS.get(userKey(user.username, 'saq_store')));
  const [prefsRaw, cepagesRaw, saqStoreRaw] = await Promise.all(kvKeys);
  const prefs = prefsRaw ? JSON.parse(prefsRaw) : [];
  const cepages = cepagesRaw ? JSON.parse(cepagesRaw) : [];
  const saqStore = saqStoreRaw || '';

  let profileSection = '';
  if (cepages.length > 0) {
    profileSection += '\nCEPAGES FAVORIS: ' + cepages.join(', ') + '\n';
  }
  profileSection += prefs.length > 0
    ? '\nPREFERENCES PERSONNELLES ACTUELLES:\n' + prefs.map((p) => '- ' + p).join('\n') + '\n'
    : '\nPREFERENCES PERSONNELLES: (aucune pour le moment)\n';
  if (saqStore) {
    profileSection += '\nSUCCURSALE PREFEREE: ' + saqStore + ' (priorise les vins disponibles a cette succursale quand possible)\n';
  }

  let systemPrompt;
  let tools = undefined;

  if (isGuideMode) {
    systemPrompt = GUIDE_PROMPT + profileSection;
  } else if (isCellar) {
    // Cellar user: fetch wines and inject inventory
    const wines = await fetchWines(env);
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
    systemPrompt = SOMMELIER_PROMPT + profileSection + '\nINVENTAIRE DE LA CAVE:\n' + inventory;
  } else {
    // SAQ user: use tool-based approach
    systemPrompt = SAQ_SOMMELIER_PROMPT + profileSection;
    tools = SAQ_TOOLS;
  }

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

  // Call Claude (with tool-use loop for SAQ users)
  let reply = '';
  const maxLoops = 3;

  for (let loop = 0; loop <= maxLoops; loop++) {
    const claudeBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    };
    if (tools && !isGuideMode) {
      claudeBody.tools = tools;
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeBody),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return jsonResponse({ error: 'Erreur IA: ' + claudeRes.status, detail: errText }, 502, request);
    }

    const claudeData = await claudeRes.json();

    // Check if Claude wants to use tools
    if (claudeData.stop_reason === 'tool_use') {
      const toolUses = claudeData.content.filter((c) => c.type === 'tool_use');
      if (toolUses.length > 0) {
        // Execute all tool calls in parallel
        const toolResults = await Promise.all(toolUses.map(async (toolUse) => {
          if (toolUse.name === 'search_saq') {
            let saqResults;
            try {
              saqResults = await searchSAQ(toolUse.input);
            } catch (err) {
              saqResults = [{ error: err.message }];
            }
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(saqResults),
            };
          }
          // Unknown tool — return error
          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: 'Unknown tool: ' + toolUse.name }),
            is_error: true,
          };
        }));

        // Add assistant response and all tool results to messages
        messages.push({ role: 'assistant', content: claudeData.content });
        messages.push({ role: 'user', content: toolResults });
        continue; // Loop back to get Claude's final response
      }
    }

    // Extract text reply
    const textBlocks = claudeData.content.filter((c) => c.type === 'text');
    reply = textBlocks.map((c) => c.text).join('');
    break;
  }

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
      await env.API_KEYS.put(userKey(user.username, 'taste_profile'), JSON.stringify(updated));
    } catch {}
    reply = reply.replace(/<!--PREFS_UPDATE:.*?-->/g, '').trim();
  }

  return jsonResponse({ reply, preferences: prefs.length + (prefsMatch ? 1 : 0) }, 200, request);
}

// --- Main Router ---

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

    // Check session status — returns user info
    if (request.method === 'GET' && path === '/check') {
      const user = await isAuthorized(request, env);
      if (!user) {
        return jsonResponse({ authenticated: false }, 200, request);
      }
      return jsonResponse({
        authenticated: true,
        username: user.username,
        type: user.type,
        displayName: user.displayName,
      }, 200, request);
    }

    // Get/update taste preferences (user-scoped)
    if (path === '/preferences') {
      const user = await isAuthorized(request, env);
      if (!user) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      if (request.method === 'GET') {
        const [rawPrefs, rawCepages] = await Promise.all([
          env.API_KEYS.get(userKey(user.username, 'taste_profile')),
          env.API_KEYS.get(userKey(user.username, 'taste_cepages')),
        ]);
        return jsonResponse({
          preferences: rawPrefs ? JSON.parse(rawPrefs) : [],
          cepages: rawCepages ? JSON.parse(rawCepages) : [],
        }, 200, request);
      }
      if (request.method === 'POST') {
        const body = await request.json();
        const writes = [];
        if (body.preferences && Array.isArray(body.preferences)) {
          writes.push(env.API_KEYS.put(userKey(user.username, 'taste_profile'), JSON.stringify(body.preferences)));
        }
        if (body.cepages && Array.isArray(body.cepages)) {
          writes.push(env.API_KEYS.put(userKey(user.username, 'taste_cepages'), JSON.stringify(body.cepages)));
        }
        await Promise.all(writes);
        return jsonResponse({ ok: true }, 200, request);
      }
    }

    // SAQ search (SAQ users only)
    if (request.method === 'GET' && path === '/saq/search') {
      const user = await isAuthorized(request, env);
      if (!user) return jsonResponse({ error: 'Non autorisé' }, 401, request);
      if (user.type !== 'saq') return jsonResponse({ error: 'SAQ seulement' }, 403, request);
      const q = url.searchParams.get('q') || '';
      if (!q.trim()) return jsonResponse({ results: [], total: 0 }, 200, request);
      try {
        const results = await searchSAQ({
          query: q,
          color: url.searchParams.get('color') || '',
          grape: url.searchParams.get('grape') || '',
          country: url.searchParams.get('country') || '',
          page_size: 100,
        });
        return jsonResponse({ results, total: results.length }, 200, request);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500, request);
      }
    }

    // SAQ preferred store (SAQ users only)
    if (path === '/saq/store') {
      const user = await isAuthorized(request, env);
      if (!user) return jsonResponse({ error: 'Non autorisé' }, 401, request);
      if (user.type !== 'saq') return jsonResponse({ error: 'SAQ seulement' }, 403, request);
      if (request.method === 'GET') {
        const store = await env.API_KEYS.get(userKey(user.username, 'saq_store'));
        return jsonResponse({ store: store || '' }, 200, request);
      }
      if (request.method === 'POST') {
        const body = await request.json();
        const storeId = (body.store || '').trim();
        await env.API_KEYS.put(userKey(user.username, 'saq_store'), storeId);
        return jsonResponse({ ok: true, store: storeId }, 200, request);
      }
    }

    // Chat with sommelier AI (requires session auth)
    if (request.method === 'POST' && path === '/chat') {
      const user = await isAuthorized(request, env);
      if (!user) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      try {
        return await handleChat(request, env, user);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500, request);
      }
    }

    // Public route with API key in query param (cellar users only)
    if (request.method === 'GET' && path === '/public/cellar') {
      const key = url.searchParams.get('key');
      const user = await verifyApiKey(key, env);
      if (!user) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      try {
        return await handleWines(request, env);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500, request);
      }
    }

    // API info (requires session auth, cellar users only)
    if (request.method === 'GET' && path === '/api-info') {
      const user = await isAuthorized(request, env);
      if (!user) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      if (user.type !== 'cellar') {
        return jsonResponse({ error: 'Non disponible pour ce type de compte' }, 403, request);
      }
      const apiKey = await getApiKey(user.username, env);
      return jsonResponse({
        key: apiKey,
        url: url.origin + '/public/cellar?key=' + apiKey,
      }, 200, request);
    }

    // Rotate API key (requires session auth, cellar users only)
    if (request.method === 'POST' && path === '/rotate-key') {
      const user = await isAuthorized(request, env);
      if (!user) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      if (user.type !== 'cellar') {
        return jsonResponse({ error: 'Non disponible pour ce type de compte' }, 403, request);
      }
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const newKey = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      await env.API_KEYS.put(userKey(user.username, 'api_key'), newKey);
      return jsonResponse({
        key: newKey,
        url: url.origin + '/public/cellar?key=' + newKey,
      }, 200, request);
    }

    // Wine list (cellar users only)
    if (request.method === 'GET' && (path === '/' || path === '/wines')) {
      const user = await isAuthorized(request, env);
      if (!user) {
        return jsonResponse({ error: 'Non autorisé' }, 401, request);
      }
      if (user.type !== 'cellar') {
        return jsonResponse([], 200, request); // SAQ users get empty inventory
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
