import type { RunSnapshot, Sm64Scoring, Sm64State } from '../../../shared/sm64';
import type { FeedInsight } from '../../../shared/types';
import { ActionError, type FormatDefinition, type FormatInstance } from '../types';
import { Sm64Engine } from './engine';
import { scoreRunner } from './radar';
import { Sm64Simulator } from './simulator';
import { validateSplits } from './splits';

const SCORINGS: Sm64Scoring[] = ['bestTime', 'finishedRuns', 'totalStars'];
const PHASES = new Set(['NotRunning', 'Running', 'Paused', 'Ended']);

function parseSnapshot(data: unknown): RunSnapshot {
  const d = data as Record<string, unknown>;
  if (!d || typeof d !== 'object' || typeof d.phase !== 'string' || !PHASES.has(d.phase)) {
    throw new ActionError('Snapshot braucht "phase" (NotRunning | Running | Paused | Ended)');
  }
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    phase: d.phase as RunSnapshot['phase'],
    splitIndex: num(d.splitIndex, -1),
    currentMs: num(d.currentMs, 0),
    deltaMs: d.deltaMs === null ? null : typeof d.deltaMs === 'number' ? d.deltaMs : undefined,
    finalMs: typeof d.finalMs === 'number' ? d.finalMs : undefined,
  };
}

/** Pseudo-zufällige, aber pro Runner stabile Demo-PB zwischen 47 und 72 Minuten. */
function demoPb(index: number): number {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return Math.round((47 + (x - Math.floor(x)) * 25) * 60_000);
}

export const sm64Format: FormatDefinition = {
  id: 'sm64-marathon',
  name: 'SM64 Speedrun-Marathon',
  description:
    'Mehrere Remote-Runner spielen Super Mario 64 (70 Stars) parallel. Highlight-Radar, Sterne-Zähler, PB-Pace, Leaderboard.',

  create(config, ctx): FormatInstance {
    const fc = config.formatConfig ?? {};
    const splits = validateSplits(fc.splits);
    const goalStars = typeof fc.goalStars === 'number' ? fc.goalStars : splits[splits.length - 1].stars;
    const scoring = SCORINGS.includes(fc.scoring as Sm64Scoring) ? (fc.scoring as Sm64Scoring) : 'bestTime';
    const runners = config.feeds.map((f, i) => {
      const pb = f.meta?.pbMs;
      return {
        feedId: f.id,
        name: typeof f.meta?.runner === 'string' ? (f.meta.runner as string) : f.label,
        pbMs: typeof pb === 'number' ? pb : ctx.simulation ? demoPb(i) : null,
      };
    });
    const engine = new Sm64Engine({ goalStars, splits, scoring, runners }, ctx);

    let simulator: Sm64Simulator | null = null;
    if (ctx.simulation) {
      simulator = new Sm64Simulator({
        splits,
        speed: ctx.simulationSpeed,
        runners: runners.map((r, i) => ({ feedId: r.feedId, pbMs: r.pbMs ?? demoPb(i) })),
        emit: (feedId, snap) => {
          if (engine.applySnapshot(feedId, snap, 'simulation')) ctx.changed();
        },
      });
    }

    return {
      start() {
        if (simulator) {
          simulator.warmStart();
          simulator.start();
        }
      },
      stop() {
        simulator?.stop();
      },
      getState(): Sm64State {
        return {
          scoring: engine.scoring,
          goalStars,
          splits,
          runners: engine.runners,
          leaderboard: engine.leaderboard(),
          eventBest: engine.eventBest,
          day: engine.day,
          simulationSpeed: simulator ? ctx.simulationSpeed : null,
        };
      },
      getInsights(): FeedInsight[] {
        const now = ctx.now();
        const feeds = new Map(ctx.feeds().map((f) => [f.id, f]));
        return engine.runners.map((r) => scoreRunner(r, { now, goalStars, runners: engine.runners, feeds }));
      },
      handleAction(action, payload) {
        const p = (payload ?? {}) as Record<string, unknown>;
        if (action.startsWith('run.')) {
          if (typeof p.feedId !== 'string') throw new ActionError('Parameter "feedId" fehlt');
          engine.manual(p.feedId, action.slice(4));
          return;
        }
        switch (action) {
          case 'scoring':
            if (!SCORINGS.includes(p.mode as Sm64Scoring)) throw new ActionError('Unbekannter Wertungsmodus');
            engine.scoring = p.mode as Sm64Scoring;
            ctx.log('sm64', `Wertung: ${engine.scoring}`);
            return;
          case 'runner.pb': {
            if (typeof p.feedId !== 'string') throw new ActionError('Parameter "feedId" fehlt');
            const r = engine.runner(p.feedId);
            r.pbMs = typeof p.pbMs === 'number' && p.pbMs > 0 ? Math.round(p.pbMs) : null;
            ctx.log('sm64', `PB von ${r.name} gesetzt`);
            return;
          }
          default:
            throw new ActionError(`Unbekannte SM64-Aktion "${action}"`);
        }
      },
      ingest(feedId, data) {
        engine.applySnapshot(feedId, parseSnapshot(data), 'relay');
      },
      serialize: () => engine.serialize(),
      restore: (data) => engine.restore(data),
    };
  },
};
