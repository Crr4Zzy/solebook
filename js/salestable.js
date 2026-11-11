// Sales table grouped by month, with checkboxes and bulk actions.
// Used in Ventas, in each client's page and in each product's page.
import { esc, icon, money, signed, fmtDate, monthKey, monthName, today, matches } from './util.js';
import * as S from './store.js';
import { registerActions, productThumb, pill, empty, openSheet, closeSheet, sheetHead, toast, rerender } from './ui.js';
import { openSale } from './sheets.js';
import { exportSalesCSV } from './io.js';

// Selection lives per screen ("ventas", "client:ID", "product:ID") and resets when you change screen.
const sel = { ctx: null, ids: new Set() };
const ensureCtx = (ctx) => { if (sel.ctx !== ctx) { sel.ctx = ctx; sel.ids = new Set(); } };
export const selectedIds = () => [...sel.ids].filter((id) => S.sale(id));

// Per-screen filters for client and product pages.
const filters = {};
export const tableFilter = (ctx) => (filters[ctx] ||= { q: '', f: '' });

export const filterSales = (sales, ctx) => {
  const t = tableFilter(ctx);
  return sales.filter((s) => {
    if (t.f === 'cobrar' && S.saleOwed(s) <= 0) return false;
    if (t.f === 'enviar' && s.delivery !== 'por_enviar') return false;
    if (t.f === 'reservas' && s.delivery !== 'reservado') return false;
    if (t.q) {
      const p = S.product(s.productId), c = S.client(s.clientId);
      const hay = `${S.productName(p)} ${p?.sku || ''} ${s.size} ${c?.name || ''} ${S.channel(s.channel).name} ${s.notes || ''} ${monthName(monthKey(s.date))} ${fmtDate(s.date, true)} ${s.price}`;
      if (!matches(hay, t.q)) return false;
    }
    return true;
  });
};

// Search box + status chips for client/product pages.
export function tableToolbar(ctx, allSales) {
  const t = tableFilter(ctx);
  const owed = allSales.filter((s) => S.saleOwed(s) > 0).length;
  const ship = allSales.filter((s) => s.delivery === 'por_enviar').length;
  const res = allSales.filter((s) => s.delivery === 'reservado').length;
  return `<div class="input-wrap mb">${icon('search')}<input class="input" id="st-q-${esc(ctx)}" data-input="st-q" data-ctx="${esc(ctx)}" placeholder="Buscar modelo, talla, mes, precio…" value="${esc(t.q)}" autocomplete="off"></div>
    <div class="chips scroll mb">
      <button class="chip ${!t.f ? 'on' : ''}" data-act="st-filter" data-ctx="${esc(ctx)}" data-v="">Todas <span class="n">${allSales.length}</span></button>
      ${owed ? `<button class="chip ${t.f === 'cobrar' ? 'on' : ''}" data-act="st-filter" data-ctx="${esc(ctx)}" data-v="cobrar">Por cobrar <span class="n">${owed}</span></button>` : ''}
      ${ship ? `<button class="chip ${t.f === 'enviar' ? 'on' : ''}" data-act="st-filter" data-ctx="${esc(ctx)}" data-v="enviar">Por enviar <span class="n">${ship}</span></button>` : ''}
      ${res ? `<button class="chip ${t.f === 'reservas' ? 'on' : ''}" data-act="st-filter" data-ctx="${esc(ctx)}" data-v="reservas">Reservas <span class="n">${res}</span></button>` : ''}
    </div>`;
}

const check = (on, act, attrs, label) => `<button type="button" class="check ${on === true ? 'on' : on === 'some' ? 'some' : ''}" data-act="${act}" ${attrs} aria-label="${esc(label)}" aria-pressed="${on === true}">${on === true ? icon('check', 'sm') : on === 'some' ? icon('minus', 'sm') : ''}</button>`;

const row = (s, showClient) => {
  const p = S.product(s.productId);
  const c = S.client(s.clientId);
  const b = S.saleBadge(s);
  const net = S.saleNet(s);
  const owed = S.saleOwed(s);
  const on = sel.ids.has(s.id);
  const who = showClient ? (c?.name || S.channel(s.channel).name) : S.channel(s.channel).name;
  return `<div class="row st-row ${on ? 'selected' : ''}">
    ${check(on, 'st-toggle', `data-id="${s.id}"`, 'Seleccionar venta')}
    <div class="st-open grow" data-act="open-sale" data-id="${s.id}">
      ${productThumb(p, 'sm')}
      <div class="grow" style="min-width:0"><div class="title">${esc(S.productName(p))}</div>
        <div class="meta">${esc([s.size && `T. ${s.size}`, who, fmtDate(s.date)].filter(Boolean).join(' · '))}</div></div>
      <div class="col-size desk-only">${esc(s.size)}</div>
      ${showClient ? `<div class="col-client desk-only small">${esc(c?.name || '—')}</div>` : ''}
      <div class="col-chan desk-only small">${esc(S.channel(s.channel).name)}</div>
      <div class="col-date desk-only small muted">${fmtDate(s.date)}</div>
      <div class="col-num desk-only">${money(s.price)}</div>
      <div class="col-num ${net >= 0 ? 'ok-text' : 'danger-text'}">${signed(net)}</div>
      <div class="col-num desk-only ${owed > 0 ? 'warn-text strong' : 'muted'}">${owed > 0 ? money(owed) : '—'}</div>
      <div class="col-status ${b.cls === 'ok' ? 'desk-only' : ''}">${pill(b.label, b.cls)}</div>
    </div>
  </div>`;
};

