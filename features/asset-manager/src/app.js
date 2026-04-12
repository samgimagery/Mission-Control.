const dataPath = '../data/assets.json';
let assets = [];
let filtered = [];
let selectedKey = null;

const THEME_KEY = 'openclawTheme';
const themeToggle = document.getElementById('themeToggle');
function applyTheme(mode){
  document.body.classList.toggle('dark', mode === 'dark');
  if (themeToggle) themeToggle.textContent = mode === 'dark' ? 'Light mode' : 'Dark mode';
}
applyTheme(localStorage.getItem(THEME_KEY) || 'light');
themeToggle?.addEventListener('click', ()=>{
  const next = document.body.classList.contains('dark') ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

const grid = document.getElementById('grid');
const detail = document.getElementById('detail');
const typeFilter = document.getElementById('typeFilter');
const folderFilter = document.getElementById('folderFilter');
const statusFilter = document.getElementById('statusFilter');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const gridWrap = document.getElementById('gridWrap');
const detailsBtn = document.getElementById('detailsBtn');
let tile = 220;
const TILE_MIN = 60;
const TILE_MAX = 520;
const PAGE_SIZE = 48;
let visibleCount = PAGE_SIZE;

document.getElementById('refreshBtn').onclick = async ()=>{
  const btn = document.getElementById('refreshBtn');
  const old = btn.textContent;
  try {
    btn.textContent = 'Refreshing…';
    btn.disabled = true;
    await fetch('/api/import-assets', { method: 'POST' });
  } catch {}
  await load();
  btn.textContent = old;
  btn.disabled = false;
};
document.getElementById('importNewBtn').onclick = async ()=>{
  try {
    const btn = document.getElementById('importNewBtn');
    const old = btn.textContent;
    btn.textContent = 'Choosing folder…'; btn.disabled = true;
    const res = await fetch('/api/select-import-folder', { method: 'POST' });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.error || 'Folder import failed');
    await load();
    alert(`Library pointed to:\n${out.folder}\n\nImport complete.`);
    btn.textContent = old; btn.disabled = false;
  } catch (e) {
    alert('Import failed: ' + e.message);
    const btn = document.getElementById('importNewBtn');
    btn.textContent = 'Import New'; btn.disabled = false;
  }
};

[typeFilter, folderFilter, statusFilter].filter(Boolean).forEach(el => el.addEventListener('input', ()=>{
  visibleCount = PAGE_SIZE;
  applyFilters();
}));
loadMoreBtn?.addEventListener('click', ()=>{
  visibleCount += PAGE_SIZE;
  render();
});
zoomInBtn?.addEventListener('click', ()=>{ tile = Math.min(TILE_MAX, tile + 60); document.documentElement.style.setProperty('--tile', `${tile}px`); render(); });
zoomOutBtn?.addEventListener('click', ()=>{ tile = Math.max(TILE_MIN, tile - 60); document.documentElement.style.setProperty('--tile', `${tile}px`); render(); });

let showDetails = true;
detailsBtn?.addEventListener('click', ()=>{
  showDetails = !showDetails;
  document.body.classList.toggle('hide-detail', !showDetails);
  detailsBtn.classList.toggle('toggle-off', !showDetails);
  render();
});

function assetUrl(a){
  const base = safeSrc(a?.path || '');
  const stamp = a?.created_at ? encodeURIComponent(String(a.created_at)) : '';
  if (!stamp) return base;
  return base + (base.includes('?') ? '&' : '?') + 'v=' + stamp;
}

function render(){
  grid.innerHTML = '';
  const compact = tile <= 150;
  grid.classList.toggle('compact', compact);
  const visibleAssets = filtered.slice(0, visibleCount);

  visibleAssets.forEach(a=>{
    const card = document.createElement('article');
    const minimalMeta = showDetails || compact;
    card.className = 'card asset-card';
    if (minimalMeta) card.classList.add('minimal-meta');
    if (compact) card.classList.add('squareish');
    card.dataset.key = assetKey(a);
    card.innerHTML = `
      <div class="thumb">${thumbFor(a)}</div>
      <div class="meta">
        ${minimalMeta ? '' : `<div class="name">${a.asset_name}</div><div class="sub">${a.project} · ${a.model_tool || 'n/a'}</div>`}
        <div class="pill-row">
          <span class="badge ${a.status || 'draft'}">${a.status || 'draft'}</span>
          <span class="badge type-pill">${fileTypeLabel(a)}</span>
        </div>
      </div>
    `;
    card.onclick = (e)=>{ e.preventDefault(); e.stopPropagation(); showDetail(assetKey(a)); };
    grid.appendChild(card);
  });

  hydrateDocThumbs();

  if (loadMoreBtn) {
    const moreRemaining = filtered.length > visibleAssets.length;
    loadMoreBtn.hidden = !moreRemaining;
    loadMoreBtn.textContent = moreRemaining
      ? `Load more (${filtered.length - visibleAssets.length} remaining)`
      : 'Load more';
  }

  if (!filtered.length) {
    selectedKey = null;
    detail.innerHTML = '<p class="muted">No assets match your filters.</p>';
    return;
  }

  if (!selectedKey || !filtered.some(x => assetKey(x) === selectedKey)) {
    showDetail(assetKey(filtered[0]));
    return;
  }

  highlightSelectedCard();
}

function highlightSelectedCard(){
  document.querySelectorAll('.asset-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.key === selectedKey);
  });
}

