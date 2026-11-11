import { esc, icon, money, signed, fmtDate, today, toNum, matches, parseSizes, sizeSort, daysBetween, compressImage } from '../util.js';
import * as S from '../store.js';
import { registerActions, productThumb, avatar, pill, empty, kpi, saleRow, rerender, openSheet, refreshSheet, closeSheet, sheetHead, toast, withUndo, go, goThen } from '../ui.js';
import { shareProductCard } from '../share.js';

const f = { q: '', filter: '' };
let lastQueryF = null;

// ---------- list ----------
export const list = {
  title: () => 'Inventario',
  render({ query }) {
    if (query.f !== undefined && query.f !== lastQueryF) { f.filter = query.f; lastQueryF = query.f; }
    const tot = S.inventoryTotals();
    const items = S.state.products.map((p) => ({ p, st: S.productStock(p) }))
      .filter(({ p, st }) => {
        if (f.filter === 'sin') { if (st.count) return false; }
        else if (!st.count) return false;
        if (f.filter === 'zapatilla' && p.type === 'ropa') return false;
        if (f.filter === 'ropa' && p.type !== 'ropa') return false;
        if (f.filter === 'parado' && !st.units.some(S.isStale)) return false;
        if (f.q && !matches(`${p.brand} ${p.model} ${p.sku || ''} ${p.barcode || ''} ${st.sizes.map((s) => s.size).join(' ')}`, f.q)) return false;
        return true;
      })
      .sort((a, b) => f.filter === 'parado' ? b.st.oldestDays - a.st.oldestDays : S.productName(a.p).localeCompare(S.productName(b.p)));
    const noStockN = S.state.products.filter((p) => !S.productStock(p).count).length;

    return `
      <div class="page-head"><h1>Inventario</h1>
        <button class="btn primary" data-act="stock-add">${icon('plus')} Añadir stock</button></div>
      <div class="kpis">
        ${kpi('Unidades', tot.count, `${S.state.products.filter((p) => S.productStock(p).count).length} modelos`)}
        ${kpi('Te ha costado', money(tot.cost), '')}
        ${kpi('Valor a tu precio', money(tot.value), '')}
        ${kpi('Beneficio si lo vendes', `<span class="${tot.latent >= 0 ? 'ok-text' : 'danger-text'}">${signed(tot.latent)}</span>`, 'antes de comisiones')}
      </div>
      <div class="input-wrap search-top">${icon('search')}<input class="input" id="stock-q" data-search data-input="stock-q" placeholder="Buscar modelo, SKU o talla" value="${esc(f.q)}" autocomplete="off"></div>
      <div class="chips scroll mb">
        ${[['', 'Todo'], ['zapatilla', 'Zapatillas'], ['ropa', 'Ropa']].map(([k, l]) => `<button class="chip ${f.filter === k ? 'on' : ''}" data-act="stock-filter" data-v="${k}">${l}</button>`).join('')}
        <button class="chip warn ${f.filter === 'parado' ? 'on' : ''}" data-act="stock-filter" data-v="parado">Parado +${S.state.settings.staleDays} días <span class="n">${tot.stale}</span></button>
        <button class="chip ${f.filter === 'sin' ? 'on' : ''}" data-act="stock-filter" data-v="sin">Sin stock <span class="n">${noStockN}</span></button>
      </div>
      <div class="card">
        ${items.length ? `<div class="table">
          <div class="thead"><span style="width:44px"></span><span style="flex:1">Modelo</span><span class="col-num">Uds</span><span class="col-num">Coste medio</span><span class="col-num">Tu precio</span><span class="col-num">Latente</span><span class="col-num">Días</span></div>
          <div class="list">${items.map(({ p, st }) => {
            const latent = st.value - st.cost;
            const stale = st.units.some(S.isStale);
            return `<a class="row" href="#/producto/${p.id}">${productThumb(p)}
              <div class="grow"><div class="title">${esc(S.productName(p))}</div><div class="meta">${st.count ? esc(S.sizesLabel(st.sizes)) : 'Sin stock'}${stale ? ` · <span class="warn-text">${st.oldestDays} días</span>` : ''}</div></div>
              <div class="col-num strong">${st.count}<span class="mob-only muted small"> ${p.type === 'ropa' ? 'uds' : 'pares'}</span></div>
              <div class="col-num desk-only">${st.count ? money(st.avgCost) : '—'}</div>
              <div class="col-num desk-only">${p.price ? money(p.price) : '—'}</div>
              <div class="col-num desk-only ${latent >= 0 ? 'ok-text' : 'danger-text'}">${st.count ? signed(latent) : '—'}</div>
              <div class="col-num desk-only">${st.count ? (stale ? pill(`${st.oldestDays} d`, 'warn') : `<span class="muted small">${st.oldestDays} d</span>`) : ''}</div>
            </a>`;
          }).join('')}</div></div>`
        : S.state.products.length ? empty('search', 'Nada con este filtro', 'Prueba con otro.')
        : empty('box', 'Añade tu primer stock', 'Apunta qué tienes, en qué tallas y cuánto te costó. Al vender se descuenta solo.', '<button class="btn primary" data-act="stock-add">Añadir stock</button>')}
      </div>`;
  },
  mount(root, { query }) {
    if (query.add === '1') {
      history.replaceState(history.state, '', '#/stock');
      openAddStock();
    }
  },
};

