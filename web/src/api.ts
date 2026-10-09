import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AppState, ServerMessage } from '../../shared/types';

export interface Toast {
  id: number;
  kind: 'error' | 'ok';
  text: string;
}

interface Store {
  state: AppState | null;
  connected: boolean;
  /** Server-Uhr minus Browser-Uhr (ms) */
  offset: number;
  toasts: Toast[];
}

let store: Store = { state: null, connected: false, offset: 0, toasts: [] };
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let toastSeq = 0;

function set(patch: Partial<Store>) {
  store = { ...store, ...patch };
  for (const l of listeners) l();
}

export function pushToast(kind: Toast['kind'], text: string) {
  const toast = { id: ++toastSeq, kind, text };
  set({ toasts: [...store.toasts, toast].slice(-4) });
  setTimeout(() => set({ toasts: store.toasts.filter((t) => t.id !== toast.id) }), kind === 'error' ? 6000 : 2500);
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;
  ws.onopen = () => set({ connected: true });
  ws.onclose = () => {
    set({ connected: false });
    socket = null;
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data as string) as ServerMessage;
    if (msg.type === 'state') {
      set({ state: msg.state, offset: msg.state.serverTime - Date.now() });
    } else if (msg.type === 'error') {
      pushToast('error', msg.message);
    }
  };
}

let started = false;
function ensureConnected() {
  if (started) return;
  started = true;
  connect();
}

/** Sendet eine Aktion an den Server. */
export function send(action: string, payload?: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    pushToast('error', 'Keine Verbindung zum ueBroadcast-Server');
    return;
  }
  socket.send(JSON.stringify({ type: 'action', action, payload }));
}

export function useStore(): Store {
  ensureConnected();
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => store,
  );
}

/** Rendert die Komponente regelmäßig neu – für laufende Timer. */
export function useNow(intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useHashRoute(): [string, (r: string) => void] {
  const read = () => location.hash.replace(/^#\/?/, '') || 'regie';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [route, (r: string) => (location.hash = `#/${r}`)];
}

/** JSON-Anfrage an die HTTP-API; wirft einen Fehler mit der Meldung des Servers. */
export async function apiRequest<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
  return data;
}
