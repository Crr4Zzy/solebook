// App state, persistence (IndexedDB) and all business rules.
import { uid, today, addDays, daysBetween, monthKey, toNum, matches, sizeSort } from './util.js';
import { buildSampleData } from './sample.js';

export const SCHEMA = 1;

export const DEFAULT_CHANNELS = [
  { id: 'directo', name: 'Directo', feePct: 0, feeFixed: 0, platform: false },
  { id: 'vinted', name: 'Vinted', feePct: 0, feeFixed: 0, platform: false },
  { id: 'wallapop', name: 'Wallapop', feePct: 0, feeFixed: 0, platform: false },
  { id: 'instagram', name: 'Instagram', feePct: 0, feeFixed: 0, platform: false },
  { id: 'stockx', name: 'StockX', feePct: 9, feeFixed: 5, platform: true },
  { id: 'hypeboost', name: 'Hypeboost', feePct: 8, feeFixed: 0, platform: true },
  { id: 'alias', name: 'Alias', feePct: 9.5, feeFixed: 5, platform: true },
];
export const DEFAULT_METHODS = ['Bizum', 'Efectivo', 'Transferencia', 'PayPal', 'Vinted', 'Plataforma', 'Tarjeta'];

export const defaultSettings = () => ({
  businessName: 'Mi tienda',
  ownerName: '',
  channels: structuredClone(DEFAULT_CHANNELS),
  methods: [...DEFAULT_METHODS],
  staleDays: 60,
  reserveDays: 3,
  showMarket: true,
  theme: 'light',
  receiptFooter: '¡Gracias por tu compra!',
});

export const emptyState = () => ({
  schema: SCHEMA,
  settings: defaultSettings(),
  products: [],
  units: [],
  clients: [],
  sales: [],
  meta: { lastModified: Date.now(), isSample: false },
});

// ---------- persistence ----------
const DB_NAME = 'solebook';
let dbp;
const db = () =>
  (dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
export const idbGet = async (key) => {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
};
export const idbSet = async (key, val) => {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
};

export let state = emptyState();
const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);

let saveTimer;
const persist = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => idbSet('state', state).catch((e) => console.error('save failed', e)), 250);
};

const migrate = (s) => {
  const base = emptyState();
  const out = { ...base, ...s };
  out.settings = { ...defaultSettings(), ...(s.settings || {}) };
  if (!Array.isArray(out.settings.channels) || !out.settings.channels.length) out.settings.channels = structuredClone(DEFAULT_CHANNELS);
  out.meta = { ...base.meta, ...(s.meta || {}) };
  ['products', 'units', 'clients', 'sales'].forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
  out.schema = SCHEMA;
  return out;
};

export async function load() {
  let saved = null;
  try { saved = await idbGet('state'); } catch (e) { console.error(e); }
  if (saved && saved.schema) state = migrate(saved);
  else {
    state = buildSampleData(emptyState());
    state.meta.isSample = true;
    state.meta.lastModified = 0; // sample data never wins a sync
    await idbSet('state', state);
  }
  return state;
}

// Every change goes through here.
export function update(fn, { silent = false } = {}) {
  fn(state);
  state.meta.lastModified = Date.now();
  persist();
  if (!silent) listeners.forEach((l) => l('local'));
}

// Replace the whole state (sync pull, backup restore, undo).
export function replaceState(next, source = 'remote') {
  state = migrate(next);
  persist();
  listeners.forEach((l) => l(source));
}

export const snapshot = () => structuredClone(state);

// ---------- lookups ----------
export const byId = (list, id) => list.find((x) => x.id === id);
export const product = (id) => byId(state.products, id);
export const client = (id) => byId(state.clients, id);
export const sale = (id) => byId(state.sales, id);
export const unit = (id) => byId(state.units, id);
export const channel = (id) => byId(state.settings.channels, id) || { id, name: id || 'Otro', feePct: 0, feeFixed: 0 };
export const productName = (p) => (p ? `${p.brand || ''} ${p.model || ''}`.trim() || 'Sin nombre' : 'Producto borrado');

// ---------- sale maths ----------
export const salePaid = (s) => (s.payments || []).reduce((a, p) => a + toNum(p.amount), 0);
export const saleOwed = (s) => Math.max(0, Math.round((toNum(s.price) - salePaid(s)) * 100) / 100);
export const saleCosts = (s) => toNum(s.fees) + toNum(s.shippingCost);
export const saleNet = (s) => toNum(s.price) - saleCosts(s) - toNum(s.cost);
export const calcFees = (channelId, price) => {
  const c = channel(channelId);
  return Math.round((toNum(price) * toNum(c.feePct) / 100 + toNum(c.feeFixed)) * 100) / 100;
};

