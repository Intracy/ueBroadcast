import type { RunSnapshot, Sm64Split } from '../../../shared/sm64';

interface SimRunner {
  feedId: string;
  pbMs: number;
  /** Form des Tages: < 1 schneller als PB */
  form: number;
  phase: 'idle' | 'running';
  idx: number;
  ms: number;
  targets: number[];
  idleLeftMs: number;
}

export interface SimulatorOptions {
  splits: Sm64Split[];
  runners: Array<{ feedId: string; pbMs: number }>;
  speed: number;
  random?: () => number;
  emit: (feedId: string, snap: RunSnapshot) => void;
}

/**
 * Simuliert Runner mit LiveSplit-artigen Snapshots – für Demos, Proben und Tests
 * ohne echte Streams. Läuft um den Faktor `speed` schneller als Echtzeit.
 */
export class Sm64Simulator {
  private runners: SimRunner[];
  private timer: NodeJS.Timeout | null = null;
  private readonly rnd: () => number;

  constructor(private readonly opts: SimulatorOptions) {
    this.rnd = opts.random ?? Math.random;
    this.runners = opts.runners.map((r) => ({
      feedId: r.feedId,
      pbMs: r.pbMs,
      form: 0.97 + this.rnd() * 0.09,
      phase: 'idle',
      idx: 0,
      ms: 0,
      targets: [],
      idleLeftMs: 0,
    }));
  }

  /** Startet die Runner versetzt mitten in ihren Runs, damit sofort etwas passiert. */
  warmStart(): void {
    const n = this.opts.splits.length;
    for (const r of this.runners) {
      if (this.rnd() < 0.15) {
        r.phase = 'idle';
        r.idleLeftMs = this.rnd() * 5 * 60_000;
        continue;
      }
      this.beginRun(r);
      r.idx = Math.floor(this.rnd() * Math.max(1, n - 3));
      r.ms = r.idx > 0 ? r.targets[r.idx - 1] + this.rnd() * 30_000 : this.rnd() * 60_000;
      this.emitRunning(r);
    }
  }

  start(intervalMs = 500): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(intervalMs * this.opts.speed), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private beginRun(r: SimRunner): void {
    const { splits } = this.opts;
    let prevAt = 0;
    let acc = 0;
    r.form = Math.min(1.12, Math.max(0.95, r.form + (this.rnd() - 0.5) * 0.03));
    r.targets = splits.map((s, i) => {
      const at = s.pbAt ?? (i + 1) / splits.length;
      const segment = r.pbMs * (at - prevAt) * (r.form + (this.rnd() - 0.5) * 0.08);
      prevAt = at;
      acc += Math.max(5_000, segment);
      return Math.round(acc);
    });
    r.phase = 'running';
    r.idx = 0;
    r.ms = 0;
  }

  private emitRunning(r: SimRunner): void {
    this.opts.emit(r.feedId, { phase: 'Running', splitIndex: r.idx, currentMs: r.ms, rate: this.opts.speed });
  }

  /** Spielt `dtMs` virtuelle Zeit für alle Runner ab. */
  tick(dtMs: number): void {
    const n = this.opts.splits.length;
    for (const r of this.runners) {
      if (r.phase === 'idle') {
        r.idleLeftMs -= dtMs;
        if (r.idleLeftMs <= 0) {
          this.beginRun(r);
          this.emitRunning(r);
        }
        continue;
      }
      r.ms += dtMs;
      let splitDone = false;
      while (r.idx < n && r.ms >= r.targets[r.idx]) {
        // Reset-Wahrscheinlichkeit pro Split, am Anfang höher
        const resetChance = r.idx < 3 ? 0.06 : 0.02;
        if (this.rnd() < resetChance) {
          this.opts.emit(r.feedId, { phase: 'NotRunning', splitIndex: -1, currentMs: 0 });
          r.phase = 'idle';
          r.idleLeftMs = 20_000 + this.rnd() * 90_000;
          splitDone = false;
          break;
        }
        r.idx += 1;
        splitDone = true;
      }
      if (r.phase === 'idle') continue;
      if (r.idx >= n) {
        const final = r.targets[n - 1];
        this.opts.emit(r.feedId, {
          phase: 'Ended',
          splitIndex: n,
          currentMs: final,
          finalMs: final,
          rate: this.opts.speed,
        });
        r.phase = 'idle';
        r.idleLeftMs = 60_000 + this.rnd() * 4 * 60_000;
        if (final < r.pbMs) r.pbMs = final;
        continue;
      }
      if (splitDone || this.rnd() < 0.1) this.emitRunning(r);
    }
  }
}
