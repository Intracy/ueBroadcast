import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { LayoutDef } from '../../shared/types';

export const ROOT_DIR = resolve(import.meta.dirname, '..', '..');
export const PRODUCTIONS_DIR = join(ROOT_DIR, 'productions');
export const DATA_DIR = join(ROOT_DIR, 'data');
export const WEB_DIST_DIR = join(ROOT_DIR, 'dist', 'web');

/** Lädt eine .env-Datei (KEY=VALUE) in process.env, ohne vorhandene Werte zu überschreiben. */
export function loadEnvFile(path = join(ROOT_DIR, '.env')): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export interface AppConfig {
  port: number;
  publicUrl: string;
  defaultProduction: string | null;
  obsUrl: string | null;
  obsPassword: string | undefined;
  relayToken: string | null;
  twitch: { clientId: string; accessToken: string; broadcasterId: string } | null;
}

export function readAppConfig(): AppConfig {
  const env = process.env;
  const port = Number(env.UEB_PORT || 4400);
  const twitch =
    env.TWITCH_CLIENT_ID && env.TWITCH_ACCESS_TOKEN && env.TWITCH_BROADCASTER_ID
      ? {
          clientId: env.TWITCH_CLIENT_ID,
          accessToken: env.TWITCH_ACCESS_TOKEN,
          broadcasterId: env.TWITCH_BROADCASTER_ID,
        }
      : null;
  return {
    port,
    publicUrl: (env.UEB_PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ''),
    defaultProduction: env.UEB_PRODUCTION || null,
    obsUrl: env.OBS_URL || null,
    obsPassword: env.OBS_PASSWORD || undefined,
    relayToken: env.UEB_RELAY_TOKEN || null,
    twitch,
  };
}

/** Feed in der Produktions-Konfiguration. */
export interface FeedConfig {
  id: string;
  label: string;
  /** Wie OBS das Signal einbindet: Medienquelle (SRT/RTMP/HLS-URL) oder Browserquelle (z. B. VDO.Ninja) */
  source?: { kind: 'media' | 'browser'; url: string };
  /** WebRTC-Vorschau für die Multiview (z. B. http://ingest:8889/runner01) */
  previewUrl?: string;
  /** Pfadname im Ingest-Server (MediaMTX), für den Verbindungsstatus */
  ingestPath?: string;
  /** Format-spezifische Zusatzdaten, z. B. { "pbMs": 3120000 } */
  meta?: Record<string, unknown>;
}

export interface ProductionConfig {
  id: string;
  name: string;
  format: string;
  description?: string;
  feeds: FeedConfig[];
  layouts?: LayoutDef[];
  defaultLayout?: string;
  /** Ingest-Server: `host` für automatisch erzeugte Adressen, `mediamtxApi` für Feed-Status */
  ingest?: { host?: string; mediamtxApi?: string };
  obs?: {
    /** Vorhandene OBS-Quellen/Szenen, die über den Feeds liegen sollen (z. B. Kommentar-Kameras) */
    extraSources?: string[];
  };
  simulation?: { enabled?: boolean; speed?: number };
  autopilot?: { layoutId?: string; minHoldSec?: number };
  twitch?: { autoMarkers?: boolean };
  /** Konfiguration für das Format-Modul */
  formatConfig?: Record<string, unknown>;
}

export class ConfigError extends Error {}

export function validateProductionConfig(raw: unknown, source: string): ProductionConfig {
  if (!raw || typeof raw !== 'object') throw new ConfigError(`${source}: kein JSON-Objekt`);
  const c = raw as Record<string, unknown>;
  for (const key of ['id', 'name', 'format'] as const) {
    if (typeof c[key] !== 'string' || !(c[key] as string).trim())
      throw new ConfigError(`${source}: Feld "${key}" fehlt`);
  }
  if (!Array.isArray(c.feeds)) throw new ConfigError(`${source}: "feeds" muss eine Liste sein`);
  const ids = new Set<string>();
  for (const [i, f] of (c.feeds as unknown[]).entries()) {
    const feed = f as Record<string, unknown>;
    if (typeof feed?.id !== 'string' || typeof feed?.label !== 'string') {
      throw new ConfigError(`${source}: feeds[${i}] braucht "id" und "label"`);
    }
    if (ids.has(feed.id)) throw new ConfigError(`${source}: Feed-ID "${feed.id}" doppelt`);
    ids.add(feed.id);
  }
  if (c.layouts !== undefined) {
    if (!Array.isArray(c.layouts)) throw new ConfigError(`${source}: "layouts" muss eine Liste sein`);
    for (const l of c.layouts as LayoutDef[]) {
      if (typeof l.id !== 'string' || !Array.isArray(l.slots)) throw new ConfigError(`${source}: Layout ohne id/slots`);
    }
  }
  return c as unknown as ProductionConfig;
}

export function loadProductionConfigs(dir = PRODUCTIONS_DIR): {
  configs: ProductionConfig[];
  errors: string[];
  files: Map<string, string>;
} {
  const configs: ProductionConfig[] = [];
  const errors: string[] = [];
  const files = new Map<string, string>();
  if (!existsSync(dir)) return { configs, errors, files };
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      const config = validateProductionConfig(raw, file);
      if (files.has(config.id)) throw new ConfigError(`${file}: Produktions-ID "${config.id}" doppelt`);
      configs.push(config);
      files.set(config.id, join(dir, file));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { configs, errors, files };
}

/** Schreibt eine JSON-Datei atomar (erst temporär, dann umbenennen). */
export function writeJsonFile(path: string, data: unknown): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}
