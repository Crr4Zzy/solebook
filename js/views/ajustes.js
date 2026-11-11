import { esc, icon, toNum, uid, normalize } from '../util.js';
import * as S from '../store.js';
import { registerActions, rerender, toast } from '../ui.js';
import { SETUP_SQL, connect, disconnect, syncNow, getConfig, getStatus } from '../sync.js';
import { downloadBackup, readBackup, exportSalesCSV } from '../io.js';

let syncForm = { url: '', key: '', email: '', busy: false, error: '', info: '' };

export const title = () => 'Ajustes';

const installHelp = () => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return `<p class="ok-text small">${icon('check', 'sm')} Ya la estás usando como app.</p>`;
  return `${window.__installPrompt ? `<button class="btn primary mb" data-act="install">${icon('download')} Instalar en este dispositivo</button>` : ''}
    <div class="list small">
      <div class="row"><b style="width:86px;flex:none">iPhone</b><span class="grow">Abre la web en <b>Safari</b> → botón Compartir ${icon('share', 'sm')} → «Añadir a pantalla de inicio».</span></div>
      <div class="row"><b style="width:86px;flex:none">Android</b><span class="grow">En Chrome → menú ⋮ → «Instalar aplicación» (o «Añadir a pantalla de inicio»).</span></div>
      <div class="row"><b style="width:86px;flex:none">PC / Mac</b><span class="grow">En Chrome o Edge → icono de instalar en la barra de direcciones (o menú → «Instalar SoleBook»).</span></div>
    </div>${ios ? '' : ''}`;
};

function syncCard() {
  const cfg = getConfig();
  const st = getStatus();
  if (cfg?.session) {
    return `<div class="row" style="border:none;padding-top:0"><span class="dot ${st.state === 'ok' ? 'ok' : st.state === 'error' ? 'err' : 'warn'}"></span>
        <div class="grow"><div class="title">${esc(cfg.email)}</div><div class="meta">${esc(st.message)}</div></div></div>
      <p class="small muted mb">Todo lo que hagas aquí aparece en tus otros dispositivos con la misma cuenta. Sin conexión se guarda en el dispositivo y se sube al volver.</p>
      <div class="btn-row"><button class="btn" data-act="sync-now">${icon('refresh')} Sincronizar ahora</button><button class="btn danger" data-act="sync-off">Cerrar sesión</button></div>`;
  }
  const sf = syncForm;
  return `<p class="small mb">Ahora mismo los datos se guardan <b>solo en este dispositivo</b>. Para tener lo mismo en el móvil y en el PC, conecta una base de datos gratuita de Supabase (se hace una vez, unos 5 minutos):</p>
    <ol class="small" style="padding-left:18px;margin:0 0 12px">
      <li>Crea una cuenta en <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> y un proyecto nuevo (plan gratis).</li>
      <li>En el proyecto, abre <b>SQL Editor</b>, pega esto y pulsa <b>Run</b>:
        <div class="code mt mb" id="sql">${esc(SETUP_SQL)}</div>
        <button class="btn sm mb" data-act="copy-sql">${icon('file', 'sm')} Copiar</button></li>
      <li>En <b>Project Settings → API</b> copia la <b>Project URL</b> y la clave <b>anon public</b> y pégalas aquí.</li>
      <li>Crea tu usuario con tu email y una contraseña. En el otro dispositivo, repite el paso 3 y pulsa «Entrar».</li>
    </ol>
    <form data-submit="sync-connect">
      <div class="field"><label for="sb-url">Project URL</label><input class="input" id="sb-url" name="url" value="${esc(sf.url)}" placeholder="https://xxxx.supabase.co" autocapitalize="off" autocomplete="off" inputmode="url"></div>
      <div class="field"><label for="sb-key">Clave anon public</label><input class="input" id="sb-key" name="key" value="${esc(sf.key)}" placeholder="eyJhbGciOi…" autocapitalize="off" autocomplete="off"></div>
      <div class="two"><div class="field"><label for="sb-email">Tu email</label><input class="input" id="sb-email" name="email" type="email" value="${esc(sf.email)}" autocomplete="username"></div>
      <div class="field"><label for="sb-pass">Contraseña</label><input class="input" id="sb-pass" name="password" type="password" autocomplete="current-password" minlength="6"></div></div>
      ${sf.error ? `<p class="error mb">${esc(sf.error)}</p>` : ''}${sf.info ? `<p class="small ok-text mb">${esc(sf.info)}</p>` : ''}
      <div class="btn-row"><button class="btn primary" type="submit" name="mode" value="login" ${sf.busy ? 'disabled' : ''}>Entrar</button>
      <button class="btn" type="submit" name="mode" value="signup" ${sf.busy ? 'disabled' : ''}>Crear usuario</button></div>
    </form>`;
}

