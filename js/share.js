// Builds a 1080×1350 image of a product (photo, sizes, price) to send by WhatsApp or post on Instagram.
import { money } from './util.js';
import * as S from './store.js';
import { toast } from './ui.js';
import { download } from './io.js';

const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); if (!src.startsWith('data:')) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  });
  if (line) lines.push(line);
  return lines;
}

export async function makeCard(productId) {
  const p = S.product(productId);
  const st = S.productStock(p);
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const font = '-apple-system, "SF Pro Display", "Segoe UI", Roboto, Arial, sans-serif';

  ctx.fillStyle = '#F6F3EC';
  ctx.fillRect(0, 0, W, H);

  // photo
  const px = 60, py = 60, pw = W - 120, ph = 760;
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 36);
  ctx.clip();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(px, py, pw, ph);
  const photo = p.photos?.[0] || p.image;
  if (photo) {
    try {
      const img = await loadImg(photo);
      const fit = p.photos?.[0] ? Math.max : Math.min; // own photo fills, StockX image fits whole
      const scale = fit(pw / img.width, ph / img.height) * (p.photos?.[0] ? 1 : 0.9);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, px + (pw - w) / 2, py + (ph - h) / 2, w, h);
    } catch {}
  } else {
    ctx.fillStyle = '#E1F5EE';
    ctx.font = `600 64px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0F6E56';
    ctx.fillText(p.brand || '', W / 2, py + ph / 2);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // name
  let y = py + ph + 90;
  ctx.fillStyle = '#5F5E5A';
  ctx.font = `500 40px ${font}`;
  ctx.fillText((p.brand || '').toUpperCase(), 70, y);
  y += 70;
  ctx.fillStyle = '#2C2C2A';
  ctx.font = `700 64px ${font}`;
  wrapText(ctx, p.model || '', W - 140).slice(0, 2).forEach((l) => { ctx.fillText(l, 70, y); y += 74; });

  // sizes as pills
  y += 10;
  ctx.font = `600 36px ${font}`;
  let x = 70;
  const sizes = st.sizes.length ? st.sizes.map((s) => s.size) : ['Consultar tallas'];
  sizes.forEach((s) => {
    const w = ctx.measureText(s).width + 48;
    if (x + w > W - 70) { x = 70; y += 72; }
    roundRect(ctx, x, y - 44, w, 60, 30);
    ctx.fillStyle = '#E1F5EE';
    ctx.fill();
    ctx.fillStyle = '#085041';
    ctx.fillText(s, x + 24, y - 2);
    x += w + 14;
  });

  // price + footer bar
  ctx.fillStyle = '#0F6E56';
  ctx.fillRect(0, H - 130, W, 130);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 60px ${font}`;
  if (p.price) ctx.fillText(money(p.price), 70, H - 46);
  ctx.font = `500 34px ${font}`;
  ctx.textAlign = 'right';
  ctx.fillText(S.state.settings.businessName || '', W - 70, H - 54);
  ctx.textAlign = 'left';

  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
}

export async function shareProductCard(productId) {
  const p = S.product(productId);
  try {
    const blob = await makeCard(productId);
    const name = `${S.productName(p).replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'producto'}.jpg`;
    const file = new File([blob], name, { type: 'image/jpeg' });
    const sizes = S.sizesLabel(S.productStock(p).sizes);
    const text = `${S.productName(p)}${sizes ? `\nTallas: ${sizes}` : ''}${p.price ? `\nPrecio: ${money(p.price)}` : ''}`;
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
    } else {
      download(name, blob);
      toast('Imagen descargada. Ya puedes enviarla.');
    }
  } catch (e) {
    if (e?.name !== 'AbortError') toast('No se ha podido crear la imagen');
  }
}
