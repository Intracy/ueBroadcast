import { describe, expect, it } from 'vitest';
import type { AlertLevel, FeedState } from '../shared/types';
import { Sm64Engine } from '../server/formats/sm64/engine';
import { scoreRunner } from '../server/formats/sm64/radar';
import { DEFAULT_SPLITS } from '../server/formats/sm64/splits';
import { Sm64Simulator } from '../server/formats/sm64/simulator';

function setup(pbMs: number | null = 3_000_000) {
  let now = 1_000_000;
  const alerts: Array<{ level: AlertLevel; text: string }> = [];
  const engine = new Sm64Engine(
    {
      goalStars: 70,
      splits: DEFAULT_SPLITS,
      scoring: 'bestTime',
      runners: [
        { feedId: 'r1', name: 'Alpha', pbMs },
        { feedId: 'r2', name: 'Beta', pbMs },
      ],
    },
    {
      now: () => now,
      alert: (level, text) => alerts.push({ level, text }),
      log: () => undefined,
      changed: () => undefined,
    },
  );
  return {
    engine,
    alerts,
    tick: (ms: number) => (now += ms),
    get now() {
      return now;
    },
  };
}

const feed = (id: string, extra: Partial<FeedState> = {}): FeedState => ({
  id,
  label: id,
  status: 'live',
  bitrateKbps: null,
  previewUrl: null,
  sourceKind: 'media',
  onProgram: false,
  inPreview: false,
  lastProgramAt: null,
  ...extra,
});

describe('SM64-Run-Logik', () => {
  it('zählt Sterne über Splits und berechnet das Delta zur PB', () => {
    const t = setup();
    const { engine } = t;
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 0, currentMs: 0 }, 'relay');
    expect(engine.runner('r1').phase).toBe('running');
    // BoB nach 170 s, PB-Anteil 6 % von 50 min = 180 s → 10 s schneller
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 1, currentMs: 170_000 }, 'relay');
    const r = engine.runner('r1');
    expect(r.stars).toBe(5);
    expect(r.splitName).toBe("Whomp's Fortress");
    expect(r.deltaMs).toBe(-10_000);
  });

  it('übernimmt das Delta aus LiveSplit, wenn geliefert', () => {
    const { engine } = setup();
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 3, currentMs: 600_000, deltaMs: 4200 }, 'relay');
    expect(engine.runner('r1').stars).toBe(15);
    expect(engine.runner('r1').deltaMs).toBe(4200);
  });

  it('zählt Resets und behält gesammelte Sterne', () => {
    const { engine } = setup();
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 2, currentMs: 400_000 }, 'relay');
    engine.applySnapshot('r1', { phase: 'NotRunning', splitIndex: -1, currentMs: 0 }, 'relay');
    const r = engine.runner('r1');
    expect(r.phase).toBe('reset');
    expect(r.resets).toBe(1);
    expect(r.totalStars).toBe(10);
    expect(r.stars).toBe(0);
  });

  it('erkennt PB und Event-Bestzeit beim Zieleinlauf', () => {
    const t = setup();
    const { engine, alerts } = t;
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 0, currentMs: 0 }, 'relay');
    engine.applySnapshot('r1', { phase: 'Ended', splitIndex: 17, currentMs: 2_950_000, finalMs: 2_950_000 }, 'relay');
    expect(engine.runner('r1').pbMs).toBe(2_950_000);
    expect(engine.eventBest?.feedId).toBe('r1');
    expect(alerts.some((a) => a.text.includes('Neue PB für Alpha'))).toBe(true);

    engine.applySnapshot('r2', { phase: 'Running', splitIndex: 0, currentMs: 0 }, 'relay');
    engine.applySnapshot('r2', { phase: 'Ended', splitIndex: 17, currentMs: 2_900_000, finalMs: 2_900_000 }, 'relay');
    expect(engine.eventBest?.feedId).toBe('r2');
    expect(alerts.some((a) => a.text.includes('Neue Event-Bestzeit'))).toBe(true);
    expect(engine.leaderboard().map((r) => r.feedId)).toEqual(['r2', 'r1']);
  });

  it('meldet PB-Pace und Endphase je Run nur einmal', () => {
    const { engine, alerts } = setup();
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 0, currentMs: 0 }, 'relay');
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 8, currentMs: 1_400_000 }, 'relay'); // 34 ★
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 9, currentMs: 1_500_000 }, 'relay'); // 37 ★
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 15, currentMs: 2_500_000 }, 'relay'); // 63 ★
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 16, currentMs: 2_700_000 }, 'relay'); // 70 ★
    expect(alerts.filter((a) => a.text.includes('PB-Pace'))).toHaveLength(1);
    expect(alerts.filter((a) => a.text.includes('Endphase'))).toHaveLength(1);
  });

  it('erlaubt manuelle Bedienung als Notlösung', () => {
    const t = setup();
    const { engine } = t;
    engine.manual('r1', 'start');
    t.tick(200_000);
    engine.manual('r1', 'split');
    expect(engine.runner('r1').stars).toBe(5);
    expect(engine.runner('r1').currentMs).toBe(200_000);
    engine.manual('r1', 'undo');
    expect(engine.runner('r1').stars).toBe(0);
    engine.manual('r1', 'reset');
    expect(engine.runner('r1').phase).toBe('reset');
    expect(() => engine.manual('r1', 'split')).toThrow();
  });
});

