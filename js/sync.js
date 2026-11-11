// Optional sync between devices through the user's own Supabase project.
// The whole dataset is stored as one JSON row per user, protected by row level security.
// Newest change wins. The config (URL, key, session) lives only on this device.
import { state, idbGet, idbSet, replaceState, subscribe } from './store.js';

export const SETUP_SQL = `create table if not exists public.solebook_data (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.solebook_data enable row level security;
create policy "solo mis datos" on public.solebook_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);`;

let cfg = null; // { url, key, email, session: { access_token, refresh_token, expires_at, user_id }, lastRemote, lastPushed }
let status = { state: 'off', message: 'Sin sincronizar', at: null };
const statusListeners = new Set();
export const onStatus = (fn) => statusListeners.add(fn);
export const getStatus = () => status;
export const getConfig = () => cfg;
const setStatus = (s, message) => {
  status = { state: s, message, at: Date.now() };
  statusListeners.forEach((f) => f(status));
};

const saveCfg = () => idbSet('sync', cfg);
const base = () => cfg.url.replace(/\/+$/, '');
const headers = (auth = true) => ({
  apikey: cfg.key,
  'Content-Type': 'application/json',
  ...(auth && cfg.session ? { Authorization: `Bearer ${cfg.session.access_token}` } : {}),
});

async function authRequest(path, body) {
  const res = await fetch(`${base()}/auth/v1/${path}`, { method: 'POST', headers: headers(false), body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || `Error ${res.status}`);
  return data;
}
const keepSession = (d) => {
  cfg.session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user_id: d.user?.id };
};

export async function connect({ url, key, email, password, signup = false }) {
  cfg = { url: url.trim(), key: key.trim(), email: email.trim(), session: null, lastRemote: 0, lastPushed: 0 };
  if (signup) {
    const d = await authRequest('signup', { email: cfg.email, password });
    if (!d.access_token) {
      await saveCfg();
      return { needsConfirm: true };
    }
    keepSession(d);
  } else {
    keepSession(await authRequest('token?grant_type=password', { email: cfg.email, password }));
  }
  await saveCfg();
  await syncNow({ firstConnect: true });
  return { ok: true };
}

export async function disconnect() {
  cfg = null;
  await idbSet('sync', null);
  setStatus('off', 'Sin sincronizar');
}

async function ensureToken() {
  if (!cfg?.session) throw new Error('Inicia sesión para sincronizar');
  if (cfg.session.expires_at - 60 > Date.now() / 1000) return;
  keepSession(await authRequest('token?grant_type=refresh_token', { refresh_token: cfg.session.refresh_token }));
  await saveCfg();
}

async function pull() {
  const res = await fetch(`${base()}/rest/v1/solebook_data?select=data,updated_at&user_id=eq.${cfg.session.user_id}`, { headers: headers() });
  if (!res.ok) throw new Error(res.status === 404 ? 'Falta crear la tabla (paso 2)' : `Error ${res.status} al leer`);
  const rows = await res.json();
  return rows[0] ? { data: rows[0].data, updated: Date.parse(rows[0].updated_at) } : null;
}

async function push() {
  const updated = state.meta.lastModified || Date.now();
  const res = await fetch(`${base()}/rest/v1/solebook_data?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: cfg.session.user_id, data: state, updated_at: new Date(updated).toISOString() }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(/relation|does not exist/.test(t) ? 'Falta crear la tabla (paso 2)' : `Error ${res.status} al guardar`);
  }
  cfg.lastPushed = updated;
  cfg.lastRemote = updated;
  await saveCfg();
}

let running = null;
export function syncNow(opts = {}) {
  if (!cfg?.session) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    if (!navigator.onLine) { setStatus('offline', 'Sin conexión: se guarda en este dispositivo'); return; }
    setStatus('syncing', 'Sincronizando…');
    try {
      await ensureToken();
      const remote = await pull();
      const local = state.meta.lastModified || 0;
      const localDirty = local > (cfg.lastPushed || 0);
      if (!remote) {
        await push();
      } else if (opts.firstConnect && state.meta.isSample) {
        replaceState(remote.data); // never upload example data over real data
        cfg.lastRemote = cfg.lastPushed = remote.updated;
      } else if (remote.updated > (cfg.lastRemote || 0) && !(localDirty && local > remote.updated)) {
        replaceState(remote.data);
        cfg.lastRemote = cfg.lastPushed = remote.updated;
      } else if (localDirty) {
        await push();
      }
      await saveCfg();
      setStatus('ok', 'Sincronizado');
    } catch (e) {
      setStatus('error', e.message || 'Error al sincronizar');
    }
  })().finally(() => { running = null; });
  return running;
}

let pushTimer;
export async function initSync() {
  cfg = (await idbGet('sync').catch(() => null)) || null;
  subscribe((source) => {
    if (source !== 'local' || !cfg?.session) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => syncNow(), 1500);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', () => syncNow());
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  if (!cfg?.session) { setStatus('off', 'Sin sincronizar'); return; }
  syncNow();
}
