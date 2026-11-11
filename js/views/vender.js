// New sale in two steps: 1) pick what you sold, 2) size, client, channel, price and payment.
import { esc, icon, money, signed, today, addDays, toNum, matches, waLink, fmtDate, sizeSort } from '../util.js';
import * as S from '../store.js';
import { registerActions, productThumb, avatar, pill, goThen, rerender, toast, marginText } from '../ui.js';
import { openClientForm, openSale, receiptText } from '../sheets.js';
import { startScanner, stopScanner, scannerSupported } from '../scanner.js';

let d = null;

const fresh = (query = {}) => {
  const st = S.state.settings;
  d = {
    step: 1, q: '', productId: null, newProduct: null, size: '', unitId: null,
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
  const sizes = S.productStock(p).sizes;
  if (sizes.length === 1) chooseSize(sizes[0].size);
  recalcFees();
}

function chooseSize(size) {
  d.size = size;
  // oldest unit of that size goes first
  const u = S.availableUnits(d.productId).filter((x) => x.size === size).sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt))[0];
  d.unitId = u?.id || null;
  if (u) d.cost = u.cost;
}

function recalcFees() {
  if (!d.feesTouched) d.fees = S.calcFees(d.channel, toNum(d.price));
}

export const title = () => 'Nueva venta';

