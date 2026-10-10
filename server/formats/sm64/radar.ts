import type { FeedInsight, FeedState } from '../../../shared/types';
import type { Sm64Runner } from '../../../shared/sm64';
import { formatDelta } from '../../../shared/format';
import { progressLabel, runProgress } from '../../../shared/sm64Categories';

export interface RadarContext {
  now: number;
  goalStars: number;
  /** Anzahl der Splits der Kategorie */
  splitCount: number;
  runners: Sm64Runner[];
  feeds: Map<string, FeedState>;
}

/** Laufzeit, hochgerechnet auf `now`. */
export function liveMs(r: Sm64Runner, now: number): number {
  return r.phase === 'running' ? r.currentMs + Math.max(0, now - r.at) * (r.rate || 1) : r.currentMs;
}

const STATUS: Record<Sm64Runner['phase'], string> = {
  idle: 'wartet',
  running: 'läuft',
  paused: 'Pause',
  finished: 'im Ziel',
  reset: 'Reset',
};

/** Wie lange ein frisch beendeter Run als Highlight gilt. */
export const FINISH_SPOTLIGHT_MS = 90_000;

/**
 * Highlight-Radar: bewertet, wie sehenswert ein Runner gerade ist.
 * Bausteine: Fortschritt, Endphase, PB-Pace, Duell, frisches Ziel, „lange nicht gezeigt“.
 */
export function scoreRunner(r: Sm64Runner, ctx: RadarContext): FeedInsight {
  const reasons: string[] = [];
  const feed = ctx.feeds.get(r.feedId);
  const base: FeedInsight = {
    feedId: r.feedId,
    score: 0,
    reasons,
    status: STATUS[r.phase],
    stats: progressLabel(r.stars, r.splitIndex, ctx.goalStars, ctx.splitCount),
    deltaMs: r.deltaMs,
    timer:
      r.phase === 'idle' || r.phase === 'reset'
        ? null
        : { baseMs: r.currentMs, running: r.phase === 'running', at: r.at, rate: r.rate || 1 },
    partnerFeedId: null,
  };
  if (feed && feed.status === 'offline') {
    base.status = 'Feed weg';
    return base;
  }

  if (r.phase === 'finished') {
    if (r.lastFinishAt !== null && ctx.now - r.lastFinishAt < FINISH_SPOTLIGHT_MS) {
      base.score = 70;
      reasons.push('Run gerade beendet');
    }
    return base;
  }
  if (r.phase !== 'running') return base;

  let score = 10;
  const progress = runProgress(r.stars, r.splitIndex, ctx.goalStars, ctx.splitCount);
  score += progress * 20;

  // Endphase ab 85 % (bei 70 Star ab 60 Sternen), je näher am Ziel, desto spannender
  if (progress >= 0.85) {
    score += 25 + Math.round((progress - 0.85) * 140);
    reasons.push(`Endphase (${progressLabel(r.stars, r.splitIndex, ctx.goalStars, ctx.splitCount)})`);
  }

  if (r.deltaMs !== null) {
    if (r.deltaMs < 0) {
      score += 20 + progress * 30;
      reasons.push(`PB-Pace ${formatDelta(r.deltaMs)}`);
    } else if (r.deltaMs <= 20_000) {
      score += 5;
      reasons.push(`knapp an PB ${formatDelta(r.deltaMs)}`);
    }
  }

  // Duell: ähnlich weit, ähnliche Zeit
  const myMs = liveMs(r, ctx.now);
  let best: { partner: Sm64Runner; gap: number } | null = null;
  for (const o of ctx.runners) {
    if (o.feedId === r.feedId || o.phase !== 'running') continue;
    if (ctx.feeds.get(o.feedId)?.status === 'offline') continue;
    // Gleich weit: bei Stern-Kategorien höchstens 1 Stern, sonst derselbe Split
    if (ctx.goalStars >= 16 ? Math.abs(o.stars - r.stars) > 1 : o.splitIndex !== r.splitIndex) continue;
    const gap = Math.abs(liveMs(o, ctx.now) - myMs);
    if (gap <= 30_000 && (!best || gap < best.gap)) best = { partner: o, gap };
  }
  if (best) {
    score += 15;
    base.partnerFeedId = best.partner.feedId;
    reasons.push(`Duell mit ${best.partner.name}`);
  }

  // Lange nicht gezeigt → kleiner Bonus, damit alle Runner Sendezeit bekommen
  if (feed && !feed.onProgram) {
    const since = feed.lastProgramAt ?? null;
    const minutes = since === null ? 15 : (ctx.now - since) / 60_000;
    const bonus = Math.min(15, Math.max(0, minutes));
    score += bonus;
    if (minutes >= 5) reasons.push(since === null ? 'noch nicht gezeigt' : `${Math.round(minutes)} min nicht im Bild`);
  }

  base.score = Math.round(score);
  return base;
}