export const DELIVERY = {
  entregado: { label: 'Entregado', cls: 'ok' },
  enviado: { label: 'Enviado', cls: 'info' },
  por_enviar: { label: 'Por enviar', cls: 'warn' },
  reservado: { label: 'Reservado', cls: 'accent' },
};

export const paymentStatus = (s) => {
  const paid = salePaid(s), owed = saleOwed(s);
  if (owed <= 0) return { key: 'pagado', label: 'Cobrado', cls: 'ok' };
  if (paid > 0) return { key: 'senal', label: `Debe ${Math.round(owed)} €`, cls: 'warn' };
  return { key: 'pendiente', label: 'Sin cobrar', cls: 'warn' };
};

// The one status shown in lists: what needs doing next.
export const saleBadge = (s) => {
  const t = today();
  if (s.delivery === 'reservado') {
    const late = s.reservedUntil && s.reservedUntil <= t;
    return { label: late ? 'Reserva vence' : 'Reservado', cls: late ? 'danger' : 'accent' };
  }
  if (s.delivery === 'por_enviar') return { label: 'Por enviar', cls: 'warn' };
  const p = paymentStatus(s);
  if (p.key !== 'pagado') return { label: p.label, cls: 'warn' };
  if (s.delivery === 'enviado') return { label: 'Enviado', cls: 'info' };
  return { label: 'Completada', cls: 'ok' };
};

// ---------- stock ----------
export const availableUnits = (productId) =>
  state.units.filter((u) => !u.saleId && (!productId || u.productId === productId));

export const productStock = (p) => {
  const units = availableUnits(p.id);
  const sizes = {};
  units.forEach((u) => { sizes[u.size] = (sizes[u.size] || 0) + 1; });
  const cost = units.reduce((a, u) => a + toNum(u.cost), 0);
  const oldest = units.reduce((m, u) => (!m || u.purchasedAt < m ? u.purchasedAt : m), null);
  return {
    units,
    count: units.length,
    sizes: Object.keys(sizes).sort(sizeSort).map((size) => ({ size, n: sizes[size] })),
    cost,
    avgCost: units.length ? cost / units.length : 0,
    value: units.length * toNum(p.price),
    oldestDays: oldest ? daysBetween(oldest, today()) : 0,
  };
};
export const sizesLabel = (sizes) => sizes.map((s) => (s.n > 1 ? `${s.size} ×${s.n}` : s.size)).join(' · ');

// Return window: days left until the last day you can send it back. null = no countdown
// (units from before this existed, or bought without a return period: returnDays 0/empty).
export const returnDeadline = (u) => (toNum(u.returnDays) > 0 && u.purchasedAt ? addDays(u.purchasedAt, toNum(u.returnDays)) : null);
export const returnLeft = (u) => { const dl = returnDeadline(u); return dl ? daysBetween(today(), dl) : null; };
// The unit of a product whose return window ends first (only counting windows that are still open).
export const nextReturn = (units) => units.map(returnLeft).filter((n) => n !== null && n >= 0).sort((a, b) => a - b)[0] ?? null;

export const isStale = (u) => !u.saleId && daysBetween(u.purchasedAt, today()) >= toNum(state.settings.staleDays || 60);

export const inventoryTotals = () => {
  const units = availableUnits();
  const cost = units.reduce((a, u) => a + toNum(u.cost), 0);
  const value = units.reduce((a, u) => a + toNum(product(u.productId)?.price), 0);
  return { count: units.length, cost, value, latent: value - cost, stale: units.filter(isStale).length };
};

// ---------- clients ----------
export const clientSales = (id) => state.sales.filter((s) => s.clientId === id).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
export const clientStats = (id) => {
  const sales = clientSales(id);
  return {
    sales,
    count: sales.length,
    total: sales.reduce((a, s) => a + toNum(s.price), 0),
    profit: sales.reduce((a, s) => a + saleNet(s), 0),
    owed: sales.reduce((a, s) => a + saleOwed(s), 0),
    last: sales[0]?.date || null,
  };
};

