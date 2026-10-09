import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { HostPlacement, Rect } from '../../shared/host';
import { TICKER_RESERVE, hostOf, hostRect } from '../../shared/host';
import type {
  Alert,
  CommentaryInfo,
  AlertLevel,
  Composition,
  FeedInsight,
  FeedState,
  GraphicsState,
  LayoutDef,
  LogEntry,
  ProductionState,
} from '../../shared/types';
import type { ProductionConfig } from './config';
import { DATA_DIR } from './config';
import { defaultLayouts, assignFeed, emptyComposition, feedsInComposition, switchLayout } from './layouts';
import { decideAutopilot } from './autopilot';
import { MediaMtxMonitor, type FeedHealth } from './feedMonitor';
import type { ObsController } from '../obs/obsController';
import type { TwitchClient } from '../integrations/twitch';
import { ActionError, type FormatDefinition, type FormatInstance } from '../formats/types';

const MAX_ALERTS = 40;
const MAX_LOG = 1000;

export interface ProductionDeps {
  obs: ObsController;
  twitch: TwitchClient;
  publicUrl: string;
  now?: () => number;
  persist?: boolean;
}

interface Persisted {
  preview?: Composition;
  program?: Composition;
  audioFollow?: boolean;
  autopilot?: boolean;
  autopilotLayoutId?: string;
  graphics?: GraphicsState;
  log?: LogEntry[];
  lastProgramAt?: Record<string, number>;
  format?: unknown;
}

/**
 * Eine Produktionsumgebung: Feeds, Layouts, Preview/Program, Grafik, Alarme –
 * plus ein Format-Modul, das die inhaltliche Logik liefert (z. B. SM64-Marathon).
 */
export class Production extends EventEmitter {
  readonly config: ProductionConfig;
  readonly layouts: LayoutDef[];
  readonly simulation: boolean;
  private readonly format: FormatInstance;
  private readonly now: () => number;
  private feeds: FeedState[];
  preview: Composition;
  program: Composition;
  private lastTakeAt: number | null = null;
  private audioFollow = true;
  private autopilot = false;
  private autopilotLayoutId: string;
  private graphics: GraphicsState = {
    slotLabels: true,
    leaderboard: false,
    boardStrip: true,
    boardFull: false,
    hostBoard: false,
    ticker: true,
    lowerThird: { visible: false, title: '', subtitle: '' },
  };
  private alerts: Alert[] = [];
  private log: LogEntry[] = [];
  private alertCooldown = new Map<string, number>();
  private simulatedDrops = new Map<string, number>();
  private monitor: MediaMtxMonitor | null = null;
  private timers: NodeJS.Timeout[] = [];
  private saveTimer: NodeJS.Timeout | null = null;
  private alertSeq = 0;
  private takeInFlight: Promise<void> = Promise.resolve();

  constructor(
    config: ProductionConfig,
    private readonly def: FormatDefinition,
    private readonly deps: ProductionDeps,
  ) {
    super();
    this.config = config;
    this.now = deps.now ?? Date.now;
    this.layouts = config.layouts?.length ? config.layouts : defaultLayouts(config.feeds.length);
    this.simulation = config.simulation?.enabled ?? deps.obs.status.mode === 'simulation';
    this.autopilotLayoutId = config.autopilot?.layoutId ?? 'featured';
    this.feeds = config.feeds.map((f) => ({
      id: f.id,
      label: f.label,
      status: this.simulation ? 'live' : 'unknown',
      bitrateKbps: null,
      // Browser-Links (VDO.Ninja) taugen direkt als Vorschau, wenn keine eigene angegeben ist
      previewUrl: f.previewUrl || (f.source?.kind === 'browser' ? f.source.url : null),
      sourceKind: f.source?.kind ?? 'none',
      onProgram: false,
      inPreview: false,
      lastProgramAt: null,
    }));
    const defaultLayout = this.layoutById(config.defaultLayout ?? 'featured') ?? this.layouts[0];
    this.preview = emptyComposition(defaultLayout);
    defaultLayout.slots.forEach((slot, i) => (this.preview.slots[slot.id] = this.feeds[i]?.id ?? null));
    if (config.commentary?.obsScene?.trim()) {
      this.preview.host = { mode: 'off', corner: config.commentary.corner ?? 'br' };
    }
    this.program = structuredClone(this.preview);
    if (config.ingest?.mediamtxApi) this.monitor = new MediaMtxMonitor(config.ingest.mediamtxApi, config.feeds);

    const speed = config.simulation?.speed ?? 6;
    this.format = def.create(config, {
      now: this.now,
      feeds: () => this.feeds,
      alert: (level, text, opts) => this.alert(level, text, opts),
      log: (kind, text) => this.addLog(kind, text),
      changed: () => this.changed(),
      simulation: this.simulation,
      simulationSpeed: speed,
    });
    this.restore();
    this.refreshFeedFlags();
  }