function showDetail(key){
  selectedKey = key;
  const a = assets.find(x => assetKey(x) === key);
  if (!a) return;

  highlightSelectedCard();

  const isImage = a.type === 'image' || a.type === 'screenshot';
  const lowerPath = (a.path || '').toLowerCase();
  const isVideo = a.type === 'video' || lowerPath.endsWith('.mp4') || lowerPath.endsWith('.mov') || lowerPath.endsWith('.m4v');
  const isHtml = lowerPath.endsWith('.html') || lowerPath.endsWith('.htm');
  const isMd = lowerPath.endsWith('.md') || lowerPath.endsWith('.txt');

  detail.innerHTML = `
    <h3>${a.asset_name}</h3>
    <p class="muted">${a.project}</p>
    ${isImage ? `<img src="${safeSrc(a.path)}" alt="${a.asset_name}" onerror="this.replaceWith(document.createTextNode('Preview unavailable'))"/>` : ''}
    ${isVideo ? `<video src="${safeSrc(a.path)}" controls playsinline preload="metadata" style="width:100%;max-height:360px;border:1px solid var(--line);border-radius:10px;background:#000"></video>` : ''}
    ${isHtml ? `<iframe src="${assetUrl(a)}" title="${esc(a.asset_name || 'HTML preview')}" style="width:100%;height:340px;border:1px solid var(--line);border-radius:10px;background:#fff"></iframe><p><a href="${assetUrl(a)}" target="_blank" rel="noopener">Open HTML in browser ↗</a></p>` : ''}
    ${isMd ? `<pre id="mdPreview" class="muted" style="white-space:pre-wrap;background:#fff;border:1px solid var(--line);padding:10px;border-radius:8px;max-height:240px;overflow:auto">Loading text preview…</pre>` : ''}

    <div class="row">
      <div>
        <label>Status</label>
        <select id="f_status">
          <option ${a.status==='draft'?'selected':''}>draft</option>
          <option ${a.status==='approved'?'selected':''}>approved</option>
          <option ${a.status==='archived'?'selected':''}>archived</option>
        </select>
      </div>
      <div>
        <label>Model / Tool</label>
        <input id="f_model" value="${esc(a.model_tool||'')}" />
      </div>
    </div>

    <label>Source</label>
    <input id="f_source" value="${esc(a.source||'')}" />

    <label>API</label>
    <input id="f_api" value="${esc(a.api||'')}" />

    <label>Prompt</label>
    <textarea id="f_prompt">${esc(a.prompt||'')}</textarea>

    <label>Designer Guidance</label>
    <textarea id="f_guidance">${esc(a.designer_guidance||'')}</textarea>

    <label>Tags (comma-separated)</label>
    <input id="f_tags" value="${esc((a.tags||[]).join(', '))}" />

    <label>Notes</label>
    <textarea id="f_notes">${esc(a.notes||'')}</textarea>

    <p><b>Folder:</b> ${esc(a.folder || inferFolderLabel(a.path))}</p>
    <p><b>Created:</b> ${a.created_at}</p>
    <p><code>${a.path}</code></p>

    <div class="actions">
      <button id="saveBtn" class="primary">Save metadata</button>
      <button id="deleteBtn" class="danger">Delete asset</button>
    </div>
    <p class="muted">Delete removes it from the library and source disk.</p>
  `;

  document.getElementById('saveBtn').onclick = saveCurrent;
  document.getElementById('deleteBtn').onclick = () => deleteCurrent(assetKey(a));
  if (isMd) loadTextPreview(a.path);
}