// ---------- product detail ----------
export const detail = {
  title: ({ id }) => S.productName(S.product(id)),
  render({ id }) {
    const p = S.product(id);
    if (!p) throw new Error('not found');
    const st = S.productStock(p);
    const sold = S.state.sales.filter((s) => s.productId === id).sort((a, b) => b.date.localeCompare(a.date));
    const avgNet = sold.length ? sold.reduce((a, s) => a + S.saleNet(s), 0) / sold.length : 0;
    const interested = S.interestedClients(id);
    const showMarket = S.state.settings.showMarket && p.market;
    const bySize = {};
    st.units.forEach((u) => (bySize[u.size] ||= []).push(u));

    return `
      <div class="page-head">
        <a class="back" href="#/stock" aria-label="Volver">${icon('chevL')}</a>
        <h1>${esc(S.productName(p))}</h1>
        <button class="btn icon-only" data-act="product-edit" data-id="${id}" aria-label="Editar">${icon('edit')}</button>
      </div>
      <div class="grid wide-left">
        <div>
          ${p.photos?.length ? `<div class="hero-photo"><img src="${p.photos[0]}" alt=""></div>
          <div class="photo-strip mb">
            ${p.photos.map((ph, i) => `<div class="ph"><img src="${ph}" alt=""><button class="del" data-act="photo-del" data-id="${id}" data-i="${i}" aria-label="Quitar foto">${icon('x', 'sm')}</button></div>`).join('')}
            ${p.photos.length < 6 ? `<label class="ph">${icon('camera')}<input type="file" accept="image/*" hidden data-change="photo-add" data-id="${id}"></label>` : ''}
          </div>` : `<label class="hero-photo empty-photo">${icon(p.type === 'ropa' ? 'shirt' : 'shoe')}<span>${icon('camera', 'sm')} Añadir foto</span><input type="file" accept="image/*" hidden data-change="photo-add" data-id="${id}"></label>`}
          <div class="btn-row mb">
            <a class="btn primary" href="#/vender?producto=${id}">${icon('plus')} Vender</a>
            <button class="btn" data-act="stock-add" data-id="${id}">${icon('box')} Añadir stock</button>
            <button class="btn" data-act="product-share" data-id="${id}">${icon('share')} Compartir ficha</button>
          </div>
          <div class="kpis">
            ${kpi('En stock', st.count, st.count ? esc(S.sizesLabel(st.sizes)) : 'agotado')}
            ${kpi('Tu precio', p.price ? money(p.price) : '—', showMarket ? `mercado ≈ ${money(p.market)}` : esc(p.sku || ''))}
            ${kpi('Coste medio', st.count ? money(st.avgCost) : '—', st.count ? `latente <span class="${st.value - st.cost >= 0 ? 'up' : 'down'}">${signed(st.value - st.cost)}</span>` : '')}
            ${kpi('Vendidos', sold.length, sold.length ? `media ${signed(avgNet)} por venta` : 'todavía ninguno')}
          </div>
          <div class="card">
            <div class="card-head"><h2>Stock por talla</h2></div>
            ${st.count ? `<div class="list">${Object.keys(bySize).sort(sizeSort).map((size) => bySize[size].sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt)).map((u) => {
              const days = daysBetween(u.purchasedAt, today());
              return `<div class="row"><div style="width:52px" class="strong">${esc(u.size)}</div>
                <div class="grow"><div class="title">${money(u.cost)}</div><div class="meta">comprado ${fmtDate(u.purchasedAt)}${u.note ? ` · ${esc(u.note)}` : ''}</div></div>
                ${S.isStale(u) ? pill(`${days} días`, 'warn') : `<span class="muted small">${days} d</span>`}
                <button class="btn ghost icon-only sm" data-act="unit-edit" data-id="${u.id}" aria-label="Editar unidad">${icon('edit', 'sm')}</button>
              </div>`;
            }).join('')).join('')}</div>` : `<p class="muted small">No te queda ninguno. <a href="#" data-act="stock-add" data-id="${id}">Añadir stock</a></p>`}
          </div>
        </div>
        <div>
          ${interested.length ? `<div class="card" style="border-color:var(--accent-light)">
            <div class="card-head"><h2>Clientes que lo buscan</h2></div>
            <div class="list">${interested.map(({ client: c, wish: w, inStock }) => `<a class="row" href="#/cliente/${c.id}">${avatar(c)}
              <div class="grow"><div class="title">${esc(c.name)}</div><div class="meta">${esc(w.text)}${w.size ? ` · talla ${esc(w.size)}` : ''}</div></div>${inStock ? pill('tienes su talla', 'ok') : pill('sin su talla')}</a>`).join('')}</div>
          </div>` : ''}
          <div class="card">
            <div class="card-head"><h2>Datos</h2></div>
            <div class="list small">
              <div class="row"><span class="grow muted">Tipo</span><span>${p.type === 'ropa' ? 'Ropa' : 'Zapatillas'}</span></div>
              ${p.sku ? `<div class="row"><span class="grow muted">SKU</span><span>${esc(p.sku)}</span></div>` : ''}
              ${p.barcode ? `<div class="row"><span class="grow muted">Código de barras</span><span>${esc(p.barcode)}</span></div>` : ''}
              ${showMarket ? `<div class="row"><span class="grow muted">Referencia de mercado</span><span>${money(p.market)}</span></div>` : ''}
              ${p.notes ? `<div class="row"><span class="grow muted">Notas</span><span>${esc(p.notes)}</span></div>` : ''}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h2>Últimas ventas</h2><span class="muted small">${sold.length}</span></div>
            <div class="list">${sold.slice(0, 6).map((s) => saleRow(s)).join('') || '<p class="muted small">Sin ventas todavía.</p>'}</div>
          </div>
          <button class="btn danger block mt" data-act="product-delete" data-id="${id}">${icon('trash')} Borrar producto</button>
        </div>
      </div>`;
  },
};

