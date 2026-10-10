import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppConfig, ProductionConfig } from '../server/core/config';
import { gridSlots } from '../server/core/layouts';
import {
  applyStoredSettings,
  mergeAppSettings,
  mergeProductionSettings,
  productionSettingsView,
} from '../server/core/settings';
import { UebApp } from '../server/core/app';
import { ingestAddresses, nextFeedId } from '../shared/settings';

const baseConfig: ProductionConfig = {
  id: 'test',
  name: 'Test',
  format: 'sm64-marathon',
  description: 'Beschreibung',
  feeds: [
    { id: 'r01', label: 'Alt', meta: { runner: 'Runner Eins', pbMs: 3_000_000 } },
    { id: 'r02', label: 'Zwei', source: { kind: 'media', url: 'srt://x:8890?streamid=read:runner02' } },
  ],
  layouts: undefined,
  simulation: { enabled: true, speed: 6 },
  formatConfig: { scoring: 'bestTime', splits: [{ name: 'A', stars: 70 }] },
};

const appCfg: AppConfig = {
  port: 4400,
  publicUrl: 'http://localhost:4400',
  defaultProduction: null,
  obsUrl: null,
  obsPassword: undefined,
  relayToken: null,
  twitch: null,
};

describe('Einstellungen: Produktion', () => {
  it('zeigt den Runner-Namen als Label und übernimmt Änderungen, ohne fremde Felder zu verlieren', () => {
    const view = productionSettingsView(baseConfig);
    expect(view.feeds[0].label).toBe('Runner Eins');
    expect(view.feeds[0].meta.runner).toBeUndefined();
    view.feeds.push({
      id: 'r03',
      label: 'Neu',
      sourceKind: 'browser',
      sourceUrl: 'https://vdo.ninja/?view=neu',
      previewUrl: '',
      ingestPath: '',
      meta: { twitch: 'neu_tv', pbMs: 3_100_000, unbekannt: 'weg' },
    });
    view.scoring = 'totalStars';
    const next = mergeProductionSettings(baseConfig, view);
    expect(next.feeds).toHaveLength(3);
    expect(next.feeds[0]).toEqual({ id: 'r01', label: 'Runner Eins', meta: { pbMs: 3_000_000 } });
    expect(next.feeds[2]).toEqual({
      id: 'r03',
      label: 'Neu',
      source: { kind: 'browser', url: 'https://vdo.ninja/?view=neu' },
      meta: { twitch: 'neu_tv', pbMs: 3_100_000 },
    });
    expect(next.formatConfig).toEqual({ scoring: 'totalStars', category: '70', splits: [{ name: 'A', stars: 70 }] });
  });

  it('lehnt unvollständige oder doppelte Einträge mit verständlicher Meldung ab', () => {
    const view = productionSettingsView(baseConfig);
    view.feeds[1] = { ...view.feeds[1], label: '' };
    expect(() => mergeProductionSettings(baseConfig, view)).toThrow(/Name fehlt/);
    const dup = productionSettingsView(baseConfig);
    dup.feeds[1] = { ...dup.feeds[1], id: 'r01' };
    expect(() => mergeProductionSettings(baseConfig, dup)).toThrow(/doppelt/);
    const noUrl = productionSettingsView(baseConfig);
    noUrl.feeds[1] = { ...noUrl.feeds[1], sourceUrl: '' };
    expect(() => mergeProductionSettings(baseConfig, noUrl)).toThrow(/Signal-Adresse fehlt/);
    const badUrl = productionSettingsView(baseConfig);
    badUrl.feeds[1] = { ...badUrl.feeds[1], previewUrl: 'ftp://x' };
    expect(() => mergeProductionSettings(baseConfig, badUrl)).toThrow(/Vorschau-Adresse/);
  });
});

