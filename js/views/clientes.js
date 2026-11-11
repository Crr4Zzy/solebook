import { esc, icon, money, signed, fmtDate, matches, waLink } from '../util.js';
import * as S from '../store.js';
import { registerActions, avatar, pill, empty, kpi, saleRow, rerender, withUndo, toast, go } from '../ui.js';
import { openClientForm, openPayment } from '../sheets.js';
import { openImport } from '../importer.js';

const f = { q: '', filter: '', sort: 'last' };
let lastQueryF = null;

const igLink = (h) => `https://instagram.com/${String(h).replace(/^@/, '')}`;

// ---------- list ----------
export const list = {
  title: () => 'Clientes',
  render({ query }) {
    if (query.f !== undefined && query.f !== lastQueryF) { f.filter = query.f; lastQueryF = query.f; }
    const allWm = S.wishMatches();
    const rows = S.state.clients.map((c) => ({ c, st: S.clientStats(c.id), wm: allWm.filter((m) => m.client.id === c.id && m.units.length) }))
      .filter(({ c, st, wm }) => {
        if (f.filter === 'deben' && st.owed <= 0) return false;
        if (f.filter === 'buscan' && !wm.length) return false;
        if (f.q && !matches(`${c.name} ${c.phone || ''} ${c.instagram || ''} ${c.brands || ''} ${c.sizes || ''}`, f.q)) return false;
        return true;
      })
      .sort((a, b) => f.sort === 'total' ? b.st.total - a.st.total : f.sort === 'name' ? a.c.name.localeCompare(b.c.name) : f.filter === 'deben' ? b.st.owed - a.st.owed : (b.st.last || b.c.createdAt || '').localeCompare(a.st.last || a.c.createdAt || ''));
    const owedN = S.state.clients.filter((c) => S.clientStats(c.id).owed > 0).length;
    const wishN = new Set(allWm.filter((m) => m.units.length).map((m) => m.client.id)).size;

    return `
      <div class="page-head"><h1>Clientes</h1>
        <button class="btn primary" data-act="client-new">${icon('userPlus')} <span class="desk-only">Nuevo cliente</span><span class="mob-only">Nuevo</span></button></div>
      <div class="input-wrap search-top">${icon('search')}<input class="input" id="clients-q" data-search data-input="clients-q" placeholder="Buscar por nombre, teléfono o Instagram" value="${esc(f.q)}" autocomplete="off"></div>
      <div class="chips scroll mb">
        <button class="chip ${!f.filter ? 'on' : ''}" data-act="clients-filter" data-v="">Todos <span class="n">${S.state.clients.length}</span></button>
        <button class="chip warn ${f.filter === 'deben' ? 'on' : ''}" data-act="clients-filter" data-v="deben">Te deben <span class="n">${owedN}</span></button>
        <button class="chip ${f.filter === 'buscan' ? 'on' : ''}" data-act="clients-filter" data-v="buscan">Tienes lo que buscan <span class="n">${wishN}</span></button>
        <select class="input" style="width:auto;min-height:36px;padding:6px 10px;font-size:14px;border-radius:20px" data-change="clients-sort" aria-label="Ordenar">
          <option value="last" ${f.sort === 'last' ? 'selected' : ''}>Última compra</option>
          <option value="total" ${f.sort === 'total' ? 'selected' : ''}>Más gastado</option>
          <option value="name" ${f.sort === 'name' ? 'selected' : ''}>Nombre</option>
        </select>
      </div>
      <div class="card">
        ${rows.length ? `<div class="table">
          <div class="thead"><span style="width:36px"></span><span style="flex:1">Cliente</span><span class="col-num">Compras</span><span class="col-num">Total</span><span class="col-num">Debe</span><span class="col-date">Última</span></div>
          <div class="list">${rows.map(({ c, st, wm }) => `<a class="row" href="#/cliente/${c.id}">${avatar(c)}
            <div class="grow"><div class="title">${esc(c.name)}</div><div class="meta">${esc([`${st.count} ${st.count === 1 ? 'compra' : 'compras'}`, c.sizes && `talla ${c.sizes}`, (c.wishes || []).length ? `busca ${c.wishes.map((w) => w.text).join(', ')}` : ''].filter(Boolean).join(' · '))}</div></div>
            <div class="col-num desk-only">${st.count}</div>
            <div class="col-num desk-only">${money(st.total)}</div>
            <div class="col-num">${st.owed > 0 ? `<span class="warn-text strong">${money(st.owed)}</span>` : '<span class="muted desk-only">—</span>'}</div>
            <div class="col-date desk-only small muted">${st.last ? fmtDate(st.last) : '—'}</div>
            ${wm.length ? pill('tienes lo que busca', 'ok') : ''}
          </a>`).join('')}</div></div>`
        : S.state.clients.length ? empty('search', 'Nadie con este filtro', 'Prueba con otro nombre.')
        : empty('users', 'Apunta a tus compradores', 'Guarda su teléfono, su talla y lo que buscan. Verás lo que te compran y lo que te deben.', '<button class="btn primary" data-act="client-new">Añadir cliente</button>')}
      </div>`;
  },
};

