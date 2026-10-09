import { EventEmitter } from 'node:events';
import type { AppState, ProductionSummary } from '../../shared/types';
import type { AppConfig, ProductionConfig } from './config';
import { loadProductionConfigs, writeJsonFile } from './config';
import type { AppSettingsPatch, ProductionSettings, SettingsResponse } from '../../shared/settings';
import {
  SETTINGS_FILE,
  appSettingsView,
  mergeAppSettings,
  mergeProductionSettings,
  productionSettingsView,
} from './settings';
import { Production } from './production';
import { ObsController } from '../obs/obsController';
import { TwitchClient } from '../integrations/twitch';
import { FORMATS, formatById } from '../formats';
import { ActionError } from '../formats/types';

export const VERSION = '0.1.0';

/** Hält OBS-Verbindung, Twitch, die Liste der Produktionen und die aktive Produktion. */
export class UebApp extends EventEmitter {
  readonly obs: ObsController;
  readonly twitch: TwitchClient;
  configs: ProductionConfig[] = [];
  configErrors: string[] = [];
  configFiles = new Map<string, string>();
  active: Production | null = null;

  constructor(
    public cfg: AppConfig,
    private readonly opts: { productionsDir?: string; persist?: boolean; settingsFile?: string } = {},
  ) {
    super();
    this.obs = new ObsController(cfg.obsUrl, cfg.obsPassword);
    this.twitch = new TwitchClient(cfg.twitch);
    this.obs.on('status', () => this.emit('change'));
    this.obs.on('log', (text: string) => this.active?.addLog('obs', text));
    this.obs.on('connected', () => void this.active?.syncObs());
  }

  start(): void {
    this.reloadConfigs();
    for (const err of this.configErrors) console.warn(`[Konfiguration] ${err}`);
    const initial =
      this.configs.find((c) => c.id === this.cfg.defaultProduction) ??
      this.configs.find((c) => c.format === 'sm64-marathon') ??
      this.configs[0];
    if (initial) this.activate(initial.id);
    this.obs.start();
  }

  async stop(): Promise<void> {
    this.active?.stop();
    await this.obs.stop();
  }

  reloadConfigs(): void {
    const { configs, errors, files } = loadProductionConfigs(this.opts.productionsDir);
    this.configFiles = files;
    this.configs = configs.filter((c) => {
      if (formatById(c.format)) return true;
      errors.push(`${c.id}: unbekanntes Format "${c.format}" (verfügbar: ${FORMATS.map((f) => f.id).join(', ')})`);
      return false;
    });
    this.configErrors = errors;
  }

  activate(id: string): void {
    const config = this.configs.find((c) => c.id === id);
    if (!config) throw new ActionError(`Produktion "${id}" nicht gefunden`);
    const def = formatById(config.format)!;
    this.active?.stop();
    this.active?.removeAllListeners();
    const prod = new Production(config, def, {
      obs: this.obs,
      twitch: this.twitch,
      publicUrl: this.cfg.publicUrl,
      persist: this.opts.persist,
    });
    prod.on('change', () => this.emit('change'));
    this.active = prod;
    prod.start();
    void prod.syncObs();
    this.emit('change');
  }

  // ---------------------------------------------------------------- Einstellungen

  getSettings(): SettingsResponse {
    const config = this.active ? this.configs.find((c) => c.id === this.active!.config.id) : undefined;
    let production: ProductionSettings | null = config ? productionSettingsView(config) : null;
    // PBs können live in der Regie geändert worden sein – aktuellen Stand anzeigen
    const runners = (
      this.active?.getState().formatState as { runners?: Array<{ feedId: string; pbMs: number | null }> }
    )?.runners;
    if (production && Array.isArray(runners) && !this.active?.simulation) {
      production = {
        ...production,
        feeds: production.feeds.map((f) => {
          const r = runners.find((x) => x.feedId === f.id);
          if (!r) return f;
          const meta = { ...f.meta };
          if (r.pbMs) meta.pbMs = r.pbMs;
          else delete meta.pbMs;
          return { ...f, meta };
        }),
      };
    }
    return { app: appSettingsView(this.cfg), production };
  }