describe('Einstellungen: App', () => {
  it('speichert OBS-Zugang und überschreibt damit die .env-Werte', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ueb-'));
    const file = join(dir, 'settings.json');
    const next = mergeAppSettings(appCfg, { obsUrl: 'ws://127.0.0.1:4455', obsPassword: 'geheim' }, file);
    expect(next.obsUrl).toBe('ws://127.0.0.1:4455');
    expect(applyStoredSettings(appCfg, file)).toMatchObject({ obsUrl: 'ws://127.0.0.1:4455', obsPassword: 'geheim' });
    expect(() => mergeAppSettings(appCfg, { obsUrl: 'http://falsch' }, file)).toThrow(/ws:\/\//);
    const cleared = mergeAppSettings(next, { obsUrl: '' }, file);
    expect(cleared.obsUrl).toBeNull();
    expect(cleared.obsPassword).toBe('geheim');
  });

  it('schreibt Änderungen in die Produktionsdatei und lädt die Produktion neu', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ueb-'));
    writeFileSync(join(dir, 'test.json'), JSON.stringify({ ...baseConfig, _hinweis: 'bleibt' }));
    const app = new UebApp(appCfg, { productionsDir: dir, persist: false, settingsFile: join(dir, 's.json') });
    app.start();
    const settings = app.getSettings().production!;
    settings.feeds.push({ ...settings.feeds[1], id: 'r03', label: 'Drei' });
    await app.saveProductionSettings(settings);
    const written = JSON.parse(readFileSync(join(dir, 'test.json'), 'utf8'));
    expect(written._hinweis).toBe('bleibt');
    expect(written.feeds.map((f: { id: string }) => f.id)).toEqual(['r01', 'r02', 'r03']);
    const state = app.getState().production!;
    expect(state.feeds.map((f) => f.label)).toEqual(['Runner Eins', 'Zwei', 'Drei']);
    expect(state.layouts.find((l) => l.id === 'grid')?.slots).toHaveLength(3);
    await app.stop();
  });
});

describe('Simulationsschalter', () => {
  it('schaltet die Simulation um, merkt sie in der Datei und lädt die Produktion neu', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ueb-'));
    writeFileSync(join(dir, 'test.json'), JSON.stringify(baseConfig));
    const app = new UebApp(appCfg, { productionsDir: dir, persist: false, settingsFile: join(dir, 's.json') });
    app.start();
    expect(app.getState().production!.simulation).toBe(true);
    await app.handleAction('simulation.set', { enabled: false });
    expect(app.getState().production!.simulation).toBe(false);
    expect(app.getState().production!.feeds.every((f) => f.status === 'unknown')).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'test.json'), 'utf8')).simulation).toEqual({ enabled: false, speed: 6 });
    await app.handleAction('simulation.set', { enabled: true });
    expect(app.getState().production!.simulation).toBe(true);
    await app.stop();
  });
});

describe('Hilfsfunktionen', () => {
  it('schlägt freie IDs vor und leitet Ingest-Adressen ab', () => {
    expect(nextFeedId(['r01', 'r02', 'r04'])).toBe('r03');
    expect(nextFeedId([])).toBe('r01');
    expect(nextFeedId(['cam1', 'cam2'])).toBe('cam3');
    expect(ingestAddresses('https://ingest.example.com:9997/', 'runner03')).toEqual({
      sourceUrl: 'srt://ingest.example.com:8890?streamid=read:runner03',
      previewUrl: 'http://ingest.example.com:8889/runner03',
      publishUrl: 'srt://ingest.example.com:8890?streamid=publish:runner03',
      apiUrl: 'http://ingest.example.com:9997',
    });
  });

  it('baut das Raster „Alle“ für jede Anzahl Feeds', () => {
    for (const n of [1, 3, 10, 11, 16, 24]) {
      const slots = gridSlots(n);
      expect(slots).toHaveLength(n);
      for (const s of slots) {
        expect(s.x + s.w).toBeLessThanOrEqual(1.0001);
        expect(s.y + s.h).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});