function saveCurrent(){
  if (!selectedKey) return;
  const idx = assets.findIndex(x => assetKey(x) === selectedKey);
  if (idx < 0) return;
  assets[idx].status = val('f_status') || 'draft';
  assets[idx].model_tool = val('f_model');
  assets[idx].source = val('f_source');
  assets[idx].api = val('f_api');
  assets[idx].prompt = val('f_prompt');
  assets[idx].designer_guidance = val('f_guidance');
  assets[idx].tags = val('f_tags').split(',').map(s=>s.trim()).filter(Boolean);
  assets[idx].notes = val('f_notes');
  applyFilters();
  showDetail(selectedKey);
  saveAllToServer().catch(()=>{});
}

async function deleteCurrent(key){
  const a = assets.find(x => assetKey(x) === key);
  if (!a) return;
  const ok = confirm(`Delete asset from library and source file?\n\n${a.asset_name}`);
  if (!ok) return;

  const deletedAtSource = await deleteAssetFile(a.path);
  if (!deletedAtSource) return;

  assets = assets.filter(x => assetKey(x) !== key);
  filtered = filtered.filter(x => assetKey(x) !== key);

  await logDeletion(a);
  await saveAllToServer();

  await load();

  const stillThere = assets.some(x => x.path === a.path);
  if (stillThere) {
    alert('Delete did not persist after refresh. Please try again.');
    return;
  }

  if (filtered.length) {
    showDetail(assetKey(filtered[0]));
  } else {
    detail.innerHTML = '<p class="muted">Asset deleted.</p>';
  }
  render();
}

async function deleteAssetFile(path){
  try {
    const res = await fetch('/api/delete-asset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.error || 'Delete failed');
    return true;
  } catch (e) {
    alert('Source delete failed: ' + e.message);
    return false;
  }
}

async function logDeletion(asset){
  try {
    await fetch('/api/log-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deleted_at: new Date().toISOString(),
        asset_name: asset.asset_name,
        path: asset.path,
        project: asset.project,
        type: asset.type
      })
    });
  } catch {}
}

async function saveAllToServer(){
  const btn = document.getElementById('saveBtn');
  const old = btn?.textContent || 'Save metadata';
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
  try {
    const res = await fetch('/api/save-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assets)
    });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.error || 'Save failed');
    alert('Saved and synced ✅');
  } catch (e) {
    exportJson();
    alert('Server save unavailable. Exported JSON instead. (' + e.message + ')');
  } finally {
    if (btn) { btn.textContent = old; btn.disabled = false; }
  }
}

function val(id){
  return (document.getElementById(id)?.value || '').trim();
}

function applyFilters(){
  const selectedStatus = (statusFilter?.value || 'active').trim().toLowerCase();
  const selectedFolder = (folderFilter?.value || '').trim();
  filtered = assets.filter(a=>{
    const type = (a.type || '').trim();
    const status = (a.status || 'draft').trim().toLowerCase();
    const folder = (a.folder || inferFolderLabel(a.path)).trim();
    const tOk = !typeFilter.value || type === typeFilter.value;
    const fOk = !selectedFolder || folder === selectedFolder;

    let sOk = true;
    if (selectedStatus === 'active' || selectedStatus === '') {
      sOk = status === 'approved' || status === 'draft';
    } else if (selectedStatus === 'all') {
      sOk = true;
    } else {
      sOk = status === selectedStatus;
    }

    return tOk && fOk && sOk;
  });
  render();
}