export function render({ query }) {
  const st = S.state.settings;
  return `
    <div class="page-head"><a class="back mob-only" href="#/mas" aria-label="Volver">${icon('chevL')}</a><h1>Ajustes</h1></div>
    <div class="grid cols-2">
      <div>
        <div class="card">
          <div class="card-head"><h2>Tu negocio</h2></div>
          <form data-submit="settings-biz">
            <div class="two"><div class="field"><label for="s-biz">Nombre del negocio</label><input class="input" id="s-biz" name="businessName" value="${esc(st.businessName)}"></div>
            <div class="field"><label for="s-owner">Tu nombre</label><input class="input" id="s-owner" name="ownerName" value="${esc(st.ownerName)}" placeholder="Para el saludo"></div></div>
            <div class="field"><label for="s-foot">Mensaje al final del recibo</label><input class="input" id="s-foot" name="receiptFooter" value="${esc(st.receiptFooter)}"></div>
            <div class="two"><div class="field"><label for="s-stale">Stock parado a partir de</label><div class="input-wrap"><input class="input" id="s-stale" name="staleDays" inputmode="numeric" value="${st.staleDays}"><span class="suffix">días</span></div></div>
            <div class="field"><label for="s-res">Reserva por defecto</label><div class="input-wrap"><input class="input" id="s-res" name="reserveDays" inputmode="numeric" value="${st.reserveDays}"><span class="suffix">días</span></div></div></div>
            <button class="btn primary" type="submit">Guardar</button>
          </form>
        </div>

        <div class="card">
          <div class="card-head"><h2>Canales y comisiones</h2></div>
          <p class="small muted mb">La comisión se descuenta sola al vender. Revisa que los porcentajes coincidan con lo que te cobra cada plataforma.</p>
          <form data-submit="settings-channels">
            ${st.channels.map((c, i) => `<div class="row" style="gap:8px;flex-wrap:wrap">
              <input class="input" name="name-${i}" value="${esc(c.name)}" style="flex:2;min-width:120px" aria-label="Nombre del canal">
              <div class="input-wrap" style="flex:1;min-width:84px"><input class="input" name="pct-${i}" value="${c.feePct}" inputmode="decimal" aria-label="Comisión %"><span class="suffix">%</span></div>
              <div class="input-wrap" style="flex:1;min-width:84px"><input class="input" name="fix-${i}" value="${c.feeFixed}" inputmode="decimal" aria-label="Fijo €"><span class="suffix">€</span></div>
              <label class="small" style="display:flex;align-items:center;gap:6px;white-space:nowrap"><input type="checkbox" class="switch" name="plat-${i}" ${c.platform ? 'checked' : ''}> Plataforma</label>
              <button type="button" class="btn ghost icon-only sm" data-act="channel-del" data-i="${i}" aria-label="Quitar canal">${icon('x', 'sm')}</button>
            </div>`).join('')}
            <p class="tiny muted mt">«Plataforma» las agrupa en los informes (StockX, Hypeboost, Alias…).</p>
            <div class="btn-row mt"><button class="btn primary" type="submit">Guardar canales</button><button class="btn" type="button" data-act="channel-add">${icon('plus')} Añadir canal</button></div>
          </form>
        </div>

        <div class="card">
          <div class="card-head"><h2>Formas de pago</h2></div>
          <form data-submit="settings-methods">
            <div class="field"><input class="input" name="methods" value="${esc(st.methods.join(', '))}" aria-label="Formas de pago"><span class="hint">Separadas por comas, en el orden en que quieres verlas.</span></div>
            <button class="btn primary" type="submit">Guardar</button>
          </form>
        </div>

        <div class="card">
          <div class="card-head"><h2>Apariencia</h2></div>
          <div class="chips mb">
            <button class="chip ${st.theme !== 'dark' ? 'on' : ''}" data-act="theme" data-v="light">${icon('sun', 'sm')} Claro</button>
            <button class="chip ${st.theme === 'dark' ? 'on' : ''}" data-act="theme" data-v="dark">${icon('moon', 'sm')} Oscuro</button>
          </div>
          <div class="switch-row"><span>Mostrar precio de mercado como referencia</span><input type="checkbox" class="switch" data-change="toggle-market" ${st.showMarket ? 'checked' : ''} aria-label="Mostrar precio de mercado"></div>
        </div>
      </div>

      <div>
        <div class="card" id="sync-card" ${query.s === 'sync' ? 'style="border-color:var(--accent)"' : ''}>
          <div class="card-head"><h2>${icon('cloud')} Móvil y PC sincronizados</h2></div>
          ${syncCard()}
        </div>

        <div class="card">
          <div class="card-head"><h2>Instalar como app</h2></div>
          ${installHelp()}
        </div>

        <div class="card">
          <div class="card-head"><h2>Copia de seguridad</h2></div>
          <p class="small muted mb">Descarga todos tus datos en un archivo. Hazlo de vez en cuando, sobre todo si no usas la sincronización.</p>
          <div class="btn-row">
            <button class="btn" data-act="backup">${icon('download')} Descargar copia</button>
            <label class="btn">${icon('upload')} Restaurar copia<input type="file" accept="application/json,.json" hidden data-change="restore"></label>
          </div>
          <button class="btn block mt" data-act="export-all">${icon('file')} Exportar todas las ventas a Excel (CSV)</button>
        </div>

        <div class="card">
          <div class="card-head"><h2>Datos</h2></div>
          ${S.state.meta.isSample ? '<p class="small mb">Ahora tienes <b>datos de ejemplo</b>. Bórralos cuando quieras empezar con los tuyos.</p>' : ''}
          <div class="btn-row">
            ${S.state.meta.isSample ? '<button class="btn primary" data-act="clear-sample">Borrar ejemplo y empezar</button>' : '<button class="btn" data-act="load-sample">Ver datos de ejemplo</button>'}
            <button class="btn danger" data-act="wipe">${icon('trash')} Borrar todo</button>
          </div>
        </div>
        <p class="tiny muted mt right">SoleBook · tus datos son solo tuyos</p>
      </div>
    </div>`;
}

