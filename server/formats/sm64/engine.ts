import type {
  RunSnapshot,
  Sm64LeaderboardRow,
  Sm64Runner,
  Sm64Scoring,
  Sm64Split,
  Sm64State,
} from '../../../shared/sm64';
import { formatDelta, formatDuration } from '../../../shared/format';
import type { FormatContext } from '../types';
import { ActionError } from '../types';
import { liveMs } from './radar';

export interface EngineOptions {
  goalStars: number;
  splits: Sm64Split[];
  scoring: Sm64Scoring;
  runners: Array<{ feedId: string; name: string; pbMs: number | null }>;
}

interface RunFlags {
  endphase: boolean;
  pbPace: boolean;
}

const localDay = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Run-Logik für SM64: wandelt LiveSplit-Snapshots (Relay, Simulator, manuelle Bedienung)
 * in Runner-Zustände, zählt Sterne, erkennt PBs/Event-Bestzeiten und löst Alarme aus.
 */
export class Sm64Engine {
  readonly splits: Sm64Split[];
  readonly goalStars: number;
  scoring: Sm64Scoring;
  runners: Sm64Runner[];
  eventBest: Sm64State['eventBest'] = null;
  day: string;
  private flags = new Map<string, RunFlags>();

  constructor(
    opts: EngineOptions,
    private readonly ctx: Pick<FormatContext, 'now' | 'alert' | 'log' | 'changed'>,
  ) {
    this.splits = opts.splits;
    this.goalStars = opts.goalStars;
    this.scoring = opts.scoring;
    const now = ctx.now();
    this.day = localDay(now);
    this.runners = opts.runners.map((r) => ({
      feedId: r.feedId,
      name: r.name,
      phase: 'idle',
      splitIndex: 0,
      splitName: this.splits[0]?.name ?? null,
      stars: 0,
      currentMs: 0,
      at: now,
      rate: 1,
      deltaMs: null,
      pbMs: r.pbMs,
      bestEventMs: null,
      bestTodayMs: null,
      finishedRuns: 0,
      finishedToday: 0,
      resets: 0,
      totalStars: 0,
      lastFinishMs: null,
      lastFinishAt: null,
      source: null,
      lastDataAt: null,
    }));
  }

  runner(feedId: string): Sm64Runner {
    const r = this.runners.find((x) => x.feedId === feedId);
    if (!r) throw new ActionError(`Unbekannter Runner "${feedId}"`);
    return r;
  }

  private rollDay(now: number): void {
    const day = localDay(now);
    if (day === this.day) return;
    this.day = day;
    for (const r of this.runners) {
      r.finishedToday = 0;
      r.bestTodayMs = null;
    }
    this.ctx.log('sm64', `Neuer Eventtag ${day}`);
  }

  /** Verarbeitet einen Zustand, wie ihn LiveSplit meldet. Gibt true zurück, wenn sich etwas Wesentliches geändert hat. */
  applySnapshot(feedId: string, snap: RunSnapshot, source: string): boolean {
    const r = this.runner(feedId);
    const now = this.ctx.now();
    this.rollDay(now);
    r.source = source;
    r.lastDataAt = now;
    const n = this.splits.length;
    const wasActive = r.phase === 'running' || r.phase === 'paused';
    let significant = false;

    switch (snap.phase) {
      case 'NotRunning': {
        if (wasActive) {
          this.reset(r);
          significant = true;
        }
        break;
      }
      case 'Running':
      case 'Paused': {
        if (!wasActive) {
          this.startRun(r, now);
          significant = true;
        }
        const target = Math.max(0, Math.min(n - 1, snap.splitIndex));
        if (target > r.splitIndex) {
          for (let k = r.splitIndex; k < target; k++) {
            this.completeSplit(r, k, snap.currentMs, k === target - 1 ? snap.deltaMs : undefined);
          }
          significant = true;
        } else if (target < r.splitIndex) {
          // Split rückgängig gemacht
          r.splitIndex = target;
          r.stars = target > 0 ? this.splits[target - 1].stars : 0;
          r.splitName = this.splits[target]?.name ?? null;
          significant = true;
        }
        const phase = snap.phase === 'Running' ? 'running' : 'paused';
        if (r.phase !== phase) significant = true;
        r.phase = phase;
        r.currentMs = snap.currentMs;
        r.at = now;
        r.rate = snap.rate ?? 1;
        break;
      }
      case 'Ended': {
        if (r.phase !== 'finished') {
          if (!wasActive) this.startRun(r, now);
          for (let k = r.splitIndex; k < n; k++)
            this.completeSplit(r, k, snap.currentMs, k === n - 1 ? snap.deltaMs : undefined);
          this.finish(r, snap.finalMs ?? snap.currentMs, now);
          significant = true;
        }
        break;
      }
    }
    return significant;
  }

