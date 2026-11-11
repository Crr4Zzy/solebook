// Example data so the app is not empty on first launch. Dates are relative to today.
import { uid, today, addDays, isoDate } from './util.js';

const rng = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SHOE_SIZES = ['38', '39', '40', '41', '42', '42.5', '43', '44', '45'];
const CLOTH_SIZES = ['S', 'M', 'L', 'XL'];

export function buildSampleData(st) {
  const r = rng(20261111);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const between = (a, b) => a + r() * (b - a);
  const round5 = (n) => Math.round(n / 5) * 5;
  const t = today();

  const P = (type, brand, model, sku, price, cost, market, weight) => ({
    id: uid(), type, brand, model, sku, price, market: market || null, photos: [], notes: '', createdAt: addDays(t, -400), _cost: cost, _w: weight,
  });
  const products = [
    P('zapatilla', 'Jordan', '4 Retro Bred Reimagined', 'FV5029-006', 245, 183, 238, 9),
    P('zapatilla', 'Nike', 'Dunk Low Panda', 'DD1391-100', 130, 95, 118, 10),
    P('zapatilla', 'New Balance', '9060 Sea Salt', 'U9060WHT', 165, 120, 152, 7),
    P('zapatilla', 'Adidas', 'Samba OG White', 'B75806', 110, 90, 84, 5),
    P('zapatilla', 'Jordan', '1 Mid Chicago Toe', '554724-069', 150, 110, null, 6),
    P('zapatilla', 'Asics', 'Gel-1130 White Silver', '1201A256-119', 120, 85, 112, 4),
    P('zapatilla', 'Nike', 'Air Force 1 \'07 White', 'CW2288-111', 115, 85, null, 4),
    P('zapatilla', 'Jordan', '4 Military Black', 'DH6927-111', 230, 175, 226, 5),
    P('ropa', 'Essentials', 'Sudadera Fear of God', 'FOG-HD-BLK', 95, 67, null, 5),
    P('ropa', 'Stüssy', 'Camiseta 8 Ball', 'STU-8B-WHT', 70, 42, null, 3),
    P('ropa', 'Nike', 'Pantalón Tech Fleece', 'FB8002-063', 110, 72, null, 3),
  ];
  const byModel = (m) => products.find((p) => p.model.includes(m));

  const C = (name, phone, instagram, sizes, brands, notes = '') => ({
    id: uid(), name, phone, instagram, sizes, brands, notes, wishes: [], createdAt: addDays(t, -380),
  });
  const clients = [
    C('Marcos Ruiz', '600112233', '@marcos.kicks', '43', 'Jordan, Nike', 'Prefiere Bizum. Recoge en tienda.'),
    C('Laura García', '611223344', '@laurag', '38 / S', 'New Balance, Adidas'),
    C('David Pérez', '622334455', '', '44', 'Jordan'),
    C('Sara Martín', '633445566', '@saram', '40', 'Nike, Asics'),
    C('Carlos Torres', '644556677', '@ctorres', 'M', 'Ropa, Essentials'),
    C('Lucía Fernández', '655667788', '', '37', 'Adidas'),
    C('Javier Gómez', '666778899', '@javigomez', '42', 'Nike, New Balance'),
    C('Ana López', '677889900', '', '39', 'Asics, New Balance'),
    C('Pablo Sánchez', '688990011', '@pablo.s', '45', 'Jordan'),
  ];
  const [marcos, laura, david, sara, carlos] = clients;

  const channels = st.settings.channels;
  const ch = (id) => channels.find((c) => c.id === id);
  const feesFor = (id, price) => Math.round((price * (ch(id)?.feePct || 0) / 100 + (ch(id)?.feeFixed || 0)) * 100) / 100;

  const units = [];
  const sales = [];
  const weighted = [];
  products.forEach((p) => { for (let i = 0; i < p._w; i++) weighted.push(p); });

  const sell = ({ p, size, date, channel, clientId, price, cost, payments, delivery = 'entregado', reservedUntil = null, purchasedDaysBefore, method }) => {
    const u = { id: uid(), productId: p.id, size, cost, purchasedAt: addDays(date, -(purchasedDaysBefore ?? Math.round(between(4, 45)))), note: '', saleId: null };
    const s = {
      id: uid(), createdAt: `${date}T12:00:00.000Z`, date, productId: p.id, unitId: u.id, size, clientId, channel,
      price, cost, fees: feesFor(channel, price), shippingCost: channel === 'vinted' || channel === 'wallapop' ? 0 : 0,
      payments: payments ?? [{ id: uid(), date, amount: price, method }], method, delivery, reservedUntil, notes: '',
    };
    u.saleId = s.id;
    units.push(u);
    sales.push(s);
    return s;
  };

  // 12 months of history, growing a little over time.
  const now = new Date();
  for (let back = 12; back >= 0; back--) {
    const first = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const lastDay = back === 0 ? now.getDate() - 1 : daysInMonth;
    if (lastDay < 1) continue;
    const season = [0.8, 0.75, 0.9, 1, 0.95, 1.05, 0.9, 0.85, 1.05, 1.1, 1.25, 1.4][first.getMonth()];
    let n = Math.round((34 + (12 - back) * 2.2) * season * between(0.9, 1.1));
    if (back === 0) n = Math.round(n * (lastDay / daysInMonth));
    for (let i = 0; i < n; i++) {
      const p = pick(weighted);
      const day = 1 + Math.floor(r() * lastDay);
      const date = isoDate(new Date(first.getFullYear(), first.getMonth(), day));
      const roll = r();
      const channel = roll < 0.5 ? 'directo' : roll < 0.72 ? 'vinted' : roll < 0.86 ? 'instagram' : roll < 0.9 ? 'wallapop' : pick(['stockx', 'hypeboost', 'alias']);
      const clientId = (channel === 'directo' || channel === 'instagram') && r() < 0.75 ? pick(clients).id : null;
      const price = round5(p.price * between(0.9, 1.08));
      const cost = round5(p._cost * between(0.92, 1.08));
      const method = channel === 'vinted' ? 'Vinted' : ['stockx', 'hypeboost', 'alias'].includes(channel) ? 'Plataforma' : pick(['Bizum', 'Bizum', 'Efectivo', 'Transferencia', 'PayPal']);
      sell({ p, size: p.type === 'ropa' ? pick(CLOTH_SIZES) : pick(SHOE_SIZES), date, channel, clientId, price, cost, method });
    }
  }

  // Today's open items (match the mockups).
  const j4 = byModel('Bred');
  sell({ p: j4, size: '43', date: t, channel: 'directo', clientId: marcos.id, price: 245, cost: 185, method: 'Bizum', purchasedDaysBefore: 13,
    payments: [{ id: uid(), date: t, amount: 65, method: 'Bizum' }], delivery: 'reservado', reservedUntil: addDays(t, 3) });
  sell({ p: byModel('Sudadera'), size: 'L', date: t, channel: 'instagram', clientId: laura.id, price: 95, cost: 67, method: 'Bizum', payments: [], delivery: 'entregado' });
  sell({ p: byModel('Military'), size: '44', date: addDays(t, -3), channel: 'directo', clientId: david.id, price: 230, cost: 175, method: 'Efectivo',
    payments: [{ id: uid(), date: addDays(t, -3), amount: 55, method: 'Efectivo' }], delivery: 'reservado', reservedUntil: t });
  sell({ p: byModel('9060'), size: '41', date: addDays(t, -2), channel: 'vinted', clientId: null, price: 165, cost: 120, method: 'Vinted', payments: [], delivery: 'enviado' });
  sell({ p: byModel('Panda'), size: '42', date: addDays(t, -1), channel: 'stockx', clientId: null, price: 130, cost: 95, method: 'Plataforma', payments: [], delivery: 'por_enviar' });
  sell({ p: j4, size: '42', date: addDays(t, -1), channel: 'hypeboost', clientId: null, price: 240, cost: 183, method: 'Plataforma', payments: [], delivery: 'por_enviar' });

  // Current stock.
  const stock = (p, sizes, cost, daysAgo) => sizes.forEach((size) => units.push({ id: uid(), productId: p.id, size, cost, purchasedAt: addDays(t, -daysAgo), note: '', saleId: null }));
  stock(j4, ['41', '42', '43', '43'], 183, 13);
  stock(byModel('Samba'), ['38', '39', '40'], 90, 74);
  stock(byModel('Panda'), ['42', '42', '42', '44'], 95, 20);
  stock(byModel('9060'), ['41', '43'], 120, 16);
  stock(byModel('Chicago'), ['42', '44'], 110, 35);
  stock(byModel('Gel-1130'), ['39', '40', '42'], 85, 66);
  stock(byModel('Air Force'), ['40', '41', '42', '43', '44'], 85, 8);
  stock(byModel('Military'), ['42', '45'], 175, 22);
  stock(byModel('Sudadera'), ['M', 'L', 'L', 'XL'], 67, 9);
  stock(byModel('8 Ball'), ['S', 'M', 'L'], 42, 30);
  stock(byModel('Tech Fleece'), ['M', 'L'], 72, 12);

  marcos.wishes.push({ id: uid(), text: 'Jordan 4 Military', size: '43', createdAt: addDays(t, -10) });
  sara.wishes.push({ id: uid(), text: 'Dunk Low', size: '40', createdAt: addDays(t, -6) });
  carlos.wishes.push({ id: uid(), text: 'Sudadera Essentials', size: 'M', createdAt: addDays(t, -4) });
  clients[6].wishes.push({ id: uid(), text: 'Air Force 1', size: '42', createdAt: addDays(t, -2) });

  products.forEach((p) => { delete p._cost; delete p._w; });
  st.products = products;
  st.clients = clients;
  st.units = units;
  st.sales = sales;
  st.settings.businessName = 'Mi tienda';
  return st;
}