function refreshFolderOptions(){
  if (!folderFilter) return;
  const current = folderFilter.value;
  const folders = [...new Set(assets.map(a => a.folder || inferFolderLabel(a.path)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  folderFilter.innerHTML = '<option value="">All folders</option>' + folders.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if (folders.includes(current)) folderFilter.value = current;
}

function exportJson(){
  const blob = new Blob([JSON.stringify(assets, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'assets.updated.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function updateZoomButtons(){
  [zoomInBtn, zoomOutBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('toggle-off');
  });
}

function assetKey(a){
  return `${a.path || ''}::${a.created_at || ''}`;
}

function esc(s){
  return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadTextPreview(path){
  const el = document.getElementById('mdPreview');
  if (!el) return;
  try {
    const res = await fetch(safeSrc(path));
    const txt = await res.text();
    el.textContent = txt.slice(0, 1800) + (txt.length > 1800 ? '\n…' : '');
  } catch {
    el.textContent = 'Preview unavailable';
  }
}

function safeSrc(p){
  try {
    return encodeURI(p || '');
  } catch {
    return p || '';
  }
}

function fileTypeLabel(a){
  const p = String(a?.path || '').toLowerCase();
  const ext = p.includes('.') ? p.split('.').pop() : '';
  if (ext) return ext.toUpperCase();
  return String(a?.type || 'asset').toUpperCase();
}

function inferFolderLabel(path){
  const raw = String(path || '').replace(/^\.\//, '');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return 'Unsorted';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, 2).join('/');
}

function thumbFor(a){
  const t = (a.type || '').toLowerCase();
  const path = (a.path || '').toLowerCase();
  if (t === 'video' || path.endsWith('.mp4') || path.endsWith('.mov') || path.endsWith('.m4v')) {
    return `<video src="${safeSrc(a.path)}" muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;background:#000" onloadeddata="try{if(this.readyState>=2){this.currentTime=(1/30);}}catch(e){}"></video>`;
  }
  if (t === 'doc' && (path.endsWith('.html') || path.endsWith('.htm'))) {
    return `<iframe src="${assetUrl(a)}" loading="lazy" title="${esc(a.asset_name || 'HTML preview')}" style="width:100%;height:100%;border:0;pointer-events:none;background:#fff" onerror="this.closest('.thumb').innerText='HTML PREVIEW UNAVAILABLE'"></iframe>`;
  }
  if (t === 'doc' && (path.endsWith('.md') || path.endsWith('.txt'))) {
    return `<div class="doc-thumb" data-doc-path="${safeSrc(a.path)}">Loading preview…</div>`;
  }
  if (a.thumbnail_path) {
    return `<img src="${safeSrc(a.thumbnail_path)}" style="width:100%;height:100%;object-fit:cover" onerror="this.closest('.thumb').innerText='PREVIEW'">`;
  }
  return (a.type || 'asset').toUpperCase();
}

function hydrateDocThumbs(){
  document.querySelectorAll('.doc-thumb[data-doc-path]').forEach(async (el)=>{
    const path = el.getAttribute('data-doc-path');
    try {
      const res = await fetch(path);
      const txt = await res.text();
      el.textContent = txt.slice(0, 380) + (txt.length > 380 ? '…' : '');
    } catch {
      el.textContent = 'Preview unavailable';
    }
  });
}

function dedupeAssets(list){
  const m = new Map();
  for (const a of list || []) {
    const k = `${a.path || ''}`;
    if (!m.has(k)) m.set(k, a);
  }
  return [...m.values()];
}

async function load(){
  document.documentElement.style.setProperty('--tile', `${tile}px`);
  updateZoomButtons();
  try{
    const res = await fetch(dataPath);
    assets = dedupeAssets(await res.json()).map(a => ({
      ...a,
      folder: a.folder || inferFolderLabel(a.path)
    }));
    refreshFolderOptions();
    visibleCount = PAGE_SIZE;
    applyFilters();
  }catch(e){
    grid.innerHTML = '<p class="muted">Could not load assets.json yet.</p>';
    if (loadMoreBtn) loadMoreBtn.hidden = true;
  }
}

(function setupDragPan(){
  if (!gridWrap) return;
  let down=false,sx=0,sy=0,sl=0,st=0;
  gridWrap.addEventListener('mousedown', (e)=>{ down=true; sx=e.clientX; sy=e.clientY; sl=gridWrap.scrollLeft; st=gridWrap.scrollTop; gridWrap.classList.add('dragging'); });
  window.addEventListener('mouseup', ()=>{ down=false; gridWrap.classList.remove('dragging'); });
  window.addEventListener('mousemove', (e)=>{ if(!down) return; gridWrap.scrollLeft = sl - (e.clientX - sx); gridWrap.scrollTop = st - (e.clientY - sy); });
})();

window.addEventListener('resize', ()=>render());
load();
