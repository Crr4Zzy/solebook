// New sale in two steps: 1) pick what you sold, 2) size, client, channel, price and payment.
import { esc, icon, money, signed, today, addDays, toNum, matches, waLink, fmtDate, sizeSort, parseSizes } from '../util.js';
import * as S from '../store.js';
import { registerActions, productThumb, avatar, pill, goThen, rerender, toast, marginText } from '../ui.js';
import { openClientForm, openSale, receiptText } from '../sheets.js';
import { startScanner, stopScanner, scannerSupported } from '../scanner.js';
import { registerPicker, pickerHTML, searchPicker, resetPicker, catalogSizes } from '../catalog.js';

function pickFromCatalog(it) {
  const existing = it.sku && S.state.products.find((x) => (x.sku || '').toUpperCase() === it.sku);
  if (existing) { chooseProduct(existing.id); rerender(); return; }
  let model = it.model || it.title;
  if (it.brand && model.toLowerCase().startsWith(it.brand.toLowerCase())) model = model.slice(it.brand.length).trim();
  d.productId = null; d.unitId = null; d.size = ''; d.cost = ''; d.picks = {};
  d.newProduct = { type: it.type, brand: it.brand, model, sku: it.sku, image: it.image, stockxSlug: it.slug };
  d.step = 2; d.catSizes = null;
  rerender();
  window.scrollTo(0, 0);
  catalogSizes(it.slug).then((sizes) => { if (d?.newProduct?.stockxSlug === it.slug) { d.catSizes = sizes; rerender(); } }).catch(() => {});
}

let d = null;

const fresh = (query = {}) => {
  const st = S.state.settings;
  d = {
    step: 1, q: '', productId: null, newProduct: null, size: '', unitId: null, picks: {},
    clientId: query.cliente || null, clientQ: '', channel: 'directo',
    price: '', cost: '', fees: 0, feesTouched: false, shippingCost: '',
    method: st.methods[0] || 'Bizum', pay: 'full', deposit: '',
    delivery: 'entregado', reservedUntil: addDays(today(), st.reserveDays || 3),
    date: today(), notes: '', scanning: !!query.scan && scannerSupported(), error: '',
  };
  if (query.producto && S.product(query.producto)) chooseProduct(query.producto);
};

function chooseProduct(id) {
  const p = S.product(id);
  d.productId = id;
  d.newProduct = null;
  d.step = 2;
  d.price = p.price || '';
  d.size = '';
  d.unitId = null;
  d.cost = '';
  d.picks = {};
  const sizes = S.productStock(p).sizes;
  if (sizes.length === 1) d.picks[sizes[0].size] = 1;
  syncPicks();
  recalcFees();
}

// Sizes and quantities ticked in the grid (only when the product is in stock). The oldest units go first.
const stockMode = () => !!(d.productId && S.availableUnits(d.productId).length);
function pickedUnits() {
  if (!stockMode()) return [];
  const avail = S.availableUnits(d.productId);
  return Object.keys(d.picks).sort(sizeSort).flatMap((size) => avail.filter((u) => u.size === size).sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt)).slice(0, d.picks[size]));
}
// One unit picked: behaves like a single sale (cost editable). Several: each unit keeps its own cost.
function syncPicks() {
  const units = pickedUnits();
  if (units.length === 1) { d.size = units[0].size; d.unitId = units[0].id; d.cost = units[0].cost; }
  else { d.size = ''; d.unitId = null; d.cost = ''; }
}
// Without stock the sizes are typed (or tapped in the grid) as text like "42, 43x2": one sale per unit.
const typedSizes = () => (stockMode() ? [] : parseSizes(d.size));
const pickedCount = () => (stockMode() ? pickedUnits().length : Math.max(1, typedSizes().length));
const compactSizes = (counts) => Object.keys(counts).sort(sizeSort).map((s) => (counts[s] > 1 ? `${s}x${counts[s]}` : s)).join(', ');
const SHOE_SIZES = Array.from({ length: 12 }, (_, i) => String(36 + i));
const CLOTHES_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const unitWord = (n, clothes) => (clothes ? (n === 1 ? 'ud' : 'uds') : n === 1 ? 'par' : 'pares');

