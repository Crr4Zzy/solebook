import { esc, icon, money, signed, currentMonth, addMonths, monthName, matches } from '../util.js';
import * as S from '../store.js';
import { registerActions, saleRow, empty, monthSwitcher } from '../ui.js';
import { exportSalesCSV } from '../io.js';
import { openImport } from '../importer.js';

const f = { month: currentMonth(), all: false, channel: '', status: '', q: '' };
let lastQueryF = null;

export const title = () => 'Ventas';

const STATUS = [
  ['', 'Todas'],
  ['cobrar', 'Por cobrar'],
  ['enviar', 'Por enviar'],
  ['reservas', 'Reservas'],
];

export const filtered = () => S.state.sales.filter((s) => {
  if (f.status === 'cobrar' && S.saleOwed(s) <= 0) return false;
  if (f.status === 'enviar' && s.delivery !== 'por_enviar') return false;
  if (f.status === 'reservas' && s.delivery !== 'reservado') return false;
  // open items are shown whatever the month
  if (!f.all && !f.status && s.date.slice(0, 7) !== f.month) return false;
  if (f.channel) {
    const c = S.channel(s.channel);
    if (f.channel === '_plat' ? !c.platform : s.channel !== f.channel) return false;
  }
  if (f.q) {
    const p = S.product(s.productId);
    const c = S.client(s.clientId);
    if (!matches(`${S.productName(p)} ${p?.sku || ''} ${s.size} ${c?.name || ''} ${S.channel(s.channel).name} ${s.notes || ''}`, f.q)) return false;
  }
  return true;
}).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));

export function render({ query }) {
  if (query.f !== undefined && query.f !== lastQueryF) { f.status = query.f; lastQueryF = query.f; }
  const list = filtered();
  const total = list.reduce((a, s) => a + s.price, 0);
  const net = list.reduce((a, s) => a + S.saleNet(s), 0);
  const chans = S.state.settings.channels.filter((c) => !c.platform);
  const hasPlat = S.state.settings.channels.some((c) => c.platform);

  return `
    <div class="page-head">
      <h1>Ventas</h1>
      <button class="btn" data-act="sales-import">${icon('upload')} <span class="desk-only">Importar Excel</span><span class="mob-only">Importar</span></button>
      <button class="btn desk-only" data-act="sales-export">${icon('download')} Exportar Excel</button>
      <a class="btn primary desk-only" href="#/vender">${icon('plus')} Nueva venta</a>
    </div>
    <div class="input-wrap search-top">${icon('search')}<input class="input" id="sales-q" data-search data-input="sales-q" placeholder="Buscar modelo, cliente, talla…" value="${esc(f.q)}" autocomplete="off"></div>
    <div class="chips scroll mb">
      ${STATUS.map(([k, l]) => `<button class="chip ${f.status === k ? 'on' : ''}" data-act="sales-status" data-v="${k}">${l}${k ? ` <span class="n">${k === 'cobrar' ? S.owedSales().length : k === 'enviar' ? S.toShip().length : S.reservations().length}</span>` : ''}</button>`).join('')}
    </div>
    <div class="page-head" style="margin-bottom:10px">
      ${f.status ? `<p class="muted small" style="flex:1">Mostrando todo lo pendiente, de cualquier mes.</p>` : `${f.all ? `<p class="strong" style="flex:1">Todas las fechas</p>` : `<div style="flex:1">${monthSwitcher(f.month, 'sales-month')}</div>`}
      <button class="btn sm ${f.all ? 'primary' : ''}" data-act="sales-all">${f.all ? 'Por mes' : 'Ver todo'}</button>`}
      <select class="input" style="width:auto;min-height:36px;padding:6px 10px;font-size:14px" data-change="sales-channel" aria-label="Canal">
        <option value="">Todos los canales</option>
        ${chans.map((c) => `<option value="${c.id}" ${f.channel === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        ${hasPlat ? `<option value="_plat" ${f.channel === '_plat' ? 'selected' : ''}>Plataformas</option>` : ''}
      </select>
    </div>
    <div class="card">
      ${list.length ? `
        <div class="table">
          <div class="thead"><span style="width:34px"></span><span class="grow" style="flex:1">Producto</span><span class="col-size">Talla</span><span class="col-chan">Canal</span><span class="col-date">Fecha</span><span class="col-num">Precio</span><span class="col-num">Neto</span><span class="col-status">Estado</span></div>
          <div class="list">${list.map((s) => saleRow(s, { table: true })).join('')}</div>
        </div>
        <div class="row" style="justify-content:space-between;margin-top:4px"><span class="muted small">${list.length} ${list.length === 1 ? 'venta' : 'ventas'} · ${money(total)}</span><span class="small">Neto <b class="${net >= 0 ? 'ok-text' : 'danger-text'}">${signed(net)}</b></span></div>`
        : empty('receipt', f.q || f.status || f.channel ? 'Nada con estos filtros' : `Sin ventas en ${monthName(f.month).toLowerCase()}`, f.q || f.status || f.channel ? 'Prueba a quitar algún filtro.' : 'Cuando vendas algo aparecerá aquí.', '<a class="btn primary" href="#/vender">Registrar venta</a>')}
    </div>
    <button class="btn block mt mob-only" data-act="sales-export">${icon('download')} Exportar a Excel (CSV)</button>`;
}

const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
registerActions({
  'sales-q': (el) => { f.q = el.value; rerender(); },
  'sales-status': (el) => {
    f.status = el.dataset.v;
    lastQueryF = f.status;
    if (location.hash.includes('?')) history.replaceState(history.state, '', '#/ventas');
    rerender();
  },
  'sales-month': (el) => {
    const next = addMonths(f.month, Number(el.dataset.delta));
    if (next > currentMonth()) return;
    f.month = next;
    rerender();
  },
  'sales-all': () => { f.all = !f.all; rerender(); },
  'sales-channel': (el) => { f.channel = el.value; rerender(); },
  'sales-import': () => openImport(),
  'sales-export': () => exportSalesCSV(filtered(), `ventas-${f.all || f.status ? 'seleccion' : f.month}.csv`),
});
