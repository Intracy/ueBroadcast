import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientAction, ServerMessage } from '../shared/types';
import type { AppSettingsPatch, ProductionSettings } from '../shared/settings';
import { WEB_DIST_DIR } from './core/config';
import type { UebApp } from './core/app';
import { ActionError } from './formats/types';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new ActionError('Anfrage zu groß');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ActionError('Ungültiges JSON');
  }
}

function serveStatic(pathname: string, res: ServerResponse): boolean {
  if (!existsSync(WEB_DIST_DIR)) return false;
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/overlay') rel = '/overlay.html';
  const file = normalize(join(WEB_DIST_DIR, rel));
  if (!file.startsWith(WEB_DIST_DIR)) return false;
  let target = file;
  if (!existsSync(target) || statSync(target).isDirectory()) {
    if (extname(rel)) return false;
    target = join(WEB_DIST_DIR, 'index.html'); // Client-Routing
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
    'Cache-Control': target.includes(`${join(WEB_DIST_DIR, 'assets')}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  });
  res.end(readFileSync(target));
  return true;
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/**
 * HTTP-API + WebSocket.
 *  GET  /api/state                     kompletter Zustand (z. B. für Bitfocus Companion)
 *  POST /api/action  {action, payload} jede Regie-Aktion
 *  POST /api/take                      Vorschau auf Sendung
 *  POST /api/layout/:id                Vorschau-Layout setzen
 *  POST /api/cut/:feedId               Feed direkt in den Hauptslot
 *  POST /api/autopilot/on|off
 *  POST /api/feeds/:feedId/run         Run-Snapshot vom Split-Relay
 *  GET  /api/log.csv                   Regie-Logbuch
 *  WS   /ws                            Live-Zustand + Aktionen
 */
export function createHttpServer(app: UebApp): Server {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ueb-token');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
      res.end();
      return;
    }

    try {
      if (path === '/api/state' && req.method === 'GET') return sendJson(res, 200, app.getState());
      if (path === '/api/health') return sendJson(res, 200, { ok: true });
      if (path === '/api/settings' && req.method === 'GET') return sendJson(res, 200, app.getSettings());
      if (path === '/api/settings/app' && req.method === 'POST') {
        await app.saveAppSettings((await readBody(req)) as AppSettingsPatch);
        return sendJson(res, 200, app.getSettings());
      }
      if (path === '/api/settings/production' && req.method === 'POST') {
        await app.saveProductionSettings((await readBody(req)) as ProductionSettings);
        return sendJson(res, 200, app.getSettings());
      }

      if (path === '/api/log.csv' && req.method === 'GET') {
        const rows = (app.active?.getLog() ?? []).map((l) =>
          [new Date(l.at).toISOString(), l.kind, l.text].map(csvCell).join(','),
        );
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${app.active?.config.id ?? 'ueb'}-log.csv"`,
        });
        res.end(['"Zeit","Art","Eintrag"', ...rows].join('\n'));
        return;
      }

      if (req.method === 'POST' && path.startsWith('/api/')) {
        const runMatch = path.match(/^\/api\/feeds\/([^/]+)\/run$/);
        if (runMatch) {
          if (app.cfg.relayToken && req.headers['x-ueb-token'] !== app.cfg.relayToken) {
            return sendJson(res, 401, { error: 'Token fehlt oder falsch' });
          }
          if (!app.active) throw new ActionError('Keine Produktion aktiv');
          app.active.ingest(decodeURIComponent(runMatch[1]), await readBody(req));
          return sendJson(res, 200, { ok: true });
        }
        let action: string | null = null;
        let payload: unknown = {};
        if (path === '/api/action') {
          const body = (await readBody(req)) as { action?: unknown; payload?: unknown };
          if (typeof body.action !== 'string') throw new ActionError('Feld "action" fehlt');
          action = body.action;
          payload = body.payload;
        } else if (path === '/api/take') {
          action = 'take';
        } else if (path.startsWith('/api/layout/')) {
          action = 'preview.layout';
          payload = { layoutId: decodeURIComponent(path.slice('/api/layout/'.length)) };
        } else if (path.startsWith('/api/cut/')) {
          action = 'cut';
          payload = { feedId: decodeURIComponent(path.slice('/api/cut/'.length)) };
        } else if (path === '/api/autopilot/on' || path === '/api/autopilot/off') {
          action = 'autopilot';
          payload = { enabled: path.endsWith('/on') };
        }
        if (!action) return sendJson(res, 404, { error: 'Unbekannter Endpunkt' });
        await app.handleAction(action, payload);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && serveStatic(path, res)) return;
      if (path === '/' || path === '/overlay.html') {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Oberfläche noch nicht gebaut. Bitte "npm start" (baut und startet) oder "npm run dev" verwenden.');
        return;
      }
      sendJson(res, 404, { error: 'Nicht gefunden' });
    } catch (err) {
      const status = err instanceof ActionError ? 400 : 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---------------------------------------------------------------- WebSocket
  const wss = new WebSocketServer({ server, path: '/ws' });
  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  let pending: NodeJS.Timeout | null = null;
  let lastSent = 0;
  const broadcast = () => {
    pending = null;
    lastSent = Date.now();
    const msg = JSON.stringify({ type: 'state', state: app.getState() } satisfies ServerMessage);
    for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(msg);
  };
  app.on('change', () => {
    if (pending) return;
    const wait = Math.max(0, 120 - (Date.now() - lastSent));
    pending = setTimeout(broadcast, wait);
  });

  wss.on('connection', (ws) => {
    send(ws, { type: 'state', state: app.getState() });
    ws.on('message', async (raw) => {
      let msg: ClientAction;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: 'error', message: 'Ungültige Nachricht' });
      }
      if (msg?.type !== 'action' || typeof msg.action !== 'string') return;
      try {
        await app.handleAction(msg.action, msg.payload);
        send(ws, { type: 'ok', action: msg.action });
      } catch (err) {
        if (!(err instanceof ActionError)) console.error(err);
        send(ws, { type: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    });
  });

  return server;
}
