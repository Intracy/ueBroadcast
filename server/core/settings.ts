import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AppSettingsPatch,
  AppSettingsView,
  FeedSettings,
  ProductionSettings,
  SourceKind,
} from '../../shared/settings';
import { FEED_ID_PATTERN } from '../../shared/settings';
import type { AppConfig, FeedConfig, ProductionConfig } from './config';
import { DATA_DIR, writeJsonFile } from './config';
import { ActionError } from '../formats/types';

export const SETTINGS_FILE = join(DATA_DIR, 'settings.json');

interface StoredSettings {
  obsUrl?: string;
  obsPassword?: string;
  publicUrl?: string;
  relayToken?: string;
}

/** Liest gespeicherte App-Einstellungen; sie haben Vorrang vor der .env. */
export function applyStoredSettings(cfg: AppConfig, file = SETTINGS_FILE): AppConfig {
  if (!existsSync(file)) return cfg;
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as StoredSettings;
    return {
      ...cfg,
      obsUrl: s.obsUrl !== undefined ? s.obsUrl || null : cfg.obsUrl,
      obsPassword: s.obsPassword !== undefined ? s.obsPassword || undefined : cfg.obsPassword,
      publicUrl: s.publicUrl ? s.publicUrl.replace(/\/$/, '') : cfg.publicUrl,
      relayToken: s.relayToken !== undefined ? s.relayToken || null : cfg.relayToken,
    };
  } catch (err) {
    console.error('data/settings.json unlesbar:', err);
    return cfg;
  }
}

export function appSettingsView(cfg: AppConfig): AppSettingsView {
  return {
    obsUrl: cfg.obsUrl ?? '',
    obsPasswordSet: !!cfg.obsPassword,
    publicUrl: cfg.publicUrl,
    relayToken: cfg.relayToken ?? '',
    port: cfg.port,
  };
}

const trimStr = (v: unknown, max = 500): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function checkUrl(value: string, protocols: string[], label: string): void {
  if (!value) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ActionError(`${label}: „${value}“ ist keine gültige Adresse`);
  }
  if (!protocols.includes(url.protocol.replace(':', ''))) {
    throw new ActionError(`${label} muss mit ${protocols.map((p) => `${p}://`).join(' oder ')} beginnen`);
  }
}

/** Prüft einen Patch der App-Einstellungen und liefert die neue Konfiguration. */
export function mergeAppSettings(cfg: AppConfig, patch: AppSettingsPatch, file = SETTINGS_FILE): AppConfig {
  const next: AppConfig = { ...cfg };
  if (patch.obsUrl !== undefined) {
    const url = trimStr(patch.obsUrl);
    checkUrl(url, ['ws', 'wss'], 'OBS-Adresse');
    next.obsUrl = url || null;
  }
  if (patch.obsPassword !== undefined) next.obsPassword = trimStr(patch.obsPassword) || undefined;
  if (patch.publicUrl !== undefined) {
    const url = trimStr(patch.publicUrl).replace(/\/$/, '');
    checkUrl(url, ['http', 'https'], 'Adresse für OBS-Overlay');
    next.publicUrl = url || `http://localhost:${cfg.port}`;
  }
  if (patch.relayToken !== undefined) next.relayToken = trimStr(patch.relayToken, 200) || null;
  const stored: StoredSettings = {
    obsUrl: next.obsUrl ?? '',
    obsPassword: next.obsPassword ?? '',
    publicUrl: next.publicUrl,
    relayToken: next.relayToken ?? '',
  };
  writeJsonFile(file, stored);
  return next;
}

// ------------------------------------------------------------------ Produktion

export function productionSettingsView(c: ProductionConfig): ProductionSettings {
  return {
    id: c.id,
    name: c.name,
    format: c.format,
    description: c.description ?? '',
    simulationEnabled: c.simulation?.enabled ?? false,
    simulationSpeed: c.simulation?.speed ?? 6,
    ingestHost: c.ingest?.host ?? '',
    ingestApi: c.ingest?.mediamtxApi ?? '',
    extraSources: c.obs?.extraSources ?? [],
    autopilotMinHoldSec: c.autopilot?.minHoldSec ?? 40,
    twitchAutoMarkers: c.twitch?.autoMarkers ?? false,
    scoring: typeof c.formatConfig?.scoring === 'string' ? (c.formatConfig.scoring as string) : undefined,
    commentaryScene: c.commentary?.obsScene ?? '',
    commentaryLabel: c.commentary?.label ?? '',
    commentarySize: c.commentary?.size ?? 30,
    commentaryCorner: c.commentary?.corner ?? 'br',
    feeds: c.feeds.map((f) => {
      const meta = { ...(f.meta ?? {}) };
      // Früher getrennt geführter Anzeigename: im Formular ist der Name das Label
      const label = typeof meta.runner === 'string' && meta.runner ? (meta.runner as string) : f.label;
      delete meta.runner;
      return {
        id: f.id,
        label,
        sourceKind: (f.source?.kind ?? 'none') as SourceKind,
        sourceUrl: f.source?.url ?? '',
        previewUrl: f.previewUrl ?? '',
        ingestPath: f.ingestPath ?? '',
        meta,
      };
    }),
  };
}

const ALLOWED_META = new Set(['twitch', 'discord', 'platform', 'notes', 'pbMs', 'country']);

