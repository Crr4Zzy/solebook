import { esc, icon, money, signed, currentMonth, addMonths, monthName, pct, sizeSort, today } from '../util.js';
import * as S from '../store.js';
import { registerActions, kpi, delta, monthsChart, barsList, profitByChannel, CHANNEL_COLORS, rerender } from '../ui.js';
import { exportSalesCSV } from '../io.js';

const f = { mode: 'month', month: currentMonth(), year: Number(currentMonth().slice(0, 4)) };

export const title = () => 'Informes';

const periodSales = (mode, month, year) => (mode === 'month'
  ? S.salesInMonth(month)
  : S.salesIn(`${year}-01-01`, `${year}-12-31`));

const top = (sales, keyFn, labelFn, n = 6, valueFn = S.saleNet) => {
  const map = new Map();
  sales.forEach((s) => {
    const k = keyFn(s);
    if (k == null) return;
    const e = map.get(k) || { key: k, value: 0, count: 0 };
    e.value += valueFn(s);
    e.count += 1;
    map.set(k, e);
  });
  return [...map.values()].sort((a, b) => b.value - a.value).slice(0, n).map((e) => ({ label: labelFn(e.key), value: e.value, extra: `${e.count} ${e.count === 1 ? 'venta' : 'ventas'}` }));
};

