// Gemeinsame Typen für Server, Regie-Oberfläche und Overlays.

export type FeedStatus = 'live' | 'offline' | 'unknown';

/** Ein Bildzuspieler: Runner-Stream, Kamera, Zuspieler … */
export interface FeedState {
  id: string;
  label: string;
  status: FeedStatus;
  bitrateKbps: number | null;
  /** WebRTC-Vorschau (z. B. MediaMTX-Seite) für die Multiview, falls vorhanden */
  previewUrl: string | null;
  /** Woher das Signal kommt: Stream über Ingest-Server, Browser-Link (VDO.Ninja) oder noch keins */
  sourceKind: 'media' | 'browser' | 'none';
  onProgram: boolean;
  inPreview: boolean;
  lastProgramAt: number | null;
}

/** Slot in einem Layout, Koordinaten relativ zur Leinwand (0–1). */
export interface SlotDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutDef {
  id: string;
  name: string;
  /** Tastenkürzel in der Regie (ein Zeichen) */
  hotkey?: string;
  slots: SlotDef[];
}

/** Belegung eines Layouts: Slot-ID → Feed-ID */
export interface Composition {
  layoutId: string;
  slots: Record<string, string | null>;
}

/** Ein laufender oder stehender Timer, der im Browser hochgerechnet wird. */
export interface TimerInfo {
  /** Stand in Millisekunden zum Zeitpunkt `at` */
  baseMs: number;
  running: boolean;
  /** Server-Zeitstempel (ms) */
  at: number;
  /** Geschwindigkeitsfaktor, 1 = Echtzeit (Simulation kann schneller laufen) */
  rate: number;
}

/**
 * Was ein Format über einen Feed weiß: Spannung (Score), Gründe, Kennzahlen.
 * Daraus entstehen Highlight-Radar, Kachel-Infos und Slot-Beschriftungen.
 */
export interface FeedInsight {
  feedId: string;
  score: number;
  reasons: string[];
  /** Kurzer Status, z. B. „läuft“, „Reset“ */
  status: string;
  /** Hauptkennzahl, z. B. „47/70 ★“ */
  stats: string | null;
  /** Abstand zur Bestzeit in ms (negativ = schneller) */
  deltaMs: number | null;
  timer: TimerInfo | null;
  /** Vorschlag für ein Duell-Layout */
  partnerFeedId: string | null;
}

export type AlertLevel = 'info' | 'highlight' | 'warning' | 'critical';

export interface Alert {
  id: string;
  at: number;
  level: AlertLevel;
  text: string;
  feedId: string | null;
}

export interface LogEntry {
  at: number;
  kind: string;
  text: string;
}

export interface LowerThird {
  visible: boolean;
  title: string;
  subtitle: string;
}

export interface GraphicsState {
  slotLabels: boolean;
  leaderboard: boolean;
  ticker: boolean;
  lowerThird: LowerThird;
}

export interface ObsStatus {
  mode: 'obs' | 'simulation';
  connected: boolean;
  url: string | null;
  studioMode: boolean;
  programScene: string | null;
  setupDone: boolean;
  error: string | null;
}

export interface ProductionSummary {
  id: string;
  name: string;
  format: string;
  formatName: string;
  description: string;
  feedCount: number;
}

export interface FormatInfo {
  id: string;
  name: string;
  description: string;
}

export interface ProductionState {
  id: string;
  name: string;
  format: string;
  formatName: string;
  description: string;
  simulation: boolean;
  feeds: FeedState[];
  layouts: LayoutDef[];
  preview: Composition;
  program: Composition;
  lastTakeAt: number | null;
  audioFollow: boolean;
  autopilot: boolean;
  autopilotLayoutId: string;
  graphics: GraphicsState;
  alerts: Alert[];
  log: LogEntry[];
  insights: FeedInsight[];
  formatState: unknown;
}

export interface AppState {
  version: string;
  serverTime: number;
  obs: ObsStatus;
  twitch: { configured: boolean; title: string | null };
  productions: ProductionSummary[];
  formats: FormatInfo[];
  /** Fehler beim Laden der Produktions-Konfigurationen */
  configErrors: string[];
  production: ProductionState | null;
}

export interface ClientAction {
  type: 'action';
  action: string;
  payload?: unknown;
}

export type ServerMessage =
  { type: 'state'; state: AppState } | { type: 'error'; message: string } | { type: 'ok'; action: string };
