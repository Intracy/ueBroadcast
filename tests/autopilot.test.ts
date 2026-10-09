import { describe, expect, it } from 'vitest';
import type { FeedInsight } from '../shared/types';
import { decideAutopilot } from '../server/core/autopilot';
import { DEFAULT_LAYOUTS } from '../server/core/layouts';

const ins = (feedId: string, score: number, partnerFeedId: string | null = null): FeedInsight => ({
  feedId,
  score,
  reasons: [],
  status: 'läuft',
  stats: null,
  deltaMs: null,
  timer: null,
  partnerFeedId,
});

const base = {
  layouts: DEFAULT_LAYOUTS,
  layoutId: 'featured',
  minHoldMs: 40_000,
  liveFeedIds: new Set(['a', 'b', 'c', 'd', 'e']),
};

describe('Autopilot', () => {
  it('hält die Mindesthaltezeit ein', () => {
    const r = decideAutopilot({
      ...base,
      insights: [ins('e', 90)],
      program: { layoutId: 'single', slots: { main: 'a' } },
      now: 30_000,
      lastTakeAt: 0,
    });
    expect(r).toBeNull();
  });

  it('setzt den spannendsten Feed in den Hauptslot', () => {
    const r = decideAutopilot({
      ...base,
      insights: [ins('a', 20), ins('b', 40), ins('c', 75), ins('d', 30)],
      program: { layoutId: 'single', slots: { main: 'a' } },
      now: 100_000,
      lastTakeAt: 0,
    });
    expect(r).toEqual({ layoutId: 'featured', slots: { main: 'c', side1: 'b', side2: 'd', side3: 'a' } });
  });

  it('wechselt nicht wegen knapper Unterschiede vor Ablauf der doppelten Haltezeit', () => {
    const r = decideAutopilot({
      ...base,
      insights: [ins('a', 50), ins('b', 55)],
      program: { layoutId: 'single', slots: { main: 'a' } },
      now: 50_000,
      lastTakeAt: 0,
    });
    expect(r).toBeNull();
  });

  it('schlägt bei einem Duell das Duell-Layout vor', () => {
    const r = decideAutopilot({
      ...base,
      insights: [ins('b', 70, 'c'), ins('c', 60, 'b')],
      program: { layoutId: 'single', slots: { main: 'a' } },
      now: 100_000,
      lastTakeAt: 0,
    });
    expect(r).toEqual({ layoutId: 'duo', slots: { left: 'b', right: 'c' } });
  });

  it('ignoriert Feeds ohne Signal', () => {
    const r = decideAutopilot({
      ...base,
      liveFeedIds: new Set(['a']),
      insights: [ins('a', 10), ins('z', 99)],
      program: { layoutId: 'single', slots: { main: 'a' } },
      now: 100_000,
      lastTakeAt: 0,
      layoutId: 'single',
    });
    expect(r).toBeNull();
  });
});
