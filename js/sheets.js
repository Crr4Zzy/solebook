// Sheets used from several screens: sale detail, payments, sale edit and client form.
import { esc, icon, money, signed, fmtDate, today, addDays, toNum, waLink } from './util.js';
import * as S from './store.js';
import { registerActions, openSheet, closeSheet, sheetHead, toast, withUndo, productThumb, pill, avatar, marginText, refreshSheet, go } from './ui.js';

// ---------- sale detail ----------
export function openSale(id) {
  openSheet(() => saleSheet(id), { live: true });
}

export const receiptText = (s) => {
  const p = S.product(s.productId);
  const st = S.state.settings;
  const paid = S.salePaid(s), owed = S.saleOwed(s);
  return [
    `*${st.businessName}*`,
    `Recibo · ${fmtDate(s.date, true)}`,
    '',
    `${S.productName(p)}${s.size ? ` · talla ${s.size}` : ''}`,
    `Precio: ${money(s.price)}`,
    `Pagado: ${money(paid)}`,
    owed > 0 ? `Pendiente: ${money(owed)}` : '',
    s.delivery === 'reservado' && s.reservedUntil ? `Reservado hasta el ${fmtDate(s.reservedUntil, true)}` : '',
    '',
    st.receiptFooter || '',
  ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n').trim();
};
const reminderText = (s) => {
  const p = S.product(s.productId);
  const c = S.client(s.clientId);
  return `Hola ${c?.name?.split(' ')[0] || ''}, te recuerdo que quedan ${money(S.saleOwed(s))} pendientes de las ${S.productName(p)}${s.size ? ` (talla ${s.size})` : ''}. ¡Gracias!`;
};

function saleSheet(id) {
  const s = S.sale(id);
  if (!s) throw new Error('gone');
  const p = S.product(s.productId);
  const c = S.client(s.clientId);
  const paid = S.salePaid(s), owed = S.saleOwed(s), net = S.saleNet(s);
  const pay = S.paymentStatus(s);
  const del = S.DELIVERY[s.delivery] || S.DELIVERY.entregado;
  const ch = S.channel(s.channel);

  let deliveryActions = '';
  if (s.delivery === 'reservado') {
    deliveryActions = `<div class="alert ${s.reservedUntil <= today() ? 'danger' : 'ok'} mb">${icon('clock', 'sm')}<span class="grow">Reservado hasta ${fmtDate(s.reservedUntil)}</span></div>
      <div class="btn-row"><button class="btn primary" data-act="sale-delivery" data-id="${s.id}" data-v="entregado">${icon('check')} Entregado</button>
      <button class="btn" data-act="sale-extend" data-id="${s.id}">+3 días de reserva</button></div>`;
  } else if (s.delivery === 'por_enviar') {
    deliveryActions = `<button class="btn primary block" data-act="sale-delivery" data-id="${s.id}" data-v="enviado">${icon('truck')} Marcar enviado</button>`;
  } else if (s.delivery === 'enviado') {
    deliveryActions = `<button class="btn block" data-act="sale-delivery" data-id="${s.id}" data-v="entregado">${icon('check')} Marcar entregado</button>`;
  }

  return `${sheetHead(`Venta · ${fmtDate(s.date, true)}`)}
    <div class="row" style="border:none;padding-top:0">${productThumb(p)}
      <div class="grow"><div class="title">${esc(S.productName(p))}</div><div class="meta">${esc([s.size && `Talla ${s.size}`, ch.name, p?.sku].filter(Boolean).join(' · '))}</div></div>
      ${p ? `<a class="btn ghost icon-only" href="#/producto/${p.id}" aria-label="Ver producto">${icon('chevR')}</a>` : ''}
    </div>
    ${c ? `<a class="row" href="#/cliente/${c.id}">${avatar(c)}<div class="grow"><div class="title">${esc(c.name)}</div><div class="meta">${esc(c.phone || c.instagram || 'Cliente')}</div></div>${icon('chevR', 'chev')}</a>` : `<div class="row muted small">${icon('user', 'sm')} Sin cliente asignado</div>`}
    <div class="status-track">${pill(pay.label, pay.cls)}<span class="sep">·</span>${pill(del.label, del.cls)}</div>
    ${deliveryActions ? `<div class="mb">${deliveryActions}</div>` : ''}

    <div class="summary">
      <div class="line"><span>Precio de venta</span><span>${money(s.price, true)}</span></div>
      ${toNum(s.fees) ? `<div class="line muted"><span>Comisión ${esc(ch.name)}</span><span>−${money(s.fees, true)}</span></div>` : ''}
      ${toNum(s.shippingCost) ? `<div class="line muted"><span>Envío</span><span>−${money(s.shippingCost, true)}</span></div>` : ''}
      <div class="line muted"><span>Coste${s.unitId && S.unit(s.unitId)?.purchasedAt ? ` · comprado ${fmtDate(S.unit(s.unitId).purchasedAt)}` : ''}</span><span>−${money(s.cost, true)}</span></div>
      <div class="line total"><span>Beneficio neto</span><span class="${net >= 0 ? 'ok-text' : 'danger-text'}">${signed(net, true)} · ${marginText(net, s.price)}</span></div>
    </div>

    <h3 class="mt-lg">Cobros</h3>
    <div class="list">
      ${(s.payments || []).map((pm) => `<div class="row"><div class="grow"><div class="title">${money(pm.amount, true)}</div><div class="meta">${esc(pm.method || 'Sin método')} · ${fmtDate(pm.date)}</div></div>
        <button class="btn ghost icon-only sm" data-act="sale-remove-payment" data-id="${s.id}" data-pid="${pm.id}" aria-label="Borrar cobro">${icon('x', 'sm')}</button></div>`).join('') || '<p class="muted small" style="padding:6px 0">Todavía no hay cobros.</p>'}
    </div>
    ${owed > 0 ? `<div class="owed-box mt"><span>Falta por cobrar</span><span>${money(owed, true)}</span></div>
      <button class="btn primary block mt" data-act="sale-pay" data-id="${s.id}">${icon('cash')} Registrar cobro</button>` : `<p class="ok-text small mt">${icon('check', 'sm')} Cobrado entero (${money(paid, true)})</p>`}

    ${c?.phone ? `<div class="btn-row mt">
      <a class="btn wa" href="${waLink(c.phone, receiptText(s))}" target="_blank" rel="noopener">${icon('wa')} Enviar recibo</a>
      ${owed > 0 ? `<a class="btn wa" href="${waLink(c.phone, reminderText(s))}" target="_blank" rel="noopener">${icon('bell')} Recordar pago</a>` : ''}
    </div>` : ''}
    ${s.notes ? `<p class="mt small"><span class="muted">Notas:</span> ${esc(s.notes)}</p>` : ''}

    <div class="btn-row mt-lg">
      <button class="btn" data-act="sale-edit" data-id="${s.id}">${icon('edit')} Editar</button>
      <button class="btn danger" data-act="sale-delete" data-id="${s.id}">${icon('trash')} Eliminar</button>
    </div>`;
}

// ---------- payment ----------
let payDraft = {};
export function openPayment(saleId) {
  const s = S.sale(saleId);
  payDraft = { amount: S.saleOwed(s), method: s.method || S.state.settings.methods[0] || '', date: today() };
  openSheet(() => paymentSheet(saleId));
}
function paymentSheet(saleId) {
  const s = S.sale(saleId);
  const c = S.client(s.clientId);
  return `${sheetHead('Registrar cobro')}
    <p class="muted small mb">${esc(S.productName(S.product(s.productId)))} · ${esc(c?.name || S.channel(s.channel).name)} · falta ${money(S.saleOwed(s), true)}</p>
    <form data-submit="payment-save" data-id="${saleId}">
      <div class="field"><label for="pay-amount">Importe</label>
        <div class="input-wrap"><input class="input" id="pay-amount" name="amount" inputmode="decimal" value="${payDraft.amount}" autofocus><span class="suffix">€</span></div></div>
      <div class="field"><span class="label-t">Cómo te ha pagado</span>
        <div class="chips">${S.state.settings.methods.map((m) => `<button type="button" class="chip ${payDraft.method === m ? 'on' : ''}" data-act="pay-method" data-v="${esc(m)}">${esc(m)}</button>`).join('')}</div></div>
      <div class="field"><label for="pay-date">Fecha</label><input class="input" type="date" id="pay-date" name="date" value="${payDraft.date}"></div>
      <div class="sheet-foot"><button class="btn primary lg block" type="submit">Guardar cobro</button></div>
    </form>`;
}

// ---------- edit sale ----------
function editSaleSheet(id) {
  const s = S.sale(id);
  const st = S.state.settings;
  return `${sheetHead('Editar venta')}
    <form data-submit="sale-save" data-id="${id}">
      <div class="two"><div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${s.date}"></div>
      <div class="field"><label>Talla</label><input class="input" name="size" value="${esc(s.size)}"></div></div>
      <div class="field"><label>Cliente</label><select class="input" name="clientId"><option value="">Sin cliente</option>
        ${S.state.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${c.id}" ${c.id === s.clientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="two"><div class="field"><label>Canal</label><select class="input" name="channel">${st.channels.map((c) => `<option value="${c.id}" ${c.id === s.channel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Estado</label><select class="input" name="delivery">${Object.entries(S.DELIVERY).map(([k, v]) => `<option value="${k}" ${k === s.delivery ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div></div>
      <div class="field"><label>Reservado hasta</label><input class="input" type="date" name="reservedUntil" value="${s.reservedUntil || addDays(today(), st.reserveDays || 3)}"><span class="hint">Solo cuenta si el estado es «Reservado».</span></div>
      <div class="two"><div class="field"><label>Precio de venta</label><input class="input" name="price" inputmode="decimal" value="${s.price}"></div>
      <div class="field"><label>Coste</label><input class="input" name="cost" inputmode="decimal" value="${s.cost}"></div></div>
      <div class="two"><div class="field"><label>Comisión</label><input class="input" name="fees" inputmode="decimal" value="${s.fees || 0}"></div>
      <div class="field"><label>Envío pagado por ti</label><input class="input" name="shippingCost" inputmode="decimal" value="${s.shippingCost || 0}"></div></div>
      <div class="field"><label>Notas</label><textarea class="input" name="notes">${esc(s.notes || '')}</textarea></div>
      <div class="sheet-foot"><button class="btn primary lg block" type="submit">Guardar cambios</button></div>
    </form>`;
}

// ---------- client form ----------
let clientSaved = null;
export function openClientForm(id = null, onSaved = null) {
  clientSaved = onSaved;
  const c = id ? S.client(id) : {};
  openSheet(() => `${sheetHead(id ? 'Editar cliente' : 'Nuevo cliente')}
    <form data-submit="client-save" data-id="${id || ''}">
      <div class="field"><label for="c-name">Nombre</label><input class="input" id="c-name" name="name" value="${esc(c.name || '')}" placeholder="Marcos Ruiz" autocomplete="off" autofocus required></div>
      <div class="field"><label for="c-phone">Teléfono (WhatsApp)</label><input class="input" id="c-phone" name="phone" type="tel" value="${esc(c.phone || '')}" placeholder="600 112 233"></div>
      <div class="field"><label for="c-ig">Instagram</label><input class="input" id="c-ig" name="instagram" value="${esc(c.instagram || '')}" placeholder="@usuario" autocapitalize="off"></div>
      <div class="two"><div class="field"><label for="c-sizes">Talla</label><input class="input" id="c-sizes" name="sizes" value="${esc(c.sizes || '')}" placeholder="43 / M"></div>
      <div class="field"><label for="c-brands">Marcas que le gustan</label><input class="input" id="c-brands" name="brands" value="${esc(c.brands || '')}" placeholder="Jordan, Nike"></div></div>
      <div class="field"><label for="c-notes">Notas</label><textarea class="input" id="c-notes" name="notes" placeholder="Paga por Bizum, recoge en tienda…">${esc(c.notes || '')}</textarea></div>
      <p class="error" data-error hidden></p>
      <div class="sheet-foot"><button class="btn primary lg block" type="submit">${id ? 'Guardar cambios' : 'Añadir cliente'}</button></div>
    </form>`);
}

const formData = (form) => Object.fromEntries(new FormData(form).entries());

registerActions({
  'close-sheet': () => closeSheet(),
  'open-sale': (el) => openSale(el.dataset.id),
  'sale-pay': (el) => openPayment(el.dataset.id),
  'pay-method': (el) => {
    payDraft.method = el.dataset.v;
    payDraft.amount = el.closest('form').amount.value;
    payDraft.date = el.closest('form').date.value;
    refreshSheet(true);
  },
  'payment-save': (form) => {
    const amount = toNum(form.amount.value);
    if (amount <= 0) { form.amount.focus(); toast('Escribe un importe'); return; }
    S.addPayment(form.dataset.id, amount, payDraft.method, form.date.value || today());
    toast(`Cobro de ${money(amount)} guardado`);
    openSale(form.dataset.id);
  },
  'sale-remove-payment': (el) => withUndo('Cobro borrado', () => S.removePayment(el.dataset.id, el.dataset.pid)),
  'sale-delivery': (el) => {
    S.setDelivery(el.dataset.id, el.dataset.v);
    toast(S.DELIVERY[el.dataset.v].label);
  },
  'sale-extend': (el) => {
    const s = S.sale(el.dataset.id);
    const from = s.reservedUntil && s.reservedUntil > today() ? s.reservedUntil : today();
    S.editSale(s.id, { reservedUntil: addDays(from, 3) });
    toast(`Reserva hasta ${fmtDate(addDays(from, 3))}`);
  },
  'sale-edit': (el) => openSheet(() => editSaleSheet(el.dataset.id)),
  'sale-save': (form) => {
    const d = formData(form);
    const s = S.sale(form.dataset.id);
    const patch = {
      date: d.date || s.date, size: d.size.trim().toUpperCase(), clientId: d.clientId || null, channel: d.channel, delivery: d.delivery,
      reservedUntil: d.delivery === 'reservado' ? d.reservedUntil : null,
      price: toNum(d.price), cost: toNum(d.cost), fees: toNum(d.fees), shippingCost: toNum(d.shippingCost), notes: d.notes.trim(),
    };
    if (s.unitId && patch.size !== s.size) S.editUnit(s.unitId, { size: patch.size });
    S.editSale(s.id, patch);
    toast('Venta actualizada');
    openSale(s.id);
  },
  'sale-delete': (el) => {
    closeSheet();
    withUndo('Venta eliminada. El par vuelve al stock.', () => S.deleteSale(el.dataset.id));
  },
  'client-save': (form) => {
    const d = formData(form);
    if (!d.name.trim()) { const e = form.querySelector('[data-error]'); e.textContent = 'Escribe un nombre'; e.hidden = false; return; }
    const id = S.saveClient({ ...(form.dataset.id ? { id: form.dataset.id } : {}), name: d.name.trim(), phone: d.phone.trim(), instagram: d.instagram.trim(), sizes: d.sizes.trim(), brands: d.brands.trim(), notes: d.notes.trim() });
    const cb = clientSaved;
    const isNew = !form.dataset.id;
    clientSaved = null;
    toast(isNew ? 'Cliente añadido' : 'Cliente actualizado');
    closeSheet(false, () => {
      if (cb) cb(id);
      else if (isNew) go(`#/cliente/${id}`);
    });
  },
});
