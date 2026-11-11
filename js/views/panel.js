import { esc, icon, money, fmtDate, currentMonth, addMonths, monthName, today, addDays } from '../util.js';
import * as S from '../store.js';
import { registerActions, kpi, delta, monthSwitcher, monthsChart, barsList, profitByChannel, CHANNEL_COLORS, avatar, pill, saleRow, productThumb } from '../ui.js';

let month = currentMonth();

export const title = () => 'Panel';

export const sampleBanner = () => S.state.meta.isSample
  ? `<div class="sample-banner">${icon('star', 'sm')}<span class="grow">Estás viendo <b>datos de ejemplo</b> para probar la app. Cuando quieras, bórralos y empieza con los tuyos.</span><button class="btn sm" data-act="clear-sample">Empezar con mis datos</button></div>`
  : '';

export function render() {
  const st = S.state.settings;
  const cur = S.statsFor(S.salesInMonth(month));
  // In the month in progress, compare with the same days of last month (1–11 vs 1–11), not the whole month.
  const prevKey = addMonths(month, -1);
  const cutDay = month === currentMonth() ? today().slice(8) : null;
  const prev = S.statsFor(S.salesInMonth(prevKey).filter((s) => !cutDay || s.date.slice(8) <= cutDay));
  const prevAbbr = monthName(prevKey, false).slice(0, 3).toLowerCase();
  const prevLabel = cutDay ? `1–${Number(cutDay)} ${prevAbbr}` : prevAbbr;
  const owed = S.owedSales();
  const totalOwed = S.totalOwed();
  const owedClients = new Set(owed.map((s) => s.clientId || `ch:${s.channel}`)).size;
  const ship = S.toShip();
  const res = S.reservations();
  const t = today();
  const resDue = res.filter((s) => s.reservedUntil && s.reservedUntil <= addDays(t, 1));
  const stale = S.availableUnits().filter(S.isStale);
  const matches = S.wishMatches().filter((m) => m.units.length);
  const allWishes = S.wishMatches();
  const isCurrent = month === currentMonth();
  const hello = st.ownerName ? `Hola, ${esc(st.ownerName.split(' ')[0])}` : 'Hola';

  const alerts = [
    resDue.length ? `<a class="alert danger" href="#/ventas?f=reservas">${icon('clock', 'sm')}<span class="grow">${resDue.length === 1 ? 'Una reserva vence' : `${resDue.length} reservas vencen`} hoy o mañana</span>${icon('chevR', 'sm')}</a>` : '',
    ship.length ? `<a class="alert warn" href="#/ventas?f=enviar">${icon('truck', 'sm')}<span class="grow">${ship.length} ${ship.length === 1 ? 'venta' : 'ventas'} por enviar</span>${icon('chevR', 'sm')}</a>` : '',
    stale.length ? `<a class="alert warn" href="#/stock?f=parado">${icon('alert', 'sm')}<span class="grow">${stale.length} ${stale.length === 1 ? 'unidad lleva' : 'unidades llevan'} más de ${st.staleDays} días</span>${icon('chevR', 'sm')}</a>` : '',
    matches.length ? `<a class="alert ok" href="#/clientes?f=buscan">${icon('heart', 'sm')}<span class="grow">Tienes comprador para ${matches.length} ${matches.length === 1 ? 'par' : 'pares'} en stock</span>${icon('chevR', 'sm')}</a>` : '',
  ].filter(Boolean).join('');

  const pending = [
    ...res.map((s) => ({ s, ic: 'clock', text: `Reserva: ${S.productName(S.product(s.productId))} · ${s.size}`, sub: `${S.client(s.clientId)?.name || ''} · hasta ${fmtDate(s.reservedUntil)}`, badge: s.reservedUntil <= t ? pill('vence', 'danger') : pill(fmtDate(s.reservedUntil), 'accent') })),
    ...ship.map((s) => ({ s, ic: 'truck', text: `Enviar ${S.productName(S.product(s.productId))} · ${s.size}`, sub: `${S.channel(s.channel).name}${S.client(s.clientId) ? ` · ${S.client(s.clientId).name}` : ''}`, badge: pill(`vendido ${fmtDate(s.date)}`, 'warn') })),
  ];

  const owedRows = owed.slice(0, 6).map((s) => {
    const c = S.client(s.clientId);
    const who = c ? avatar(c) : `<div class="avatar">${icon(S.channel(s.channel).platform ? 'box' : 'tag', 'sm')}</div>`;
    return `<div class="row click" data-act="open-sale" data-id="${s.id}">${who}
      <div class="grow"><div class="title">${esc(c?.name || S.channel(s.channel).name)}</div><div class="meta">${esc(S.productName(S.product(s.productId)))} · ${esc(s.size)}</div></div>
      <div class="end"><div class="strong">${money(S.saleOwed(s))}</div><div class="tiny muted">${fmtDate(s.date)}</div></div></div>`;
  }).join('');

  const matchRows = allWishes.slice(0, 5).map((m) => `<a class="row" href="#/cliente/${m.client.id}">
      <div class="grow"><div class="title">${esc(m.wish.text)}${m.wish.size ? ` · ${esc(m.wish.size)}` : ''}</div><div class="meta">${esc(m.client.name)} lo busca</div></div>
      ${m.units.length ? pill('en stock', 'ok') : pill('sin stock')}</a>`).join('');

  const recent = S.state.sales.slice().sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt)).slice(0, 6);

  return `
    ${sampleBanner()}
    <div class="page-head">
      <h1><span class="mob-only">${hello}</span><span class="desk-only">Panel</span></h1>
      ${monthSwitcher(month, 'panel-month')}
    </div>
    ${alerts ? `<div class="alerts">${alerts}</div>` : ''}
    <div class="quick">
      <a href="#/vender">${icon('plus')}Vender</a>
      <a href="#/vender?scan=1">${icon('barcode')}Escanear</a>
      <a href="#/stock?add=1">${icon('box')}Añadir stock</a>
    </div>
    <div class="kpis">
      ${kpi('Facturación', money(cur.revenue), `${prevLabel} ${money(prev.revenue)} · ${delta(cur.revenue, prev.revenue)}`)}
      ${kpi('Beneficio neto', money(cur.net), `${prevLabel} ${money(prev.net)} · ${delta(cur.net, prev.net)}`)}
      <a href="#/clientes?f=deben" style="color:inherit">${kpi('Te deben', money(totalOwed), totalOwed ? `${owedClients} ${owedClients === 1 ? 'pendiente' : 'pendientes'}${res.length ? ` · ${res.length} ${res.length === 1 ? 'reserva' : 'reservas'}` : ''}` : 'Todo cobrado', totalOwed ? 'warn' : '')}</a>
      ${kpi(cur.clothes ? 'Pares · prendas' : 'Pares vendidos', cur.clothes ? `${cur.shoes} · ${cur.clothes}` : cur.shoes, `margen ${Number.isFinite(cur.margin) ? cur.margin.toFixed(1).replace('.', ',') + '%' : '—'}`)}
    </div>

    <div class="grid wide-left">
      <div class="card">
        <div class="card-head"><h2>Últimos 12 meses</h2><a class="link" href="#/informes">Informes</a></div>
        ${monthsChart(month)}
      </div>
      <div class="card">
        <div class="card-head"><h2>Pendiente${isCurrent ? ' hoy' : ''}</h2></div>
        <div class="list">${pending.slice(0, 6).map((x) => `<div class="row click" data-act="open-sale" data-id="${x.s.id}">
          <span class="muted">${icon(x.ic)}</span><div class="grow"><div class="title">${esc(x.text)}</div><div class="meta">${esc(x.sub)}</div></div>${x.badge}</div>`).join('') || `<div class="empty" style="padding:16px">${icon('check')}<p class="small">Nada pendiente de enviar ni reservas.</p></div>`}</div>
      </div>
    </div>

    <div class="grid cols-3 mt">
      <div class="card">
        <div class="card-head"><h2>Pendiente de cobro</h2>${owed.length > 6 ? `<a class="link" href="#/ventas?f=cobrar">Ver ${owed.length}</a>` : ''}</div>
        <div class="list">${owedRows || '<p class="muted small">Todo cobrado.</p>'}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Beneficio por canal</h2></div>
        ${barsList(profitByChannel(S.salesInMonth(month)), { colors: CHANNEL_COLORS })}
        <p class="tiny muted">Plataformas: StockX, Hypeboost y Alias juntas.</p>
      </div>
      <div class="card">
        <div class="card-head"><h2>Tus clientes buscan</h2><a class="link" href="#/clientes?f=buscan">Ver todo</a></div>
        <div class="list">${matchRows || '<p class="muted small">Apunta en la ficha de cada cliente lo que busca y te avisaré cuando lo tengas.</p>'}</div>
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h2>Últimas ventas</h2><a class="link" href="#/ventas">Ver todas</a></div>
      <div class="list">${recent.map((s) => saleRow(s)).join('') || '<p class="muted small">Todavía no hay ventas.</p>'}</div>
    </div>`;
}

registerActions({
  'panel-month': (el) => {
    const next = addMonths(month, Number(el.dataset.delta));
    if (next > currentMonth()) return;
    month = next;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },
  'clear-sample': () => {
    if (!confirm('Se borrarán todos los datos de ejemplo (ventas, clientes y stock). Tus ajustes se mantienen. ¿Seguir?')) return;
    S.clearAllData(true);
    location.hash = '#/';
  },
});