  // ---------------------------------------------------------------- Lifecycle

  start(): void {
    this.format.start();
    this.deps.obs.setSpec({
      feeds: this.config.feeds.map((f) => ({ id: f.id, label: f.label, source: f.source })),
      overlayUrl: `${this.deps.publicUrl}/overlay.html?view=program`,
      extraSources: this.config.obs?.extraSources ?? [],
      commentaryScene: this.commentary?.obsScene ?? null,
    });
    this.timers.push(setInterval(() => void this.pollFeeds(), 3000));
    this.timers.push(setInterval(() => this.autopilotTick(), 2000));
    this.timers.push(setInterval(() => this.emit('change'), 1000));
    this.addLog('system', `Produktion „${this.config.name}“ gestartet${this.simulation ? ' (Simulation)' : ''}`);
    void this.pollFeeds();
  }

  stop(): void {
    this.format.stop();
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.saveNow();
  }

  /** OBS ist (wieder) verbunden → aktuelles Programm und Audio übertragen. */
  async syncObs(): Promise<void> {
    const layout = this.layoutById(this.program.layoutId);
    if (!layout || !this.deps.obs.status.setupDone) return;
    // Kommentar-Szene noch nicht eingebettet (z. B. nachträglich eingerichtet) → automatisch nachholen
    const commentary = this.commentary;
    if (commentary && this.deps.obs.active && !this.deps.obs.hasProgramItem(commentary.obsScene)) {
      try {
        const notes = await this.deps.obs.setup();
        for (const n of notes) this.addLog('obs', n);
        if (this.deps.obs.hasProgramItem(commentary.obsScene)) {
          this.addLog('obs', `Kommentar-Szene „${commentary.obsScene}“ eingebettet`);
        }
      } catch (err) {
        this.obsError(err);
      }
    }
    await this.deps.obs.applyProgram(layout, this.program, this.hostBox(this.program)).catch((e) => this.obsError(e));
    await this.applyAudio();
  }

  /** Feste Kommentar-Szene aus der Konfiguration (null = nicht eingerichtet). */
  get commentary(): CommentaryInfo | null {
    const c = this.config.commentary;
    if (!c?.obsScene?.trim()) return null;
    const size = typeof c.size === 'number' ? Math.min(60, Math.max(10, c.size)) : 30;
    return { obsScene: c.obsScene.trim(), label: c.label?.trim() || 'Kommentar', size };
  }

  /** Wo das Kommentar-Bild in einer Belegung liegt (null = nicht sichtbar). */
  hostBox(comp: Composition): Rect | null {
    if (!this.commentary) return null;
    return hostRect(
      this.layoutById(comp.layoutId),
      hostOf(comp),
      this.commentary.size,
      this.graphics.ticker ? TICKER_RESERVE : 0,
    );
  }

  /** Kommentar-Einstellung prüfen; ohne eingerichtete Szene immer „aus“. */
  private cleanHost(host: unknown): HostPlacement | undefined {
    if (!this.commentary || !host || typeof host !== 'object') return undefined;
    const h = host as Partial<HostPlacement>;
    const mode = h.mode === 'pip' || h.mode === 'full' ? h.mode : 'off';
    const fallback = this.config.commentary?.corner ?? 'br';
    const corner =
      h.corner === 'bl' || h.corner === 'tl' || h.corner === 'tr' || h.corner === 'br' ? h.corner : fallback;
    return { mode, corner };
  }

  // ---------------------------------------------------------------- State

  layoutById(id: string): LayoutDef | undefined {
    return this.layouts.find((l) => l.id === id);
  }

  insights(): FeedInsight[] {
    return this.format.getInsights();
  }