  private startRun(r: Sm64Runner, now: number): void {
    r.phase = 'running';
    r.splitIndex = 0;
    r.splitName = this.splits[0]?.name ?? null;
    r.stars = 0;
    r.currentMs = 0;
    r.at = now;
    r.deltaMs = null;
    this.flags.set(r.feedId, { endphase: false, pbPace: false });
    this.ctx.log('run', `${r.name} startet einen Run`);
  }

  private completeSplit(r: Sm64Runner, k: number, currentMs: number, deltaMs: number | null | undefined): void {
    const split = this.splits[k];
    r.splitIndex = k + 1;
    r.stars = split.stars;
    r.splitName = this.splits[k + 1]?.name ?? null;
    if (deltaMs !== undefined) {
      r.deltaMs = deltaMs;
    } else if (r.pbMs !== null && split.pbAt !== undefined) {
      r.deltaMs = Math.round(currentMs - r.pbMs * split.pbAt);
    }
    const flags = this.flags.get(r.feedId) ?? { endphase: false, pbPace: false };
    this.flags.set(r.feedId, flags);
    const remaining = this.goalStars - r.stars;
    if (r.stars >= 60 && !flags.endphase && r.splitIndex < this.splits.length) {
      flags.endphase = true;
      this.ctx.alert('highlight', `${r.name} in der Endphase – ${r.stars}/${this.goalStars} Sterne`, {
        feedId: r.feedId,
        key: `endphase-${r.feedId}`,
        cooldownMs: 10 * 60_000,
      });
    }
    if (r.deltaMs !== null && r.deltaMs < 0 && r.stars >= 35 && !flags.pbPace && r.splitIndex < this.splits.length) {
      flags.pbPace = true;
      this.ctx.alert('highlight', `${r.name} auf PB-Pace (${formatDelta(r.deltaMs)}), noch ${remaining} Sterne`, {
        feedId: r.feedId,
        key: `pbpace-${r.feedId}`,
        cooldownMs: 10 * 60_000,
        marker: true,
      });
    }
  }

  private reset(r: Sm64Runner): void {
    r.totalStars += r.stars;
    r.resets += 1;
    this.ctx.log('run', `${r.name}: Reset bei ${r.stars} Sternen (${formatDuration(r.currentMs)})`);
    r.phase = 'reset';
    r.splitIndex = 0;
    r.splitName = this.splits[0]?.name ?? null;
    r.stars = 0;
    r.currentMs = 0;
    r.deltaMs = null;
  }

  private finish(r: Sm64Runner, ms: number, now: number): void {
    r.phase = 'finished';
    r.currentMs = ms;
    r.at = now;
    r.stars = this.goalStars;
    r.totalStars += this.goalStars;
    r.finishedRuns += 1;
    r.finishedToday += 1;
    r.lastFinishMs = ms;
    r.lastFinishAt = now;
    if (r.pbMs !== null) r.deltaMs = ms - r.pbMs;
    const time = formatDuration(ms, true);
    this.ctx.log('run', `${r.name} im Ziel: ${time}`);

    const newPb = r.pbMs === null || ms < r.pbMs;
    if (newPb) {
      const gain = r.pbMs !== null ? ` (${formatDelta(ms - r.pbMs)})` : '';
      r.pbMs = ms;
      this.ctx.alert('highlight', `Neue PB für ${r.name}: ${time}${gain}`, { feedId: r.feedId, marker: true });
    } else {
      this.ctx.alert('info', `${r.name} im Ziel: ${time}`, { feedId: r.feedId });
    }
    if (r.bestEventMs === null || ms < r.bestEventMs) r.bestEventMs = ms;
    if (r.bestTodayMs === null || ms < r.bestTodayMs) r.bestTodayMs = ms;
    if (!this.eventBest || ms < this.eventBest.ms) {
      const hadBest = this.eventBest !== null;
      this.eventBest = { feedId: r.feedId, name: r.name, ms, at: now };
      if (hadBest)
        this.ctx.alert('highlight', `Neue Event-Bestzeit: ${r.name} mit ${time}!`, { feedId: r.feedId, marker: true });
    }
  }

  // ------------------------------------------------------------ manuelle Bedienung

