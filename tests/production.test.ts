import { describe, expect, it } from 'vitest';
import { Production } from '../server/core/production';
import { ObsController } from '../server/obs/obsController';
import { TwitchClient } from '../server/integrations/twitch';
import { sm64Format } from '../server/formats/sm64';
import { multicamFormat } from '../server/formats/multicam';
import type { ProductionConfig } from '../server/core/config';
import { validateProductionConfig } from '../server/core/config';
import { parseLiveSplitTime } from '../tools/split-relay.mjs';

const feeds = Array.from({ length: 6 }, (_, i) => ({ id: `r${i + 1}`, label: `Runner ${i + 1}` }));

function make(config: Partial<ProductionConfig> = {}) {
  const cfg: ProductionConfig = {
    id: 'test',
    name: 'Test',
    format: 'sm64-marathon',
    feeds,
    simulation: { enabled: true, speed: 1 },
    ...config,
  };
  return new Production(cfg, cfg.format === 'multicam' ? multicamFormat : sm64Format, {
    obs: new ObsController(null),
    twitch: new TwitchClient(null),
    publicUrl: 'http://localhost:4400',
    persist: false,
  });
}

describe('Produktion', () => {
  it('belegt die Vorschau und bringt sie per Take auf Sendung', async () => {
    const p = make();
    await p.handleAction('preview.layout', { layoutId: 'duo' });
    await p.handleAction('preview.assign', { slotId: 'left', feedId: 'r5' });
    await p.handleAction('preview.assign', { slotId: 'right', feedId: 'r6' });
    await p.handleAction('take', {});
    const s = p.getState();
    expect(s.program).toEqual({ layoutId: 'duo', slots: { left: 'r5', right: 'r6' } });
    expect(s.feeds.find((f) => f.id === 'r5')?.onProgram).toBe(true);
    expect(s.log.at(-1)?.text).toContain('Take: Duell');
  });

  it('ersetzt einen verlorenen Feed auf Sendung automatisch', async () => {
    const p = make();
    await p.handleAction('cut', { feedId: 'r1' });
    expect(Object.values(p.getState().program.slots)).toContain('r1');
    await p.handleAction('feed.simulateDrop', { feedId: 'r1' });
    await new Promise((r) => setTimeout(r, 50));
    const s = p.getState();
    expect(Object.values(s.program.slots)).not.toContain('r1');
    expect(s.alerts[0].level).toBe('critical');
    expect(s.log.some((l) => l.kind === 'failover')).toBe(true);
  });

  it('leitet Format-Aktionen und Relay-Daten an das Format weiter', async () => {
    const p = make();
    p.ingest('r2', { phase: 'Running', splitIndex: 2, currentMs: 400_000 });
    const runner = (p.getState().formatState as { runners: Array<{ feedId: string; stars: number }> }).runners.find(
      (r) => r.feedId === 'r2',
    );
    expect(runner?.stars).toBe(10);
    expect(() => p.ingest('r2', { phase: 'Unsinn' })).toThrow();
    expect(() => p.ingest('gibtsnicht', { phase: 'Running' })).toThrow();
    await expect(p.handleAction('format.scoring', { mode: 'totalStars' })).resolves.toBeUndefined();
    await expect(p.handleAction('gibtsnicht', {})).rejects.toThrow();
  });

  it('läuft auch mit dem Multicam-Format', async () => {
    const p = make({
      format: 'multicam',
      formatConfig: { rundown: [{ title: 'Intro' }, { title: 'Talk', durationMin: 20 }] },
    });
    await p.handleAction('format.rundown.next', {});
    await p.handleAction('format.rundown.next', {});
    expect((p.getState().formatState as { current: number }).current).toBe(1);
    expect(p.getState().insights.every((i) => i.score === 0)).toBe(true);
  });
});

describe('Konfiguration & Relay', () => {
  it('prüft Produktions-Konfigurationen', () => {
    expect(() => validateProductionConfig({ id: 'x', name: 'X', format: 'multicam' }, 'x.json')).toThrow(/feeds/);
    expect(() =>
      validateProductionConfig(
        {
          id: 'x',
          name: 'X',
          format: 'multicam',
          feeds: [
            { id: 'a', label: 'A' },
            { id: 'a', label: 'B' },
          ],
        },
        'x.json',
      ),
    ).toThrow(/doppelt/);
  });

  it('liest LiveSplit-Zeiten', () => {
    expect(parseLiveSplitTime('1:02:03.45')).toBe(3_723_450);
    expect(parseLiveSplitTime('−12.34')).toBe(-12_340);
    expect(parseLiveSplitTime('+1:04.2')).toBe(64_200);
    expect(parseLiveSplitTime('-')).toBeNull();
  });
});