export function render({ query, fresh: isFresh }) {
  if (isFresh || !d) fresh(query);
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

  // sizes: only those in stock, with how many you have
  let sizeBlock;
  if (p && stock.count) {
    sizeBlock = `<div class="choices">${stock.sizes.map((s) => `<button type="button" class="choice ${d.size === s.size ? 'on' : ''}" data-act="sell-size" data-v="${esc(s.size)}">${esc(s.size)}<small>${s.n} ${isClothes ? (s.n === 1 ? 'ud' : 'uds') : s.n === 1 ? 'par' : 'pares'}</small></button>`).join('')}</div>
      <p class="hint tiny muted mt">Solo aparecen las tallas que tienes.${d.unitId ? ` Coste de esta unidad: ${money(S.unit(d.unitId)?.cost)}.` : ''}</p>`;
  } else {
    sizeBlock = `<input class="input" id="sell-size" data-input="sell-field" data-k="size" value="${esc(d.size)}" placeholder="${isClothes ? 'M' : '43'}" autocomplete="off">
      <p class="tiny muted mt">No hay stock de este producto: escribe la talla y el coste a mano.</p>`;
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
      <div class="row" style="border:none;padding:0 0 4px">${productThumb(p || { type: np?.type })}
        <div class="grow"><div class="title">${p ? esc(S.productName(p)) : 'Producto nuevo'}</div><div class="meta">${p ? esc(p.sku || (p.type === 'ropa' ? 'Ropa' : 'Zapatillas')) : 'Se añadirá a tu catálogo'}</div></div>
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
        <div class="field"><label for="sell-price">Precio de venta</label><div class="input-wrap"><input class="input" id="sell-price" inputmode="decimal" data-input="sell-field" data-k="price" value="${esc(d.price)}" placeholder="0"><span class="suffix">€</span></div>${priceHint ? `<span class="hint">${esc(priceHint)}</span>` : ''}</div>
        <div class="field"><label for="sell-cost">Lo que te costó</label><div class="input-wrap"><input class="input" id="sell-cost" inputmode="decimal" data-input="sell-field" data-k="cost" value="${esc(d.cost)}" placeholder="0"><span class="suffix">€</span></div></div>
      </div>
      ${showFees ? `<div class="field"><label for="sell-fees">Comisión ${esc(ch.name)}</label><div class="input-wrap"><input class="input" id="sell-fees" inputmode="decimal" data-input="sell-fees" value="${esc(d.fees)}"><span class="suffix">€</span></div><span class="hint">${toNum(ch.feePct)}%${toNum(ch.feeFixed) ? ` + ${money(ch.feeFixed)}` : ''}. Cámbiala en Ajustes si no es correcta.</span></div>` : ''}
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
      <div class="field"><label for="sell-ship">Envío pagado por ti</label><div class="input-wrap"><input class="input" id="sell-ship" inputmode="decimal" data-input="sell-field" data-k="shippingCost" value="${esc(d.shippingCost)}" placeholder="0"><span class="suffix">€</span></div></div></div>
      <div class="field" style="margin:0"><label for="sell-notes">Notas</label><textarea class="input" id="sell-notes" data-input="sell-field" data-k="notes" placeholder="Viene a recoger el sábado…">${esc(d.notes)}</textarea></div>
    </details>

    <div id="sell-summary" class="mt">${summary()}</div>
    ${d.error ? `<p class="error mt">${esc(d.error)}</p>` : ''}
    <div class="sell-foot">
      <div class="btn-row" style="flex-wrap:nowrap">
        <button class="btn primary lg" type="submit" style="flex:1">Guardar venta</button>
        ${c?.phone ? `<button type="button" class="btn lg wa" style="flex:none" data-act="sell-save-wa" title="Guardar y enviar recibo por WhatsApp">${icon('wa')}<span class="desk-only">Guardar y enviar recibo</span></button>` : ''}
      </div>
    </div>
    </form>`;
}

function summary() {
  const price = toNum(d.price);
  const net = price - toNum(d.fees) - toNum(d.shippingCost) - toNum(d.cost);
  const paid = d.pay === 'full' ? price : d.pay === 'deposit' ? toNum(d.deposit) : 0;
  const owed = Math.max(0, price - paid);
  if (!price) return '';
  return `<div class="net-box ${net < 0 ? 'neg' : ''}"><span>Beneficio neto</span><span>${signed(net, true)} · ${marginText(net, price)}</span></div>
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
  else if (!String(d.size).trim()) d.error = 'Elige la talla.';
  else if (price <= 0) d.error = 'Pon el precio de venta.';
  else if (d.pay === 'deposit' && toNum(d.deposit) <= 0) d.error = 'Escribe cuánto te ha dado de señal.';
  if (d.error) { rerender(); return null; }

  let productId = d.productId;
  if (d.newProduct) productId = S.saveProduct({ type: d.newProduct.type, brand: d.newProduct.brand.trim(), model: d.newProduct.model.trim(), price, sku: '', photos: [] });
  const paid = d.pay === 'full' ? price : d.pay === 'deposit' ? toNum(d.deposit) : 0;
  const s = S.createSale({
    productId, unitId: d.unitId, size: String(d.size).trim().toUpperCase(), clientId: d.clientId, channel: d.channel,
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
  return s;
}

registerActions({
  'sell-q': (el) => { d.q = el.value; rerender(); },
  'sell-scan': () => { d.scanning = true; rerender(); },
  'sell-scan-stop': () => { d.scanning = false; stopScanner(); rerender(); },
  'sell-product': (el) => { stopScanner(); d.scanning = false; chooseProduct(el.dataset.id); rerender(); window.scrollTo(0, 0); },
  'sell-new-product': () => {
    d.productId = null; d.unitId = null; d.size = ''; d.cost = '';
    const q = d.q.trim();
    const [brand, ...rest] = q.split(/\s+/);
    d.newProduct = { type: 'zapatilla', brand: q ? brand : '', model: rest.join(' ') };
    d.step = 2;
    rerender();
  },
  'sell-np-type': (el) => { d.newProduct.type = el.dataset.v; rerender(); },
  'sell-np': (el) => { d.newProduct[el.dataset.k] = el.value; },
  'sell-back': () => { d.step = 1; d.error = ''; rerender(); },
  'sell-size': (el) => { chooseSize(el.dataset.v); d.error = ''; rerender(); },
  'sell-field': (el) => {
    d[el.dataset.k] = el.value;
    if (el.dataset.k === 'price') recalcFees();
    if (el.dataset.k === 'price' && document.getElementById('sell-fees')) document.getElementById('sell-fees').value = d.fees;
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
    const s = save();
    if (s && c?.phone) window.open(waLink(c.phone, receiptText(s)), '_blank', 'noopener');
  },
});
