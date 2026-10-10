import { describe, expect, it } from 'vitest';
import type { ProductionConfig } from '../server/core/config';
import { mergeProductionSettings, productionSettingsView } from '../server/core/settings';
import { SM64_CATEGORIES, categoryOf, progressLabel, runProgress } from '../shared/sm64Categories';
import { sm64Format } from '../server/formats/sm64';
import type { Sm64State } from '../shared/sm64';
import type { FormatContext } from '../server/formats/types';

const config = (formatConfig: Record<string, unknown>): ProductionConfig => ({
  id: 'k',
  name: 'K',
  format: 'sm64-marathon',
  feeds: [
    { id: 'r01', label: 'Eins', meta: { pbMs: 2_900_000 } },
    { id: 'r02', label: 'Zwei' },
  ],
  simulation: { enabled: false, speed: 1 },
  formatConfig,
});

function instance(formatConfig: Record<string, unknown>, simulation = false) {
  const alerts: string[] = [];
  let now = 1_000_000;
  const ctx = {
    now: () => now,
    alert: (_l: string, text: string) => alerts.push(text),
    log: () => undefined,
    changed: () => undefined,
    feeds: () => [],
    simulation,
    simulationSpeed: 1,
  } as unknown as FormatContext;
  const inst = sm64Format.create(config(formatConfig), ctx);
  return { inst, alerts, tick: (ms: number) => (now += ms) };
}

describe('SM64-Kategorien', () => {
  it('bietet 0, 1, 16, 70 und 120 Star mit passenden Ziel-Sternen und aufsteigenden Splits', () => {
    expect(SM64_CATEGORIES.map((c) => [c.id, c.goalStars])).toEqual([
      ['0', 0],
      ['1', 1],
      ['16', 16],
      ['70', 70],
      ['120', 120],
    ]);
    for (const c of SM64_CATEGORIES) {
      const last = c.splits[c.splits.length - 1];
      expect(last.stars, c.label).toBe(c.goalStars);
      expect(last.pbAt).toBe(1);
      c.splits.forEach((s, i) => i > 0 && expect(s.stars).toBeGreaterThanOrEqual(c.splits[i - 1].stars));
    }
  });

  it('liest ältere Konfigurationen ohne Kategorie über die Sternzahl', () => {
    expect(categoryOf({ goalStars: 70 })).toBe('70');
    expect(categoryOf({ category: '16' })).toBe('16');
    expect(categoryOf({ category: 120 })).toBe('120');
    expect(categoryOf(undefined)).toBe('70');
  });

  it('zählt sternlose Kategorien nach Splits', () => {
    expect(progressLabel(0, 2, 0, 7)).toBe('Split 3/7');
    expect(progressLabel(1, 3, 1, 7)).toBe('1/1 ★ · Split 4/7');
    expect(progressLabel(34, 8, 70, 17)).toBe('34/70 ★');
    expect(runProgress(0, 6, 0, 7)).toBeCloseTo(6 / 7);
    expect(runProgress(60, 14, 70, 17)).toBeCloseTo(60 / 70);
  });

  it('übernimmt Ziel-Sterne und Splits der gewählten Kategorie ins Format', () => {
    const s16 = instance({ category: '16' }).inst.getState() as Sm64State;
    expect(s16.goalStars).toBe(16);
    expect(s16.category).toEqual({ id: '16', label: '16 Star' });
    expect(s16.splits.length).toBe(SM64_CATEGORIES.find((c) => c.id === '16')!.splits.length);
    // Eigene Splits haben Vorrang
    const custom = instance({
      category: '16',
      splits: [{ name: 'A', stars: 3 }],
      goalStars: 3,
    }).inst.getState() as Sm64State;
    expect(custom.splits).toEqual([{ name: 'A', stars: 3, pbAt: undefined }]);
    expect(custom.goalStars).toBe(3);
  });

  it('meldet bei 0 Star die Endphase nach Splits statt nach Sternen', () => {
    const { inst, alerts } = instance({ category: '0' });
    inst.ingest!('r01', { phase: 'Running', splitIndex: 0, currentMs: 1000 });
    inst.ingest!('r01', { phase: 'Running', splitIndex: 6, currentMs: 380_000 });
    expect(alerts.join()).toContain('Endphase');
    expect(alerts.join()).toContain('Split 7/7');
    const insight = inst.getInsights().find((i) => i.feedId === 'r01')!;
    expect(insight.stats).toBe('Split 7/7');
    expect(Number.isFinite(insight.score)).toBe(true);
  });

  it('startet bei Kategoriewechsel mit leerer Tabelle', () => {
    const a = instance({ category: '70' });
    a.inst.ingest!('r01', { phase: 'Running', splitIndex: 0, currentMs: 0 });
    a.inst.ingest!('r01', { phase: 'Ended', splitIndex: 16, currentMs: 2_800_000, finalMs: 2_800_000 });
    const saved = a.inst.serialize!();
    const same = instance({ category: '70' });
    same.inst.restore!(saved);
    expect((same.inst.getState() as Sm64State).runners[0].finishedRuns).toBe(1);
    const other = instance({ category: '16' });
    other.inst.restore!(saved);
    expect((other.inst.getState() as Sm64State).runners[0].finishedRuns).toBe(0);
  });

  it('Einstellungen: Kategoriewechsel ersetzt Splits und merkt PBs je Kategorie', () => {
    const original = config({ scoring: 'bestTime', goalStars: 70, splits: [{ name: 'X', stars: 70 }] });
    const view = productionSettingsView(original);
    expect(view.category).toBe('70');
    const to16 = mergeProductionSettings(original, { ...view, category: '16' });
    expect(to16.formatConfig).toEqual({ scoring: 'bestTime', category: '16' });
    expect(to16.feeds[0].meta).toEqual({ pbByCategory: { '70': 2_900_000 } });
    // PB für 16 Star eintragen, zurück auf 70: alte PB ist wieder da
    const view16 = productionSettingsView(to16);
    view16.feeds[0].meta = { ...view16.feeds[0].meta, pbMs: 900_000 };
    const back = mergeProductionSettings(to16, { ...view16, category: '70' });
    expect(back.feeds[0].meta).toEqual({ pbMs: 2_900_000, pbByCategory: { '70': 2_900_000, '16': 900_000 } });
    // Gleiche Kategorie: eigene Splits bleiben
    const keep = mergeProductionSettings(original, view);
    expect(keep.formatConfig?.splits).toEqual([{ name: 'X', stars: 70 }]);
  });
});