// Clients waiting for something you now have in stock.
export const wishMatches = () => {
  const out = [];
  state.clients.forEach((c) => {
    (c.wishes || []).forEach((w) => {
      const hits = availableUnits().filter((u) => {
        const p = product(u.productId);
        if (!p) return false;
        if (w.size && String(u.size).toUpperCase() !== String(w.size).toUpperCase()) return false;
        return matches(`${p.brand} ${p.model} ${p.sku || ''}`, w.text);
      });
      out.push({ client: c, wish: w, units: hits });
    });
  });
  return out;
};
export const interestedClients = (productId) => {
  const p = product(productId);
  if (!p) return [];
  const sizes = new Set(availableUnits(productId).map((u) => String(u.size).toUpperCase()));
  const res = [];
  state.clients.forEach((c) => (c.wishes || []).forEach((w) => {
    if (matches(`${p.brand} ${p.model} ${p.sku || ''}`, w.text)) {
      res.push({ client: c, wish: w, inStock: !w.size || sizes.has(String(w.size).toUpperCase()) });
    }
  }));
  return res;
};

// ---------- period stats ----------
export const salesIn = (from, to) => state.sales.filter((s) => s.date >= from && s.date <= to);
export const salesInMonth = (key) => state.sales.filter((s) => monthKey(s.date) === key);
export const statsFor = (sales) => {
  const revenue = sales.reduce((a, s) => a + toNum(s.price), 0);
  const net = sales.reduce((a, s) => a + saleNet(s), 0);
  const days = sales.map((s) => (s.unitId && unit(s.unitId)?.purchasedAt ? daysBetween(unit(s.unitId).purchasedAt, s.date) : null)).filter((d) => d !== null && d >= 0);
  const shoes = sales.filter((s) => product(s.productId)?.type !== 'ropa').length;
  return {
    count: sales.length,
    shoes,
    clothes: sales.length - shoes,
    revenue,
    net,
    margin: revenue ? (net / revenue) * 100 : NaN,
    ticket: sales.length ? revenue / sales.length : 0,
    daysToSell: days.length ? days.reduce((a, b) => a + b, 0) / days.length : NaN,
  };
};
export const owedSales = () => state.sales.filter((s) => saleOwed(s) > 0).sort((a, b) => a.date.localeCompare(b.date));
export const totalOwed = () => owedSales().reduce((a, s) => a + saleOwed(s), 0);
export const toShip = () => state.sales.filter((s) => s.delivery === 'por_enviar').sort((a, b) => a.date.localeCompare(b.date));
export const reservations = () => state.sales.filter((s) => s.delivery === 'reservado').sort((a, b) => (a.reservedUntil || '').localeCompare(b.reservedUntil || ''));

// ---------- mutations ----------
export function createSale(data) {
  const s = {
    id: uid(),
    createdAt: new Date().toISOString(),
    date: data.date || today(),
    productId: data.productId,
    unitId: data.unitId || null,
    size: data.size || '',
    clientId: data.clientId || null,
    channel: data.channel || 'directo',
    price: toNum(data.price),
    cost: toNum(data.cost),
    fees: toNum(data.fees),
    shippingCost: toNum(data.shippingCost),
    payments: (data.payments || []).filter((p) => toNum(p.amount) > 0).map((p) => ({ id: uid(), date: p.date || data.date || today(), amount: toNum(p.amount), method: p.method || '' })),
    method: data.method || '',
    delivery: data.delivery || 'entregado',
    reservedUntil: data.delivery === 'reservado' ? data.reservedUntil || addDays(today(), state.settings.reserveDays || 3) : null,
    notes: data.notes || '',
  };
  update((st) => {
    st.sales.push(s);
    if (s.unitId) {
      const u = byId(st.units, s.unitId);
      if (u) u.saleId = s.id;
    }
  });
  return s;
}

export function editSale(id, patch) {
  update((st) => {
    const s = byId(st.sales, id);
    if (!s) return;
    Object.assign(s, patch);
    if (s.delivery !== 'reservado') s.reservedUntil = null;
  });
}

export function deleteSale(id) {
  update((st) => {
    const s = byId(st.sales, id);
    if (s?.unitId) {
      const u = byId(st.units, s.unitId);
      if (u) u.saleId = null;
    }
    st.sales = st.sales.filter((x) => x.id !== id);
  });
}

// ---------- bulk changes (one update, so one undo) ----------
// patch may hold: delivery, channel (fees are recalculated), method, clientId, date
export function bulkEditSales(ids, patch) {
  const set = new Set(ids);
  update((st) => {
    st.sales.forEach((s) => {
      if (!set.has(s.id)) return;
      if (patch.delivery) {
        s.delivery = patch.delivery;
        if (patch.delivery === 'reservado') s.reservedUntil = s.reservedUntil || addDays(today(), st.settings.reserveDays || 3);
        else s.reservedUntil = null;
      }
      if (patch.channel && patch.channel !== s.channel) {
        s.channel = patch.channel;
        s.fees = calcFees(patch.channel, s.price);
      }
      if (patch.method) {
        s.method = patch.method;
        (s.payments || []).forEach((p) => { p.method = patch.method; });
      }
      if (patch.clientId !== undefined) s.clientId = patch.clientId || null;
      if (patch.date) s.date = patch.date;
    });
  });
}

