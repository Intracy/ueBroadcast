import { EventEmitter } from 'node:events';
import OBSWebSocket from 'obs-websocket-js/json';
import type { Composition, LayoutDef, ObsStatus, SlotDef } from '../../shared/types';
import { slotTransform } from '../core/layouts';

export const SCENE_A = 'ueB Programm A';
export const SCENE_B = 'ueB Programm B';
export const OVERLAY_INPUT = 'ueB Overlay';
export const feedInputName = (feedId: string) => `ueB Feed ${feedId}`;

export interface ObsFeedSpec {
  id: string;
  label: string;
  source?: { kind: 'media' | 'browser'; url: string };
}

export interface ObsSetupSpec {
  feeds: ObsFeedSpec[];
  overlayUrl: string;
  extraSources: string[];
}

type Req = { requestType: string; requestData?: Record<string, unknown> };

/**
 * Steuert OBS über obs-websocket v5.
 *
 * Prinzip: Zwei Szenen („ueB Programm A/B“) enthalten jeweils alle Feeds und das Overlay.
 * Beim Take wird die gerade nicht gesendete Szene mit dem neuen Layout belegt und
 * dann übergeblendet. Die Feeds bleiben dauerhaft geladen – kein Nachladen beim Umschnitt.
 *
 * Ohne OBS_URL läuft der Controller im Simulationsmodus und tut nichts.
 */
