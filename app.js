let wines = [];
let filtered = [];
let currentSort = { field: 'name', dir: 'asc' };
let viewMode = localStorage.getItem('viewMode') || 'table';
let userType = localStorage.getItem('userType') || null;
let displayName = localStorage.getItem('displayName') || null;

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
  return w.maturityEnd || w.maturityPeak || w.maturityStart || 0;
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
    currentSort.dir = (field === 'name' || field === 'maturity' || field === 'color' || field === 'country') ? 'asc' : 'desc';
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

function showLogin() {
  document.getElementById('loginScreen').style.display = '';
  document.querySelector('header').style.display = 'none';
  document.querySelector('main').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.querySelector('header').style.display = '';
  document.querySelector('main').style.display = '';

  const isSAQ = userType === 'saq';
  const title = document.getElementById('appTitle');
  const badge = document.getElementById('userBadge');
  const saqSection = document.getElementById('saqSection');

  // Title & badge
  title.textContent = isSAQ ? 'Mon Sommelier SAQ' : 'Ma Cave à Vin';
  if (displayName) {
    badge.textContent = displayName;
    badge.className = 'user-badge user-badge-' + userType;
    badge.style.display = '';
  }

  // Cellar-specific elements
  const cellarElements = ['syncBtn', 'downloadBtn', 'syncIndicator', 'apiSection'];
  cellarElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isSAQ ? 'none' : '';
  });

  // Controls & wine grid
  const controls = document.querySelector('.controls');
  const resultsInfo = document.getElementById('resultsInfo');
  const wineGrid = document.getElementById('wineGrid');
  const stats = document.getElementById('stats');

  if (isSAQ) {
    if (controls) controls.style.display = 'none';
    if (resultsInfo) resultsInfo.style.display = 'none';
    if (wineGrid) wineGrid.style.display = 'none';
    if (stats) stats.style.display = 'none';
    if (saqSection) saqSection.style.display = '';
    // Show store section in profile
    const storeSection = document.getElementById('saqStoreSection');
    if (storeSection) storeSection.style.display = '';
  } else {
    if (controls) controls.style.display = '';
    if (resultsInfo) resultsInfo.style.display = '';
    if (wineGrid) wineGrid.style.display = '';
    if (stats) stats.style.display = '';
    if (saqSection) saqSection.style.display = 'none';
  }
}

function authHeaders() {
  const token = localStorage.getItem('session');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

async function login(username, password) {
  const res = await fetch(API_URL + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  if (data.token) {
    localStorage.setItem('session', data.token);
    localStorage.setItem('userType', data.type);
    localStorage.setItem('displayName', data.displayName);
    userType = data.type;
    displayName = data.displayName;
  }
  return true;
}

async function logout() {
  localStorage.removeItem('session');
  localStorage.removeItem('userType');
  localStorage.removeItem('displayName');
  userType = null;
  displayName = null;
  showLogin();
}

async function loadWines() {
  const indicator = document.getElementById('syncIndicator');

  try {
    const res = await fetch(API_URL, { headers: authHeaders() });
    if (res.status === 401) {
      showLogin();
      return false;
    }
    if (!res.ok) throw new Error('API error ' + res.status);
    wines = await res.json();
    if (indicator) {
      indicator.textContent = 'Données en direct';
      indicator.className = 'sync-indicator sync-live';
    }
    return true;
  } catch (e) {
    try {
      const res = await fetch('wines.json');
      wines = await res.json();
      if (indicator) {
        indicator.textContent = 'Données hors-ligne';
        indicator.className = 'sync-indicator sync-offline';
      }
      return true;
    } catch (e2) {
      wines = [];
      if (indicator) {
        indicator.textContent = 'Erreur de chargement';
        indicator.className = 'sync-indicator sync-offline';
      }
      return true;
    }
  }
}

async function init() {
  // Check auth + get user info
  try {
    const checkRes = await fetch(API_URL + '/check', { headers: authHeaders() });
    const checkData = await checkRes.json();
    if (!checkData.authenticated) {
      showLogin();
      return;
    }
    userType = checkData.type;
    displayName = checkData.displayName;
    localStorage.setItem('userType', userType);
    localStorage.setItem('displayName', displayName);
  } catch {
    // Fallback to stored values
    if (!localStorage.getItem('session')) {
      showLogin();
      return;
    }
  }

  const isSAQ = userType === 'saq';

  if (!isSAQ) {
    const loaded = await loadWines();
    if (!loaded) return;
  }

  showApp();

  if (!isSAQ) {
    renderStats();
    populateFilters();
    applyFilters();
  }

  // Set chat welcome messages based on user type
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    const welcomeMsg = isSAQ
      ? 'Bonjour! Decrivez-moi votre plat ou occasion et je vous trouverai le vin parfait a la SAQ.'
      : 'Bonjour! Decrivez-moi votre plat et je vous recommanderai un vin de votre cave.';
    chatMessages.innerHTML = `<div class="chat-bubble chat-bubble-ai">${welcomeMsg}</div>`;
  }

  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.placeholder = isSAQ ? 'Decrivez votre plat ou occasion...' : 'Decrivez votre plat...';
  }

  if (!isSAQ) {
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

  // SAQ search
  if (isSAQ) {
    initSAQSearch();
  }

  document.getElementById('logoutBtn').addEventListener('click', logout);

  // FAB group & Chat
  document.getElementById('fabGroup').style.display = '';
  document.getElementById('chatToggle').addEventListener('click', toggleChat);
  document.getElementById('chatClose').addEventListener('click', toggleChat);

  // Profile panel
  document.getElementById('profileToggle').addEventListener('click', toggleProfile);
  document.getElementById('profileClose').addEventListener('click', toggleProfile);
  document.getElementById('prefAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('prefInput');
    addPreference(input.value);
    input.value = '';
  });
  document.getElementById('cepageAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('cepageInput');
    addCepage(input.value);
    input.value = '';
  });
  document.getElementById('startGuideBtn').addEventListener('click', startTasteGuide);
  document.getElementById('guideBack').addEventListener('click', exitGuide);
  document.getElementById('guideClose').addEventListener('click', () => {
    exitGuide();
    toggleProfile();
  });
  document.getElementById('guideChatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    sendGuideMessage(document.getElementById('guideChatInput').value);
  });
  loadPreferences();
  document.getElementById('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    sendChatMessage(document.getElementById('chatInput').value);
  });

  // API info section (cellar users only)
  if (!isSAQ) loadApiInfo();
  document.getElementById('copyUrlBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('apiUrl').value);
    document.getElementById('copyUrlBtn').textContent = 'Copie!';
    setTimeout(() => document.getElementById('copyUrlBtn').textContent = 'Copier', 1500);
  });
  document.getElementById('copyKeyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('apiKey').value);
    document.getElementById('copyKeyBtn').textContent = 'Copie!';
    setTimeout(() => document.getElementById('copyKeyBtn').textContent = 'Copier', 1500);
  });
  document.getElementById('rotateKeyBtn').addEventListener('click', async () => {
    if (!confirm('Regenerer la cle API? L\'ancienne cle cessera de fonctionner.')) return;
    const res = await fetch(API_URL + '/rotate-key', { method: 'POST', headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('apiUrl').value = data.url;
      document.getElementById('apiKey').value = data.key;
    }
  });
}

