let wines = [];
let filtered = [];

const currentYear = new Date().getFullYear();

function getMaturityStatus(wine) {
  const start = wine.maturityStart || 0;
  const peak = wine.maturityPeak || 0;
  const end = wine.maturityEnd || 0;
  if (!peak && !end) return null;
  if (start && currentYear < start) return 'not-ready';
  if (end && currentYear > end) return 'past';
  if (peak && currentYear >= peak - 1 && currentYear <= peak + 1) return 'peak';
  if ((start && currentYear >= start) || (!start && peak && currentYear <= peak)) return 'ready';
  return 'ready';
}

function maturityLabel(status) {
  switch (status) {
    case 'not-ready': return 'Pas encore prêt';
    case 'ready': return 'Prêt à boire';
    case 'peak': return 'Au pic!';
    case 'past': return 'Passé le pic';
    default: return '';
  }
}

function formatPrice(val) {
  if (!val && val !== 0) return '';
  return val.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatML(ml) {
  if (ml >= 1000) return (ml / 1000).toFixed(1).replace('.0', '') + ' L';
  return ml + ' mL';
}

function colorBadgeClass(color) {
  const c = (color || '').toLowerCase();
  if (c === 'rouge') return 'badge-rouge';
  if (c === 'blanc') return 'badge-blanc';
  if (c === 'rosé') return 'badge-rose';
  if (c === 'orange') return 'badge-orange';
  return 'badge-blanc';
}

function renderStats() {
  const totalBottles = wines.reduce((sum, w) => sum + (w.bottles || 0), 0);
  const totalProducts = wines.length;
  const totalValue = wines.reduce((sum, w) => sum + ((w.marketValue || 0) * (w.bottles || 0)), 0);
  const countries = new Set(wines.map(w => w.country).filter(Boolean));

  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="stat-value">${totalBottles}</div><div class="stat-label">Bouteilles</div></div>
    <div class="stat"><div class="stat-value">${totalProducts}</div><div class="stat-label">Produits</div></div>
    <div class="stat"><div class="stat-value">${formatPrice(totalValue)}</div><div class="stat-label">Valeur totale</div></div>
    <div class="stat"><div class="stat-value">${countries.size}</div><div class="stat-label">Pays</div></div>
  `;
}

function populateFilters() {
  const colors = [...new Set(wines.map(w => w.color).filter(Boolean))].sort();
  const countries = [...new Set(wines.map(w => w.country).filter(Boolean))].sort();

  const colorSelect = document.getElementById('filterColor');
  colors.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    colorSelect.appendChild(opt);
  });

  const countrySelect = document.getElementById('filterCountry');
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    countrySelect.appendChild(opt);
  });
}

function applyFilters() {
  const search = document.getElementById('search').value.toLowerCase().trim();
  const color = document.getElementById('filterColor').value;
  const country = document.getElementById('filterCountry').value;
  const sort = document.getElementById('filterSort').value;
  const maturity = document.getElementById('filterMaturity').value;

  filtered = wines.filter(w => {
    if (search && !w.name.toLowerCase().includes(search) && !w.regions.toLowerCase().includes(search)) return false;
    if (color && w.color !== color) return false;
    if (country && w.country !== country) return false;
    if (maturity) {
      const status = getMaturityStatus(w);
      if (!status || status !== maturity) return false;
    }
    return true;
  });

  const [field, dir] = sort.split('-');
  filtered.sort((a, b) => {
    let va, vb;
    switch (field) {
      case 'name': va = a.name; vb = b.name; return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'vintage': va = a.vintage || 0; vb = b.vintage || 0; break;
      case 'value': va = a.marketValue || 0; vb = b.marketValue || 0; break;
      case 'bottles': va = a.bottles || 0; vb = b.bottles || 0; break;
      case 'maturity': va = a.maturityPeak || 9999; vb = b.maturityPeak || 9999; break;
    }
    return dir === 'asc' ? va - vb : vb - va;
  });

  renderWines();
}

function renderWines() {
  const grid = document.getElementById('wineGrid');
  const info = document.getElementById('resultsInfo');

  const filteredBottles = filtered.reduce((sum, w) => sum + (w.bottles || 0), 0);
  const filteredValue = filtered.reduce((sum, w) => sum + ((w.marketValue || 0) * (w.bottles || 0)), 0);
  info.textContent = `${filtered.length} produits, ${filteredBottles} bouteilles` +
    (filteredValue > 0 ? ` — Valeur: ${formatPrice(filteredValue)}` : '');

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state">Aucun vin trouvé pour ces critères.</div>';
    return;
  }

  grid.innerHTML = filtered.map(w => {
    const status = getMaturityStatus(w);
    const maturityWindow = [];
    if (w.maturityStart) maturityWindow.push(w.maturityStart);
    if (w.maturityPeak) maturityWindow.push(w.maturityPeak);
    if (w.maturityEnd) maturityWindow.push(w.maturityEnd);

    return `
      <div class="wine-card">
        <div class="wine-card-header">
          <div class="wine-name">${escapeHtml(w.name)}</div>
          <div class="wine-vintage">${w.vintage || 'NV'}</div>
        </div>
        <div class="wine-badges">
          <span class="badge ${colorBadgeClass(w.color)}">${escapeHtml(w.color || '')}</span>
          ${w.bottles > 1 ? `<span class="badge badge-bottles">${w.bottles} bout.</span>` : ''}
          ${w.format !== 750 ? `<span class="badge" style="background:rgba(255,255,255,0.1);color:var(--text-muted)">${formatML(w.format)}</span>` : ''}
        </div>
        <div class="wine-origin">${escapeHtml(w.country)}${w.regions ? ' — ' + escapeHtml(w.regions) : ''}</div>
        <div class="wine-details">
          <div class="wine-price">${w.marketValue ? formatPrice(w.marketValue) : '—'}</div>
          ${status ? `<div class="wine-maturity maturity-${status}">${maturityLabel(status)}${maturityWindow.length ? ' (' + maturityWindow.join('-') + ')' : ''}</div>` : '<div class="wine-format"></div>'}
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const API_URL = 'https://wine-api-proxy.dany-b53.workers.dev';

async function loadWines() {
  const indicator = document.getElementById('syncIndicator');

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('API error ' + res.status);
    wines = await res.json();
    if (indicator) {
      indicator.textContent = 'Données en direct';
      indicator.className = 'sync-indicator sync-live';
    }
  } catch (e) {
    // Fallback to static wines.json
    try {
      const res = await fetch('wines.json');
      wines = await res.json();
      if (indicator) {
        indicator.textContent = 'Données hors-ligne';
        indicator.className = 'sync-indicator sync-offline';
      }
    } catch (e2) {
      wines = [];
      if (indicator) {
        indicator.textContent = 'Erreur de chargement';
        indicator.className = 'sync-indicator sync-offline';
      }
    }
  }
}

async function init() {
  await loadWines();
  renderStats();
  populateFilters();
  applyFilters();

  document.getElementById('search').addEventListener('input', applyFilters);
  document.getElementById('filterColor').addEventListener('change', applyFilters);
  document.getElementById('filterCountry').addEventListener('change', applyFilters);
  document.getElementById('filterSort').addEventListener('change', applyFilters);
  document.getElementById('filterMaturity').addEventListener('change', applyFilters);

  const syncBtn = document.getElementById('syncBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = '⟳';
      await loadWines();
      renderStats();
      applyFilters();
      syncBtn.disabled = false;
      syncBtn.textContent = '↻';
    });
  }
}

init();
