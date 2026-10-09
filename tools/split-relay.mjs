#!/usr/bin/env node
// ueBroadcast Split-Relay
// Läuft beim Runner, liest LiveSplit über dessen TCP-Server (Standard-Port 16834)
// und meldet den Run-Zustand an die Regie. Keine Portfreigabe beim Runner nötig.
//
// Voraussetzungen: Node.js ≥ 18, in LiveSplit „Control → Start TCP Server“ (bzw. LiveSplit-Server-Komponente).
//
// Aufruf:
//   node split-relay.mjs --server https://regie.example.com --feed r01 [--token GEHEIM]
//                        [--livesplit 127.0.0.1:16834] [--interval 1000]

import net from 'node:net';
import { parseArgs } from 'node:util';

function readConfig() {
  const { values: args } = parseArgs({
    options: {
      server: { type: 'string' },
      feed: { type: 'string' },
      token: { type: 'string', default: '' },
      livesplit: { type: 'string', default: '127.0.0.1:16834' },
      interval: { type: 'string', default: '1000' },
      help: { type: 'boolean', default: false },
    },
  });

  if (args.help || !args.server || !args.feed) {
    console.log(
      'Aufruf: node split-relay.mjs --server <Regie-URL> --feed <Feed-ID> [--token <Token>] [--livesplit host:port]',
    );
    process.exit(args.help ? 0 : 1);
  }

  const [lsHost, lsPortRaw] = args.livesplit.split(':');
  const lsPort = Number(lsPortRaw || 16834);
  const intervalMs = Math.max(250, Number(args.interval) || 1000);
  const endpoint = `${args.server.replace(/\/$/, '')}/api/feeds/${encodeURIComponent(args.feed)}/run`;
  return { args, lsHost, lsPort, intervalMs, endpoint };
}

let args, lsHost, lsPort, intervalMs, endpoint;

/** "1:02:03.45", "−12.34", "+1:04.2" → Millisekunden; "-"/leer → null */
export function parseLiveSplitTime(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace('−', '-');
  if (!s || s === '-' || s === '—') return null;
  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  const parts = s.split(':').map((p) => p.replace(',', '.'));
  if (parts.some((p) => p === '' || Number.isNaN(Number(p)))) return null;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + Number(p);
  return Math.round(sign * seconds * 1000);
}

class LiveSplitClient {
  socket = null;
  buffer = '';
  queue = [];

  connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: lsHost, port: lsPort }, () => resolve());
      socket.setEncoding('utf8');
      socket.on('data', (chunk) => {
        this.buffer += chunk;
        let idx;
        while ((idx = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, idx).replace(/\r$/, '');
          this.buffer = this.buffer.slice(idx + 1);
          this.queue.shift()?.resolve(line);
        }
      });
      socket.on('error', (err) => {
        reject(err);
        this.failAll(err);
      });
      socket.on('close', () => {
        this.socket = null;
        this.failAll(new Error('LiveSplit-Verbindung geschlossen'));
      });
      this.socket = socket;
    });
  }

  failAll(err) {
    for (const q of this.queue.splice(0)) q.reject(err);
  }

  ask(command) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Nicht mit LiveSplit verbunden'));
      const timer = setTimeout(() => {
        const i = this.queue.findIndex((q) => q.resolve === done);
        if (i >= 0) this.queue.splice(i, 1);
        reject(new Error(`Keine Antwort auf ${command}`));
      }, 2000);
      const done = (line) => {
        clearTimeout(timer);
        resolve(line);
      };
      this.queue.push({ resolve: done, reject: (e) => (clearTimeout(timer), reject(e)) });
      this.socket.write(`${command}\r\n`);
    });
  }
}

async function readSnapshot(ls) {
  const phase = (await ls.ask('getcurrenttimerphase')).trim();
  const splitIndex = Number((await ls.ask('getsplitindex')).trim());
  const currentMs = parseLiveSplitTime(await ls.ask('getcurrenttime')) ?? 0;
  let deltaMs;
  if (phase === 'Running' || phase === 'Paused' || phase === 'Ended') {
    deltaMs = parseLiveSplitTime(await ls.ask('getdelta'));
  }
  const snap = { phase, splitIndex: Number.isFinite(splitIndex) ? splitIndex : -1, currentMs };
  if (deltaMs !== undefined) snap.deltaMs = deltaMs;
  if (phase === 'Ended') snap.finalMs = parseLiveSplitTime(await ls.ask('getfinaltime')) ?? currentMs;
  return snap;
}

async function post(snap) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(args.token ? { 'x-ueb-token': args.token } : {}) },
    body: JSON.stringify(snap),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`Regie antwortet ${res.status}: ${await res.text()}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  ({ args, lsHost, lsPort, intervalMs, endpoint } = readConfig());
  console.log(`Split-Relay für Feed ${args.feed} → ${endpoint}`);
  let lastKey = '';
  let lastSent = 0;
  for (;;) {
    const ls = new LiveSplitClient();
    try {
      await ls.connect();
      console.log(`Mit LiveSplit verbunden (${lsHost}:${lsPort})`);
      for (;;) {
        const snap = await readSnapshot(ls);
        const key = `${snap.phase}|${snap.splitIndex}`;
        // Bei Zustandswechsel sofort, sonst alle 5 s zum Nachjustieren der Uhr
        if (key !== lastKey || Date.now() - lastSent > 5000) {
          await post(snap).then(
            () => {
              if (key !== lastKey)
                console.log(`${new Date().toLocaleTimeString()}  ${snap.phase}  Split ${snap.splitIndex}`);
              lastKey = key;
              lastSent = Date.now();
            },
            (err) => console.warn(`Senden fehlgeschlagen: ${err.message}`),
          );
        }
        await sleep(intervalMs);
      }
    } catch (err) {
      console.warn(`LiveSplit: ${err.message} – neuer Versuch in 3 s`);
      ls.socket?.destroy();
      await sleep(3000);
    }
  }
}

if (process.argv[1]?.endsWith('split-relay.mjs')) {
  main();
}