// sales: already filtered. Grouped by month, newest first.
export function salesTable(ctx, sales, { showClient = true, emptyHtml = '' } = {}) {
  ensureCtx(ctx);
  if (!sales.length) return emptyHtml || empty('receipt', 'No hay ventas', 'Prueba a cambiar la búsqueda o los filtros.');
  const sorted = sales.slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  const groups = [];
  sorted.forEach((s) => {
    const k = monthKey(s.date);
    if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, sales: [] });
    groups[groups.length - 1].sales.push(s);
  });
  const allOn = sorted.every((s) => sel.ids.has(s.id)) ? true : sorted.some((s) => sel.ids.has(s.id)) ? 'some' : false;

  return `<div class="st" data-ctx="${esc(ctx)}">
    <div class="thead st-head">
      ${check(allOn, 'st-all', `data-ids="${sorted.map((s) => s.id).join(',')}"`, 'Seleccionar todas')}
      <span style="flex:1"><span class="desk-only">Producto</span><span class="mob-only">Seleccionar todo</span></span><span class="col-size">Talla</span>${showClient ? '<span class="col-client">Cliente</span>' : ''}<span class="col-chan">Canal</span><span class="col-date">Fecha</span><span class="col-num">Precio</span><span class="col-num">Neto</span><span class="col-num">Debe</span><span class="col-status">Estado</span>
    </div>
    ${groups.map((g) => {
      const st = S.statsFor(g.sales);
      const owed = g.sales.reduce((a, s) => a + S.saleOwed(s), 0);
      const gOn = g.sales.every((s) => sel.ids.has(s.id)) ? true : g.sales.some((s) => sel.ids.has(s.id)) ? 'some' : false;
      return `<div class="st-month">
        <div class="st-month-head">
          ${check(gOn, 'st-group', `data-ids="${g.sales.map((s) => s.id).join(',')}"`, `Seleccionar ${monthName(g.key)}`)}
          <div class="grow"><b>${monthName(g.key)}</b> <span class="muted small">· ${st.count} ${st.count === 1 ? 'venta' : 'ventas'}</span></div>
          <div class="small right"><span class="desk-only">${money(st.revenue)} · </span><span class="${st.net >= 0 ? 'ok-text' : 'danger-text'}">${signed(st.net)}</span>${owed > 0 ? ` · <span class="warn-text">debe ${money(owed)}</span>` : ''}</div>
        </div>
        <div class="list">${g.sales.map((s) => row(s, showClient)).join('')}</div>
      </div>`;
    }).join('')}
  </div>
  ${bulkBar()}`;
}

function bulkBar() {
  const ids = selectedIds();
  if (!ids.length) return '';
  const sales = ids.map(S.sale);
  const total = sales.reduce((a, s) => a + s.price, 0);
  const owed = sales.reduce((a, s) => a + S.saleOwed(s), 0);
  return `<div class="bulk-bar" role="toolbar" aria-label="Acciones para las ventas seleccionadas">
    <div class="bulk-info"><b>${ids.length}</b> ${ids.length === 1 ? 'seleccionada' : 'seleccionadas'} · ${money(total)}${owed > 0 ? ` · <span class="warn-text">debe ${money(owed)}</span>` : ''}
      <button class="btn ghost sm" data-act="st-clear" aria-label="Quitar selección">${icon('x', 'sm')}<span class="desk-only">Quitar selección</span></button></div>
    <div class="bulk-actions">
      ${owed > 0 ? `<button class="btn sm primary" data-act="st-paid">${icon('cash', 'sm')} Marcar cobradas</button>` : ''}
      <button class="btn sm" data-act="st-delivery" data-v="entregado">${icon('check', 'sm')} Entregadas</button>
      <button class="btn sm" data-act="st-delivery" data-v="enviado">${icon('truck', 'sm')} Enviadas</button>
      <button class="btn sm" data-act="st-more">${icon('edit', 'sm')} Cambiar…</button>
      <button class="btn sm" data-act="st-export">${icon('download', 'sm')} Exportar</button>
      <button class="btn sm danger" data-act="st-delete">${icon('trash', 'sm')} Eliminar</button>
    </div>
  </div>`;
}