export class ObsController extends EventEmitter {
  status: ObsStatus;
  private obs: OBSWebSocket | null = null;
  private spec: ObsSetupSpec | null = null;
  private canvas = { width: 1920, height: 1080 };
  private itemIds = new Map<string, number>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly url: string | null,
    private readonly password?: string,
  ) {
    super();
    this.status = {
      mode: url ? 'obs' : 'simulation',
      connected: false,
      url,
      studioMode: false,
      programScene: null,
      setupDone: false,
      error: null,
    };
  }

  get active(): boolean {
    return this.status.mode === 'obs' && this.status.connected;
  }

  start(): void {
    if (!this.url) return;
    this.stopped = false;
    void this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.obs?.disconnect().catch(() => undefined);
  }

  setSpec(spec: ObsSetupSpec): void {
    this.spec = spec;
    if (this.active) void this.refresh().catch((e) => this.fail(e));
  }

  async reconnect(): Promise<void> {
    if (!this.url) return;
    await this.obs?.disconnect().catch(() => undefined);
    await this.connect();
  }

  private update(patch: Partial<ObsStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  private fail(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.update({ error: message });
    this.emit('log', `OBS: ${message}`);
  }

  private async connect(): Promise<void> {
    if (!this.url || this.stopped) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const obs = new OBSWebSocket();
    this.obs = obs;
    obs.on('ConnectionClosed', () => {
      if (this.obs !== obs) return;
      this.update({ connected: false });
      this.scheduleReconnect();
    });
    obs.on('CurrentProgramSceneChanged', (e) => this.update({ programScene: e.sceneName }));
    obs.on('StudioModeStateChanged', (e) => this.update({ studioMode: e.studioModeEnabled }));
    obs.on('SceneItemCreated', () => void this.cacheItems().catch(() => undefined));
    obs.on('SceneItemRemoved', () => void this.cacheItems().catch(() => undefined));
    try {
      await obs.connect(this.url, this.password);
      this.update({ connected: true, error: null });
      this.emit('log', `OBS verbunden (${this.url})`);
      await this.refresh();
      this.emit('connected');
    } catch (err) {
      this.update({ connected: false, error: err instanceof Error ? err.message : String(err) });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 3000);
  }

  private call<T = Record<string, unknown>>(requestType: string, requestData?: Record<string, unknown>): Promise<T> {
    if (!this.obs) throw new Error('OBS nicht verbunden');
    // obs-websocket-js ist streng typisiert; hier generisch für alle Requests (Methode an die Instanz binden!).
    const call = this.obs.call.bind(this.obs) as unknown as (t: string, d?: Record<string, unknown>) => Promise<T>;
    return call(requestType, requestData);
  }

  private async batch(requests: Req[]): Promise<void> {
    if (!this.obs || requests.length === 0) return;
    const callBatch = this.obs.callBatch.bind(this.obs) as unknown as (r: Req[]) => Promise<unknown[]>;
    const results = (await callBatch(requests)) as Array<{
      requestStatus?: { result: boolean; comment?: string };
    }>;
    const failed = results.find((r) => r.requestStatus && !r.requestStatus.result);
    if (failed) throw new Error(failed.requestStatus?.comment ?? 'OBS-Anfrage fehlgeschlagen');
  }

  private async refresh(): Promise<void> {
    const video = await this.call<{ baseWidth: number; baseHeight: number }>('GetVideoSettings');
    this.canvas = { width: video.baseWidth, height: video.baseHeight };
    const studio = await this.call<{ studioModeEnabled: boolean }>('GetStudioModeEnabled');
    const program = await this.call<{ currentProgramSceneName?: string; sceneName?: string }>('GetCurrentProgramScene');
    const scenes = await this.sceneNames();
    this.update({
      studioMode: studio.studioModeEnabled,
      programScene: program.sceneName ?? program.currentProgramSceneName ?? null,
      setupDone: scenes.has(SCENE_A) && scenes.has(SCENE_B),
    });
    if (this.status.setupDone) await this.cacheItems();
  }

  private async sceneNames(): Promise<Set<string>> {
    const { scenes } = await this.call<{ scenes: Array<{ sceneName: string }> }>('GetSceneList');
    return new Set(scenes.map((s) => s.sceneName));
  }

  private async cacheItems(): Promise<void> {
    if (!this.obs) return;
    this.itemIds.clear();
    const scenes = await this.sceneNames();
    for (const scene of [SCENE_A, SCENE_B]) {
      if (!scenes.has(scene)) continue;
      const { sceneItems } = await this.call<{ sceneItems: Array<{ sourceName: string; sceneItemId: number }> }>(
        'GetSceneItemList',
        { sceneName: scene },
      );
      for (const item of sceneItems) this.itemIds.set(`${scene}|${item.sourceName}`, item.sceneItemId);
    }
  }

  /** Legt Szenen, Feed-Quellen und Overlay in OBS an (idempotent). */
  async setup(): Promise<string[]> {
    if (!this.active) throw new Error('OBS ist nicht verbunden');
    if (!this.spec) throw new Error('Keine Produktion aktiv');
    const notes: string[] = [];
    const scenes = await this.sceneNames();
    for (const scene of [SCENE_A, SCENE_B]) {
      if (!scenes.has(scene)) {
        await this.call('CreateScene', { sceneName: scene });
        notes.push(`Szene „${scene}“ angelegt`);
      }
    }
    const { inputs } = await this.call<{ inputs: Array<{ inputName: string }> }>('GetInputList');
    const inputNames = new Set(inputs.map((i) => i.inputName));
    const itemsIn = async (scene: string) => {
      const { sceneItems } = await this.call<{ sceneItems: Array<{ sourceName: string }> }>('GetSceneItemList', {
        sceneName: scene,
      });
      return new Set(sceneItems.map((i) => i.sourceName));
    };

    const ensureInScenes = async (sourceName: string, enabled: boolean) => {
      for (const scene of [SCENE_A, SCENE_B]) {
        if (!(await itemsIn(scene)).has(sourceName)) {
          await this.call('CreateSceneItem', { sceneName: scene, sourceName, sceneItemEnabled: enabled });
        }
      }
    };

    for (const feed of this.spec.feeds) {
      const name = feedInputName(feed.id);
      if (!inputNames.has(name)) {
        if (!feed.source) {
          notes.push(`Feed ${feed.label}: keine Quelle konfiguriert – Quelle „${name}“ bitte in OBS selbst anlegen`);
          continue;
        }
        const media = feed.source.kind === 'media';
        await this.call('CreateInput', {
          sceneName: SCENE_A,
          inputName: name,
          inputKind: media ? 'ffmpeg_source' : 'browser_source',
          inputSettings: media
            ? {
                input: feed.source.url,
                is_local_file: false,
                restart_on_activate: false,
                close_when_inactive: false,
                hw_decode: true,
                buffering_mb: 2,
                reconnect_delay_sec: 2,
              }
            : { url: feed.source.url, width: 1280, height: 720, reroute_audio: true },
          sceneItemEnabled: false,
        });
        inputNames.add(name);
        notes.push(`Quelle „${name}“ angelegt`);
      }
      await ensureInScenes(name, false);
    }

    for (const extra of this.spec.extraSources) {
      if (!inputNames.has(extra) && !scenes.has(extra)) {
        notes.push(`Zusatzquelle „${extra}“ nicht in OBS gefunden`);
        continue;
      }
      await ensureInScenes(extra, true);
    }

    if (!inputNames.has(OVERLAY_INPUT)) {
      await this.call('CreateInput', {
        sceneName: SCENE_A,
        inputName: OVERLAY_INPUT,
        inputKind: 'browser_source',
        inputSettings: { url: this.spec.overlayUrl, width: this.canvas.width, height: this.canvas.height },
        sceneItemEnabled: true,
      });
      notes.push('Overlay-Browserquelle angelegt');
    } else {
      await this.call('SetInputSettings', { inputName: OVERLAY_INPUT, inputSettings: { url: this.spec.overlayUrl } });
    }
    await ensureInScenes(OVERLAY_INPUT, true);

    // Overlay ganz nach oben
    for (const scene of [SCENE_A, SCENE_B]) {
      const { sceneItems } = await this.call<{ sceneItems: Array<{ sourceName: string; sceneItemId: number }> }>(
        'GetSceneItemList',
        { sceneName: scene },
      );
      const overlay = sceneItems.find((i) => i.sourceName === OVERLAY_INPUT);
      if (overlay) {
        await this.call('SetSceneItemIndex', {
          sceneName: scene,
          sceneItemId: overlay.sceneItemId,
          sceneItemIndex: sceneItems.length - 1,
        });
      }
    }

    await this.refresh();
    this.update({ setupDone: true });
    return notes;
  }

  /** Belegt die nicht gesendete Szene mit der Komposition und blendet über. */
  async applyProgram(layout: LayoutDef, comp: Composition): Promise<void> {
    if (!this.active) return;
    if (!this.spec) return;
    if (!this.status.setupDone) throw new Error('OBS ist noch nicht eingerichtet („OBS einrichten“ in der Regie)');
    const target = this.status.programScene === SCENE_A ? SCENE_B : SCENE_A;
    const slotByFeed = new Map<string, SlotDef>();
    for (const slot of layout.slots) {
      const feedId = comp.slots[slot.id];
      if (feedId) slotByFeed.set(feedId, slot);
    }
    const requests: Req[] = [];
    for (const feed of this.spec.feeds) {
      const itemId = this.itemIds.get(`${target}|${feedInputName(feed.id)}`);
      if (itemId === undefined) continue;
      const slot = slotByFeed.get(feed.id);
      if (slot) {
        requests.push({
          requestType: 'SetSceneItemTransform',
          requestData: {
            sceneName: target,
            sceneItemId: itemId,
            sceneItemTransform: slotTransform(slot, this.canvas.width, this.canvas.height),
          },
        });
      }
      requests.push({
        requestType: 'SetSceneItemEnabled',
        requestData: { sceneName: target, sceneItemId: itemId, sceneItemEnabled: !!slot },
      });
    }
    await this.batch(requests);
    if (this.status.studioMode) {
      await this.call('SetCurrentPreviewScene', { sceneName: target });
      await this.call('TriggerStudioModeTransition');
    } else {
      await this.call('SetCurrentProgramScene', { sceneName: target });
    }
  }

  /** Audio-Follow: nur die angegebenen Feeds sind hörbar. */
  async setAudible(audibleFeedIds: Set<string>): Promise<void> {
    if (!this.active || !this.spec) return;
    const requests: Req[] = this.spec.feeds
      .filter((f) => this.itemIds.has(`${SCENE_A}|${feedInputName(f.id)}`))
      .map((f) => ({
        requestType: 'SetInputMute',
        requestData: { inputName: feedInputName(f.id), inputMuted: !audibleFeedIds.has(f.id) },
      }));
    await this.batch(requests);
  }

  /** Wiedergabestatus der Medienquellen (Fallback, wenn kein Ingest-Server abgefragt wird). */
  async mediaStatus(): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    if (!this.active || !this.spec) return result;
    for (const feed of this.spec.feeds) {
      if (feed.source?.kind !== 'media') continue;
      try {
        const s = await this.call<{ mediaState: string }>('GetMediaInputStatus', { inputName: feedInputName(feed.id) });
        result.set(feed.id, s.mediaState === 'OBS_MEDIA_STATE_PLAYING');
      } catch {
        /* Quelle existiert (noch) nicht */
      }
    }
    return result;
  }
}
