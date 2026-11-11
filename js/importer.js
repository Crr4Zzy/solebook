// Bulk import of sales from Excel (.xlsx) or CSV, with a preview before saving.
import { esc, icon, money, signed, today, isoDate, normalize, matches, uid, fmtDate, addDays } from './util.js';
import * as S from './store.js';
import { registerActions, openSheet, refreshSheet, closeSheet, sheetHead, toast, avatar } from './ui.js';
import { download } from './io.js';

// SheetJS reads and writes .xlsx. It is loaded only when needed; CSV works without it (and offline).
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxPromise = null;
const loadXLSX = () => (xlsxPromise ||= new Promise((resolve, reject) => {
  if (window.XLSX) return resolve(window.XLSX);
  const s = document.createElement('script');
  s.src = XLSX_URL;
  s.onload = () => resolve(window.XLSX);
  s.onerror = () => { xlsxPromise = null; reject(new Error('Sin conexión: para Excel hace falta internet. Puedes usar un CSV.')); };
  document.head.appendChild(s);
}));

// ---------- columns ----------
const COLS = [
  { key: 'date', label: 'Fecha', alias: ['fecha', 'dia', 'date'] },
  { key: 'brand', label: 'Marca', alias: ['marca', 'brand'] },
  { key: 'model', label: 'Modelo', alias: ['modelo', 'producto', 'articulo', 'nombre', 'model'] },
  { key: 'sku', label: 'SKU', alias: ['sku', 'referencia', 'ref', 'codigo'] },
  { key: 'type', label: 'Tipo', alias: ['tipo', 'categoria'] },
  { key: 'size', label: 'Talla', alias: ['talla', 'size', 'numero', 'num'] },
  { key: 'price', label: 'Precio', alias: ['precio', 'precio de venta', 'venta', 'importe', 'pvp', 'price'] },
  { key: 'cost', label: 'Coste', alias: ['coste', 'costo', 'precio de compra', 'compra', 'cost'] },
  { key: 'channel', label: 'Canal', alias: ['canal', 'plataforma', 'donde', 'channel'] },
  { key: 'client', label: 'Cliente', alias: ['cliente', 'comprador', 'client'] },
  { key: 'paid', label: 'Pagado', alias: ['pagado', 'cobrado', 'pago', 'senal', 'paid'] },
  { key: 'method', label: 'Método de pago', alias: ['metodo de pago', 'metodo', 'forma de pago'] },
  { key: 'delivery', label: 'Estado', alias: ['estado', 'entrega', 'estado de entrega'] },
  { key: 'notes', label: 'Notas', alias: ['notas', 'nota', 'comentarios', 'observaciones'] },
];
const TEMPLATE_COLS = ['date', 'brand', 'model', 'size', 'price', 'cost', 'channel', 'client', 'paid', 'method', 'delivery', 'notes'];

const headerKey = (h) => {
  const n = normalize(h).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  for (const c of COLS) if (c.alias.includes(n)) return c.key;
  for (const c of COLS) if (c.alias.some((a) => a.length > 3 && n.startsWith(a))) return c.key;
  return null;
};

// "1.245,50 €", "245", 245.5, "245.5" -> number
export const parseAmount = (v) => {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[€\s]/g, '').replace(/eur/i, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};

// 15/10/2026, 15-10-26, 2026-10-15, Excel serial number or Date -> YYYY-MM-DD
export const parseDateCell = (v) => {
  if (v instanceof Date && !isNaN(v)) return isoDate(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) return isoDate(new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000));
  const s = String(v ?? '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoDate(new Date(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (d.getMonth() === +m[2] - 1) return isoDate(d);
  }
  return null;
};

const parseCSV = (text) => {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
};