// ---------- detail ----------
export const detail = {
  title: ({ id }) => S.client(id)?.name || 'Cliente',
  render({ id }) {
    const c = S.client(id);
    if (!c) throw new Error('not found');
    const st = S.clientStats(id);
    const matchesForClient = S.wishMatches().filter((m) => m.client.id === id);
    const owedSales = st.sales.filter((s) => S.saleOwed(s) > 0);

    return `
      <div class="page-head">
        <a class="back" href="#/clientes" aria-label="Volver">${icon('chevL')}</a>
        <h1 style="display:flex;align-items:center;gap:12px">${avatar(c, 'lg')}<span>${esc(c.name)}<span class="muted small" style="display:block;font-weight:400">${esc([c.sizes && `Talla ${c.sizes}`, c.brands].filter(Boolean).join(' · ') || `Cliente desde ${fmtDate(c.createdAt, true)}`)}</span></span></h1>
        <button class="btn icon-only" data-act="client-edit" data-id="${id}" aria-label="Editar">${icon('edit')}</button>
      </div>
      <div class="btn-row mb">
        ${c.phone ? `<a class="btn wa" href="${waLink(c.phone)}" target="_blank" rel="noopener">${icon('wa')} WhatsApp</a><a class="btn" href="tel:${esc(c.phone)}">${icon('phone')} Llamar</a>` : ''}
        ${c.instagram ? `<a class="btn" href="${igLink(c.instagram)}" target="_blank" rel="noopener">${icon('insta')} ${esc(c.instagram)}</a>` : ''}
        <a class="btn primary" href="#/vender?cliente=${id}">${icon('plus')} Nueva venta</a>
        <button class="btn" data-act="client-import" data-id="${id}">${icon('upload')} Importar ventas</button>
      </div>
      <div class="kpis">
        ${kpi('Compras', st.count, st.last ? `última ${fmtDate(st.last)}` : 'sin compras')}
        ${kpi('Total gastado', money(st.total), st.count ? `media ${money(st.total / st.count)}` : '')}
        ${kpi('Te ha dejado', `<span class="${st.profit >= 0 ? 'ok-text' : 'danger-text'}">${signed(st.profit)}</span>`, 'beneficio neto')}
        ${kpi('Te debe', money(st.owed), owedSales.length ? `${owedSales.length} ${owedSales.length === 1 ? 'venta' : 'ventas'}` : 'al día', st.owed > 0 ? 'warn' : '')}
      </div>
      ${owedSales.length ? `<div class="card mb" style="border-color:var(--warn-bg)">
        <div class="card-head"><h2>Pendiente de cobro</h2></div>
        <div class="list">${owedSales.map((s) => `<div class="row"><div class="grow"><div class="title">${esc(S.productName(S.product(s.productId)))} · ${esc(s.size)}</div><div class="meta">${fmtDate(s.date)} · pagado ${money(S.salePaid(s))} de ${money(s.price)}</div></div>
          <button class="btn sm primary" data-act="client-pay" data-id="${s.id}">Cobrar ${money(S.saleOwed(s))}</button></div>`).join('')}</div></div>` : ''}

      <div class="grid wide-left">
        <div class="card">
          <div class="card-head"><h2>Historial</h2><span class="muted small">${st.count}</span></div>
          <div class="list">${st.sales.map((s) => saleRow(s, { showClient: false })).join('') || '<p class="muted small">Todavía no te ha comprado nada.</p>'}</div>
        </div>
        <div>
          <div class="card">
            <div class="card-head"><h2>Busca</h2></div>
            <div class="list">${(c.wishes || []).map((w) => {
              const m = matchesForClient.find((x) => x.wish.id === w.id);
              const has = m?.units.length;
              return `<div class="row"><div class="grow"><div class="title">${esc(w.text)}${w.size ? ` · ${esc(w.size)}` : ''}</div><div class="meta">${has ? `Lo tienes: ${m.units.length} en stock` : `Apuntado ${fmtDate(w.createdAt)}`}</div></div>
                ${has ? `<a class="btn sm primary" href="#/vender?cliente=${id}&producto=${m.units[0].productId}">Vender</a>` : pill('esperando')}
                <button class="btn ghost icon-only sm" data-act="wish-del" data-id="${id}" data-wid="${w.id}" aria-label="Quitar">${icon('x', 'sm')}</button></div>`;
            }).join('') || '<p class="muted small">Apunta lo que busca y te avisaré en el panel cuando lo tengas en stock.</p>'}</div>
            <form class="mt" data-submit="wish-add" data-id="${id}" style="display:flex;gap:8px">
              <input class="input" name="text" placeholder="Jordan 4 Military" style="flex:2" autocomplete="off" aria-label="Modelo que busca">
              <input class="input" name="size" placeholder="${esc((c.sizes || '43').split(/[\s/]/)[0])}" style="flex:1;min-width:0" aria-label="Talla" autocomplete="off">
              <button class="btn icon-only" type="submit" aria-label="Añadir">${icon('plus')}</button>
            </form>
          </div>
          ${c.notes ? `<div class="card"><h3 class="mb">Notas</h3><p class="small">${esc(c.notes)}</p></div>` : ''}
          <div class="card">
            <div class="list">
              ${c.phone ? `<div class="row"><span class="muted">${icon('phone', 'sm')}</span><span class="grow">${esc(c.phone)}</span></div>` : ''}
              ${c.instagram ? `<div class="row"><span class="muted">${icon('insta', 'sm')}</span><span class="grow">${esc(c.instagram)}</span></div>` : ''}
              <div class="row"><span class="muted">${icon('calendar', 'sm')}</span><span class="grow">Cliente desde ${fmtDate(c.createdAt, true)}</span></div>
            </div>
            <button class="btn danger block mt" data-act="client-delete" data-id="${id}">${icon('trash')} Borrar cliente</button>
          </div>
        </div>
      </div>`;
  },
};