// ---------- add stock sheet ----------
let as = null;
export function openAddStock(productId = null) {
  as = {
    productId, mode: productId ? 'existing' : S.state.products.length ? 'search' : 'new', q: '',
    np: { type: 'zapatilla', brand: '', model: '', sku: '', price: '', market: '', barcode: '' },
    sizes: '', costMode: 'unit', cost: '', date: today(), note: '', error: '',
  };
  openSheet(addStockSheet);
}

function addStockSheet() {
  const p = as.productId ? S.product(as.productId) : null;
  const isClothes = p ? p.type === 'ropa' : as.np.type === 'ropa';
  let productBlock;
  if (p) {
    productBlock = `<div class="row" style="border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;background:var(--card)">${productThumb(p, 'sm')}
      <div class="grow"><div class="title">${esc(S.productName(p))}</div><div class="meta">${esc(S.sizesLabel(S.productStock(p).sizes) || 'Sin stock')}</div></div>
      <button type="button" class="btn sm" data-act="as-change">Cambiar</button></div>`;
  } else if (as.mode === 'search') {
    const res = S.state.products.filter((x) => !as.q || matches(`${x.brand} ${x.model} ${x.sku || ''}`, as.q)).slice(0, 8);
    productBlock = `<div class="input-wrap">${icon('search')}<input class="input" id="as-q" data-input="as-q" placeholder="Busca un modelo que ya tengas" value="${esc(as.q)}" autocomplete="off" autofocus></div>
      <div class="search-results">${res.map((x) => `<div class="row click" data-act="as-pick" data-id="${x.id}">${productThumb(x, 'sm')}<div class="grow"><div class="title">${esc(S.productName(x))}</div><div class="meta">${esc(x.sku || '')}</div></div></div>`).join('')}
        <div class="row click" data-act="as-new"><div class="thumb sm">${icon('plus')}</div><div class="grow"><div class="title">${as.q ? `Producto nuevo «${esc(as.q)}»` : 'Producto nuevo'}</div></div></div></div>`;
  } else {
    const np = as.np;
    productBlock = `<div class="chips mb">${['zapatilla', 'ropa'].map((t) => `<button type="button" class="chip ${np.type === t ? 'on' : ''}" data-act="as-type" data-v="${t}">${t === 'ropa' ? 'Ropa' : 'Zapatillas'}</button>`).join('')}
      ${S.state.products.length ? '<button type="button" class="chip" data-act="as-search">Buscar existente</button>' : ''}</div>
      <div class="two"><div class="field"><label for="np-b">Marca</label><input class="input" id="np-b" data-input="as-np" data-k="brand" value="${esc(np.brand)}" placeholder="${np.type === 'ropa' ? 'Essentials' : 'Jordan'}" autofocus></div>
      <div class="field"><label for="np-m">Modelo</label><input class="input" id="np-m" data-input="as-np" data-k="model" value="${esc(np.model)}" placeholder="${np.type === 'ropa' ? 'Sudadera negra' : '4 Retro Bred'}"></div></div>
      <div class="two"><div class="field"><label for="np-p">Precio de venta</label><div class="input-wrap"><input class="input" id="np-p" inputmode="decimal" data-input="as-np" data-k="price" value="${esc(np.price)}" placeholder="0"><span class="suffix">€</span></div></div>
      <div class="field"><label for="np-s">SKU (opcional)</label><input class="input" id="np-s" data-input="as-np" data-k="sku" value="${esc(np.sku)}" placeholder="FV5029-006" autocapitalize="characters"></div></div>
      ${S.state.settings.showMarket ? `<div class="field"><label for="np-mk">Precio de mercado (opcional)</label><div class="input-wrap"><input class="input" id="np-mk" inputmode="decimal" data-input="as-np" data-k="market" value="${esc(np.market)}" placeholder="Lo que se paga en StockX, Vinted…"><span class="suffix">€</span></div><span class="hint">Solo como referencia para no vender barato.</span></div>` : ''}`;
  }

  const sizes = parseSizes(as.sizes);
  const perUnit = as.costMode === 'lot' ? (sizes.length ? toNum(as.cost) / sizes.length : 0) : toNum(as.cost);
  return `${sheetHead('Añadir stock')}
    <form data-submit="as-save" novalidate>
      <div class="field"><span class="label-t">Producto</span>${productBlock}</div>
      <div class="field"><label for="as-sizes">Tallas</label>
        <input class="input" id="as-sizes" data-input="as-sizes" value="${esc(as.sizes)}" placeholder="${isClothes ? 'S, M, Lx2, XL' : '41, 42, 43x2'}" autocomplete="off">
        <span class="hint" id="as-preview">${sizesPreview(sizes)}</span></div>
      <div class="field"><span class="label-t">Coste</span>
        <div class="chips mb">${[['unit', 'Por unidad'], ['lot', 'Total del lote']].map(([k, l]) => `<button type="button" class="chip ${as.costMode === k ? 'on' : ''}" data-act="as-costmode" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="input-wrap"><input class="input" id="as-cost" inputmode="decimal" data-input="as-cost" value="${esc(as.cost)}" placeholder="0"><span class="suffix">€</span></div>
        <span class="hint" id="as-cost-hint">${costHint(sizes, perUnit)}</span></div>
      <div class="two"><div class="field"><label for="as-date">Fecha de compra</label><input class="input" type="date" id="as-date" data-input="as-f" data-k="date" value="${as.date}"></div>
      <div class="field"><label for="as-note">Proveedor / nota</label><input class="input" id="as-note" data-input="as-f" data-k="note" value="${esc(as.note)}" placeholder="Opcional"></div></div>
      ${as.error ? `<p class="error mb">${esc(as.error)}</p>` : ''}
      <div class="sheet-foot"><button class="btn primary lg block" type="submit">${sizes.length ? `Añadir ${sizes.length} ${sizes.length === 1 ? 'unidad' : 'unidades'}` : 'Añadir'}</button></div>
    </form>`;
}
const sizesPreview = (sizes) => (sizes.length ? `${sizes.length} ${sizes.length === 1 ? 'unidad' : 'unidades'}: ${[...new Set(sizes)].sort(sizeSort).map((s) => { const n = sizes.filter((x) => x === s).length; return n > 1 ? `${s} ×${n}` : s; }).join(' · ')}` : 'Separa con comas. Usa «x2» si tienes varias de la misma talla.');
const costHint = (sizes, perUnit) => (as.costMode === 'lot' ? (sizes.length && toNum(as.cost) ? `= ${money(perUnit, true)} por unidad` : 'Se reparte entre todas las unidades.') : sizes.length > 1 && toNum(as.cost) ? `Total: ${money(toNum(as.cost) * sizes.length)}` : '');

function saveStock() {
  as.error = '';
  const sizes = parseSizes(as.sizes);
  let productId = as.productId;
  if (!productId && as.mode !== 'new') as.error = 'Elige el producto o crea uno nuevo.';
  else if (!productId && !(as.np.brand.trim() || as.np.model.trim())) as.error = 'Escribe la marca o el modelo.';
  else if (!sizes.length) as.error = 'Escribe al menos una talla.';
  if (as.error) { refreshSheet(true); return; }
  if (!productId) {
    const np = as.np;
    productId = S.saveProduct({ type: np.type, brand: np.brand.trim(), model: np.model.trim(), sku: np.sku.trim().toUpperCase(), price: toNum(np.price), market: toNum(np.market) || null, barcode: '', photos: [], notes: '' });
  }
  const perUnit = as.costMode === 'lot' ? toNum(as.cost) / sizes.length : toNum(as.cost);
  S.addUnits(productId, sizes, Math.round(perUnit * 100) / 100, as.date || today(), as.note.trim());
  toast(`${sizes.length} ${sizes.length === 1 ? 'unidad añadida' : 'unidades añadidas'}`);
  closeSheet(false, () => go(`#/producto/${productId}`));
}

