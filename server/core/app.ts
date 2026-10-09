import { EventEmitter } from 'node:events';
import type { AppState, ProductionSummary } from '../../shared/types';
import type { AppConfig, ProductionConfig } from './config';
import { loadProductionConfigs } from './config';
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
  active: Production | null = null;

  constructor(
    readonly cfg: AppConfig,
    private readonly opts: { productionsDir?: string; persist?: boolean } = {},
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
    const { configs, errors } = loadProductionConfigs(this.opts.productionsDir);
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