export function mount(root, { query }) {
  if (query.s === 'sync') document.getElementById('sync-card')?.scrollIntoView({ block: 'start' });
}

const form = (el) => Object.fromEntries(new FormData(el).entries());

registerActions({
  'settings-biz': (el) => {
    const d = form(el);
    S.saveSettings({ businessName: d.businessName.trim() || 'Mi tienda', ownerName: d.ownerName.trim(), receiptFooter: d.receiptFooter.trim(), staleDays: Math.max(1, toNum(d.staleDays) || 60), reserveDays: Math.max(1, toNum(d.reserveDays) || 3) });
    toast('Guardado');
  },
  'settings-channels': (el) => {
    const d = new FormData(el);
    const channels = S.state.settings.channels.map((c, i) => ({ ...c, name: String(d.get(`name-${i}`) || '').trim() || c.name, feePct: toNum(d.get(`pct-${i}`)), feeFixed: toNum(d.get(`fix-${i}`)), platform: d.get(`plat-${i}`) === 'on' }));
    S.saveSettings({ channels });
    toast('Canales guardados');
  },
  'channel-add': () => {
    const name = prompt('Nombre del canal (por ejemplo: Wallapop, Tienda física)');
    if (!name?.trim()) return;
    const id = normalize(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
    if (S.state.settings.channels.some((c) => c.id === id)) { toast('Ese canal ya existe'); return; }
    S.saveSettings({ channels: [...S.state.settings.channels, { id, name: name.trim(), feePct: 0, feeFixed: 0, platform: false }] });
  },
  'channel-del': (el) => {
    const c = S.state.settings.channels[Number(el.dataset.i)];
    if (S.state.settings.channels.length <= 1) return;
    const used = S.state.sales.some((s) => s.channel === c.id);
    if (!confirm(used ? `Hay ventas en ${c.name}. Se seguirán viendo, pero ya no podrás elegir este canal. ¿Quitarlo?` : `¿Quitar ${c.name}?`)) return;
    S.saveSettings({ channels: S.state.settings.channels.filter((_, i) => i !== Number(el.dataset.i)) });
  },
  'settings-methods': (el) => {
    const methods = form(el).methods.split(',').map((m) => m.trim()).filter(Boolean);
    if (!methods.length) { toast('Pon al menos una forma de pago'); return; }
    S.saveSettings({ methods: [...new Set(methods)] });
    toast('Guardado');
  },
  theme: (el) => S.saveSettings({ theme: el.dataset.v }),
  'toggle-market': (el) => S.saveSettings({ showMarket: el.checked }),
  'copy-sql': async () => {
    try { await navigator.clipboard.writeText(SETUP_SQL); toast('Copiado'); } catch { toast('Selecciona el texto y cópialo'); }
  },
  'sync-connect': async (el, e) => {
    const d = form(el);
    const mode = e.submitter?.value || 'login';
    syncForm = { url: d.url.trim(), key: d.key.trim(), email: d.email.trim(), busy: true, error: '', info: '' };
    if (!/^https:\/\/.+/.test(syncForm.url) || !syncForm.key || !syncForm.email || (d.password || '').length < 6) {
      syncForm.busy = false;
      syncForm.error = 'Rellena la URL (https://…), la clave, el email y una contraseña de al menos 6 caracteres.';
      rerender();
      return;
    }
    rerender();
    try {
      const r = await connect({ ...syncForm, password: d.password, signup: mode === 'signup' });
      syncForm.busy = false;
      if (r.needsConfirm) syncForm.info = 'Usuario creado. Abre el email de confirmación que te ha enviado Supabase y luego pulsa «Entrar».';
      else { syncForm = { url: '', key: '', email: '', busy: false, error: '', info: '' }; toast('Conectado. Sincronizando…'); }
    } catch (err) {
      syncForm.busy = false;
      syncForm.error = /invalid login/i.test(err.message) ? 'Email o contraseña incorrectos (o falta confirmar el email).' : /fetch/i.test(err.message) ? 'No se puede conectar con esa URL.' : err.message;
    }
    rerender();
  },
  'sync-now': async () => { await syncNow(); rerender(); toast(getStatus().message); },
  'sync-off': async () => {
    if (!confirm('Este dispositivo dejará de sincronizarse. Los datos se quedan aquí. ¿Seguir?')) return;
    await disconnect();
    rerender();
  },
  install: async () => {
    const p = window.__installPrompt;
    if (!p) return;
    p.prompt();
    await p.userChoice.catch(() => {});
    window.__installPrompt = null;
    rerender();
  },
  backup: () => downloadBackup(),
  restore: async (el) => {
    const file = el.files?.[0];
    if (!file) return;
    try {
      const data = await readBackup(file);
      if (!confirm(`Se reemplazarán los datos actuales por la copia (${data.sales.length} ventas, ${data.clients?.length || 0} clientes). ¿Seguir?`)) return;
      data.meta = { ...(data.meta || {}), lastModified: Date.now(), isSample: false };
      S.replaceState(data, 'local');
      toast('Copia restaurada');
    } catch (err) { toast(err.message || 'No se ha podido leer el archivo'); }
    el.value = '';
  },
  'export-all': () => exportSalesCSV(S.state.sales, 'ventas-todas.csv'),
  'load-sample': () => {
    if (S.state.sales.length && !confirm('Se reemplazarán tus datos por los de ejemplo. Descarga antes una copia si los quieres conservar. ¿Seguir?')) return;
    S.loadSample();
    location.hash = '#/';
  },
  wipe: () => {
    if (!confirm('Se borrarán todas las ventas, clientes y stock de este dispositivo (y de la nube si sincronizas). ¿Seguro?')) return;
    if (!confirm('Última confirmación: no se puede deshacer. ¿Borrar todo?')) return;
    S.clearAllData(true);
    location.hash = '#/';
  },
});
