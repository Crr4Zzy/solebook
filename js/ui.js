// Shared UI pieces: action registry, sheet (drawer/modal), toast and reusable HTML fragments.
import { esc, icon, money, signed, fmtDate, initials, monthShort, addMonths, monthName, pct } from './util.js';
import * as S from './store.js';

// ---------- actions ----------
// Elements declare data-act="name"; views register the handlers here.
export const actions = {};
export const registerActions = (obj) => Object.assign(actions, obj);

// ---------- navigation ----------
export const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
export const go = (hash) => {
  if (location.hash === hash) rerender();
  else location.hash = hash;
};
// Navigate, then run fn once the new screen is on (e.g. open a sheet over it).
export const goThen = (hash, fn) => {
  if (location.hash === hash) { rerender(); fn(); return; }
  window.addEventListener('hashchange', () => setTimeout(fn, 0), { once: true });
  location.hash = hash;
};

// ---------- sheet ----------
let sheetRender = null;
let sheetLive = false;
let ignorePop = false;
const wrap = () => document.getElementById('sheet-wrap');
const sheetEl = () => document.getElementById('sheet');
export const sheetOpen = () => !wrap().hidden;

// render: () => html. live: re-render when data changes (detail views), not for forms being typed in.
export function openSheet(render, { live = false, onMount } = {}) {
  const wasOpen = sheetOpen();
  sheetRender = render;
  sheetLive = live;
  sheetEl().innerHTML = render();
  sheetEl().scrollTop = 0;
  sheetEl()._onMount = onMount;
  onMount?.(sheetEl());
  wrap().hidden = false;
  document.body.style.overflow = 'hidden';
  if (!wasOpen) history.pushState({ sheet: 1 }, '');
  const first = sheetEl().querySelector('[autofocus]');
  if (first && matchMedia('(min-width: 900px)').matches) setTimeout(() => first.focus(), 50);
}
export function refreshSheet(force = false) {
  if (!sheetOpen() || !sheetRender || (!sheetLive && !force)) return;
  const top = sheetEl().scrollTop;
  const a = document.activeElement;
  const focusId = a && sheetEl().contains(a) && a.id ? a.id : null;
  const sel = focusId && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
  try { sheetEl().innerHTML = sheetRender(); } catch (e) { closeSheet(); return; }
  sheetEl().scrollTop = top;
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch {} }
  }
  sheetEl()._onMount?.(sheetEl());
}
// then: runs after the history entry of the sheet is gone (safe place to navigate).
let afterPop = null;
export function closeSheet(fromPop = false, then = null) {
  if (!sheetOpen()) { then?.(); return; }
  wrap().hidden = true;
  sheetEl().innerHTML = '';
  sheetRender = null;
  document.body.style.overflow = '';
  if (!fromPop && history.state?.sheet) {
    ignorePop = true;
    afterPop = then;
    history.back();
  } else then?.();
}
window.addEventListener('popstate', () => {
  if (ignorePop) {
    ignorePop = false;
    const fn = afterPop;
    afterPop = null;
    fn?.();
    return;
  }
  if (sheetOpen()) closeSheet(true);
});

export const sheetHead = (title, extra = '') =>
  `<div class="sheet-head"><h2>${esc(title)}</h2>${extra}<button class="btn ghost icon-only" data-act="close-sheet" aria-label="Cerrar">${icon('x')}</button></div>`;

// ---------- toast ----------
let toastTimer;
export function toast(message, { undo, duration = 3500 } = {}) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button type="button" data-toast-undo>Deshacer</button>' : ''}`;
  el.hidden = false;
  const btn = el.querySelector('[data-toast-undo]');
  if (btn) btn.onclick = () => { undo(); el.hidden = true; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 6000 : duration);
}

// Delete with an undo button instead of a scary confirm.
export function withUndo(message, fn) {
  const before = S.snapshot();
  fn();
  toast(message, { undo: () => S.replaceState(before, 'local') });
}

// ---------- fragments ----------
export const productThumb = (p, cls = '') => {
  const ph = p?.photos?.[0];
  return `<div class="thumb ${cls}">${ph ? `<img src="${ph}" alt="">` : icon(p?.type === 'ropa' ? 'shirt' : 'shoe')}</div>`;
};
export const avatar = (c, cls = '') => `<div class="avatar ${cls}">${esc(initials(c?.name))}</div>`;
export const pill = (label, cls = '') => `<span class="pill ${cls}">${esc(label)}</span>`;

export const empty = (ic, title, text = '', btn = '') =>
  `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3>${text ? `<p class="small">${esc(text)}</p>` : ''}${btn}</div>`;

export const kpi = (label, value, meta = '', cls = '') =>
  `<div class="kpi ${cls}"><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="meta">${meta}</div></div>`;

export const delta = (cur, prev, { suffix = '%', invert = false, abs = false } = {}) => {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || (!abs && !prev)) return '';
  const d = abs ? cur - prev : ((cur - prev) / Math.abs(prev)) * 100;
  const good = invert ? d < 0 : d > 0;
  const txt = (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toLocaleString('es-ES', { maximumFractionDigits: abs ? 1 : 0 }) + suffix;
  return `<span class="${d === 0 ? '' : good ? 'up' : 'down'}">${txt}</span>`;
};