// Preferences / Profile
let preferences = [];
let cepages = [];

function toggleProfile() {
  const panel = document.getElementById('profilePanel');
  const chatPanel = document.getElementById('chatPanel');
  if (chatPanel.classList.contains('open') && !panel.classList.contains('open')) {
    chatPanel.classList.remove('open');
  }
  panel.classList.toggle('open');
}

async function loadPreferences() {
  try {
    const res = await fetch(API_URL + '/preferences', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    preferences = data.preferences || [];
    cepages = data.cepages || [];
    renderPreferences();
    renderCepages();
  } catch {}
}

async function savePreferences() {
  try {
    await fetch(API_URL + '/preferences', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences, cepages }),
    });
  } catch {}
}

function renderPreferences() {
  const list = document.getElementById('prefList');
  const empty = document.getElementById('prefEmpty');
  const count = document.getElementById('prefCount');

  count.textContent = preferences.length;

  if (preferences.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = preferences.map((pref, i) => `
    <div class="pref-chip">
      <span class="pref-chip-text">${escapeHtml(pref)}</span>
      <button class="pref-chip-delete" data-index="${i}" title="Supprimer">&#10005;</button>
    </div>
  `).join('');

  list.querySelectorAll('.pref-chip-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index);
      preferences.splice(idx, 1);
      renderPreferences();
      await savePreferences();
    });
  });
}

async function addPreference(text) {
  const trimmed = text.trim();
  if (!trimmed || preferences.includes(trimmed)) return;
  preferences.push(trimmed);
  renderPreferences();
  await savePreferences();
}

function renderCepages() {
  const list = document.getElementById('cepageList');
  const empty = document.getElementById('cepageEmpty');
  const count = document.getElementById('cepageCount');

  count.textContent = cepages.length;

  if (cepages.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = cepages.map((c, i) => `
    <span class="cepage-chip">
      ${escapeHtml(c)}
      <button class="cepage-chip-delete" data-index="${i}" title="Supprimer">&#10005;</button>
    </span>
  `).join('');

  list.querySelectorAll('.cepage-chip-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index);
      cepages.splice(idx, 1);
      renderCepages();
      await savePreferences();
    });
  });
}

async function addCepage(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  // Capitalize first letter
  const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  if (cepages.includes(formatted)) return;
  cepages.push(formatted);
  renderCepages();
  await savePreferences();
}