  async saveAppSettings(patch: AppSettingsPatch): Promise<void> {
    const before = this.cfg;
    const next = mergeAppSettings(before, patch, this.opts.settingsFile ?? SETTINGS_FILE);
    this.cfg = next;
    const obsChanged = next.obsUrl !== before.obsUrl || next.obsPassword !== before.obsPassword;
    if (next.publicUrl !== before.publicUrl && this.active) this.activate(this.active.config.id);
    this.active?.addLog('einstellungen', 'App-Einstellungen gespeichert');
    if (obsChanged) {
      this.active?.addLog('obs', next.obsUrl ? `Verbinde mit OBS (${next.obsUrl})` : 'OBS getrennt – Simulationsmodus');
      await this.obs.configure(next.obsUrl, next.obsPassword);
    }
    this.emit('change');
  }

  async saveProductionSettings(settings: ProductionSettings): Promise<void> {
    const original = this.configs.find((c) => c.id === settings?.id);
    if (!original) throw new ActionError('Produktion nicht gefunden');
    const file = this.configFiles.get(original.id);
    if (!file) throw new ActionError('Konfigurationsdatei der Produktion nicht gefunden');
    const next = mergeProductionSettings(original, settings);
    writeJsonFile(file, next);
    this.configs = this.configs.map((c) => (c.id === next.id ? next : c));

    const oldPb = new Map(original.feeds.map((f) => [f.id, f.meta?.pbMs]));
    const added = next.feeds.filter((f) => !oldPb.has(f.id)).map((f) => f.label);
    const removed = original.feeds.filter((f) => !next.feeds.some((n) => n.id === f.id)).map((f) => f.label);

    if (this.active?.config.id === next.id) {
      this.activate(next.id);
      const prod = this.active!;
      // Geänderte PBs überschreiben den gespeicherten Run-Zustand
      for (const f of next.feeds) {
        const pb = f.meta?.pbMs;
        if (pb !== oldPb.get(f.id) || !oldPb.has(f.id)) {
          await prod
            .handleAction('format.runner.pb', { feedId: f.id, pbMs: typeof pb === 'number' ? pb : null })
            .catch(() => undefined);
        }
      }
      const parts = [
        added.length ? `neu: ${added.join(', ')}` : '',
        removed.length ? `entfernt: ${removed.join(', ')}` : '',
      ].filter(Boolean);
      prod.addLog('einstellungen', `Produktion gespeichert${parts.length ? ` (${parts.join('; ')})` : ''}`);
      if (this.obs.active && this.obs.status.setupDone) {
        // Neue Feeds und geänderte Adressen direkt in OBS übernehmen
        const notes = await this.obs.setup().catch((err) => [`OBS: ${err instanceof Error ? err.message : err}`]);
        for (const n of notes) prod.addLog('obs', n);
        await prod.syncObs();
      }
    }
    this.emit('change');
  }

  summaries(): ProductionSummary[] {
    return this.configs.map((c) => ({
      id: c.id,
      name: c.name,
      format: c.format,
      formatName: formatById(c.format)?.name ?? c.format,
      description: c.description ?? '',
      feedCount: c.feeds.length,
    }));
  }

  getState(): AppState {
    return {
      version: VERSION,
      serverTime: Date.now(),
      obs: this.obs.status,
      twitch: { configured: this.twitch.configured, title: this.twitch.title },
      productions: this.summaries(),
      formats: FORMATS.map((f) => ({ id: f.id, name: f.name, description: f.description })),
      configErrors: this.configErrors,
      production: this.active?.getState() ?? null,
    };
  }

  async handleAction(action: string, payload: unknown): Promise<void> {
    const p = (payload ?? {}) as Record<string, unknown>;
    switch (action) {
      case 'production.activate':
        if (typeof p.id !== 'string') throw new ActionError('Parameter "id" fehlt');
        this.activate(p.id);
        return;
      case 'productions.reload':
        this.reloadConfigs();
        this.emit('change');
        return;
      case 'obs.setup': {
        const notes = await this.obs.setup();
        for (const n of notes) this.active?.addLog('obs', n);
        this.active?.addLog('obs', 'OBS eingerichtet');
        await this.active?.syncObs();
        this.emit('change');
        return;
      }
      case 'obs.reconnect':
        await this.obs.reconnect();
        return;
    }
    if (!this.active) throw new ActionError('Keine Produktion aktiv');
    await this.active.handleAction(action, payload);
  }
}
