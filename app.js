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
}

function authHeaders() {
  const token = localStorage.getItem('session');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

async function login(password) {
  const res = await fetch(API_URL + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  if (data.token) localStorage.setItem('session', data.token);
  return true;
}

async function logout() {
  localStorage.removeItem('session');
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
  const loaded = await loadWines();
  if (!loaded) return; // login screen shown

  showApp();
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
  loadPreferences();
  document.getElementById('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    sendChatMessage(document.getElementById('chatInput').value);
  });

  // API info section
  loadApiInfo();
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

function startTasteGuide() {
  const profilePanel = document.getElementById('profilePanel');
  const chatPanel = document.getElementById('chatPanel');

  // Close profile, open chat
  profilePanel.classList.remove('open');
  chatPanel.classList.add('open');

  // Send a guided profiling prompt
  const guidePrompt = '__GUIDE_PROFIL__';
  sendChatMessage(guidePrompt, true);
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

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  err.textContent = '';
  const ok = await login(pw);
  if (ok) {
    document.getElementById('loginPassword').value = '';
    init();
  } else {
    err.textContent = 'Mot de passe incorrect';
  }
});

init();