async function readRows(file) {
  if (/\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv') return parseCSV(await file.text());
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames.find((n) => !/instruc/i.test(n)) || wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
}

// ---------- matching ----------
const CLOTH_SIZES = /^(XXS|XS|S|M|L|XL|XXL|XXXL|U|TU|UNICA)$/i;
const DELIVERY_MAP = { entregado: 'entregado', entregada: 'entregado', 'por enviar': 'por_enviar', pendiente: 'por_enviar', enviado: 'enviado', enviada: 'enviado', reservado: 'reservado', reserva: 'reservado', reservada: 'reservado' };

function findProduct(r, created) {
  const all = [...S.state.products, ...created];
  if (r.sku) {
    const bySku = all.find((p) => p.sku && normalize(p.sku) === normalize(r.sku));
    if (bySku) return bySku;
  }
  const full = normalize(`${r.brand} ${r.model}`.trim());
  if (!full) return null;
  const exact = all.find((p) => normalize(`${p.brand} ${p.model}`) === full || normalize(p.model) === full);
  if (exact) return exact;
  const fuzzy = all.filter((p) => matches(`${p.brand} ${p.model} ${p.sku || ''}`, full));
  return fuzzy.length === 1 ? fuzzy[0] : null;
}

function findClient(name, created) {
  const n = normalize(name);
  if (!n) return null;
  return [...S.state.clients, ...created].find((c) => normalize(c.name) === n) || null;
}

function findChannel(name) {
  const n = normalize(name);
  if (!n) return S.state.settings.channels[0];
  return S.state.settings.channels.find((c) => normalize(c.name) === n || c.id === n) || null;
}

// Turns the raw sheet into checked rows, without saving anything.
export function analyse(raw, opts) {
  const headerIdx = raw.findIndex((row) => row.filter((c) => headerKey(c)).length >= 2);
  if (headerIdx < 0) throw new Error('No encuentro la fila de títulos (Fecha, Modelo, Talla, Precio…). Usa la plantilla.');
  const map = raw[headerIdx].map(headerKey);
  if (!map.includes('price')) throw new Error('Falta la columna «Precio».');
  if (!map.includes('model') && !map.includes('sku')) throw new Error('Falta la columna «Modelo».');

  const newProducts = [], newClients = [], usedUnits = new Set();
  const forcedClient = opts.clientId ? S.client(opts.clientId) : null;
  const rows = [];
  raw.slice(headerIdx + 1).forEach((cells, i) => {
    const r = {};
    map.forEach((k, j) => { if (k && r[k] === undefined) r[k] = cells[j]; });
    const text = (k) => String(r[k] ?? '').trim();
    if (!Object.keys(r).some((k) => text(k))) return; // empty line
    if (normalize(text('model')).startsWith('ejemplo') || normalize(text('notes')).startsWith('fila de ejemplo')) return;

    const out = { line: headerIdx + i + 2, errors: [], warnings: [] };
    out.brand = text('brand');
    out.model = text('model');
    out.sku = text('sku').toUpperCase();
    out.size = text('size').replace(/\.0$/, '').toUpperCase();
    out.price = parseAmount(r.price);
    out.notes = text('notes');

    const d = parseDateCell(r.date);
    if (d === null) out.errors.push(`Fecha «${text('date')}» no válida`);
    out.date = d || today();
    if (!out.model && !out.sku) out.errors.push('Falta el modelo');
    if (!(out.price > 0)) out.errors.push('Falta el precio');

    // product
    let p = findProduct({ brand: out.brand, model: out.model, sku: out.sku }, newProducts);
    if (!p && !out.errors.length) {
      const t = normalize(text('type'));
      p = { id: uid(), _new: true, type: t.startsWith('rop') || CLOTH_SIZES.test(out.size) ? 'ropa' : 'zapatilla', brand: out.brand, model: out.model || out.sku, sku: out.sku, price: out.price, market: null, photos: [], notes: '', createdAt: today() };
      newProducts.push(p);
      out.warnings.push('Producto nuevo');
    }
    out.product = p;

    // client: the one chosen in the screen wins; otherwise the column
    const cname = text('client');
    let c = forcedClient;
    if (!c && cname) {
      c = findClient(cname, newClients);
      if (!c) {
        c = { id: uid(), _new: true, name: cname, phone: '', instagram: '', sizes: '', brands: '', notes: '', wishes: [], createdAt: today() };
        newClients.push(c);
        out.warnings.push('Cliente nuevo');
      }
    }
    out.client = c;

    // channel
    const ch = findChannel(text('channel'));
    if (!ch) out.warnings.push(`Canal «${text('channel')}» no existe: se pone Directo`);
    out.channel = (ch || S.state.settings.channels[0]).id;

    // stock unit and cost
    let unit = null;
    if (opts.useStock && p && !p._new && out.size) {
      unit = S.availableUnits(p.id).filter((u) => u.size === out.size && !usedUnits.has(u.id)).sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt))[0] || null;
      if (unit) usedUnits.add(unit.id);
    }
    out.unitId = unit?.id || null;
    const cost = parseAmount(r.cost);
    out.cost = Number.isFinite(cost) ? cost : unit ? unit.cost : 0;
    if (!Number.isFinite(cost) && !unit && !out.errors.length) out.warnings.push('Sin coste');
    if (!out.size) out.warnings.push('Sin talla');

    // payment
    const paidRaw = text('paid');
    const pn = normalize(paidRaw);
    let paid;
    if (!paidRaw || ['si', 'sí', 'pagado', 'cobrado', 'todo', 'yes', 'x'].includes(pn)) paid = out.price;
    else if (['no', 'pendiente', 'nada', '0'].includes(pn)) paid = 0;
    else paid = parseAmount(paidRaw);
    if (!Number.isFinite(paid)) { out.warnings.push(`Pagado «${paidRaw}» no se entiende: se pone todo`); paid = out.price; }
    out.paid = Math.min(Math.max(0, paid), out.price || 0);
    const methods = S.state.settings.methods;
    const m = text('method');
    out.method = methods.find((x) => normalize(x) === normalize(m)) || m || (out.channel === 'vinted' ? 'Vinted' : S.channel(out.channel).platform ? 'Plataforma' : methods[0] || '');

    const dl = normalize(text('delivery'));
    out.delivery = DELIVERY_MAP[dl] || 'entregado';
    if (dl && !DELIVERY_MAP[dl]) out.warnings.push(`Estado «${text('delivery')}» no se entiende: se pone Entregado`);

    out.fees = out.price > 0 ? S.calcFees(out.channel, out.price) : 0;
    out.net = (out.price || 0) - out.fees - out.cost;
    rows.push(out);
  });
  return { rows, newProducts, newClients };
}