registerActions({
  'clients-q': (el) => { f.q = el.value; rerender(); },
  'clients-filter': (el) => {
    f.filter = el.dataset.v;
    lastQueryF = f.filter;
    if (location.hash.includes('?')) history.replaceState(history.state, '', '#/clientes');
    rerender();
  },
  'clients-sort': (el) => { f.sort = el.value; rerender(); },
  'client-new': () => openClientForm(),
  'client-edit': (el) => openClientForm(el.dataset.id),
  'client-import': (el) => openImport(el.dataset.id),
  'client-pay': (el) => openPayment(el.dataset.id),
  'wish-add': (form) => {
    const text = form.text.value.trim();
    if (!text) { form.text.focus(); return; }
    S.addWish(form.dataset.id, text, form.size.value);
    toast('Apuntado. Te avisaré cuando lo tengas.');
    setTimeout(() => document.querySelector('form[data-submit="wish-add"] input[name="text"]')?.focus(), 0);
  },
  'wish-del': (el) => withUndo('Quitado de su lista', () => S.removeWish(el.dataset.id, el.dataset.wid)),
  'client-delete': (el) => {
    const c = S.client(el.dataset.id);
    if (!confirm(`¿Borrar a ${c.name}? Sus ventas se quedan, pero sin cliente asignado.`)) return;
    go('#/clientes');
    withUndo('Cliente borrado', () => S.deleteClient(el.dataset.id));
  },
});