function moreSheet() {
  const ids = selectedIds();
  const st = S.state.settings;
  const opt = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
  const keep = '<option value="">Sin cambiar</option>';
  return `${sheetHead(`Cambiar ${ids.length} ${ids.length === 1 ? 'venta' : 'ventas'}`)}
    <p class="small muted mb">Solo se cambia lo que elijas; lo que dejes en «Sin cambiar» se queda como está.</p>
    <form data-submit="st-apply">
      <div class="field"><label for="bk-del">Estado de entrega</label><select class="input" id="bk-del" name="delivery">${keep}${Object.entries(S.DELIVERY).map(([k, v]) => opt(k, v.label)).join('')}</select></div>
      <div class="field"><label for="bk-ch">Canal</label><select class="input" id="bk-ch" name="channel">${keep}${st.channels.map((c) => opt(c.id, c.name)).join('')}</select><span class="hint">La comisión se recalcula con el canal nuevo.</span></div>
      <div class="field"><label for="bk-m">Método de pago</label><select class="input" id="bk-m" name="method">${keep}${st.methods.map((m) => opt(m, m)).join('')}</select></div>
      <div class="field"><label for="bk-c">Cliente</label><select class="input" id="bk-c" name="clientId">${keep}<option value="_none">Sin cliente</option>${S.state.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => opt(c.id, c.name)).join('')}</select></div>
      <div class="field"><label for="bk-d">Fecha</label><input class="input" type="date" id="bk-d" name="date"><span class="hint">Déjala vacía para no cambiarla.</span></div>
      <div class="switch-row"><span>Marcar como cobradas (lo que falte)</span><input type="checkbox" class="switch" name="paid" aria-label="Marcar como cobradas"></div>
      <div class="sheet-foot"><button class="btn primary lg block" type="submit">Aplicar a ${ids.length} ${ids.length === 1 ? 'venta' : 'ventas'}</button></div>
    </form>`;
}

// Runs a change and returns a function that undoes it.
const undoable = (fn) => {
  const before = S.snapshot();
  fn();
  return () => S.replaceState(before, 'local');
};

const toggleMany = (ids) => {
  const allOn = ids.every((id) => sel.ids.has(id));
  ids.forEach((id) => (allOn ? sel.ids.delete(id) : sel.ids.add(id)));
  rerender();
};
const ctxOf = (el) => el.closest('[data-ctx]')?.dataset.ctx;

registerActions({
  'st-toggle': (el) => { if (sel.ids.has(el.dataset.id)) sel.ids.delete(el.dataset.id); else sel.ids.add(el.dataset.id); rerender(); },
  'st-group': (el) => toggleMany(el.dataset.ids.split(',')),
  'st-all': (el) => toggleMany(el.dataset.ids.split(',')),
  'st-clear': () => { sel.ids.clear(); rerender(); },
  'st-q': (el) => { tableFilter(el.dataset.ctx).q = el.value; rerender(); },
  'st-filter': (el) => { tableFilter(el.dataset.ctx).f = el.dataset.v; rerender(); },
  'st-paid': () => {
    const ids = selectedIds();
    let res;
    sel.ids.clear();
    const undo = undoable(() => { res = S.bulkMarkPaid(ids); });
    toast(`${res.n} ${res.n === 1 ? 'venta cobrada' : 'ventas cobradas'} · ${money(res.total)}`, { undo });
  },
  'st-delivery': (el) => {
    const ids = selectedIds();
    const undo = undoable(() => S.bulkEditSales(ids, { delivery: el.dataset.v }));
    toast(`${ids.length} marcadas como ${S.DELIVERY[el.dataset.v].label.toLowerCase()}`, { undo });
  },
  'st-more': () => openSheet(moreSheet),
  'st-apply': (form) => {
    const d = Object.fromEntries(new FormData(form).entries());
    const ids = selectedIds();
    const patch = {};
    if (d.delivery) patch.delivery = d.delivery;
    if (d.channel) patch.channel = d.channel;
    if (d.method) patch.method = d.method;
    if (d.clientId) patch.clientId = d.clientId === '_none' ? null : d.clientId;
    if (d.date) patch.date = d.date;
    if (!Object.keys(patch).length && !d.paid) { toast('No has elegido ningún cambio'); return; }
    sel.ids.clear();
    const undo = undoable(() => {
      if (Object.keys(patch).length) S.bulkEditSales(ids, patch);
      if (d.paid) S.bulkMarkPaid(ids, d.method || '', today());
    });
    closeSheet();
    toast(`${ids.length} ${ids.length === 1 ? 'venta actualizada' : 'ventas actualizadas'}`, { undo });
  },
  'st-export': () => exportSalesCSV(selectedIds().map(S.sale), `ventas-seleccion-${today()}.csv`),
  'st-delete': () => {
    const ids = selectedIds();
    if (!confirm(`¿Eliminar ${ids.length} ${ids.length === 1 ? 'venta' : 'ventas'}? Los pares vuelven al stock. Podrás deshacerlo justo después.`)) return;
    sel.ids.clear();
    const undo = undoable(() => S.bulkDeleteSales(ids));
    toast(`${ids.length} ${ids.length === 1 ? 'venta eliminada' : 'ventas eliminadas'}`, { undo });
  },
});