describe('Highlight-Radar', () => {
  it('bewertet PB-Pace in der Endphase höher als einen frühen, langsamen Run', () => {
    const { engine, now } = setup();
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 15, currentMs: 2_600_000, deltaMs: -20_000 }, 'relay');
    engine.applySnapshot('r2', { phase: 'Running', splitIndex: 2, currentMs: 500_000, deltaMs: 30_000 }, 'relay');
    const feeds = new Map([
      ['r1', feed('r1', { onProgram: true })],
      ['r2', feed('r2', { onProgram: true })],
    ]);
    const ctx = { now, goalStars: 70, splitCount: 17, runners: engine.runners, feeds };
    const hot = scoreRunner(engine.runner('r1'), ctx);
    const cold = scoreRunner(engine.runner('r2'), ctx);
    expect(hot.score).toBeGreaterThan(cold.score + 40);
    expect(hot.reasons.join()).toContain('PB-Pace');
    expect(hot.reasons.join()).toContain('Endphase');
  });

  it('erkennt Duelle und gibt Feeds ohne Signal keine Punkte', () => {
    const { engine, now } = setup();
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 6, currentMs: 1_200_000 }, 'relay');
    engine.applySnapshot('r2', { phase: 'Running', splitIndex: 6, currentMs: 1_210_000 }, 'relay');
    const feeds = new Map([
      ['r1', feed('r1', { onProgram: true })],
      ['r2', feed('r2', { onProgram: true })],
    ]);
    const duel = scoreRunner(engine.runner('r1'), {
      now,
      goalStars: 70,
      splitCount: 17,
      runners: engine.runners,
      feeds,
    });
    expect(duel.partnerFeedId).toBe('r2');
    feeds.set('r1', feed('r1', { status: 'offline' }));
    expect(
      scoreRunner(engine.runner('r1'), { now, goalStars: 70, splitCount: 17, runners: engine.runners, feeds }).score,
    ).toBe(0);
  });

  it('gibt Runnern, die lange nicht im Bild waren, einen Bonus', () => {
    const { engine, now } = setup();
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 4, currentMs: 900_000 }, 'relay');
    const ctx = (lastProgramAt: number) => ({
      now,
      goalStars: 70,
      splitCount: 17,
      runners: [engine.runner('r1')],
      feeds: new Map([['r1', feed('r1', { lastProgramAt })]]),
    });
    const recent = scoreRunner(engine.runner('r1'), ctx(now - 60_000));
    const long = scoreRunner(engine.runner('r1'), ctx(now - 20 * 60_000));
    expect(long.score).toBeGreaterThan(recent.score);
  });
});

describe('Simulator', () => {
  it('erzeugt plausible Runs mit Starts, Splits und Zieleinläufen', () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const phases = new Set<string>();
    let maxSplit = 0;
    const sim = new Sm64Simulator({
      splits: DEFAULT_SPLITS,
      runners: [
        { feedId: 'r1', pbMs: 3_000_000 },
        { feedId: 'r2', pbMs: 3_300_000 },
      ],
      speed: 1,
      random,
      emit: (_id, snap) => {
        phases.add(snap.phase);
        maxSplit = Math.max(maxSplit, snap.splitIndex);
      },
    });
    for (let i = 0; i < 20_000; i++) sim.tick(5_000); // ~28 Stunden virtuelle Zeit
    expect(phases).toContain('Running');
    expect(phases).toContain('Ended');
    expect(phases).toContain('NotRunning');
    expect(maxSplit).toBe(DEFAULT_SPLITS.length);
  });
});

describe('Tabelle', () => {
  it('sortiert Runner ohne Zieleinlauf nach gesammelten Sternen hinter die mit Zeit', () => {
    const { engine } = setup();
    engine.applySnapshot('r1', { phase: 'Running', splitIndex: 2, currentMs: 300_000 }, 'relay');
    engine.applySnapshot('r2', { phase: 'Running', splitIndex: 6, currentMs: 900_000 }, 'relay');
    expect(engine.leaderboard().map((r) => r.feedId)).toEqual(['r2', 'r1']);
    engine.applySnapshot('r1', { phase: 'Ended', splitIndex: 17, currentMs: 3_100_000, finalMs: 3_100_000 }, 'relay');
    expect(engine.leaderboard().map((r) => r.feedId)).toEqual(['r1', 'r2']);
  });
});
