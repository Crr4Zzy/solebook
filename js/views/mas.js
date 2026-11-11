import { icon, esc, money } from '../util.js';
import * as S from '../store.js';
import { getStatus } from '../sync.js';

export const title = () => 'Más';

export function render() {
  const st = getStatus();
  const item = (href, ic, label, extra = '') => `<a class="row" href="${href}">${icon(ic)}<span class="grow">${label}</span>${extra}${icon('chevR', 'chev')}</a>`;
  return `
    <div class="page-head"><h1>Más</h1></div>
    <div class="card more-list"><div class="list">
      ${item('#/ventas', 'receipt', 'Todas las ventas', S.toShip().length ? `<span class="pill warn">${S.toShip().length} por enviar</span>` : '')}
      <a class="row" href="#" data-act="sales-import">${icon('upload')}<span class="grow">Importar ventas desde Excel</span>${icon('chevR', 'chev')}</a>
      ${item('#/informes', 'chart', 'Informes')}
      ${item('#/ventas?f=cobrar', 'cash', 'Pendiente de cobro', S.totalOwed() ? `<span class="pill warn">${money(S.totalOwed())}</span>` : '')}
      ${item('#/ventas?f=reservas', 'clock', 'Reservas', S.reservations().length ? `<span class="pill accent">${S.reservations().length}</span>` : '')}
    </div></div>
    <div class="card more-list"><div class="list">
      ${item('#/ajustes?s=sync', 'cloud', 'Sincronizar móvil y PC', `<span class="small muted">${esc(st.state === 'off' ? 'Desactivado' : st.message)}</span>`)}
      ${item('#/ajustes', 'settings', 'Ajustes, comisiones y copias')}
    </div></div>`;
}