function cleanFeed(raw: FeedSettings, index: number): FeedConfig {
  const id = trimStr(raw?.id, 32).toLowerCase();
  if (!FEED_ID_PATTERN.test(id)) {
    throw new ActionError(
      `Eintrag ${index + 1}: ID „${raw?.id ?? ''}“ ist ungültig (Kleinbuchstaben, Ziffern, - und _)`,
    );
  }
  const label = trimStr(raw.label, 60);
  if (!label) throw new ActionError(`Eintrag ${index + 1} (${id}): Name fehlt`);
  const feed: FeedConfig = { id, label };
  const kind = raw.sourceKind;
  const sourceUrl = trimStr(raw.sourceUrl, 1000);
  if (kind === 'media' || kind === 'browser') {
    if (!sourceUrl) throw new ActionError(`${label}: Signal-Adresse fehlt (oder Signalquelle auf „keine“ stellen)`);
    checkUrl(
      sourceUrl,
      kind === 'media' ? ['srt', 'rtmp', 'rtmps', 'rtsp', 'http', 'https', 'udp'] : ['http', 'https'],
      `${label}: Signal-Adresse`,
    );
    feed.source = { kind, url: sourceUrl };
  }
  const previewUrl = trimStr(raw.previewUrl, 1000);
  if (previewUrl) {
    checkUrl(previewUrl, ['http', 'https'], `${label}: Vorschau-Adresse`);
    feed.previewUrl = previewUrl;
  }
  const ingestPath = trimStr(raw.ingestPath, 100);
  if (ingestPath) feed.ingestPath = ingestPath;
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw.meta ?? {})) {
    if (!ALLOWED_META.has(k)) continue;
    if (k === 'pbMs') {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) meta.pbMs = Math.round(v);
    } else {
      const s = trimStr(v, k === 'notes' ? 1000 : 100);
      if (s) meta[k] = s;
    }
  }
  if (Object.keys(meta).length) feed.meta = meta;
  return feed;
}

/**
 * Übernimmt die Formulardaten in die Produktions-Konfiguration.
 * Unbekannte Felder der Datei (Layouts, Splits, Hinweise …) bleiben erhalten.
 */
export function mergeProductionSettings(original: ProductionConfig, s: ProductionSettings): ProductionConfig {
  if (!s || s.id !== original.id) throw new ActionError('Einstellungen gehören zu einer anderen Produktion');
  const name = trimStr(s.name, 80);
  if (!name) throw new ActionError('Name der Produktion fehlt');
  if (!Array.isArray(s.feeds)) throw new ActionError('Liste der Feeds fehlt');
  if (s.feeds.length > 64) throw new ActionError('Höchstens 64 Feeds pro Produktion');
  const feeds = s.feeds.map(cleanFeed);
  const ids = new Set<string>();
  for (const f of feeds) {
    if (ids.has(f.id)) throw new ActionError(`ID „${f.id}“ ist doppelt vergeben`);
    ids.add(f.id);
  }
  const ingestHost = trimStr(s.ingestHost, 200);
  const ingestApi = trimStr(s.ingestApi, 300);
  checkUrl(ingestApi, ['http', 'https'], 'MediaMTX-API');
  const speed = Number(s.simulationSpeed);
  const hold = Number(s.autopilotMinHoldSec);

  const next: ProductionConfig = structuredClone(original);
  next.name = name;
  next.description = trimStr(s.description, 500);
  next.feeds = feeds;
  next.simulation = {
    ...(original.simulation ?? {}),
    enabled: !!s.simulationEnabled,
    speed: Number.isFinite(speed) ? Math.min(60, Math.max(1, speed)) : 6,
  };
  const ingest = { ...(original.ingest ?? {}) };
  if (ingestHost) ingest.host = ingestHost;
  else delete ingest.host;
  if (ingestApi) ingest.mediamtxApi = ingestApi;
  else delete ingest.mediamtxApi;
  if (Object.keys(ingest).length) next.ingest = ingest;
  else delete next.ingest;
  next.obs = {
    ...(original.obs ?? {}),
    extraSources: (Array.isArray(s.extraSources) ? s.extraSources : []).map((x) => trimStr(x, 100)).filter(Boolean),
  };
  next.autopilot = {
    ...(original.autopilot ?? {}),
    minHoldSec: Number.isFinite(hold) ? Math.min(600, Math.max(5, Math.round(hold))) : 40,
  };
  next.twitch = { ...(original.twitch ?? {}), autoMarkers: !!s.twitchAutoMarkers };
  const commentaryScene = trimStr(s.commentaryScene, 100);
  if (commentaryScene) {
    const size = Number(s.commentarySize);
    next.commentary = {
      ...(original.commentary ?? {}),
      obsScene: commentaryScene,
      label: trimStr(s.commentaryLabel, 80) || undefined,
      size: Number.isFinite(size) ? Math.min(60, Math.max(10, Math.round(size))) : 30,
      corner: ['br', 'bl', 'tr', 'tl'].includes(s.commentaryCorner) ? s.commentaryCorner : 'br',
    };
    if (!next.commentary.label) delete next.commentary.label;
    // Die Kommentar-Szene steuert jetzt der Kommentar-Modus, nicht mehr die dauerhaften Zusatzquellen
    next.obs.extraSources = (next.obs.extraSources ?? []).filter((x) => x !== commentaryScene);
  } else {
    delete next.commentary;
  }
  if (s.scoring !== undefined) {
    if (!['bestTime', 'finishedRuns', 'totalStars'].includes(s.scoring)) throw new ActionError('Unbekannte Wertung');
    next.formatConfig = { ...(original.formatConfig ?? {}), scoring: s.scoring };
  }
  return next;
}