function recalcFees() {
  if (!d.feesTouched) d.fees = S.calcFees(d.channel, toNum(d.price));
}

export const title = () => 'Nueva venta';

export function render({ query, fresh: isFresh }) {
  if (isFresh || !d) { fresh(query); resetPicker('sell'); }
  registerPicker('sell', { onPick: pickFromCatalog, refresh: rerender });
  return `<div class="sell-wrap">${d.step === 1 ? step1() : step2()}</div>`;
}

export function mount(root) {
  if (d.step === 1 && d.scanning) {
    const video = root.querySelector('#scan-video');
    if (video) startScanner(video, onScan, (msg) => { d.scanning = false; toast(msg); rerender(); });
  } else stopScanner();
}

function onScan(code) {
  const c = String(code).trim().toUpperCase();
  const p = S.state.products.find((x) => [x.barcode, x.sku].filter(Boolean).some((v) => String(v).trim().toUpperCase() === c));
  d.scanning = false;
  stopScanner();
  if (p) { chooseProduct(p.id); toast(`Encontrado: ${S.productName(p)}`); }
  else { d.q = c; toast('No tienes ese código guardado. Búscalo por nombre.'); }
  rerender();
}

const head = (stepN) => `
  <div class="page-head">
    ${stepN === 1 ? `<a class="back" href="#/" aria-label="Cancelar">${icon('x')}</a>` : `<button class="back btn ghost icon-only" data-act="sell-back" aria-label="Atrás">${icon('chevL')}</button>`}
    <h1>Nueva venta</h1><span class="muted small">Paso ${stepN} de 2</span>
  </div>
  <div class="steps"><span class="on"></span><span class="${stepN === 2 ? 'on' : ''}"></span></div>`;

function step1() {
  const prods = S.state.products.map((p) => ({ p, stock: S.productStock(p) }));
  const q = d.q.trim();
  const hits = prods.filter(({ p }) => !q || matches(`${p.brand} ${p.model} ${p.sku || ''} ${p.barcode || ''}`, q));
  const inStock = hits.filter((x) => x.stock.count).sort((a, b) => {
    const la = a.stock.units.reduce((m, u) => (u.purchasedAt > m ? u.purchasedAt : m), '');
    const lb = b.stock.units.reduce((m, u) => (u.purchasedAt > m ? u.purchasedAt : m), '');
    return lb.localeCompare(la);
  });
  const noStock = q ? hits.filter((x) => !x.stock.count) : [];
  const row = ({ p, stock }) => `<div class="row click" data-act="sell-product" data-id="${p.id}">${productThumb(p)}
      <div class="grow"><div class="title">${esc(S.productName(p))}</div><div class="meta">${stock.count ? `${stock.count} ${p.type === 'ropa' ? 'uds' : stock.count === 1 ? 'par' : 'pares'} · ${esc(S.sizesLabel(stock.sizes))}` : 'Sin stock'}</div></div>
      <div class="end"><div class="small strong">${p.price ? money(p.price) : ''}</div></div>${icon('chevR', 'chev')}</div>`;

  return `${head(1)}
    ${d.scanning ? `<div class="scanner"><video id="scan-video" playsinline muted></video><div class="frame"></div></div>
      <button class="btn block mb" data-act="sell-scan-stop">${icon('x')} Cerrar cámara</button>` : ''}
    <div class="btn-row mb" style="flex-wrap:nowrap">
      <div class="input-wrap" style="flex:1">${icon('search')}<input class="input" id="sell-q" data-search data-input="sell-q" placeholder="¿Qué has vendido? Modelo o SKU" value="${esc(d.q)}" autocomplete="off" ${d.scanning ? '' : 'autofocus'}></div>
      ${scannerSupported() && !d.scanning ? `<button class="btn icon-only" style="flex:none;min-height:44px;width:44px" data-act="sell-scan" aria-label="Escanear código">${icon('barcode')}</button>` : ''}
    </div>
    <div class="card">
      <h3 class="mb">${q ? 'En tu stock' : 'Tu stock'}</h3>
      <div class="list">${inStock.map(row).join('') || `<p class="muted small" style="padding:8px 0">${q ? 'No tienes nada en stock con ese nombre.' : 'Todavía no tienes stock. Puedes registrar la venta igualmente.'}</p>`}</div>
      ${noStock.length ? `<h3 class="mt-lg mb">Sin stock</h3><div class="list">${noStock.map(row).join('')}</div>` : ''}
    ${q ? pickerHTML('sell', { withInput: false, title: 'En StockX (venta sin stock)' }) : ''}
    </div>
    <div class="card mt">
      <div class="row" style="border:none;padding:0">
        <div class="grow"><div class="title">¿No lo tienes en el inventario?</div><div class="meta">Registra la venta igual y se crea el producto.</div></div>
        <button class="btn" data-act="sell-new-product">${icon('plus')} Venta rápida</button>
      </div>
    </div>`;
}