  /** Baut aus dem aktuellen Zustand einen Snapshot für manuelle Aktionen. */
  manual(feedId: string, action: string): void {
    const r = this.runner(feedId);
    const now = this.ctx.now();
    const ms = Math.round(liveMs(r, now));
    const active = r.phase === 'running' || r.phase === 'paused';
    const n = this.splits.length;
    const send = (snap: RunSnapshot) => this.applySnapshot(feedId, snap, 'manual');
    switch (action) {
      case 'start':
        if (active) throw new ActionError(`${r.name} läuft bereits`);
        send({ phase: 'Running', splitIndex: 0, currentMs: 0 });
        break;
      case 'split':
        if (!active) throw new ActionError(`${r.name} hat keinen laufenden Run`);
        if (r.splitIndex >= n - 1) send({ phase: 'Ended', splitIndex: n, currentMs: ms, finalMs: ms });
        else send({ phase: r.phase === 'paused' ? 'Paused' : 'Running', splitIndex: r.splitIndex + 1, currentMs: ms });
        break;
      case 'undo':
        if (!active || r.splitIndex === 0) throw new ActionError('Nichts rückgängig zu machen');
        send({ phase: r.phase === 'paused' ? 'Paused' : 'Running', splitIndex: r.splitIndex - 1, currentMs: ms });
        break;
      case 'pause':
        if (!active) throw new ActionError(`${r.name} hat keinen laufenden Run`);
        send({ phase: r.phase === 'paused' ? 'Running' : 'Paused', splitIndex: r.splitIndex, currentMs: ms });
        break;
      case 'reset':
        if (!active) throw new ActionError(`${r.name} hat keinen laufenden Run`);
        send({ phase: 'NotRunning', splitIndex: -1, currentMs: 0 });
        break;
      case 'finish':
        if (!active) throw new ActionError(`${r.name} hat keinen laufenden Run`);
        send({ phase: 'Ended', splitIndex: n, currentMs: ms, finalMs: ms });
        break;
      default:
        throw new ActionError(`Unbekannte Run-Aktion "${action}"`);
    }
  }

  // ------------------------------------------------------------ Auswertung

  /** Gesammelte Sterne inkl. des laufenden Runs. */
  static collected(r: Sm64Runner): number {
    return r.totalStars + (r.phase === 'running' || r.phase === 'paused' ? r.stars : 0);
  }

  leaderboard(): Sm64LeaderboardRow[] {
    const rows = this.runners.map((r) => ({ r }));
    const col = Sm64Engine.collected;
    // Ohne Zeit hinten einsortieren (Infinity − Infinity wäre NaN)
    const byTime = (a: Sm64Runner, b: Sm64Runner) => {
      if (a.bestEventMs === null || b.bestEventMs === null) {
        return (a.bestEventMs === null ? 1 : 0) - (b.bestEventMs === null ? 1 : 0);
      }
      return a.bestEventMs - b.bestEventMs;
    };
    const cmp: Record<Sm64Scoring, (a: Sm64Runner, b: Sm64Runner) => number> = {
      bestTime: (a, b) => byTime(a, b) || col(b) - col(a),
      finishedRuns: (a, b) => b.finishedRuns - a.finishedRuns || byTime(a, b) || col(b) - col(a),
      totalStars: (a, b) => col(b) - col(a) || b.finishedRuns - a.finishedRuns,
    };
    rows.sort((a, b) => cmp[this.scoring](a.r, b.r));
    return rows.map(({ r }, i) => ({
      rank: i + 1,
      feedId: r.feedId,
      name: r.name,
      value:
        this.scoring === 'bestTime'
          ? r.bestEventMs !== null
            ? formatDuration(r.bestEventMs, true)
            : `${col(r)} ★`
          : this.scoring === 'finishedRuns'
            ? `${r.finishedRuns} Runs`
            : `${col(r)} ★`,
      bestEventMs: r.bestEventMs,
      finishedRuns: r.finishedRuns,
      totalStars: col(r),
    }));
  }

  serialize(): unknown {
    return { runners: this.runners, eventBest: this.eventBest, day: this.day, scoring: this.scoring };
  }

  restore(data: unknown): void {
    const d = data as {
      runners?: Sm64Runner[];
      eventBest?: Sm64State['eventBest'];
      day?: string;
      scoring?: Sm64Scoring;
    };
    if (Array.isArray(d?.runners)) {
      for (const saved of d.runners) {
        const r = this.runners.find((x) => x.feedId === saved.feedId);
        if (!r) continue;
        Object.assign(r, {
          pbMs: saved.pbMs ?? r.pbMs,
          bestEventMs: saved.bestEventMs ?? null,
          bestTodayMs: saved.bestTodayMs ?? null,
          finishedRuns: saved.finishedRuns ?? 0,
          finishedToday: saved.finishedToday ?? 0,
          resets: saved.resets ?? 0,
          totalStars: saved.totalStars ?? 0,
          lastFinishMs: saved.lastFinishMs ?? null,
        });
      }
    }
    if (d?.eventBest) this.eventBest = d.eventBest;
    if (typeof d?.day === 'string') this.day = d.day;
    if (d?.scoring) this.scoring = d.scoring;
    this.rollDay(this.ctx.now());
  }
}