  getState(): ProductionState {
    return {
      id: this.config.id,
      name: this.config.name,
      format: this.def.id,
      formatName: this.def.name,
      description: this.config.description ?? '',
      simulation: this.simulation,
      feeds: this.feeds,
      layouts: this.layouts,
      preview: this.preview,
      program: this.program,
      lastTakeAt: this.lastTakeAt,
      audioFollow: this.audioFollow,
      autopilot: this.autopilot,
      autopilotLayoutId: this.autopilotLayoutId,
      graphics: this.graphics,
      alerts: this.alerts,
      log: this.log.slice(-200),
      insights: this.insights(),
      formatState: this.format.getState(),
      commentary: this.commentary,
    };
  }

  getLog(): LogEntry[] {
    return this.log;
  }

  private changed(): void {
    this.emit('change');
    this.scheduleSave();
  }

  addLog(kind: string, text: string): void {
    this.log.push({ at: this.now(), kind, text });
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
    this.changed();
  }

  alert(
    level: AlertLevel,
    text: string,
    opts: { feedId?: string; key?: string; cooldownMs?: number; marker?: boolean } = {},
  ): void {
    const now = this.now();
    if (opts.key) {
      const until = this.alertCooldown.get(opts.key);
      if (until && until > now) return;
      this.alertCooldown.set(opts.key, now + (opts.cooldownMs ?? 120_000));
    }
    this.alerts.unshift({ id: `a${++this.alertSeq}`, at: now, level, text, feedId: opts.feedId ?? null });
    if (this.alerts.length > MAX_ALERTS) this.alerts.length = MAX_ALERTS;
    this.addLog(`alarm:${level}`, text);
    if (opts.marker && this.config.twitch?.autoMarkers && this.deps.twitch.configured) {
      void this.deps.twitch.createMarker(text).catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- Feeds

  private async pollFeeds(): Promise<void> {
    let health: Map<string, FeedHealth> | null = null;
    const now = this.now();
    if (this.simulation) {
      health = new Map(
        this.feeds.map((f) => {
          const drop = this.simulatedDrops.get(f.id);
          const live = !(drop && drop > now);
          return [f.id, { live, bitrateKbps: live ? 4200 + Math.round(Math.random() * 1600) : null }];
        }),
      );
    } else if (this.monitor) {
      try {
        health = await this.monitor.poll(now);
      } catch (err) {
        this.alert('warning', `Ingest-Server nicht erreichbar: ${err instanceof Error ? err.message : err}`, {
          key: 'ingest-down',
          cooldownMs: 60_000,
        });
      }
    } else if (this.deps.obs.active) {
      const media = await this.deps.obs.mediaStatus();
      if (media.size > 0) {
        health = new Map([...media].map(([id, live]) => [id, { live, bitrateKbps: null }]));
      }
    }
    if (!health) return;
    let changed = false;
    for (const feed of this.feeds) {
      const h = health.get(feed.id);
      if (!h) continue;
      const status = h.live ? 'live' : 'offline';
      if (feed.status !== status) {
        const wasLive = feed.status === 'live';
        feed.status = status;
        changed = true;
        if (wasLive && status === 'offline') this.onFeedLost(feed);
        if (status === 'live' && wasLive === false && this.feedsKnown) {
          this.addLog('feed', `${feed.label} ist wieder da`);
        }
      }
      if (feed.bitrateKbps !== h.bitrateKbps) {
        feed.bitrateKbps = h.bitrateKbps;
        changed = true;
      }
    }
    this.feedsKnown = true;
    if (changed) this.changed();
  }

  private feedsKnown = false;

  /** Feed weg: Alarm, und falls er gesendet wird, sofort ersetzen. */
  private onFeedLost(feed: FeedState): void {
    const onProgram = Object.values(this.program.slots).includes(feed.id);
    this.alert(
      onProgram ? 'critical' : 'warning',
      `Feed verloren: ${feed.label}${onProgram ? ' (war auf Sendung)' : ''}`,
      {
        feedId: feed.id,
        key: `lost-${feed.id}`,
        cooldownMs: 30_000,
      },
    );
    if (!onProgram) return;
    const layout = this.layoutById(this.program.layoutId);
    const inProgram = new Set(feedsInComposition(this.program, layout));
    const replacement = this.insights()
      .filter((i) => !inProgram.has(i.feedId) && this.usable(i.feedId))
      .sort((a, b) => b.score - a.score)[0]?.feedId;
    const slotId = Object.entries(this.program.slots).find(([, f]) => f === feed.id)?.[0];
    let next: Composition;
    if (replacement && slotId) {
      next = assignFeed(this.program, slotId, replacement);
      this.addLog('failover', `${feed.label} ersetzt durch ${this.feedById(replacement)?.label}`);
    } else {
      const pause = this.layoutById('pause');
      next = pause ? emptyComposition(pause) : assignFeed(this.program, slotId ?? '', null);
      this.addLog('failover', `Kein Ersatz für ${feed.label} – Pausen-Layout`);
    }
    void this.take(next, 'Failover');
  }

  /**
   * Kann der Feed gesendet werden? „live“ sicher; „unbekannt“ bei Browser-Links (VDO.Ninja),
   * deren Signal sich nicht von außen prüfen lässt. Feeds ohne Signalquelle nie.
   */
  usable(id: string): boolean {
    const f = this.feedById(id);
    if (!f) return false;
    if (f.status === 'live') return true;
    return f.status === 'unknown' && f.sourceKind === 'browser';
  }

  feedById(id: string): FeedState | undefined {
    return this.feeds.find((f) => f.id === id);
  }

  private refreshFeedFlags(): void {
    const prog = new Set(Object.values(this.program.slots).filter(Boolean));
    const prev = new Set(Object.values(this.preview.slots).filter(Boolean));
    const now = this.now();
    for (const f of this.feeds) {
      const on = prog.has(f.id);
      if (on || f.onProgram) f.lastProgramAt = now;
      f.onProgram = on;
      f.inPreview = prev.has(f.id);
    }
  }

  // ---------------------------------------------------------------- Takes

  async take(comp: Composition = this.preview, reason = 'Take'): Promise<void> {
    const run = async () => {
      const layout = this.layoutById(comp.layoutId);
      if (!layout) throw new ActionError(`Unbekanntes Layout ${comp.layoutId}`);
      // Feeds, die gerade gehen, behalten ihr „zuletzt gesehen“
      this.refreshFeedFlags();
      this.program = structuredClone(comp);
      this.lastTakeAt = this.now();
      this.refreshFeedFlags();
      const host = hostOf(this.program);
      const names =
        host.mode === 'full'
          ? ''
          : feedsInComposition(this.program, layout)
              .map((id) => this.feedById(id)?.label ?? id)
              .join(', ');
      const what =
        host.mode === 'full'
          ? 'Kommentar im Vollbild'
          : `${layout.name}${names ? ` – ${names}` : ''}${host.mode === 'pip' ? ' + Kommentar-Overlay' : ''}`;
      this.addLog('take', `${reason}: ${what}`);
      try {
        await this.deps.obs.applyProgram(layout, this.program, this.hostBox(this.program));
      } catch (err) {
        this.obsError(err);
      }
      await this.applyAudio();
    };
    this.takeInFlight = this.takeInFlight.then(run, run);
    return this.takeInFlight;
  }

  private obsError(err: unknown): void {
    this.alert('warning', `OBS: ${err instanceof Error ? err.message : String(err)}`, {
      key: 'obs-error',
      cooldownMs: 15_000,
    });
  }

  private async applyAudio(): Promise<void> {
    if (!this.audioFollow) return;
    const layout = this.layoutById(this.program.layoutId);
    // Kommentar im Vollbild: kein Spielton
    const main = hostOf(this.program).mode === 'full' ? undefined : feedsInComposition(this.program, layout)[0];
    await this.deps.obs.setAudible(new Set(main ? [main] : [])).catch((e) => this.obsError(e));
  }

  private autopilotTick(): void {
    if (!this.autopilot) return;
    // Kommentar im Vollbild hat Vorrang – der Autopilot schneidet erst wieder, wenn die Regie zurückschaltet
    if (hostOf(this.program).mode === 'full') return;
    const next = decideAutopilot({
      insights: this.insights(),
      liveFeedIds: new Set(this.feeds.filter((f) => this.usable(f.id)).map((f) => f.id)),
      program: this.program,
      layouts: this.layouts,
      layoutId: this.autopilotLayoutId,
      now: this.now(),
      lastTakeAt: this.lastTakeAt,
      minHoldMs: (this.config.autopilot?.minHoldSec ?? 40) * 1000,
    });
    if (!next) return;
    if (this.program.host) next.host = { ...this.program.host };
    this.preview = structuredClone(next);
    void this.take(next, 'Autopilot');
  }

  // ---------------------------------------------------------------- Actions

  async handleAction(action: string, payload: unknown): Promise<void> {
    const p = (payload ?? {}) as Record<string, unknown>;
    const str = (key: string): string => {
      const v = p[key];
      if (typeof v !== 'string' || !v) throw new ActionError(`Parameter "${key}" fehlt`);
      return v;
    };

    if (action.startsWith('format.')) {
      this.format.handleAction(action.slice('format.'.length), payload);
      this.changed();
      return;
    }

    switch (action) {
      case 'preview.layout': {
        const to = this.layoutById(str('layoutId'));
        if (!to) throw new ActionError('Unbekanntes Layout');
        this.preview = switchLayout(this.preview, this.layoutById(this.preview.layoutId), to);
        break;
      }
      case 'preview.assign': {
        const feedId = p.feedId === null ? null : str('feedId');
        if (feedId && !this.feedById(feedId)) throw new ActionError('Unbekannter Feed');
        this.preview = assignFeed(this.preview, str('slotId'), feedId);
        break;
      }
      case 'preview.set': {
        const comp = p.composition as Composition | undefined;
        if (!comp || !this.layoutById(comp.layoutId)) throw new ActionError('Ungültige Belegung');
        const layout = this.layoutById(comp.layoutId)!;
        const clean = emptyComposition(layout);
        for (const slot of layout.slots) {
          const fid = comp.slots?.[slot.id];
          clean.slots[slot.id] = fid && this.feedById(fid) ? fid : null;
        }
        const host = this.cleanHost(comp.host ?? this.preview.host);
        if (host) clean.host = host;
        this.preview = clean;
        break;
      }
      case 'preview.host': {
        if (!this.commentary) throw new ActionError('Keine Kommentar-Szene eingerichtet (Einstellungen → Produktion)');
        const current = hostOf(this.preview);
        const host = this.cleanHost({ ...current, ...p });
        this.preview = { ...this.preview, host: host ?? { mode: 'off', corner: current.corner } };
        break;
      }
      case 'host.take': {
        // Kommentar-Modus direkt aufs Programm, Runner-Belegung bleibt
        if (!this.commentary) throw new ActionError('Keine Kommentar-Szene eingerichtet (Einstellungen → Produktion)');
        const host = this.cleanHost({ ...hostOf(this.program), ...p }) ?? { mode: 'off', corner: 'br' };
        const next = { ...structuredClone(this.program), host };
        this.preview = { ...this.preview, host: { ...host } };
        await this.take(next, 'Kommentar');
        break;
      }
      case 'preview.fromProgram':
        this.preview = structuredClone(this.program);
        break;
      case 'take':
        await this.take(this.preview, 'Take');
        break;
      case 'cut': {
        // Direktschnitt eines Feeds in den Hauptslot des aktuellen Programms
        const feedId = str('feedId');
        const layout = this.layoutById(this.program.layoutId);
        const first = layout?.slots[0]?.id;
        if (!first) throw new ActionError('Aktuelles Layout hat keine Slots');
        const next = assignFeed(this.program, first, feedId);
        // Aus dem Kommentar-Vollbild zurück auf den Runner
        if (next.host?.mode === 'full') next.host = { ...next.host, mode: 'off' };
        await this.take(next, 'Direktschnitt');
        break;
      }
      case 'audioFollow':
        this.audioFollow = !!p.enabled;
        await this.applyAudio();
        this.addLog('audio', `Audio-Follow ${this.audioFollow ? 'an' : 'aus'}`);
        break;
      case 'autopilot':
        this.autopilot = !!p.enabled;
        if (typeof p.layoutId === 'string' && this.layoutById(p.layoutId)) this.autopilotLayoutId = p.layoutId;
        this.addLog('autopilot', `Autopilot ${this.autopilot ? 'an' : 'aus'}`);
        break;
      case 'graphics': {
        const patch = (p.patch ?? {}) as Partial<GraphicsState>;
        if (
          patch.ticker !== undefined &&
          patch.ticker !== this.graphics.ticker &&
          hostOf(this.program).mode === 'pip'
        ) {
          // Kommentar-Overlay macht dem Ticker Platz bzw. rutscht wieder nach unten
          queueMicrotask(() => void this.syncObs());
        }
        if (typeof patch.boardFull === 'boolean' && patch.boardFull !== this.graphics.boardFull) {
          this.addLog(
            'graphics',
            patch.boardFull ? 'Tabelle im Vollbild eingeblendet' : 'Vollbild-Tabelle ausgeblendet',
          );
        }
        this.graphics = {
          ...this.graphics,
          ...patch,
          lowerThird: { ...this.graphics.lowerThird, ...(patch.lowerThird ?? {}) },
        };
        break;
      }
      case 'alert.dismiss':
        this.alerts = this.alerts.filter((a) => a.id !== p.id);
        break;
      case 'alerts.clear':
        this.alerts = [];
        break;
      case 'marker': {
        const text = typeof p.text === 'string' && p.text.trim() ? p.text.trim() : 'Highlight';
        this.addLog('marker', text);
        if (this.deps.twitch.configured) {
          await this.deps.twitch
            .createMarker(text)
            .catch((err) =>
              this.alert('warning', `Twitch-Marker fehlgeschlagen: ${err instanceof Error ? err.message : err}`),
            );
        }
        break;
      }
      case 'twitch.title': {
        const title = str('title');
        await this.deps.twitch.setTitle(title);
        this.addLog('twitch', `Titel: ${title}`);
        break;
      }
      case 'feed.simulateDrop': {
        if (!this.simulation) throw new ActionError('Nur im Simulationsmodus');
        this.simulatedDrops.set(str('feedId'), this.now() + 15_000);
        void this.pollFeeds();
        break;
      }
      default:
        throw new ActionError(`Unbekannte Aktion "${action}"`);
    }
    this.refreshFeedFlags();
    this.changed();
  }

  ingest(feedId: string, data: unknown): void {
    if (!this.feedById(feedId)) throw new ActionError(`Unbekannter Feed "${feedId}"`);
    if (!this.format.ingest) throw new ActionError('Dieses Format nimmt keine externen Daten an');
    this.format.ingest(feedId, data);
    this.changed();
  }

  // ---------------------------------------------------------------- Persistence

  /** Simulation und Echtbetrieb speichern getrennt – simulierte Runs landen nie in den echten Event-Daten. */
  private get dataFile(): string {
    return join(DATA_DIR, `${this.config.id}${this.simulation ? '.simulation' : ''}.json`);
  }

  private scheduleSave(): void {
    if (this.deps.persist === false || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 2000);
  }

  saveNow(): void {
    if (this.deps.persist === false) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const data: Persisted = {
      preview: this.preview,
      program: this.program,
      audioFollow: this.audioFollow,
      autopilot: this.autopilot,
      autopilotLayoutId: this.autopilotLayoutId,
      graphics: this.graphics,
      log: this.log,
      lastProgramAt: Object.fromEntries(
        this.feeds.filter((f) => f.lastProgramAt).map((f) => [f.id, f.lastProgramAt as number]),
      ),
      format: this.format.serialize(),
    };
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${this.dataFile}.tmp`;
      writeFileSync(tmp, JSON.stringify(data));
      renameSync(tmp, this.dataFile);
    } catch (err) {
      console.error('Speichern fehlgeschlagen:', err);
    }
  }

  /** Belegung an aktuelle Layouts und Feeds anpassen (nach Änderungen in den Einstellungen). */
  private sanitize(c?: Composition): Composition | null {
    const layout = c ? this.layoutById(c.layoutId) : undefined;
    if (!c || !layout) return null;
    const clean = emptyComposition(layout);
    for (const slot of layout.slots) {
      const fid = c.slots?.[slot.id];
      clean.slots[slot.id] = fid && this.feedById(fid) ? fid : null;
    }
    const host = this.cleanHost(c.host ?? {});
    if (host) clean.host = host;
    return clean;
  }

  private restore(): void {
    if (this.deps.persist === false || !existsSync(this.dataFile)) return;
    try {
      const data = JSON.parse(readFileSync(this.dataFile, 'utf8')) as Persisted;
      const preview = this.sanitize(data.preview);
      const program = this.sanitize(data.program);
      if (preview) this.preview = preview;
      if (program) this.program = program;
      if (typeof data.audioFollow === 'boolean') this.audioFollow = data.audioFollow;
      if (typeof data.autopilotLayoutId === 'string') this.autopilotLayoutId = data.autopilotLayoutId;
      // Autopilot startet aus Sicherheitsgründen immer aus.
      // Vollbild-Tabelle startet nie eingeblendet
      if (data.graphics) this.graphics = { ...this.graphics, ...data.graphics, boardFull: false };
      if (Array.isArray(data.log)) this.log = data.log.slice(-MAX_LOG);
      for (const f of this.feeds) f.lastProgramAt = data.lastProgramAt?.[f.id] ?? null;
      if (data.format !== undefined) this.format.restore(data.format);
    } catch (err) {
      console.error(`Gespeicherter Zustand für ${this.config.id} unlesbar:`, err);
    }
  }
}