export function render() {
  const isMonth = f.mode === 'month';
  const sales = periodSales(f.mode, f.month, f.year);
  // Period in progress: compare with the same stretch of the previous one (1–11 nov vs 1–11 oct).
  const t = today();
  const inProgress = isMonth ? f.month === currentMonth() : f.year === Number(t.slice(0, 4));
  const prevSales = isMonth
    ? S.salesInMonth(addMonths(f.month, -1)).filter((s) => !inProgress || s.date.slice(8) <= t.slice(8))
    : periodSales('year', null, f.year - 1).filter((s) => !inProgress || s.date.slice(5) <= t.slice(5));
  const cur = S.statsFor(sales);
  const prev = S.statsFor(prevSales);
  const prevName = isMonth ? monthName(addMonths(f.month, -1), false).toLowerCase() : String(f.year - 1);
  const prevLabel = inProgress ? (isMonth ? `1–${Number(t.slice(8))} ${prevName.slice(0, 3)}` : `${prevName} hasta hoy`) : prevName;
  const label = isMonth ? monthName(f.month) : String(f.year);
  const endKey = isMonth ? f.month : (f.year === Number(currentMonth().slice(0, 4)) ? currentMonth() : `${f.year}-12`);

  // sizes chart: shoes only, numeric sort
  const sizeCounts = {};
  sales.filter((s) => S.product(s.productId)?.type !== 'ropa').forEach((s) => { sizeCounts[s.size] = (sizeCounts[s.size] || 0) + 1; });
  const sizeItems = Object.keys(sizeCounts).sort(sizeSort).map((k) => ({ label: k, value: sizeCounts[k] }));
  const maxSize = Math.max(1, ...sizeItems.map((x) => x.value));

  const byType = [
    { label: 'Zapatillas', value: sales.filter((s) => S.product(s.productId)?.type !== 'ropa').reduce((a, s) => a + S.saleNet(s), 0) },
    { label: 'Ropa', value: sales.filter((s) => S.product(s.productId)?.type === 'ropa').reduce((a, s) => a + S.saleNet(s), 0) },
  ].filter((x) => x.value);

  const methods = top(sales.flatMap((s) => (s.payments || []).map((p) => ({ ...p, _m: p.method }))), (p) => p._m || 'Sin método', (k) => k, 8, (p) => p.amount);

  return `
    <div class="page-head">
      <h1>Informes</h1>
      <button class="btn desk-only" data-act="rep-export">${icon('download')} Exportar ${esc(label)}</button>
    </div>
    <div class="page-head" style="margin-bottom:14px">
      <div class="chips"><button class="chip ${isMonth ? 'on' : ''}" data-act="rep-mode" data-v="month">Mes</button><button class="chip ${!isMonth ? 'on' : ''}" data-act="rep-mode" data-v="year">Año</button></div>
      <div class="btn-row" style="flex:none;gap:4px;margin-left:auto">
        <button class="btn icon-only sm" data-act="rep-step" data-delta="-1" aria-label="Anterior">${icon('chevL', 'sm')}</button>
        <span class="btn sm" style="min-width:132px;pointer-events:none">${esc(label)}</span>
        <button class="btn icon-only sm" data-act="rep-step" data-delta="1" aria-label="Siguiente">${icon('chevR', 'sm')}</button>
      </div>
    </div>
    <div class="kpis">
      ${kpi('Facturación', money(cur.revenue), `${prevLabel} ${money(prev.revenue)} · ${delta(cur.revenue, prev.revenue)}`)}
      ${kpi('Beneficio neto', money(cur.net), `${prevLabel} ${money(prev.net)} · ${delta(cur.net, prev.net)}`)}
      ${kpi('Margen', pct(cur.margin), `${prevLabel} ${pct(prev.margin)} · ${delta(cur.margin, prev.margin, { suffix: ' pts', abs: true })}`)}
      ${kpi('Ventas', cur.count, `${cur.shoes} pares · ${cur.clothes} prendas`)}
    </div>
    <div class="kpis">
      ${kpi('Ticket medio', money(cur.ticket), delta(cur.ticket, prev.ticket))}
      ${kpi('Días hasta vender', Number.isFinite(cur.daysToSell) ? Math.round(cur.daysToSell) : '—', Number.isFinite(prev.daysToSell) ? `${prevLabel} ${Math.round(prev.daysToSell)} · ${delta(cur.daysToSell, prev.daysToSell, { suffix: ' días', abs: true, invert: true })}` : 'desde que lo compras')}
      ${kpi('Beneficio medio', cur.count ? signed(cur.net / cur.count) : '—', 'por venta')}
      ${kpi('Clientes', new Set(sales.map((s) => s.clientId).filter(Boolean)).size, 'distintos con compra')}
    </div>

    <div class="card">
      <div class="card-head"><h2>Facturación y beneficio por mes</h2></div>
      ${monthsChart(endKey, 12, { height: 190 })}
    </div>

    <div class="grid cols-3 mt">
      <div class="card"><div class="card-head"><h2>Beneficio por canal</h2></div>${barsList(profitByChannel(sales), { colors: CHANNEL_COLORS })}</div>
      <div class="card"><div class="card-head"><h2>Por marca</h2></div>${barsList(top(sales, (s) => S.product(s.productId)?.brand || '—', (k) => k))}</div>
      <div class="card"><div class="card-head"><h2>Tallas que más salen</h2></div>
        ${sizeItems.length ? `<svg class="chart" viewBox="0 0 ${Math.max(sizeItems.length * 44, 200)} 140" role="img" aria-label="Ventas por talla">
          ${sizeItems.map((it, i) => { const h = (it.value / maxSize) * 100; return `<rect x="${i * 44 + 8}" y="${112 - h}" width="28" height="${h}" rx="3" fill="var(--accent)"><title>${esc(it.label)}: ${it.value}</title></rect><text x="${i * 44 + 22}" y="${106 - h}" text-anchor="middle" style="fill:var(--text)">${it.value}</text><text x="${i * 44 + 22}" y="132" text-anchor="middle">${esc(it.label)}</text>`; }).join('')}
        </svg>` : '<p class="muted small">Sin ventas de zapatillas en este periodo.</p>'}
      </div>
    </div>

    <div class="grid cols-3 mt">
      <div class="card"><div class="card-head"><h2>Modelos que más dejan</h2></div>${barsList(top(sales, (s) => s.productId, (k) => S.productName(S.product(k))))}</div>
      <div class="card"><div class="card-head"><h2>Mejores clientes</h2></div>${barsList(top(sales, (s) => s.clientId || null, (k) => S.client(k)?.name || '—', 6, (s) => s.price))}</div>
      <div class="card"><div class="card-head"><h2>Cobrado por método</h2></div>${barsList(methods)}
        ${byType.length > 1 ? `<h3 class="mt-lg mb">Zapatillas vs ropa</h3>${barsList(byType, { colors: ['var(--c1)', 'var(--c3)'] })}` : ''}</div>
    </div>
    <button class="btn block mt mob-only" data-act="rep-export">${icon('download')} Exportar ${esc(label)} a Excel</button>`;
}

registerActions({
  'rep-mode': (el) => { f.mode = el.dataset.v; rerender(); },
  'rep-step': (el) => {
    const d = Number(el.dataset.delta);
    if (f.mode === 'month') {
      const n = addMonths(f.month, d);
      if (n <= currentMonth()) f.month = n;
    } else if (f.year + d <= Number(currentMonth().slice(0, 4))) f.year += d;
    rerender();
  },
  'rep-export': () => exportSalesCSV(periodSales(f.mode, f.month, f.year), `ventas-${f.mode === 'month' ? f.month : f.year}.csv`),
});