// Guide chat (separate from sommelier chat)
let guideHistory = [];
let guideActive = false;

function startTasteGuide() {
  // Switch to guide view inside profile panel
  guideActive = true;
  guideHistory = [];
  document.getElementById('profileBody').style.display = 'none';
  document.getElementById('profileHeaderMain').style.display = 'none';
  document.getElementById('profileHeaderGuide').style.display = '';
  const messagesEl = document.getElementById('guideChatMessages');
  messagesEl.style.display = '';
  messagesEl.innerHTML = '';
  document.getElementById('guideChatForm').style.display = '';

  // Send the initial guide prompt
  sendGuideMessage('__GUIDE_PROFIL__', true);
}

function exitGuide() {
  guideActive = false;
  document.getElementById('profileBody').style.display = '';
  document.getElementById('profileHeaderMain').style.display = '';
  document.getElementById('profileHeaderGuide').style.display = 'none';
  document.getElementById('guideChatMessages').style.display = 'none';
  document.getElementById('guideChatForm').style.display = 'none';
  // Reload preferences to show any new ones from the guide
  loadPreferences();
}

function addGuideBubble(text, type) {
  const messages = document.getElementById('guideChatMessages');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble-' + type;
  if (type === 'ai') {
    bubble.innerHTML = formatChatText(text);
  } else {
    bubble.textContent = text;
  }
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

async function sendGuideMessage(text, isInitial = false) {
  if (!text.trim()) return;

  if (!isInitial) addGuideBubble(text, 'user');
  const input = document.getElementById('guideChatInput');
  const sendBtn = document.querySelector('.guide-chat-send');
  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;

  const typingText = isInitial ? 'Preparation du guide...' : 'Reflexion en cours...';
  const typing = addGuideBubble(typingText, 'ai');
  typing.classList.add('chat-typing');

  try {
    const message = isInitial ? '__GUIDE_PROFIL__' : text;
    const res = await fetch(API_URL + '/chat', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: guideHistory }),
    });

    typing.remove();

    if (!res.ok) {
      addGuideBubble('Desolee, une erreur est survenue. Reessayez.', 'ai');
      return;
    }

    const data = await res.json();
    const userContent = isInitial ? 'Je veux definir mon profil de gouts. Guide-moi!' : text;
    guideHistory.push({ role: 'user', content: userContent });
    guideHistory.push({ role: 'assistant', content: data.reply });
    addGuideBubble(data.reply, 'ai');

    // Reload preferences in case they were updated
    loadPreferences();
  } catch {
    typing.remove();
    addGuideBubble('Erreur de connexion. Verifiez votre reseau.', 'ai');
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

// Chat
let chatHistory = [];

function toggleChat() {
  const panel = document.getElementById('chatPanel');
  const profilePanel = document.getElementById('profilePanel');
  if (profilePanel.classList.contains('open') && !panel.classList.contains('open')) {
    profilePanel.classList.remove('open');
  }
  panel.classList.toggle('open');
}

function addChatBubble(text, type) {
  const messages = document.getElementById('chatMessages');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble-' + type;
  if (type === 'ai') {
    bubble.innerHTML = formatChatText(text);
  } else {
    bubble.textContent = text;
  }
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

function formatChatText(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

async function sendChatMessage(text, isGuide = false) {
  if (!text.trim()) return;

  const displayText = isGuide ? null : text;
  if (displayText) addChatBubble(displayText, 'user');
  const input = document.getElementById('chatInput');
  const sendBtn = document.querySelector('.chat-send');
  input.value = '';
  input.disabled = true;
  sendBtn.disabled = true;

  const typingText = isGuide ? 'Preparation du guide...' : 'Reflexion en cours...';
  const typing = addChatBubble(typingText, 'ai');
  typing.classList.add('chat-typing');

  try {
    const res = await fetch(API_URL + '/chat', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: chatHistory }),
    });

    typing.remove();

    if (!res.ok) {
      addChatBubble('Desolee, une erreur est survenue. Reessayez.', 'ai');
      return;
    }

    const data = await res.json();
    if (!isGuide) chatHistory.push({ role: 'user', content: text });
    else chatHistory.push({ role: 'user', content: text });
    chatHistory.push({ role: 'assistant', content: data.reply });
    addChatBubble(data.reply, 'ai');

    // Reload preferences in case they were updated by the chat
    loadPreferences();
  } catch {
    typing.remove();
    addChatBubble('Erreur de connexion. Verifiez votre reseau.', 'ai');
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

async function loadApiInfo() {
  try {
    const res = await fetch(API_URL + '/api-info', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('apiUrl').value = data.url;
    document.getElementById('apiKey').value = data.key;
    document.getElementById('apiSection').style.display = '';
  } catch {}
}

// --- SAQ Search ---
let saqResults = [];
let saqFilteredResults = [];
let saqStoreId = '';

// 329 SAQ stores [id, name, banner]
const SAQ_STORES = [["23001","Ste-Catherine Ouest/Stanley","Express"],["23002","Val D'or","Sélection"],["23003","Halles de la Gare","Classique"],["23004","Quartier Dix30","Sélection"],["23008","Ste-Thérèse - Boul. Labelle","Classique"],["23009","Du Parc/Fairmount Ouest","Classique"],["23010","St-Laurent/Des Pins","Classique"],["23011","Halles D'Anjou","Classique"],["23013","Lajeunesse/Fleury","Express"],["23014","Place du Centre (Promenade du Portage)","Classique"],["23015","Baie D'Urfé","Classique"],["23016","Ville-Des-Laurentides","Classique"],["23018","D.D.O. - Boul. St-Jean","Express"],["23019","St-Denis/Duluth","Classique"],["23020","Beaubien","Express"],["23021","Ontario/Pie IX","Classique"],["23023","Décarie/Côte-Vertu","Express"],["23025","Galeries Gatineau","Sélection"],["23026","Lachine - 28e avenue","Classique"],["23028","Faubourg Sainte-Catherine","Classique"],["23029","Dorval","Sélection"],["23030","Jarry","Classique"],["23032","Ville-Émard","Classique"],["23033","St-Jérôme - Centre-ville","Classique"],["23035","Granby - Centre-ville","Classique"],["23036","Fleury/Papineau","Classique"],["23037","Galeries Joliette","Sélection"],["23042","Marieville","Classique"],["23043","Saint-Hyacinthe - Centre-ville","Classique"],["23044","Galeries D'Anjou","Classique"],["23048","Longueuil - Boul. Roland-Therrien","Sélection"],["23049","Saint-Martin Ouest/Le Corbusier","Express"],["23050","Carrefour du Casino","Sélection"],["23051","Buckingham","Classique"],["23052","Galeries Aylmer","Classique"],["23053","Berthierville","Classique"],["23054","Amos","Classique"],["23055","Marché Jean-Talon","Classique"],["23056","Carrefour St-Hubert","Sélection"],["23057","Mail Montenach","Sélection"],["23059","Dorion","Classique"],["23060","Chambly","Sélection"],["23061","Terrebonne Ch. Gascon","Classique"],["23062","L'Assomption","Classique"],["23063","Rigaud","Classique"],["23064","Sherbrooke Est/Carignan","Express"],["23065","Avenue Laurier Ouest","Sélection"],["23066","Beaubien/St-André","Sélection"],["23067","Cowansville","Classique"],["23068","La Prairie","Classique"],["23069","Blainville","Sélection"],["23070","Repentigny - Boul. Notre-Dame","Sélection"],["23071","Valleyfield - Centre-ville","Classique"],["23072","Gatineau - Promenade du Portage","Classique"],["23073","Le Gardeur","Classique"],["23075","Méga-centre Côte-Vertu","Classique"],["23076","Beaubien/30e avenue","Classique"],["23077","Bedford","Classique"],["23079","Delson","Classique"],["23080","Farnham","Classique"],["23082","Magog - Rue Principale","Sélection"],["23084","Halles Saint-Jean","Classique"],["23085","Côte-Saint-Luc","Classique"],["23086","Westmount","Sélection"],["23087","Henri-Bourassa Ouest/Tanguay","Sélection"],["23088","Iberville","Classique"],["23090","Saint-Eustache - Arthur-Sauvé/Pie XII","Sélection"],["23091","Notre-Dame Est/St-Donat","Classique"],["23092","N.D.G. - Rue Sherbrooke Ouest","Express"],["23094","Sutton","Classique"],["23095","Bromont","Sélection"],["23096","Acton Vale","Classique"],["23097","Sainte-Anne-des-Plaines","Classique"],["23098","Maniwaki","Classique"],["23099","Pie IX/Industriel","Express"],["23100","N.D.G. - Rue Monkland","Classique"],["23101","Mont-Royal Est/Papineau","Sélection"],["23102","Rouyn-Noranda","Sélection"],["23104","Rawdon","Classique"],["23105","Lachute","Classique"],["23106","Carrefour de la Pointe","Sélection"],["23107","Verdun","Classique"],["23108","L'Annonciation","Classique"],["23109","Queen-Mary/Décarie","Classique"],["23110","Lacolle","Classique"],["23113","Complexe Les Ailes","Signature"],["23115","La Porte de Gatineau","Express"],["23117","Asbestos","Classique"],["23118","Tracy","Classique"],["23119","Saint-Jovite","Sélection"],["23120","Ville-Marie","Classique"],["23121","Duvernay","Classique"],["23123","La Sarre","Classique"],["23124","Côte-des-Neiges/Queen-Mary","Classique"],["23125","Mont-Laurier","Classique"],["23126","Pierrefonds - Boul. des Sources","Classique"],["23128","St-Gabriel-de-Brandon","Classique"],["23129","Chateauguay - Boul. d'Anjou","Sélection"],["23130","Plaza Gatineau","Classique"],["23131","Saint-Lambert - Boul. Sir-Wilfrid-Laurier","Sélection"],["23132","Marché Atwater","Sélection"],["23133","Sainte-Dorothée","Sélection"],["23134","De Maisonneuve/City Councillors","Sélection"],["23135","Saint-Sauveur - Ch. Jean-Adam","Express"],["23136","Pierrefonds - Boul. St-Jean","Sélection"],["23137","Boucherville - Boul. du Fort St-Louis","Classique"],["23138","Jean-Talon/Viau","Classique"],["23139","Centre Laval","Classique"],["23140","Brossard - Taschereau/Adam","Sélection"],["23141","Saint-Bruno","Sélection"],["23142","Mirabel - Saint-Janvier","Classique"],["23144","Terrebonne - Boul. des Seigneurs","Sélection"],["23145","N.D.G. - Ave. Somerled","Classique"],["23146","Place Bourassa","Sélection"],["23148","Sherbrooke - Centre-ville","Sélection"],["23149","Papineauville","Classique"],["23150","Kirkland - St-Charles/Brunswick","Express"],["23151","Centre Rockland","Sélection"],["23152","Sherbrooke - King Ouest/J.-Cartier Sud","Sélection"],["23153","Galeries des Sources","Classique"],["23155","Van Horne/Wilderton","Classique"],["23156","Saint-Antoine-des-Laurentides","Express"],["23158","Rock Forest","Classique"],["23159","Centre Fairview","Sélection"],["23160","Carrefour de L'Estrie","Classique"],["23162","Saint-Jean-sur-Richelieu - Boul. du Séminaire","Sélection"],["23163","La Salle - Boul. Champlain","Classique"],["23165","Sainte-Agathe-des-Monts","Sélection"],["23166","Galeries Saint-Laurent","Sélection"],["23167","Ste-Catherine/St-André","Express"],["23168","Chomedey","Sélection"],["23169","Galeries Normandie","Express"],["23170","Plaza Pointe-Claire","Classique"],["23171","Sherbrooke Est/Autoroute 25","Sélection"],["23173","Rue Masson","Classique"],["23174","Complexe Desjardins","Classique"],["23176","Saint-Donat","Classique"],["23177","Kirkland - St-Charles/Hymus","Sélection"],["23179","Mont-Tremblant","Classique"],["23180","Longueuil - Ch. de Chambly","Sélection"],["23181","Fabreville","Classique"],["23182","Saint-François","Classique"],["23183","Carrefour du Nord","Sélection"],["23184","Bois-des-Filions","Classique"],["23185","Ateliers Angus","Sélection"],["23186","Village Montpellier","Classique"],["23187","Carrefour Saint-Hyacinthe","Sélection"],["23188","Vimont","Sélection"],["23189","Sainte-Adèle","Sélection"],["23190","Gatineau - St-Joseph/St-Raymond","Express"],["23191","Carrefour Angrignon","Sélection"],["23192","Granby - Rue St-Jude Nord","Sélection"],["23193","Mail Champlain","Classique"],["23194","Valleyfield - Boul. Monseigneur-Langlois","Sélection"],["23195","Langelier/Bélanger","Classique"],["23196","Sorel","Sélection"],["23197","Beaconsfield","Classique"],["23198","St-Joseph-du-Lac","Classique"],["23200","Grenville","Classique"],["23202","Faubourg Boisbriand","Sélection"],["23203","Lac-Brome","Classique"],["23205","Autoroute 440/Autoroute 19","Sélection"],["23206","Teminus Longueuil","Classique"],["23207","Sainte-Marthe-sur-le-Lac","Classique"],["23208","Papineau/Crémazie","Sélection"],["23209","Vaudreuil","Sélection"],["23210","Mont-Royal Est/Mentana","Express"],["23212","Ste-Thérèse - Rue St-Charles","Express"],["23213","Du Village","Classique"],["23214","Saint-Constant","Classique"],["23215","Carrefour Candiac","Sélection"],["23216","Mirabel - St-Canut","Classique"],["23217","Centre Forum Pepsi","Sélection"],["23218","Centropolis","Sélection"],["23219","Sainte-Julienne","Classique"],["23220","Mont-Royal Ouest/Clark","Express"],["23221","Galeries Orford","Classique"],["23224","Saint-Basile-le-Grand","Classique"],["23226","Châteauguay - Boul. St-Jean-Baptiste","Express"],["23227","Saint-Césaire","Classique"],["23228","Ville Mont-Royal","Classique"],["23229","Brossard - Taschereau/Pelletier","Sélection"],["23230","Bellefeuille","Classique"],["23231","Saint-Eustache - Arthur-Sauvé/Léveillé","Classique"],["23233","Saint-Jean-de-Matha","Classique"],["23234","Gatineau - Montée-Paiement","Classique"],["23235","Laval Ouest","Classique"],["23236","Auteuil","Express"],["23237","R.D.P. - Boul. Rodolphe-Forget","Classique"],["23239","Repentigny - Boul. Iberville","Classique"],["23241","Avenue Laurier Est","Classique"],["23246","Beloeil - Autoroute 20","Classique"],["23247","Gatineau - St-Joseph/Freeman","Classique"],["23250","Griffintown","Classique"],["23291","Complexe Les Ailes","Signature"],["23292","Marché Jean-Talon","Classique"],["23301","Gatineau - Boul. du Plateau","Sélection"],["23303","Terrebonne - Montée des Pionniers","Classique"],["23304","N.D.G. - Rue St-Jacques","Sélection"],["23308","Boucherville - De Mortagne/Aut. 20","Express"],["23309","Fleurimont","Classique"],["23311","Sainte-Rose","Sélection"],["23312","La Plaine","Classique"],["23313","Saint-Eustache - 25e avenue","Express"],["23314","Terrebonne - Boul. Moody","Express"],["23324","Brossard - Boul. de la Grande Allée","Classique"],["23325","Promenades Saint-Bruno","Classique"],["23327","Repentigny - Boul. Industriel","Express"],["23329","Place D'Armes","Classique"],["23330","Hemmingford","Classique"],["23331","R.D.P. - Boul. Maurice-Duplessis","Classique"],["23332","Brossard - Marché Village","Express"],["23333","Napierville","Classique"],["23334","Saint-Luc","Classique"],["23335","Mascouche","Classique"],["23337","L'Île-des-Soeurs","Sélection"],["23343","L'Île-Perrot","Sélection"],["23344","Centre Le Boulevard","Sélection"],["23345","La Cité - Les Galeries du Parc","Classique"],["23347","Varennes","Sélection"],["23348","Lorraine","Classique"],["23349","Pont-Viau","Classique"],["23351","Oka","Classique"],["23352","Ormstown","Classique"],["23355","Hudson","Classique"],["23358","Lavaltrie","Classique"],["23359","Joliette - Centre-ville","Sélection"],["23361","Galeries Mille-Iles","Sélection"],["23362","St-Lazare","Classique"],["23363","Marché 440","Classique"],["23364","Carrefour Laval","Classique"],["23365","Mont St-Hilaire","Classique"],["23366","Sainte-Julie","Sélection"],["23367","Mercier","Classique"],["23368","Place Longueuil","Classique"],["23369","Saint-Lambert - Centre-ville","Classique"],["23371","Boucherville - De Mortagne/L.-Daunais","Sélection"],["23380","Saint-Sauveur - De la Gare","Sélection"],["23385","Marché Jean-Talon","Classique"],["23390","Centre Forum Pepsi","Sélection"],["33501","St-Romuald","Classique"],["33503","St-Félicien","Classique"],["33504","Trois-Pistoles","Classique"],["33505","Mégacentre Rimouski","Sélection"],["33506","Chicoutimi-Nord","Classique"],["33508","Québec - Rue Cartier","Classique"],["33509","Donnacona","Classique"],["33511","Chicoutimi - Boul. Talbot","Sélection"],["33512","Jonquière","Sélection"],["33513","Alma","Classique"],["33515","Limoilou","Classique"],["33518","Saint-Georges","Sélection"],["33520","Val Bélair","Classique"],["33521","Victoriaville - Centre-ville","Classique"],["33523","Lac Mégantic","Classique"],["33524","Québec - Boul. Charest Ouest","Express"],["33526","Québec - Rue St-Jean","Classique"],["33527","Chibougamau","Classique"],["33528","Ste-Catherine-de-la-Jacques-Cartier","Classique"],["33530","Grand-Mère","Classique"],["33531","Rimouski - Nazareth","Classique"],["33533","Gaspé","Classique"],["33534","Shawinigan","Classique"],["33535","Québec - Boul. de L'Ormière","Classique"],["33536","Cap-Rouge","Sélection"],["33537","Québec - Boul. Jean-Lesage","Sélection"],["33538","Québec - Rue Maguire","Classique"],["33539","Saint-Jean-Chrysostome","Classique"],["33540","La Baie","Classique"],["33541","Amqui","Classique"],["33542","Saint-Raymond","Classique"],["33543","Arvida","Classique"],["33545","Estimauville","Classique"],["33546","Drummondville - Boul. St-Joseph","Sélection"],["33548","Rivière-du-Loup","Sélection"],["33549","La Malbaie","Sélection"],["33550","Baie-Comeau","Classique"],["33551","Sainte-Anne-des-Monts","Classique"],["33553","Galeries de la Capitale","Sélection"],["33556","Cabano","Classique"],["33558","La Pocatière","Classique"],["33559","Saint-Émile","Classique"],["33560","Trois-Rivières - Boul. St-Maurice","Classique"],["33561","Trois-Rivières - Boul. des Récollets","Sélection"],["33562","Sept-Iles","Sélection"],["33563","Roberval","Classique"],["33564","Beauport - Rue Blanche-Lamontagne","Sélection"],["33565","Baie Saint-Paul","Classique"],["33566","Iles-de-la-Madeleine","Classique"],["33567","Drummondville - Rue des Forges","Classique"],["33569","Forestville","Classique"],["33570","Sainte-Marie","Classique"],["33571","Thetford Mines","Classique"],["33573","Neufchâtel","Classique"],["33574","Lauzon","Classique"],["33575","Québec - Boul. Laurier","Signature"],["33576","Beauceville","Classique"],["33577","Dolbeau","Classique"],["33578","Saint-Nicéphore","Classique"],["33580","Plaza Laval","Classique"],["33581","Saint-Étienne-de-Lauzon","Classique"],["33582","L'Ancienne-Lorette - Autoroute Duplessis","Express"],["33583","Place Naviles","Sélection"],["33584","Les Saules","Sélection"],["33585","Carrefour Charlesbourg","Sélection"],["33593","Percé","Classique"],["33594","Halles Sainte-Foy","Express"],["33595","Québec - Ch. Saint-Louis","Classique"],["33596","Vanier","Classique"],["33600","Campanile","Classique"],["33601","Charlesbourg - Boul. du Lac","Classique"],["33604","Sainte-Anne-de-Beaupré","Classique"],["33605","Beauport - Boul. Louis XIV","Express"],["33606","Québec - Ave. St-Sacrement","Classique"],["33609","Saint-Nicolas","Sélection"],["33611","Grande-Place-des-Bois-Francs","Sélection"],["33612","Montmagny","Classique"],["33613","New Richmond","Classique"],["33614","Hauterive","Classique"],["33615","Lévis - Route du Président Kennedy","Sélection"],["33616","Galeries Charlesbourg","Classique"],["33617","L'Ancienne-Lorette - Rue Notre-Dame","Classique"],["33618","Trois-Rivières - Boul. Thibeau","Classique"],["33619","Pointe-à-la-Croix","Classique"],["33620","Saint-Apollinaire","Classique"],["33624","Matane","Classique"],["33630","Trois-Rivières - Rue des Forges","Classique"],["33632","Carrefour d'Alma","Sélection"],["33635","Trois-Rivières - Boul. Jean XXIII","Classique"],["33639","Beauport - Ave. Royale","Classique"],["33691","Québec - Place de la Cité","Sélection"],["33692","Beauport - Ave. Larue","Classique"],["33693","Québec - Boul. des Gradins","Classique"],["33694","Lac St-Charles","Classique"],["33695","Québec - Lebourgneuf","Classique"],["33851","Portneuf","Classique"],["33852","Beauport - Terrasse Beauport","Classique"],["33853","Lévis - Route des Rivières","Classique"],["33854","Sainte-Foy - Boul. Wilfrid-Hamel","Classique"],["33856","Lévis - Boul. Guillaume-Couture","Classique"],["33858","Saint-Marc-des-Carrières","Classique"],["33859","Lévis - Centre-ville","Classique"],["33860","Québec - Boul. Bastien","Classique"],["33862","Saint-Augustin-de-Desmaures","Classique"]];

function populateSAQStoreSelect() {
  const select = document.getElementById('saqStoreSelect');
  if (!select) return;
  // Group: 23xxx = Montreal & South, 33xxx = Quebec & East
  const grpMtl = document.createElement('optgroup');
  grpMtl.label = 'Montreal et Sud du Quebec';
  const grpQc = document.createElement('optgroup');
  grpQc.label = 'Quebec et Est du Quebec';
  SAQ_STORES.forEach(([id, name, banner]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${name} (${banner})`;
    if (id.startsWith('23')) grpMtl.appendChild(opt);
    else grpQc.appendChild(opt);
  });
  select.appendChild(grpMtl);
  select.appendChild(grpQc);
}

async function loadSAQStore() {
  try {
    const res = await fetch(API_URL + '/saq/store', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    saqStoreId = data.store || '';
    const select = document.getElementById('saqStoreSelect');
    if (select) select.value = saqStoreId;
  } catch {}
}

async function saveSAQStore(id) {
  saqStoreId = id;
  try {
    await fetch(API_URL + '/saq/store', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: id }),
    });
    const saved = document.getElementById('saqStoreSaved');
    if (saved) {
      saved.style.display = '';
      setTimeout(() => saved.style.display = 'none', 2000);
    }
  } catch {}
  // Re-apply filter if "Ma succursale" is selected
  applySAQFilters();
}

async function searchSAQCatalog(query) {
  const resultsEl = document.getElementById('saqResults');
  const infoEl = document.getElementById('saqResultsInfo');
  if (!query.trim()) return;

  resultsEl.innerHTML = '<div class="saq-loading">Recherche en cours...</div>';
  infoEl.textContent = '';

  try {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(API_URL + '/saq/search?' + params, { headers: authHeaders() });
    if (!res.ok) throw new Error('Erreur ' + res.status);
    const data = await res.json();
    saqResults = data.results || [];
    applySAQFilters();
  } catch (err) {
    resultsEl.innerHTML = '<div class="saq-empty-state">Erreur de recherche. Reessayez.</div>';
  }
}

function applySAQFilters() {
  const availFilter = document.getElementById('saqFilterAvailability').value;
  const colorFilter = document.getElementById('saqFilterColor').value;
  const infoEl = document.getElementById('saqResultsInfo');

  saqFilteredResults = saqResults.filter(w => {
    if (colorFilter && w.color !== colorFilter) return false;
    if (availFilter === 'online') {
      if (!w.availability || !w.availability.includes('En ligne')) return false;
    }
    if (availFilter === 'store') {
      if (!saqStoreId) return false;
      if (!w.stores || !w.stores.includes(saqStoreId)) return false;
    }
    return true;
  });

  if (availFilter === 'store' && !saqStoreId) {
    infoEl.innerHTML = '<span class="saq-store-warning">Definissez votre succursale dans votre profil pour utiliser ce filtre.</span>';
    renderSAQResults([]);
    return;
  }

  infoEl.textContent = saqFilteredResults.length + ' vin' + (saqFilteredResults.length !== 1 ? 's' : '') + ' trouve' + (saqFilteredResults.length !== 1 ? 's' : '');
  renderSAQResults(saqFilteredResults);
}

function renderSAQResults(results) {
  const container = document.getElementById('saqResults');
  if (results.length === 0 && saqResults.length > 0) {
    container.innerHTML = '<div class="saq-empty-state">Aucun vin ne correspond aux filtres selectionnes.</div>';
    return;
  }
  if (results.length === 0) {
    container.innerHTML = '<div class="saq-empty-state">Recherchez un vin dans le catalogue de la SAQ</div>';
    return;
  }

  container.innerHTML = '<div class="saq-card-grid">' + results.map(w => {
    const priceText = w.price ? w.price.toFixed(2).replace('.', ',') + ' $' : '';
    const availBadges = (w.availability || []).map(a => {
      if (a === 'En ligne') return '<span class="saq-avail-badge saq-avail-online">En ligne</span>';
      if (a === 'En succursale') return '<span class="saq-avail-badge saq-avail-store">En succursale</span>';
      return '<span class="saq-avail-badge saq-avail-other">' + escapeHtml(a) + '</span>';
    }).join('');
    const storeMatch = saqStoreId && w.stores && w.stores.includes(saqStoreId);

    return `
      <div class="saq-card">
        <div class="saq-card-header">
          <div class="saq-card-name">${escapeHtml(w.name)}</div>
          ${priceText ? `<div class="saq-card-price">${priceText}</div>` : ''}
        </div>
        <div class="saq-card-badges">
          <span class="badge ${colorBadgeClass(w.color)}">${escapeHtml(w.color)}</span>
          ${w.vintage ? `<span class="saq-card-vintage">${escapeHtml(w.vintage)}</span>` : ''}
          ${w.pastille ? `<span class="saq-pastille">${escapeHtml(w.pastille)}</span>` : ''}
        </div>
        ${w.grape ? `<div class="saq-card-grape">${escapeHtml(w.grape)}</div>` : ''}
        <div class="saq-card-origin">${escapeHtml(w.country)}${w.region ? ' — ' + escapeHtml(w.region) : ''}</div>
        <div class="saq-card-footer">
          <div class="saq-card-avail">${availBadges}${storeMatch ? '<span class="saq-avail-badge saq-avail-mystore">Ma succursale</span>' : ''}</div>
          <a href="${w.url}" target="_blank" rel="noopener" class="saq-card-link">Voir a la SAQ</a>
        </div>
      </div>
    `;
  }).join('') + '</div>';
}

function initSAQSearch() {
  populateSAQStoreSelect();
  loadSAQStore();

  document.getElementById('saqSearchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    searchSAQCatalog(document.getElementById('saqSearchInput').value);
  });

  document.getElementById('saqFilterAvailability').addEventListener('change', applySAQFilters);
  document.getElementById('saqFilterColor').addEventListener('change', applySAQFilters);

  document.getElementById('saqStoreSelect').addEventListener('change', (e) => {
    saveSAQStore(e.target.value);
  });
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const pw = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  err.textContent = '';
  const ok = await login(username, pw);
  if (ok) {
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    init();
  } else {
    err.textContent = 'Identifiants incorrects';
  }
});

init();
