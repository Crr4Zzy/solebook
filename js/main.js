import { icon, esc } from './util.js';
import * as S from './store.js';
import { actions, closeSheet, sheetOpen, refreshSheet, go } from './ui.js';
import { initSync, onStatus, getStatus } from './sync.js';
import { stopScanner } from './scanner.js';
import { loadCatalogKey } from './catalog.js';
import './sheets.js';
import * as panel from './views/panel.js';
import * as ventas from './views/ventas.js';
import * as vender from './views/vender.js';
import * as clientes from './views/clientes.js';
import * as stock from './views/stock.js';
import * as informes from './views/informes.js';
import * as ajustes from './views/ajustes.js';
import * as mas from './views/mas.js';

const ROUTES = {
  '': { view: panel, nav: 'panel' },
  ventas: { view: ventas, nav: 'ventas' },
  vender: { view: vender, nav: 'vender' },
  clientes: { view: clientes.list, nav: 'clientes' },
  cliente: { view: clientes.detail, nav: 'clientes' },
  stock: { view: stock.list, nav: 'stock' },
  producto: { view: stock.detail, nav: 'stock' },
  informes: { view: informes, nav: 'informes' },
  ajustes: { view: ajustes, nav: 'ajustes' },
  mas: { view: mas, nav: 'mas' },
};

const parseHash = () => {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const [name = '', id = ''] = path.split('/');
  return { name, id: decodeURIComponent(id), query: Object.fromEntries(new URLSearchParams(qs || '')) };
};

// ---------- chrome ----------
function renderSidebar(nav) {
  const owed = S.owedSales().length;
  const ship = S.toShip().length;
  const link = (key, href, ic, label, count = 0) =>
    `<a class="nav-link ${nav === key ? 'on' : ''}" href="${href}">${icon(ic)}${label}${count ? `<span class="count">${count}</span>` : ''}</a>`;
  const st = getStatus();
  document.getElementById('sidebar').innerHTML = `
    <div class="brand"><img src="icons/icon.svg" alt="">${esc(S.state.settings.businessName || 'SoleBook')}</div>
    <a class="btn primary side-btn" href="#/vender">${icon('plus')} Nueva venta <kbd>N</kbd></a>
    ${link('panel', '#/', 'home', 'Panel')}
    ${link('ventas', '#/ventas', 'receipt', 'Ventas', ship)}
    ${link('clientes', '#/clientes', 'users', 'Clientes', owed)}
    ${link('stock', '#/stock', 'box', 'Inventario')}
    ${link('informes', '#/informes', 'chart', 'Informes')}
    ${link('ajustes', '#/ajustes', 'settings', 'Ajustes')}
    <a class="side-foot" href="#/ajustes?s=sync" title="${esc(st.message)}"><span class="dot ${st.state === 'ok' ? 'ok' : st.state === 'error' ? 'err' : st.state === 'off' ? '' : 'warn'}"></span>${esc(st.state === 'off' ? 'Solo en este dispositivo' : st.message)}</a>`;
}

function renderTabbar(nav) {
  const more = ['mas', 'ventas', 'informes', 'ajustes'].includes(nav);
  const t = (key, href, ic, label, on) => `<a href="${href}" class="${on ? 'on' : ''}">${icon(ic)}<span>${label}</span></a>`;
  document.getElementById('tabbar').innerHTML = `
    ${t('panel', '#/', 'home', 'Inicio', nav === 'panel')}
    ${t('clientes', '#/clientes', 'users', 'Clientes', nav === 'clientes')}
    <a href="#/vender" aria-label="Nueva venta"><span class="fab">${icon('plus')}</span></a>
    ${t('stock', '#/stock', 'box', 'Stock', nav === 'stock')}
    ${t('mas', '#/mas', 'menu', 'Más', more)}`;
}

// ---------- render ----------
let lastRouteKey = null;
function render() {
  const { name, id, query } = parseHash();
  const route = ROUTES[name] || ROUTES[''];
  const main = document.getElementById('main');
  const routeKey = `${name}/${id}`;
  const sameRoute = routeKey === lastRouteKey;

  // keep focus and caret when re-rendering the same screen (typing in a search box)
  const active = document.activeElement;
  const focusId = sameRoute && active && main.contains(active) && active.id ? active.id : null;
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = window.scrollY;

  if (!sameRoute && name !== 'vender') stopScanner();
  renderSidebar(route.nav);
  renderTabbar(route.nav);
  try {
    main.innerHTML = route.view.render({ id, query, fresh: !sameRoute });
    route.view.mount?.(main, { id, query, fresh: !sameRoute });
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="empty">${icon('alert')}<h3>No se ha encontrado</h3><p class="small">Puede que se haya borrado.</p><a class="btn mt" href="#/">Volver al inicio</a></div>`;
  }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); if (sel) try { el.setSelectionRange(...sel); } catch {} }
  }
  if (sameRoute) window.scrollTo(0, scroll);
  else window.scrollTo(0, 0);
  lastRouteKey = routeKey;
  document.title = `${route.view.title?.({ id }) || 'SoleBook'} · ${S.state.settings.businessName || 'SoleBook'}`;
}

function applyTheme() {
  const dark = S.state.settings.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#1C1D1B' : '#F6F3EC';
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-submit]');
  if (!form) return;
  e.preventDefault();
  actions[form.dataset.submit]?.(form, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el) actions[el.dataset.input]?.(el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) actions[el.dataset.change]?.(el, e);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen()) { closeSheet(); return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (typing || e.metaKey || e.ctrlKey || e.altKey || sheetOpen()) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); go('#/vender'); }
  if (e.key === '/') {
    const s = document.querySelector('[data-search]');
    if (s) { e.preventDefault(); s.focus(); }
  }
});
window.addEventListener('hashchange', () => {
  if (sheetOpen()) closeSheet(true);
  render();
});

// ---------- start ----------
async function start() {
  await S.load();
  await loadCatalogKey().catch(() => {});
  applyTheme();
  S.subscribe(() => {
    applyTheme();
    render();
    refreshSheet();
  });
  onStatus(() => {
    const nav = (ROUTES[parseHash().name] || ROUTES['']).nav;
    if (nav === 'ajustes' || nav === 'mas') render();
    else renderSidebar(nav);
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__installPrompt = e;
  });
  render();
  initSync();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
}
start();