// ---------- product edit ----------
function editProductSheet(id) {
  const p = S.product(id);
  return `${sheetHead('Editar producto')}
    <form data-submit="product-save" data-id="${id}">
      <div class="field"><span class="label-t">Tipo</span><select class="input" name="type"><option value="zapatilla" ${p.type !== 'ropa' ? 'selected' : ''}>Zapatillas</option><option value="ropa" ${p.type === 'ropa' ? 'selected' : ''}>Ropa</option></select></div>
      <div class="two"><div class="field"><label>Marca</label><input class="input" name="brand" value="${esc(p.brand)}"></div>
      <div class="field"><label>Modelo</label><input class="input" name="model" value="${esc(p.model)}"></div></div>
      <div class="two"><div class="field"><label>Precio de venta</label><input class="input" name="price" inputmode="decimal" value="${p.price || ''}"></div>
      <div class="field"><label>Precio de mercado</label><input class="input" name="market" inputmode="decimal" value="${p.market || ''}" placeholder="Opcional"></div></div>
      <div class="two"><div class="field"><label>SKU</label><input class="input" name="sku" value="${esc(p.sku || '')}"></div>
      <div class="field"><label>Código de barras</label><input class="input" name="barcode" value="${esc(p.barcode || '')}" inputmode="numeric" placeholder="Para el escáner"></div></div>
      <div class="field"><label>Notas</label><textarea class="input" name="notes">${esc(p.notes || '')}</textarea></div>
      <div class="sheet-foot"><button class="btn primary lg block" type="submit">Guardar</button></div>
    </form>`;
}

