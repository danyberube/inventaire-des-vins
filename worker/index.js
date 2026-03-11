export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const token = env.ALFRED_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
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
        return new Response(JSON.stringify({ error: 'Alfred API error', status: apiRes.status }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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

      return new Response(JSON.stringify(wines), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
