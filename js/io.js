// Files in and out: CSV export for the accountant, full JSON backup and restore.
import { today, toNum } from './util.js';
import * as S from './store.js';

export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const cell = (v) => {
  const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Semicolon + BOM so Excel in Spanish opens it with accents and columns right.
export function exportSalesCSV(sales, filename = `ventas-${today()}.csv`) {
  const head = ['Fecha', 'Tipo', 'Marca', 'Modelo', 'SKU', 'Talla', 'Canal', 'Cliente', 'Precio', 'Comisión', 'Envío', 'Coste', 'Beneficio neto', 'Cobrado', 'Pendiente', 'Método de pago', 'Estado', 'Notas'];
  const rows = sales.slice().sort((a, b) => a.date.localeCompare(b.date)).map((s) => {
    const p = S.product(s.productId);
    return [
      s.date, p?.type === 'ropa' ? 'Ropa' : 'Zapatillas', p?.brand || '', p?.model || '', p?.sku || '', s.size,
      S.channel(s.channel).name, S.client(s.clientId)?.name || '', toNum(s.price), toNum(s.fees), toNum(s.shippingCost), toNum(s.cost),
      S.saleNet(s), S.salePaid(s), S.saleOwed(s), [...new Set((s.payments || []).map((x) => x.method))].join(' + ') || s.method || '',
      (S.DELIVERY[s.delivery] || {}).label || '', s.notes || '',
    ];
  });
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  download(filename, csv, 'text/csv;charset=utf-8');
}

export function downloadBackup() {
  download(`solebook-copia-${today()}.json`, JSON.stringify(S.state), 'application/json');
}

export async function readBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.sales) || !Array.isArray(data.products)) throw new Error('El archivo no es una copia de SoleBook');
  return data;
}
