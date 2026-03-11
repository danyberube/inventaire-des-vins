let wines = [];
let filtered = [];
let currentSort = { field: 'name', dir: 'asc' };
let viewMode = localStorage.getItem('viewMode') || 'table';

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

function maturitySortValue(w) {
  return w.maturityEnd || w.maturityPeak || w.maturityStart || 9999;
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

function toggleSort(field) {
  if (currentSort.field === field) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.field = field;
    currentSort.dir = field === 'name' ? 'asc' : 'desc';
  }
  applyFilters();
}

function applyFilters() {
  const search = document.getElementById('search').value.toLowerCase().trim();
  const color = document.getElementById('filterColor').value;
  const country = document.getElementById('filterCountry').value;
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

  const { field, dir } = currentSort;
  filtered.sort((a, b) => {
    let va, vb;
    switch (field) {
      case 'name': va = a.name; vb = b.name; return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'vintage': va = a.vintage || 0; vb = b.vintage || 0; break;
      case 'value': va = a.marketValue || 0; vb = b.marketValue || 0; break;
      case 'bottles': va = a.bottles || 0; vb = b.bottles || 0; break;
      case 'maturity': va = maturitySortValue(a); vb = maturitySortValue(b); break;
      case 'color': va = a.color || ''; vb = b.color || ''; return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'country': va = a.country || ''; vb = b.country || ''; return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return dir === 'asc' ? va - vb : vb - va;
  });

  renderWines();
}

function sortArrow(field) {
  const active = currentSort.field === field;
  const upClass = active && currentSort.dir === 'asc' ? 'active' : '';
  const downClass = active && currentSort.dir === 'desc' ? 'active' : '';
  return `<span class="sort-arrows"><span class="arrow-up ${upClass}">&#9650;</span><span class="arrow-down ${downClass}">&#9660;</span></span>`;
}

function renderWines() {
  const container = document.getElementById('wineGrid');
  const info = document.getElementById('resultsInfo');

  const filteredBottles = filtered.reduce((sum, w) => sum + (w.bottles || 0), 0);
  const filteredValue = filtered.reduce((sum, w) => sum + ((w.marketValue || 0) * (w.bottles || 0)), 0);
  info.textContent = `${filtered.length} produits, ${filteredBottles} bouteilles` +
    (filteredValue > 0 ? ` — Valeur: ${formatPrice(filteredValue)}` : '');

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">Aucun vin trouvé pour ces critères.</div>';
    return;
  }

  if (viewMode === 'table') {
    renderTable(container);
  } else {
    renderCards(container);
  }
}

function renderTable(container) {
  const header = `<thead><tr>
    <th class="th-sortable" data-sort="name">${sortArrow('name')} Nom</th>
    <th class="th-sortable th-center" data-sort="vintage">${sortArrow('vintage')} Mill.</th>
    <th class="th-sortable th-center" data-sort="color">${sortArrow('color')} Couleur</th>
    <th class="th-sortable" data-sort="country">${sortArrow('country')} Pays / Région</th>
    <th class="th-sortable th-center" data-sort="bottles">${sortArrow('bottles')} Bout.</th>
    <th class="th-sortable th-center" data-sort="maturity">${sortArrow('maturity')} Maturité</th>
    <th class="th-sortable th-right" data-sort="value">${sortArrow('value')} Valeur</th>
  </tr></thead>`;

  const rows = filtered.map(w => {
    const status = getMaturityStatus(w);
    const maturityWindow = [];
    if (w.maturityStart) maturityWindow.push(w.maturityStart);
    if (w.maturityPeak) maturityWindow.push(w.maturityPeak);
    if (w.maturityEnd) maturityWindow.push(w.maturityEnd);
    const maturityText = status ? `<span class="maturity-pill maturity-${status}">${maturityLabel(status)}</span>${maturityWindow.length ? `<span class="maturity-years">${maturityWindow.join('-')}</span>` : ''}` : '';

    return `<tr>
      <td class="td-name">${escapeHtml(w.name)}${w.format !== 750 ? ` <span class="format-tag">${formatML(w.format)}</span>` : ''}</td>
      <td class="td-center">${w.vintage || 'NV'}</td>
      <td class="td-center"><span class="badge-sm ${colorBadgeClass(w.color)}">${escapeHtml(w.color || '')}</span></td>
      <td>${escapeHtml(w.country)}${w.regions ? ' <span class="td-regions">' + escapeHtml(w.regions) + '</span>' : ''}</td>
      <td class="td-center">${w.bottles || 0}</td>
      <td class="td-center">${maturityText}</td>
      <td class="td-right td-price">${w.marketValue ? formatPrice(w.marketValue) : '—'}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `<div class="table-wrapper"><table class="wine-table">${header}<tbody>${rows}</tbody></table></div>`;

  container.querySelectorAll('.th-sortable').forEach(th => {
    th.addEventListener('click', () => toggleSort(th.dataset.sort));
  });
}

function renderCards(container) {
  container.innerHTML = '<div class="card-grid">' + filtered.map(w => {
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
  }).join('') + '</div>';
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const headers = ['Nom', 'Millésime', 'Couleur', 'Pays', 'Régions', 'Format (mL)', 'Bouteilles', 'Valeur marchande ($)', 'Maturité début', 'Maturité pic', 'Maturité fin'];
  const rows = wines.map(w => [
    '"' + (w.name || '').replace(/"/g, '""') + '"',
    w.vintage || '',
    w.color || '',
    '"' + (w.country || '').replace(/"/g, '""') + '"',
    '"' + (w.regions || '').replace(/"/g, '""') + '"',
    w.format || 750,
    w.bottles || 0,
    w.marketValue || '',
    w.maturityStart || '',
    w.maturityPeak || '',
    w.maturityEnd || '',
  ].join(','));
  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  downloadFile(csv, 'inventaire-vins.csv', 'text/csv;charset=utf-8');
}

function exportJSON() {
  downloadFile(JSON.stringify(wines, null, 2), 'inventaire-vins.json', 'application/json');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setViewMode(mode) {
  viewMode = mode;
  localStorage.setItem('viewMode', mode);
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
  renderWines();
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
  document.getElementById('filterMaturity').addEventListener('change', applyFilters);

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewMode);
    btn.addEventListener('click', () => setViewMode(btn.dataset.view));
  });

  const downloadBtn = document.getElementById('downloadBtn');
  const downloadMenu = document.getElementById('downloadMenu');
  if (downloadBtn && downloadMenu) {
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadMenu.classList.toggle('open');
    });
    downloadMenu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const format = btn.dataset.format;
        if (format === 'csv') exportCSV();
        if (format === 'json') exportJSON();
        downloadMenu.classList.remove('open');
      });
    });
    document.addEventListener('click', () => downloadMenu.classList.remove('open'));
  }

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
