// Datenmodell der Einstellungsseite (Server ↔ Browser).

/** App-weite Einstellungen. Passwörter gehen nie zurück an den Browser, nur ob eines gesetzt ist. */
export interface AppSettingsView {
  obsUrl: string;
  obsPasswordSet: boolean;
  publicUrl: string;
  relayToken: string;
  port: number;
}

export interface AppSettingsPatch {
  obsUrl?: string;
  /** undefined = unverändert, '' = löschen */
  obsPassword?: string;
  publicUrl?: string;
  relayToken?: string;
}

export type SourceKind = 'none' | 'media' | 'browser';

/** Ein Feed (Runner, Kamera …) so, wie ihn die Einstellungsseite bearbeitet. */
export interface FeedSettings {
  id: string;
  label: string;
  sourceKind: SourceKind;
  sourceUrl: string;
  previewUrl: string;
  ingestPath: string;
  /** Zusatzangaben: twitch, discord, platform, notes, pbMs … */
  meta: Record<string, unknown>;
}

export interface ProductionSettings {
  id: string;
  name: string;
  format: string;
  description: string;
  simulationEnabled: boolean;
  simulationSpeed: number;
  ingestHost: string;
  ingestApi: string;
  extraSources: string[];
  autopilotMinHoldSec: number;
  twitchAutoMarkers: boolean;
  /** SM64: Wertungsmodus */
  scoring?: string;
  /** Feste Kommentar-Szene in OBS (leer = keine) */
  commentaryScene: string;
  commentaryLabel: string;
  /** Größe des Overlays in % der Breite des Hauptbilds */
  commentarySize: number;
  commentaryCorner: 'br' | 'bl' | 'tr' | 'tl';
  feeds: FeedSettings[];
}

export interface SettingsResponse {
  app: AppSettingsView;
  production: ProductionSettings | null;
}

export const FEED_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Schlägt die nächste freie Feed-ID vor: r01, r02 … (Präfix und Stellen aus den vorhandenen IDs). */
export function nextFeedId(existing: string[], fallbackPrefix = 'r'): string {
  const match = existing.map((id) => /^([a-z_-]*?)(\d+)$/.exec(id)).find((m) => m !== null);
  const prefix = match ? match[1] : fallbackPrefix;
  const width = match ? match[2].length : 2;
  const taken = new Set(existing);
  for (let i = 1; ; i++) {
    const candidate = `${prefix}${String(i).padStart(width, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Adressen für einen Feed aus dem Ingest-Server (MediaMTX-Standardports) ableiten. */
export function ingestAddresses(
  host: string,
  path: string,
): { sourceUrl: string; previewUrl: string; publishUrl: string; apiUrl: string } {
  const h = ingestHostName(host);
  return {
    sourceUrl: `srt://${h}:8890?streamid=read:${path}`,
    previewUrl: `http://${h}:8889/${path}`,
    publishUrl: `srt://${h}:8890?streamid=publish:${path}`,
    apiUrl: `http://${h}:9997`,
  };
}

/** „https://ingest.example.com:9997/x“ → „ingest.example.com“ */
export function ingestHostName(host: string): string {
  return host
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '');
}