export const monthSwitcher = (key, act) => `
  <div class="btn-row" style="flex:none;gap:4px">
    <button class="btn icon-only sm" data-act="${act}" data-delta="-1" aria-label="Mes anterior">${icon('chevL', 'sm')}</button>
    <span class="btn sm" style="min-width:132px;pointer-events:none">${monthName(key)}</span>
    <button class="btn icon-only sm" data-act="${act}" data-delta="1" aria-label="Mes siguiente">${icon('chevR', 'sm')}</button>
  </div>`;

export const saleRow = (s, { showClient = true, table = false } = {}) => {
  const p = S.product(s.productId);
  const c = S.client(s.clientId);
  const b = S.saleBadge(s);
  const net = S.saleNet(s);
  const metaBits = [p?.type === 'ropa' ? `Talla ${s.size}` : `${s.size}`, S.channel(s.channel).name, showClient && c ? c.name : '', fmtDate(s.date)].filter(Boolean);
  if (table) {
    return `<div class="row click" data-act="open-sale" data-id="${s.id}">
      ${productThumb(p, 'sm')}
      <div class="grow"><div class="title">${esc(S.productName(p))}</div><div class="meta">${esc(c ? c.name : S.channel(s.channel).name)}</div></div>
      <div class="col-size desk-only">${esc(s.size)}</div>
      <div class="col-chan desk-only small">${esc(S.channel(s.channel).name)}</div>
      <div class="col-date desk-only small muted">${fmtDate(s.date)}</div>
      <div class="col-num desk-only">${money(s.price)}</div>
      <div class="col-num ${net >= 0 ? 'ok-text' : 'danger-text'}">${signed(net)}</div>
      <div class="col-status">${pill(b.label, b.cls)}</div>
    </div>`;
  }
  return `<div class="row click" data-act="open-sale" data-id="${s.id}">
    ${productThumb(p, 'sm')}
    <div class="grow"><div class="title">${esc(S.productName(p))}</div><div class="meta">${esc(metaBits.join(' · '))}</div></div>
    <div class="end"><div class="${net >= 0 ? 'ok-text' : 'danger-text'} strong small">${signed(net)}</div>${pill(b.label, b.cls)}</div>
  </div>`;
};

// Bars for the last N months with a profit line.
export function monthsChart(endKey, n = 12, { height = 170 } = {}) {
  const keys = Array.from({ length: n }, (_, i) => addMonths(endKey, i - n + 1));
  const data = keys.map((k) => S.statsFor(S.salesInMonth(k)));
  const W = 640, H = height, padB = 22, padT = 26, padL = 4;
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const bw = (W - padL) / n;
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const bars = data.map((d, i) => {
    const x = padL + i * bw + bw * 0.18, w = bw * 0.64, yy = y(d.revenue);
    const last = i === n - 1;
    return `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${w.toFixed(1)}" height="${(H - padB - yy).toFixed(1)}" rx="3" fill="${last ? 'var(--accent)' : 'var(--accent-light)'}"><title>${monthName(keys[i])}: ${money(d.revenue)} · beneficio ${money(d.net)}</title></rect>
      <text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${monthShort(keys[i])}</text>`;
  }).join('');
  const pts = data.map((d, i) => `${(padL + i * bw + bw / 2).toFixed(1)},${y(Math.max(0, d.net)).toFixed(1)}`).join(' ');
  const lastD = data[n - 1];
  const lx = padL + (n - 1) * bw + bw / 2, ly = y(Math.max(0, lastD.net));
  const labelY = Math.max(12, Math.min(y(lastD.revenue), ly) - 8);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Facturación y beneficio por mes">
    ${bars}
    <polyline points="${pts}" fill="none" stroke="#C26A1A" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="${lx}" cy="${ly}" r="4" fill="#C26A1A"/>
    <text x="${W - 2}" y="${labelY}" text-anchor="end" style="fill:#C26A1A;font-weight:600">${money(lastD.net)}</text>
  </svg>
  <div class="legend mt"><span><i style="background:var(--accent-light)"></i>Facturación</span><span><i style="background:#C26A1A;height:3px;vertical-align:3px"></i>Beneficio neto</span></div>`;
}

export const barsList = (items, { valueFmt = money, colors } = {}) => {
  if (!items.length) return '<p class="muted small">Sin datos en este periodo.</p>';
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return `<div class="bars">${items.map((it, idx) => `
    <div class="bar-row"><div class="bar-label"><span>${esc(it.label)}</span><span class="strong">${valueFmt(it.value)}${it.extra ? ` <span class="muted">${esc(it.extra)}</span>` : ''}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, (Math.abs(it.value) / max) * 100).toFixed(1)}%;${colors ? `background:${colors[idx % colors.length]}` : ''}"></div></div></div>`).join('')}</div>`;
};

export const CHANNEL_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];

// Profit grouped by channel; StockX/Hypeboost/Alias collapse into "Plataformas".
export const profitByChannel = (sales) => {
  const map = new Map();
  sales.forEach((s) => {
    const c = S.channel(s.channel);
    const key = c.platform ? 'Plataformas' : c.name;
    map.set(key, (map.get(key) || 0) + S.saleNet(s));
  });
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

export const marginText = (net, price) => (price ? pct((net / price) * 100, 0) : '—');