// Adds a payment for whatever each sale still owes.
export function bulkMarkPaid(ids, method = '', date = today()) {
  const set = new Set(ids);
  let n = 0, total = 0;
  update((st) => {
    st.sales.forEach((s) => {
      if (!set.has(s.id)) return;
      const owed = saleOwed(s);
      if (owed <= 0) return;
      s.payments = s.payments || [];
      s.payments.push({ id: uid(), date, amount: owed, method: method || s.method || '' });
      n++; total += owed;
    });
  });
  return { n, total };
}

export function bulkDeleteSales(ids) {
  const set = new Set(ids);
  update((st) => {
    st.units.forEach((u) => { if (u.saleId && set.has(u.saleId)) u.saleId = null; });
    st.sales = st.sales.filter((s) => !set.has(s.id));
  });
}

export function addPayment(saleId, amount, method, date = today()) {
  update((st) => {
    const s = byId(st.sales, saleId);
    if (!s) return;
    s.payments = s.payments || [];
    s.payments.push({ id: uid(), date, amount: toNum(amount), method });
  });
}

export function removePayment(saleId, paymentId) {
  update((st) => {
    const s = byId(st.sales, saleId);
    if (s) s.payments = (s.payments || []).filter((p) => p.id !== paymentId);
  });
}

export function setDelivery(saleId, delivery) {
  editSale(saleId, { delivery });
}

export function saveClient(data) {
  let id = data.id;
  update((st) => {
    const existing = id && byId(st.clients, id);
    if (existing) Object.assign(existing, data);
    else {
      id = uid();
      st.clients.push({ id, createdAt: today(), wishes: [], ...data, id });
    }
  });
  return id;
}

export function deleteClient(id) {
  update((st) => {
    st.clients = st.clients.filter((c) => c.id !== id);
    st.sales.forEach((s) => { if (s.clientId === id) s.clientId = null; });
  });
}

export function addWish(clientId, text, size) {
  update((st) => {
    const c = byId(st.clients, clientId);
    if (!c) return;
    c.wishes = c.wishes || [];
    c.wishes.push({ id: uid(), text: text.trim(), size: String(size || '').trim().toUpperCase(), createdAt: today() });
  });
}
export function removeWish(clientId, wishId) {
  update((st) => {
    const c = byId(st.clients, clientId);
    if (c) c.wishes = (c.wishes || []).filter((w) => w.id !== wishId);
  });
}

export function saveProduct(data) {
  let id = data.id;
  update((st) => {
    const existing = id && byId(st.products, id);
    if (existing) Object.assign(existing, data);
    else {
      id = uid();
      st.products.push({ photos: [], type: 'zapatilla', createdAt: today(), ...data, id });
    }
  });
  return id;
}

export function deleteProduct(id) {
  update((st) => {
    st.units = st.units.filter((u) => u.productId !== id || u.saleId);
    st.products = st.products.filter((p) => p.id !== id);
  });
}

// sizes: array of size strings (one per unit). cost: per unit.
export function addUnits(productId, sizes, cost, purchasedAt = today(), note = '', returnDays = null) {
  const ids = [];
  update((st) => {
    sizes.forEach((size) => {
      const id = uid();
      ids.push(id);
      st.units.push({ id, productId, size: String(size).toUpperCase(), cost: toNum(cost), purchasedAt, note, returnDays, saleId: null });
    });
  });
  return ids;
}

export function editUnit(id, patch) {
  update((st) => { const u = byId(st.units, id); if (u) Object.assign(u, patch); });
}

export function deleteUnit(id) {
  update((st) => { st.units = st.units.filter((u) => u.id !== id || u.saleId); });
}

export function saveSettings(patch) {
  update((st) => { Object.assign(st.settings, patch); });
}

export function clearAllData(keepSettings = true) {
  const settings = keepSettings ? state.settings : defaultSettings();
  replaceState({ ...emptyState(), settings, meta: { lastModified: Date.now(), isSample: false } }, 'local');
}

export function loadSample() {
  const s = buildSampleData({ ...emptyState(), settings: state.settings });
  s.meta = { lastModified: 0, isSample: true };
  replaceState(s, 'local');
}