// ---------- template ----------
export async function downloadTemplate(clientName = '') {
  const t = today();
  const [y, mo, d] = t.split('-');
  const ex = (model, brand, size, price, cost, channel, paid, method, del, notes) => [`${d}/${mo}/${y}`, brand, model, size, price, cost, channel, clientName || 'Marcos Ruiz', paid, method, del, notes];
  const head = TEMPLATE_COLS.map((k) => COLS.find((c) => c.key === k).label);
  const rows = [
    head,
    ex('4 Retro Bred Reimagined', 'Jordan', '43', 245, 183, 'Directo', 245, 'Bizum', 'Entregado', 'Fila de ejemplo: bórrala'),
    ex('Dunk Low Panda', 'Nike', '42', 130, 95, 'Directo', 50, 'Efectivo', 'Reservado', 'Fila de ejemplo: pagó 50 de señal'),
    ex('Sudadera Fear of God', 'Essentials', 'M', 95, 67, 'Instagram', '', 'Bizum', 'Por enviar', 'Fila de ejemplo: Pagado vacío = pagado entero'),
  ];
  const help = [
    ['Cómo rellenar la plantilla'],
    [''],
    ['Fecha', 'Día de la venta (15/10/2026). Si la dejas vacía se pone hoy.'],
    ['Marca y Modelo', 'Si ya existe en tu inventario se reconoce; si no, se crea el producto.'],
    ['Talla', '43, 42.5, M… Si tienes esa talla en stock, se descuenta del inventario.'],
    ['Precio', 'Precio de venta. Obligatorio.'],
    ['Coste', 'Lo que te costó. Vacío = se coge del stock si lo tienes.'],
    ['Canal', 'Directo, Vinted, Instagram, Wallapop, StockX… La comisión se calcula sola.'],
    ['Cliente', 'Nombre del cliente. Si no existe se crea. Si importas desde la ficha de un cliente, se ignora.'],
    ['Pagado', 'Vacío = pagado entero. Pon una cantidad si fue señal, o 0 / «no» si no te ha pagado.'],
    ['Método de pago', 'Bizum, Efectivo, Transferencia, PayPal…'],
    ['Estado', 'Entregado, Por enviar, Enviado o Reservado. Vacío = Entregado.'],
    [''],
    ['Las filas que digan «Fila de ejemplo» en Notas no se importan.'],
  ];
  try {
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [12, 12, 26, 7, 9, 9, 12, 18, 9, 15, 12, 40].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas');
    const ws2 = XLSX.utils.aoa_to_sheet(help);
    ws2['!cols'] = [{ wch: 18 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    download('plantilla-ventas.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch {
    const csv = '﻿' + rows.map((r) => r.map((c) => (/[";\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(';')).join('\r\n');
    download('plantilla-ventas.csv', csv, 'text/csv;charset=utf-8');
    toast('Sin conexión: te descargo la plantilla en CSV (se abre igual con Excel).');
  }
}

// ---------- bulk save ----------
function saveAll(result) {
  const ok = result.rows.filter((r) => !r.errors.length);
  const usedP = new Set(ok.map((r) => r.product.id));
  const usedC = new Set(ok.map((r) => r.client?.id).filter(Boolean));
  const before = S.snapshot();
  S.update((st) => {
    result.newProducts.filter((p) => usedP.has(p.id)).forEach((p) => { const { _new, ...clean } = p; st.products.push(clean); });
    result.newClients.filter((c) => usedC.has(c.id)).forEach((c) => { const { _new, ...clean } = c; st.clients.push(clean); });
    ok.forEach((r) => {
      const id = uid();
      st.sales.push({
        id, createdAt: new Date().toISOString(), date: r.date, productId: r.product.id, unitId: r.unitId, size: r.size,
        clientId: r.client?.id || null, channel: r.channel, price: r.price, cost: r.cost, fees: r.fees, shippingCost: 0,
        payments: r.paid > 0 ? [{ id: uid(), date: r.date, amount: r.paid, method: r.method }] : [], method: r.method,
        delivery: r.delivery, reservedUntil: r.delivery === 'reservado' ? addDays(today(), S.state.settings.reserveDays || 3) : null,
        notes: r.notes,
      });
      if (r.unitId) { const u = st.units.find((x) => x.id === r.unitId); if (u) u.saleId = id; }
    });
  });
  return { count: ok.length, before };
}

// ---------- sheet ----------
let st = null;

export function openImport(clientId = null) {
  st = { clientId, useStock: true, file: null, raw: null, result: null, error: '', busy: false, showAll: false };
  openSheet(render);
}

function rerunAnalysis() {
  if (!st.raw) return;
  try { st.result = analyse(st.raw, st); st.error = ''; } catch (e) { st.result = null; st.error = e.message; }
}

function render() {
  const c = S.client(st.clientId);
  const res = st.result;
  const ok = res ? res.rows.filter((r) => !r.errors.length) : [];
  const bad = res ? res.rows.filter((r) => r.errors.length) : [];
  const total = ok.reduce((a, r) => a + r.price, 0);
  const net = ok.reduce((a, r) => a + r.net, 0);
  const owed = ok.reduce((a, r) => a + (r.price - r.paid), 0);
  const fromStock = ok.filter((r) => r.unitId).length;
  const nP = res ? new Set(ok.filter((r) => r.product._new).map((r) => r.product.id)).size : 0;
  const nC = res ? new Set(ok.filter((r) => r.client?._new).map((r) => r.client.id)).size : 0;
  const shown = res ? (st.showAll ? res.rows : res.rows.slice(0, 40)) : [];

  return `${sheetHead(c ? `Importar ventas de ${c.name}` : 'Importar ventas desde Excel')}
    ${!res ? `
      <ol class="small" style="padding-left:18px;margin:0 0 14px;line-height:1.7">
        <li>Descarga la plantilla y ábrela con Excel o Numbers.</li>
        <li>Escribe una venta por fila${c ? '' : ' (con el nombre del cliente si quieres)'}. Borra las filas de ejemplo.</li>
        <li>Guárdala y súbela aquí. Verás lo que se va a añadir antes de confirmar.</li>
      </ol>
      <button class="btn block mb" data-act="imp-template">${icon('download')} Descargar plantilla</button>` : ''}

    <div class="field"><span class="label-t">Cliente</span>
      ${c ? `<div class="row" style="border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;background:var(--card)">${avatar(c)}<div class="grow"><div class="title">${esc(c.name)}</div><div class="meta">Todas las filas serán suyas</div></div><button class="btn sm" data-act="imp-client-clear">Quitar</button></div>`
        : `<select class="input" data-change="imp-client"><option value="">Según la columna «Cliente» del Excel</option>${S.state.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map((x) => `<option value="${x.id}">Todas para ${esc(x.name)}</option>`).join('')}</select>`}
    </div>
    <div class="switch-row" style="border-top:none;padding-top:0"><span class="small">Descontar del inventario si tengo esa talla</span><input type="checkbox" class="switch" data-change="imp-stock" ${st.useStock ? 'checked' : ''} aria-label="Descontar del inventario"></div>

    <label class="btn ${res ? '' : 'primary'} block mt">${icon('upload')} ${st.file ? `Cambiar archivo (${esc(st.file)})` : 'Elegir archivo Excel o CSV'}<input type="file" hidden accept=".xlsx,.xls,.csv,.numbers,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" data-change="imp-file"></label>
    ${st.busy ? '<p class="muted small mt">Leyendo el archivo…</p>' : ''}
    ${st.error ? `<div class="alert danger mt">${icon('alert', 'sm')}<span class="grow">${esc(st.error)}</span></div>` : ''}

    ${res ? `
      <div class="kpis mt-lg" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="kpi"><div class="label">Ventas a importar</div><div class="value">${ok.length}</div><div class="meta">${money(total)} · ${fromStock} del stock</div></div>
        <div class="kpi"><div class="label">Beneficio neto</div><div class="value ${net >= 0 ? 'ok-text' : 'danger-text'}">${signed(net)}</div><div class="meta">${owed > 0 ? `quedan ${money(owed)} por cobrar` : 'todo cobrado'}</div></div>
      </div>
      ${nP || nC ? `<p class="small muted mb">Se crearán ${[nP && `${nP} ${nP === 1 ? 'producto nuevo' : 'productos nuevos'}`, nC && `${nC} ${nC === 1 ? 'cliente nuevo' : 'clientes nuevos'}`].filter(Boolean).join(' y ')}.</p>` : ''}
      ${bad.length ? `<div class="alert warn mb">${icon('alert', 'sm')}<span class="grow">${bad.length} ${bad.length === 1 ? 'fila tiene' : 'filas tienen'} errores y no se importarán. Corrígelas en el Excel y vuelve a subirlo, o importa solo las buenas.</span></div>` : ''}
      <div class="card" style="padding:4px 12px">
        <div class="list">${shown.map((r) => `<div class="row" style="align-items:flex-start">
          <span class="tiny muted" style="width:26px;flex:none;padding-top:2px">${r.line}</span>
          <div class="grow">
            <div class="title">${esc([r.brand, r.model].filter(Boolean).join(' ') || r.sku || '—')}${r.size ? ` · ${esc(r.size)}` : ''}</div>
            <div class="meta">${esc([fmtDate(r.date, true), S.channel(r.channel).name, r.client?.name, r.paid < r.price && r.price > 0 ? `pagado ${money(r.paid)}` : ''].filter(Boolean).join(' · '))}</div>
            ${r.errors.length ? `<div class="tiny danger-text">${esc(r.errors.join(' · '))}</div>` : r.warnings.length ? `<div class="tiny warn-text">${esc(r.warnings.join(' · '))}</div>` : ''}
          </div>
          <div class="end">${r.errors.length ? '<span class="pill danger">No</span>' : `<div class="small strong">${money(r.price)}</div><div class="tiny ${r.net >= 0 ? 'ok-text' : 'danger-text'}">${signed(r.net)}</div>`}</div>
        </div>`).join('')}</div>
        ${res.rows.length > shown.length ? `<button class="btn ghost block" data-act="imp-all">Ver las ${res.rows.length} filas</button>` : ''}
      </div>
      <div class="sheet-foot"><button class="btn primary lg block" data-act="imp-save" ${ok.length ? '' : 'disabled'}>${ok.length ? `Importar ${ok.length} ${ok.length === 1 ? 'venta' : 'ventas'}` : 'Nada que importar'}</button></div>` : ''}`;
}

registerActions({
  'imp-template': () => downloadTemplate(S.client(st?.clientId)?.name || ''),
  'imp-client': (el) => { st.clientId = el.value || null; rerunAnalysis(); refreshSheet(true); },
  'imp-client-clear': () => { st.clientId = null; rerunAnalysis(); refreshSheet(true); },
  'imp-stock': (el) => { st.useStock = el.checked; rerunAnalysis(); refreshSheet(true); },
  'imp-all': () => { st.showAll = true; refreshSheet(true); },
  'imp-file': async (el) => {
    const file = el.files?.[0];
    if (!file) return;
    st.file = file.name; st.busy = true; st.error = ''; st.result = null;
    refreshSheet(true);
    try { st.raw = await readRows(file); rerunAnalysis(); } catch (e) { st.error = e.message || 'No se ha podido leer el archivo'; }
    st.busy = false;
    refreshSheet(true);
  },
  'imp-save': () => {
    const { count, before } = saveAll(st.result);
    closeSheet();
    toast(`${count} ${count === 1 ? 'venta importada' : 'ventas importadas'}`, { undo: () => S.replaceState(before, 'local') });
  },
});