function step2() {
  const st = S.state.settings;
  const p = d.productId ? S.product(d.productId) : null;
  const np = d.newProduct;
  const stock = p ? S.productStock(p) : { sizes: [], count: 0 };
  const c = S.client(d.clientId);
  const ch = S.channel(d.channel);
  const isClothes = (p?.type || np?.type) === 'ropa';
  const nUnits = pickedCount();
  const multi = nUnits > 1;

  // sizes: only those in stock, with how many you have
  let sizeBlock;
  const nPick = nUnits;
  if (p && stock.count) {
    sizeBlock = `<div class="qty-grid">${stock.sizes.map((s) => {
      const n = d.picks[s.size] || 0;
      return `<div class="qty-cell ${n ? 'on' : ''}"><button type="button" class="qty-size" data-act="sell-pick-inc" data-v="${esc(s.size)}" aria-label="Sumar una de la talla ${esc(s.size)}">${esc(s.size)}</button>
        <span class="qty-av">hay ${s.n}</span>
        <div class="qty-ctl"><button type="button" class="qty-b" data-act="sell-pick-dec" data-v="${esc(s.size)}" ${n ? '' : 'disabled'} aria-label="Quitar una de la talla ${esc(s.size)}">−</button><b>${n}</b><button type="button" class="qty-b" data-act="sell-pick-inc" data-v="${esc(s.size)}" ${n >= s.n ? 'disabled' : ''} aria-label="Sumar una de la talla ${esc(s.size)}">+</button></div></div>`;
    }).join('')}</div>
      <p class="hint tiny muted mt">Toca una talla o el + para sumar. Solo aparecen las tallas que tienes.${nPick > 1 ? ` <b>${nPick} ${unitWord(nPick, isClothes)} en esta venta</b>: se guardan como ${nPick} ventas, cada una con su coste.` : d.unitId ? ` Coste de esta unidad: ${money(S.unit(d.unitId)?.cost)}.` : ''}</p>`;
  } else {
    const counts = typedSizes().reduce((o, s) => { o[s] = (o[s] || 0) + 1; return o; }, {});
    const base = d.catSizes?.length ? d.catSizes : isClothes ? CLOTHES_SIZES : SHOE_SIZES;
    const all = [...new Set([...base.map((s) => String(s).toUpperCase()), ...Object.keys(counts)])].sort(sizeSort);
    sizeBlock = `<div class="qty-grid">${all.map((sz) => {
      const n = counts[sz] || 0;
      return `<div class="qty-cell ${n ? 'on' : ''}"><button type="button" class="qty-size" data-act="sell-pick-inc" data-v="${esc(sz)}" aria-label="Sumar una de la talla ${esc(sz)}">${esc(sz)}</button>
        <div class="qty-ctl"><button type="button" class="qty-b" data-act="sell-pick-dec" data-v="${esc(sz)}" ${n ? '' : 'disabled'} aria-label="Quitar una de la talla ${esc(sz)}">−</button><b>${n}</b><button type="button" class="qty-b" data-act="sell-pick-inc" data-v="${esc(sz)}" aria-label="Sumar una de la talla ${esc(sz)}">+</button></div></div>`;
    }).join('')}</div>
      <label class="tiny muted mt" for="sell-size" style="display:block">¿Falta alguna talla? Escríbela aquí (por ejemplo: 42, 43x2):</label>
      <input class="input" id="sell-size" data-input="sell-field" data-k="size" value="${esc(d.size)}" placeholder="${isClothes ? 'M, Lx2' : '42, 43x2'}" autocomplete="off">
      <p class="tiny muted mt">${nPick > 1 ? `<b>${nPick} ${unitWord(nPick, isClothes)} en esta venta</b>: se guardan como ${nPick} ventas.` : ''} No hay stock de este producto: toca las tallas y pon abajo lo que te costó <b>cada una</b>.</p>`;
  }

  // client picker
  let clientBlock;
  if (c) {
    const wants = (c.wishes || []).some((w) => p && matches(`${p.brand} ${p.model} ${p.sku || ''}`, w.text));
    clientBlock = `<div class="row" style="border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;background:var(--card)">${avatar(c)}
      <div class="grow"><div class="title">${esc(c.name)}</div><div class="meta">${esc([S.clientStats(c.id).count + ' compras', c.sizes && `talla ${c.sizes}`].filter(Boolean).join(' · '))}</div></div>
      <button type="button" class="btn sm" data-act="sell-client-clear">Cambiar</button></div>
      ${wants ? `<p class="tiny ok-text mt">${icon('heart', 'sm')} Lo tenía apuntado en su lista: se quitará al guardar.</p>` : ''}`;
  } else {
    const q = d.clientQ.trim();
    const res = q ? S.state.clients.filter((x) => matches(`${x.name} ${x.phone || ''} ${x.instagram || ''}`, q)).slice(0, 6) : S.state.clients.slice().sort((a, b) => (S.clientStats(b.id).last || '').localeCompare(S.clientStats(a.id).last || '')).slice(0, 4);
    clientBlock = `<div class="input-wrap">${icon('user')}<input class="input" id="sell-client-q" data-input="sell-client-q" placeholder="Buscar cliente (opcional)" value="${esc(d.clientQ)}" autocomplete="off"></div>
      <div class="search-results">${res.map((x) => `<div class="row click" data-act="sell-client" data-id="${x.id}">${avatar(x, 'sm')}<div class="grow"><div class="title">${esc(x.name)}</div><div class="meta">${esc(x.phone || x.instagram || '')}</div></div></div>`).join('')}
        <div class="row click" data-act="sell-client-new"><div class="avatar">${icon('userPlus', 'sm')}</div><div class="grow"><div class="title">${q ? `Nuevo cliente «${esc(q)}»` : 'Nuevo cliente'}</div></div></div></div>`;
  }

  const chans = st.channels.filter((x) => !x.platform);
  const plats = st.channels.filter((x) => x.platform);
  const showFees = toNum(ch.feePct) || toNum(ch.feeFixed) || toNum(d.fees);
  const priceHint = [p?.price ? `Tu precio: ${money(p.price)}` : '', st.showMarket && p?.market ? `mercado ≈ ${money(p.market)}` : ''].filter(Boolean).join(' · ');

  return `${head(2)}
    <form data-submit="sell-save" novalidate>
    <div class="card">
      <div class="row" style="border:none;padding:0 0 4px">${productThumb(p || { type: np?.type, image: np?.image })}
        <div class="grow"><div class="title">${p ? esc(S.productName(p)) : np?.image ? esc(`${np.brand} ${np.model}`) : 'Producto nuevo'}</div><div class="meta">${p ? esc(p.sku || (p.type === 'ropa' ? 'Ropa' : 'Zapatillas')) : np?.image ? `De StockX · ${esc(np.sku)} · se añadirá a tu catálogo` : 'Se añadirá a tu catálogo'}</div></div>
        <button type="button" class="btn sm" data-act="sell-back">Cambiar</button></div>
      ${np ? `<div class="chips mt">${['zapatilla', 'ropa'].map((t) => `<button type="button" class="chip ${np.type === t ? 'on' : ''}" data-act="sell-np-type" data-v="${t}">${t === 'ropa' ? 'Ropa' : 'Zapatillas'}</button>`).join('')}</div>
        <div class="two mt"><div class="field" style="margin:0"><label for="np-brand">Marca</label><input class="input" id="np-brand" data-input="sell-np" data-k="brand" value="${esc(np.brand)}" placeholder="Nike"></div>
        <div class="field" style="margin:0"><label for="np-model">Modelo</label><input class="input" id="np-model" data-input="sell-np" data-k="model" value="${esc(np.model)}" placeholder="Dunk Low Panda"></div></div>` : ''}
    </div>

    <div class="card mt">
      <div class="field"><span class="label-t">Talla</span>${sizeBlock}</div>
      <div class="field" style="margin-bottom:0"><span class="label-t">Cliente</span>${clientBlock}</div>
    </div>

    <div class="card mt">
      <div class="field"><span class="label-t">Dónde lo has vendido</span>
        <div class="chips">${chans.map((x) => `<button type="button" class="chip ${d.channel === x.id ? 'on' : ''}" data-act="sell-channel" data-v="${x.id}">${esc(x.name)}</button>`).join('')}
        ${plats.map((x) => `<button type="button" class="chip ${d.channel === x.id ? 'on' : ''}" data-act="sell-channel" data-v="${x.id}">${esc(x.name)}</button>`).join('')}</div></div>
      <div class="two">
        <div class="field"><label for="sell-price">${multi ? 'Precio por unidad' : 'Precio de venta'}</label><div class="input-wrap"><input class="input" id="sell-price" inputmode="decimal" data-input="sell-field" data-k="price" value="${esc(d.price)}" placeholder="0"><span class="suffix">€</span></div>${priceHint ? `<span class="hint">${esc(priceHint)}</span>` : ''}</div>
        <div class="field"><label for="sell-cost">${multi ? (stockMode() ? 'Lo que te costaron' : 'Lo que te costó cada una') : 'Lo que te costó'}</label>${multi && stockMode() ? `<div class="input-wrap"><input class="input" id="sell-cost" value="${esc(money(pickedUnits().reduce((a, u) => a + toNum(u.cost), 0), true))}" disabled></div><span class="hint">Suma del coste de cada unidad.</span>`
          : `<div class="input-wrap"><input class="input" id="sell-cost" inputmode="decimal" data-input="sell-field" data-k="cost" value="${esc(d.cost)}" placeholder="0"><span class="suffix">€</span></div>`}</div>
      </div>
      ${showFees ? `<div class="field"><label for="sell-fees">Comisión ${esc(ch.name)}${multi ? ' (por unidad)' : ''}</label><div class="input-wrap"><input class="input" id="sell-fees" inputmode="decimal" data-input="sell-fees" value="${esc(d.fees)}"><span class="suffix">€</span></div><span class="hint">${toNum(ch.feePct)}%${toNum(ch.feeFixed) ? ` + ${money(ch.feeFixed)}` : ''}. Cámbiala en Ajustes si no es correcta.</span></div>` : ''}
    </div>

    <div class="card mt">
      <div class="field"><span class="label-t">Cómo te paga</span>
        <div class="chips">${st.methods.map((m) => `<button type="button" class="chip ${d.method === m ? 'on' : ''}" data-act="sell-method" data-v="${esc(m)}">${esc(m)}</button>`).join('')}</div></div>
      <div class="field"><span class="label-t">Cobro</span>
        <div class="chips">${[['full', 'Pagado todo'], ['deposit', 'Señal'], ['none', 'Sin cobrar']].map(([k, l]) => `<button type="button" class="chip ${d.pay === k ? 'on' : ''}" data-act="sell-pay" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${d.pay === 'deposit' ? `<div class="field"><label for="sell-deposit">Señal recibida</label><div class="input-wrap"><input class="input" id="sell-deposit" inputmode="decimal" data-input="sell-field" data-k="deposit" value="${esc(d.deposit)}" placeholder="0" autofocus><span class="suffix">€</span></div></div>` : ''}
      <div class="field" style="margin-bottom:${d.delivery === 'reservado' ? '14px' : '0'}"><span class="label-t">Entrega</span>
        <div class="chips">${[['entregado', 'Entregado'], ['por_enviar', 'Por enviar'], ['reservado', 'Reservado']].map(([k, l]) => `<button type="button" class="chip ${d.delivery === k ? 'on' : ''}" data-act="sell-delivery" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${d.delivery === 'reservado' ? `<div class="field" style="margin:0"><label for="sell-res">Se lo guardas hasta</label><input class="input" type="date" id="sell-res" data-input="sell-field" data-k="reservedUntil" value="${d.reservedUntil}"></div>` : ''}
    </div>

    <details class="card mt" ${d.moreOpen || d.notes || toNum(d.shippingCost) || d.date !== today() ? 'open' : ''}>
      <summary class="strong" style="cursor:pointer" data-act="sell-more">Más opciones</summary>
      <div class="two mt"><div class="field"><label for="sell-date">Fecha</label><input class="input" type="date" id="sell-date" data-input="sell-field" data-k="date" value="${d.date}"></div>
      <div class="field"><label for="sell-ship">Envío pagado por ti</label><div class="input-wrap"><input class="input" id="sell-ship" inputmode="decimal" data-input="sell-field" data-k="shippingCost" value="${esc(d.shippingCost)}" placeholder="0"><span class="suffix">€</span></div>${multi ? '<span class="hint">De todo el pedido; se apunta en la primera venta.</span>' : ''}</div></div>
      <div class="field" style="margin:0"><label for="sell-notes">Notas</label><textarea class="input" id="sell-notes" data-input="sell-field" data-k="notes" placeholder="Viene a recoger el sábado…">${esc(d.notes)}</textarea></div>
    </details>

    <div id="sell-summary" class="mt">${summary()}</div>
    ${d.error ? `<p class="error mt">${esc(d.error)}</p>` : ''}
    <div class="sell-foot">
      <div class="btn-row" style="flex-wrap:nowrap">
        <button class="btn primary lg" type="submit" style="flex:1">${multi ? `Guardar ${nUnits} ventas` : 'Guardar venta'}</button>
        ${c?.phone ? `<button type="button" class="btn lg wa" style="flex:none" data-act="sell-save-wa" title="Guardar y enviar recibo por WhatsApp">${icon('wa')}<span class="desk-only">Guardar y enviar recibo</span></button>` : ''}
      </div>
    </div>
    </form>`;
}

function summary() {
  const price = toNum(d.price);
  const n = pickedCount();
  const total = price * n;
  const cost = stockMode() ? (n > 1 ? pickedUnits().reduce((a, u) => a + toNum(u.cost), 0) : toNum(d.cost)) : toNum(d.cost) * n;
  const net = total - toNum(d.fees) * n - toNum(d.shippingCost) - cost;
  const paid = d.pay === 'full' ? total : d.pay === 'deposit' ? Math.min(toNum(d.deposit), total) : 0;
  const owed = Math.max(0, total - paid);
  if (!price) return '';
  return `${n > 1 ? `<div class="owed-box mb" style="background:var(--card);border:1px solid var(--border)"><span>${n} unidades × ${money(price, true)}</span><span>${money(total, true)}</span></div>` : ''}<div class="net-box ${net < 0 ? 'neg' : ''}"><span>Beneficio neto</span><span>${signed(net, true)} · ${marginText(net, total)}</span></div>
    ${owed > 0 ? `<div class="owed-box mt"><span>Quedará por cobrar</span><span>${money(owed, true)}</span></div>` : ''}`;
}
const refreshSummary = () => {
  const el = document.getElementById('sell-summary');
  if (el) el.innerHTML = summary();
};

function save() {
  d.error = '';
  const price = toNum(d.price);
  const p = d.productId ? S.product(d.productId) : null;
  if (d.newProduct && !(d.newProduct.brand.trim() || d.newProduct.model.trim())) d.error = 'Escribe la marca o el modelo.';
  else if (stockMode() ? !pickedUnits().length : !typedSizes().length) d.error = 'Elige la talla.';
  else if (price <= 0) d.error = 'Pon el precio de venta.';
  else if (d.pay === 'deposit' && toNum(d.deposit) <= 0) d.error = 'Escribe cuánto te ha dado de señal.';
  if (d.error) { rerender(); return null; }

  let productId = d.productId;
  if (d.newProduct) productId = S.saveProduct({ type: d.newProduct.type, brand: d.newProduct.brand.trim(), model: d.newProduct.model.trim(), price, sku: d.newProduct.sku || '', photos: [], image: d.newProduct.image || '', stockxSlug: d.newProduct.stockxSlug || '' });

  // Several sizes/quantities at once: one sale per unit, same client, channel, date and payment method.
  const units = pickedUnits();
  const typed = typedSizes();
  const lines = units.length > 1 ? units.map((u) => ({ unitId: u.id, size: u.size, cost: toNum(u.cost) }))
    : typed.length > 1 ? typed.map((size) => ({ unitId: null, size, cost: toNum(d.cost) })) : null;
  if (lines) {
    let depositLeft = d.pay === 'deposit' ? toNum(d.deposit) : 0;
    const sales = lines.map((ln, i) => {
      const paid = d.pay === 'full' ? price : d.pay === 'deposit' ? Math.min(depositLeft, price) : 0;
      depositLeft -= d.pay === 'deposit' ? paid : 0;
      return S.createSale({
        productId, unitId: ln.unitId, size: ln.size, clientId: d.clientId, channel: d.channel,
        price, cost: ln.cost, fees: toNum(d.fees), shippingCost: i === 0 ? toNum(d.shippingCost) : 0,
        payments: paid ? [{ amount: paid, method: d.method, date: d.date }] : [], method: d.method,
        delivery: d.delivery, reservedUntil: d.reservedUntil, date: d.date || today(), notes: d.notes.trim(),
      });
    });
    const c = S.client(d.clientId);
    const prod = S.product(productId);
    (c?.wishes || []).filter((w) => matches(`${prod.brand} ${prod.model} ${prod.sku || ''}`, w.text)).forEach((w) => S.removeWish(c.id, w.id));
    d = null;
    toast(`${sales.length} ventas guardadas`);
    goThen('#/ventas', () => {});
    return sales;
  }

  const paid = d.pay === 'full' ? price : d.pay === 'deposit' ? toNum(d.deposit) : 0;
  const s = S.createSale({
    productId, unitId: d.unitId, size: typed.length === 1 ? typed[0] : String(d.size).trim().toUpperCase(), clientId: d.clientId, channel: d.channel,
    price, cost: toNum(d.cost), fees: toNum(d.fees), shippingCost: toNum(d.shippingCost),
    payments: paid ? [{ amount: paid, method: d.method, date: d.date }] : [], method: d.method,
    delivery: d.delivery, reservedUntil: d.reservedUntil, date: d.date || today(), notes: d.notes.trim(),
  });
  // remove the wish that this sale fulfils
  const c = S.client(d.clientId);
  const prod = S.product(productId);
  (c?.wishes || []).filter((w) => matches(`${prod.brand} ${prod.model} ${prod.sku || ''}`, w.text)).forEach((w) => S.removeWish(c.id, w.id));
  d = null;
  toast('Venta guardada');
  goThen('#/ventas', () => openSale(s.id));
  return [s];
}

// One WhatsApp receipt for an order of several units.
function multiReceipt(sales) {
  const st = S.state.settings;
  const p = S.product(sales[0].productId);
  const bySize = {};
  sales.forEach((s) => { bySize[s.size] = (bySize[s.size] || 0) + 1; });
  const total = sales.reduce((a, s) => a + s.price, 0);
  const paid = sales.reduce((a, s) => a + S.salePaid(s), 0);
  const owed = sales.reduce((a, s) => a + S.saleOwed(s), 0);
  return [
    `*${st.businessName}*`, `Recibo · ${fmtDate(sales[0].date, true)}`, '',
    S.productName(p),
    ...Object.keys(bySize).sort(sizeSort).map((size) => `· talla ${size}${bySize[size] > 1 ? ` ×${bySize[size]}` : ''} · ${money(sales[0].price)} c/u`),
    `Total: ${money(total)}`, `Pagado: ${money(paid)}`, owed > 0 ? `Pendiente: ${money(owed)}` : '',
    '', st.receiptFooter || '',
  ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n').trim();
}

function pickSize(size, delta) {
  if (!stockMode()) {
    // No stock: the sizes live in the typed text ("42, 43x2"); the grid just rewrites it.
    const counts = typedSizes().reduce((o, s) => { o[s] = (o[s] || 0) + 1; return o; }, {});
    const n = Math.max(0, Math.min(99, (counts[size] || 0) + delta));
    if (n) counts[size] = n; else delete counts[size];
    d.size = compactSizes(counts);
    d.error = '';
    rerender();
    return;
  }
  const have = S.availableUnits(d.productId).filter((u) => u.size === size).length;
  const n = Math.max(0, Math.min(have, (d.picks[size] || 0) + delta));
  if (n) d.picks[size] = n; else delete d.picks[size];
  syncPicks();
  d.error = '';
  rerender();
}

registerActions({
  'sell-q': (el) => { d.q = el.value; searchPicker('sell', el.value); rerender(); },
  'sell-scan': () => { d.scanning = true; rerender(); },
  'sell-scan-stop': () => { d.scanning = false; stopScanner(); rerender(); },
  'sell-product': (el) => { stopScanner(); d.scanning = false; chooseProduct(el.dataset.id); rerender(); window.scrollTo(0, 0); },
  'sell-new-product': () => {
    d.productId = null; d.unitId = null; d.size = ''; d.cost = ''; d.picks = {};
    const q = d.q.trim();
    const [brand, ...rest] = q.split(/\s+/);
    d.newProduct = { type: 'zapatilla', brand: q ? brand : '', model: rest.join(' ') };
    d.step = 2;
    rerender();
  },
  'sell-np-type': (el) => { d.newProduct.type = el.dataset.v; rerender(); },
  'sell-np': (el) => { d.newProduct[el.dataset.k] = el.value; },
  'sell-back': () => { d.step = 1; d.error = ''; rerender(); },
  'sell-catsize': (el) => { d.size = el.dataset.v; d.error = ''; rerender(); },
  'sell-pick-inc': (el) => pickSize(el.dataset.v, 1),
  'sell-pick-dec': (el) => pickSize(el.dataset.v, -1),
  'sell-field': (el) => {
    d[el.dataset.k] = el.value;
    if (el.dataset.k === 'price') recalcFees();
    if (el.dataset.k === 'price' && document.getElementById('sell-fees')) document.getElementById('sell-fees').value = d.fees;
    if (el.dataset.k === 'size') {
      const n = pickedCount();
      const btn = document.querySelector('.sell-foot button[type=submit]');
      if (btn) btn.textContent = n > 1 ? `Guardar ${n} ventas` : 'Guardar venta';
    }
    refreshSummary();
  },
  'sell-fees': (el) => { d.fees = el.value; d.feesTouched = true; refreshSummary(); },
  'sell-client-q': (el) => { d.clientQ = el.value; rerender(); },
  'sell-client': (el) => { d.clientId = el.dataset.id; d.clientQ = ''; rerender(); },
  'sell-client-clear': () => { d.clientId = null; rerender(); setTimeout(() => document.getElementById('sell-client-q')?.focus(), 0); },
  'sell-client-new': () => {
    const name = d.clientQ.trim();
    openClientForm(null, (id) => { if (d) { d.clientId = id; d.clientQ = ''; } rerender(); });
    if (name) setTimeout(() => { const i = document.getElementById('c-name'); if (i) i.value = name; }, 0);
  },
  'sell-channel': (el) => {
    d.channel = el.dataset.v;
    d.feesTouched = false;
    recalcFees();
    const m = S.state.settings.methods;
    if (d.channel === 'vinted' && m.includes('Vinted')) d.method = 'Vinted';
    else if (S.channel(d.channel).platform && m.includes('Plataforma')) d.method = 'Plataforma';
    else if (['Vinted', 'Plataforma'].includes(d.method)) d.method = m[0];
    if (S.channel(d.channel).platform && d.delivery === 'entregado') d.delivery = 'por_enviar';
    rerender();
  },
  'sell-more': () => { d.moreOpen = !d.moreOpen; rerender(); },
  'sell-method': (el) => { d.method = el.dataset.v; rerender(); },
  'sell-pay': (el) => { d.pay = el.dataset.v; rerender(); },
  'sell-delivery': (el) => { d.delivery = el.dataset.v; rerender(); },
  'sell-save': () => save(),
  'sell-save-wa': () => {
    const c = S.client(d.clientId);
    const sales = save();
    if (sales && c?.phone) window.open(waLink(c.phone, sales.length > 1 ? multiReceipt(sales) : receiptText(sales[0])), '_blank', 'noopener');
  },
});
