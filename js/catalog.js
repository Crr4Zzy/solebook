// StockX catalog through KicksDB (https://kicks.dev): search with image, SKU and sizes.
// The API key is stored only on this device (IndexedDB), never in the code or the synced data.
import { esc, icon, sizeSort } from './util.js';
import { idbGet, idbSet } from './store.js';
import { registerActions } from './ui.js';

const API = 'https://api.kicks.dev/v3/stockx';
let key = null;
export const loadCatalogKey = async () => { key = (await idbGet('kicksKey').catch(() => null)) || null; return key; };
export const catalogKey = () => key;
export const catalogEnabled = () => !!key;
export async function setCatalogKey(k) {
  key = (k || '').trim() || null;
  await idbSet('kicksKey', key);
  searchCache.clear();
}

const searchCache = new Map();
const detailCache = new Map();

async function call(path) {
  if (!key) throw new Error('Falta la clave del catálogo (Ajustes → Catálogo StockX).');
  if (!navigator.onLine) throw new Error('Sin conexión.');
  let res;
  try {
    res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` } });
  } catch {
    throw new Error('No se puede conectar con el catálogo.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('La clave del catálogo no es válida.');
  if (res.status === 429) throw new Error('Has llegado al límite de búsquedas del mes de tu plan.');
  if (!res.ok) throw new Error(`El catálogo ha respondido con un error (${res.status}).`);
  return res.json();
}

const CLOTHING = /apparel|clothing|hoodie|sweat|shirt|tee|jacket|pants|short|ropa|top/i;
const toItem = (p) => ({
  id: p.id,
  slug: p.slug || p.id,
  title: p.title || [p.brand, p.model].filter(Boolean).join(' '),
  brand: p.brand || '',
  model: p.model || '',
  sku: (p.sku || '').toUpperCase(),
  image: p.image || p.gallery?.[0] || '',
  type: CLOTHING.test(`${p.product_type || ''} ${p.category || ''}`) ? 'ropa' : 'zapatilla',
  minPrice: p.min_price ?? null,
});

export async function searchCatalog(q) {
  const query = q.trim();
  if (query.length < 3) return [];
  const k = query.toLowerCase();
  if (searchCache.has(k)) return searchCache.get(k);
  const json = await call(`/products?query=${encodeURIComponent(query)}`);
  const items = (Array.isArray(json.data) ? json.data : []).map(toItem).filter((x) => x.title);
  searchCache.set(k, items);
  return items;
}

// Sizes of a product, as the user writes them: EU for shoes ("42.5"), letters for clothing ("M").
export async function catalogSizes(slugOrId) {
  if (detailCache.has(slugOrId)) return detailCache.get(slugOrId);
  const json = await call(`/products/${encodeURIComponent(slugOrId)}?display[variants]=true`);
  const p = json.data || json;
  const out = new Set();
  (p.variants || []).forEach((v) => {
    const eu = (v.sizes || []).find((s) => String(s.type).toLowerCase() === 'eu');
    let size = eu ? String(eu.size).replace(/^EU\s*/i, '') : String(v.size || '').replace(/^(US|EU)\s*/i, '');
    size = size.replace(/W$/i, '').trim().toUpperCase();
    if (size) out.add(size);
  });
  const sizes = [...out].sort(sizeSort);
  detailCache.set(slugOrId, sizes);
  return sizes;
}

// ---------- picker (search box + results), usable in a sheet or a page ----------
// Each picker has an id; the host gives a callback for the chosen item and a refresh function.
const pickers = {};
export function registerPicker(id, { onPick, refresh }) {
  // Keep the same object: a search in flight writes its results into it.
  const p = (pickers[id] ||= { q: '', items: [], loading: false, error: '' });
  p.onPick = onPick;
  p.refresh = refresh;
  return p;
}
export const pickerState = (id) => pickers[id] || { q: '', items: [], loading: false, error: '' };
export function resetPicker(id, q = '') {
  if (pickers[id]) Object.assign(pickers[id], { q, items: [], loading: false, error: '' });
}

let timer;
function runSearch(id) {
  const p = pickers[id];
  clearTimeout(timer);
  if (p.q.trim().length < 3) { p.items = []; p.loading = false; p.error = ''; p.refresh(); return; }
  p.loading = true;
  timer = setTimeout(async () => {
    const q = p.q;
    try {
      const items = await searchCatalog(q);
      if (p.q === q) { p.items = items; p.error = ''; }
    } catch (e) { p.error = e.message; p.items = []; }
    p.loading = false;
    p.refresh();
  }, 450);
}
export const searchPicker = (id, q) => {
  const p = pickers[id];
  if (!p) return;
  p.q = q;
  runSearch(id);
};

export const catalogThumb = (url, cls = 'sm') => `<div class="thumb ${cls} cat-thumb">${url ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : icon('shoe')}</div>`;

// withInput: render its own search box (false when the host already has one, e.g. Añadir stock).
export function pickerHTML(id, { withInput = true, placeholder = 'Busca en StockX: Jordan 4 Bred, DD1391-100…', title = 'Sugerencias de StockX' } = {}) {
  if (!catalogEnabled()) {
    return `<p class="tiny muted mt">${icon('star', 'sm')} Conecta el catálogo de StockX en <a href="#/ajustes?s=catalogo">Ajustes</a> para ver sugerencias con foto y tallas.</p>`;
  }
  const p = pickerState(id);
  const list = p.items.map((it, i) => `<div class="row click" data-act="cat-pick" data-picker="${esc(id)}" data-i="${i}">
      ${catalogThumb(it.image)}
      <div class="grow"><div class="title">${esc(it.title)}</div><div class="meta">${esc([it.sku, it.type === 'ropa' ? 'Ropa' : ''].filter(Boolean).join(' · '))}</div></div>
      ${icon('plus', 'chev')}</div>`).join('');
  return `${withInput ? `<div class="input-wrap">${icon('search')}<input class="input" id="cat-q-${esc(id)}" data-input="cat-q" data-picker="${esc(id)}" value="${esc(p.q)}" placeholder="${esc(placeholder)}" autocomplete="off"></div>` : ''}
    ${p.q.trim().length >= 3 ? `<div class="cat-results">
      <div class="cat-title">${icon('star', 'sm')} ${esc(title)}${p.loading ? ' <span class="muted">· buscando…</span>' : ''}</div>
      ${p.error ? `<p class="small danger-text" style="padding:6px 0">${esc(p.error)}</p>` : ''}
      ${list || (!p.loading && !p.error ? '<p class="small muted" style="padding:6px 0">Nada en StockX con ese nombre.</p>' : '')}
    </div>` : ''}`;
}

registerActions({
  'cat-q': (el) => searchPicker(el.dataset.picker, el.value),
  'cat-pick': (el) => {
    const p = pickers[el.dataset.picker];
    const it = p?.items[Number(el.dataset.i)];
    if (it) p.onPick(it);
  },
});