function editUnitSheet(id) {
  const u = S.unit(id);
  return `${sheetHead(`Unidad · talla ${u.size}`)}
    <form data-submit="unit-save" data-id="${id}">
      <div class="two"><div class="field"><label>Talla</label><input class="input" name="size" value="${esc(u.size)}"></div>
      <div class="field"><label>Coste</label><input class="input" name="cost" inputmode="decimal" value="${u.cost}"></div></div>
      <div class="field"><label>Fecha de compra</label><input class="input" type="date" name="purchasedAt" value="${u.purchasedAt}"></div>
      <div class="field"><label>Proveedor / nota</label><input class="input" name="note" value="${esc(u.note || '')}"></div>
      <div class="btn-row"><button class="btn primary lg" type="submit">Guardar</button>
      <button class="btn danger lg" type="button" data-act="unit-delete" data-id="${id}">${icon('trash')} Quitar</button></div>
    </form>`;
}

registerActions({
  'stock-q': (el) => { f.q = el.value; rerender(); },
  'stock-filter': (el) => {
    f.filter = el.dataset.v;
    lastQueryF = f.filter;
    if (location.hash.includes('?')) history.replaceState(history.state, '', '#/stock');
    rerender();
  },
  'stock-add': (el) => openAddStock(el.dataset.id || null),
  'as-q': (el) => { as.q = el.value; refreshSheet(true); },
  'as-pick': (el) => { as.productId = el.dataset.id; as.mode = 'existing'; refreshSheet(true); setTimeout(() => document.getElementById('as-sizes')?.focus(), 0); },
  'as-new': () => {
    const [b, ...rest] = as.q.trim().split(/\s+/);
    if (as.q.trim()) { as.np.brand = b; as.np.model = rest.join(' '); }
    as.mode = 'new'; refreshSheet(true);
  },
  'as-search': () => { as.mode = 'search'; refreshSheet(true); },
  'as-change': () => { as.productId = null; as.mode = 'search'; refreshSheet(true); },
  'as-type': (el) => { as.np.type = el.dataset.v; refreshSheet(true); },
  'as-np': (el) => { as.np[el.dataset.k] = el.value; },
  'as-f': (el) => { as[el.dataset.k] = el.value; },
  'as-sizes': (el) => {
    as.sizes = el.value;
    const sizes = parseSizes(as.sizes);
    document.getElementById('as-preview').textContent = sizesPreview(sizes);
    document.getElementById('as-cost-hint').textContent = costHint(sizes, as.costMode === 'lot' ? toNum(as.cost) / (sizes.length || 1) : toNum(as.cost));
    const btn = el.closest('form').querySelector('[type=submit]');
    btn.textContent = sizes.length ? `Añadir ${sizes.length} ${sizes.length === 1 ? 'unidad' : 'unidades'}` : 'Añadir';
  },
  'as-cost': (el) => {
    as.cost = el.value;
    const sizes = parseSizes(as.sizes);
    document.getElementById('as-cost-hint').textContent = costHint(sizes, as.costMode === 'lot' ? toNum(as.cost) / (sizes.length || 1) : toNum(as.cost));
  },
  'as-costmode': (el) => { as.costMode = el.dataset.v; refreshSheet(true); },
  'as-save': () => saveStock(),
  'product-edit': (el) => openSheet(() => editProductSheet(el.dataset.id)),
  'product-save': (form) => {
    const d = Object.fromEntries(new FormData(form).entries());
    S.saveProduct({ id: form.dataset.id, type: d.type, brand: d.brand.trim(), model: d.model.trim(), price: toNum(d.price), market: toNum(d.market) || null, sku: d.sku.trim().toUpperCase(), barcode: d.barcode.trim(), notes: d.notes.trim() });
    closeSheet();
    toast('Producto guardado');
  },
  'product-delete': (el) => {
    const p = S.product(el.dataset.id);
    const n = S.productStock(p).count;
    const sold = S.state.sales.some((s) => s.productId === p.id);
    if (sold && !confirm(`${S.productName(p)} tiene ventas. Si lo borras, esas ventas aparecerán como «Producto borrado». ¿Seguir?`)) return;
    if (!sold && n && !confirm(`Se borrarán también ${n} unidades en stock. ¿Seguir?`)) return;
    go('#/stock');
    withUndo('Producto borrado', () => S.deleteProduct(p.id));
  },
  'photo-add': async (el) => {
    const file = el.files?.[0];
    if (!file) return;
    try {
      const data = await compressImage(file);
      const p = S.product(el.dataset.id);
      S.saveProduct({ id: p.id, photos: [...(p.photos || []), data].slice(0, 6) });
    } catch { toast('No se ha podido leer la foto'); }
  },
  'photo-del': (el) => {
    const p = S.product(el.dataset.id);
    withUndo('Foto quitada', () => S.saveProduct({ id: p.id, photos: p.photos.filter((_, i) => i !== Number(el.dataset.i)) }));
  },
  'product-share': (el) => shareProductCard(el.dataset.id),
  'unit-edit': (el) => openSheet(() => editUnitSheet(el.dataset.id)),
  'unit-save': (form) => {
    const d = Object.fromEntries(new FormData(form).entries());
    S.editUnit(form.dataset.id, { size: d.size.trim().toUpperCase(), cost: toNum(d.cost), purchasedAt: d.purchasedAt, note: d.note.trim() });
    closeSheet();
    toast('Unidad actualizada');
  },
  'unit-delete': (el) => {
    closeSheet();
    withUndo('Unidad quitada del stock', () => S.deleteUnit(el.dataset.id));
  },
});
