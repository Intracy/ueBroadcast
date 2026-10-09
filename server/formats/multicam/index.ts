import type { FeedInsight } from '../../../shared/types';
import type { MulticamState, RundownSegment } from '../../../shared/multicam';
import { ActionError, type FormatDefinition } from '../types';

/**
 * Allgemeines Multicam-Format (Talk, Podcast, Panel): Feeds, Layouts, Grafik –
 * plus ein einfacher Ablaufplan. Vorlage für weitere Event-Formate.
 */
export const multicamFormat: FormatDefinition = {
  id: 'multicam',
  name: 'Multicam / Talk',
  description: 'Mehrere Kameras oder Zuspieler mit Ablaufplan – für Talks, Podcasts, Panels und Bühnenformate.',

  create(config, ctx) {
    const raw = (config.formatConfig?.rundown as unknown[]) ?? [];
    const segments: RundownSegment[] = raw.map((s, i) => {
      const o = s as Record<string, unknown>;
      if (typeof o?.title !== 'string') throw new Error(`formatConfig.rundown[${i}] braucht "title"`);
      return { title: o.title, durationMin: typeof o.durationMin === 'number' ? o.durationMin : null };
    });
    const state: MulticamState = { segments, current: 0, segmentStartedAt: null };

    const goto = (index: number) => {
      if (index < 0 || index >= segments.length) throw new ActionError('Kein Segment an dieser Stelle');
      state.current = index;
      state.segmentStartedAt = ctx.now();
      ctx.log('ablauf', `Segment: ${segments[index].title}`);
    };

    return {
      start() {},
      stop() {},
      getState: () => state,
      getInsights(): FeedInsight[] {
        return ctx.feeds().map((f) => ({
          feedId: f.id,
          score: 0,
          reasons: [],
          status: f.status === 'live' ? 'bereit' : f.status === 'offline' ? 'kein Signal' : '–',
          stats: null,
          deltaMs: null,
          timer: null,
          partnerFeedId: null,
        }));
      },
      handleAction(action, payload) {
        const p = (payload ?? {}) as Record<string, unknown>;
        switch (action) {
          case 'rundown.next':
            goto(state.segmentStartedAt === null ? 0 : state.current + 1);
            return;
          case 'rundown.prev':
            goto(state.current - 1);
            return;
          case 'rundown.goto':
            if (typeof p.index !== 'number') throw new ActionError('Parameter "index" fehlt');
            goto(p.index);
            return;
          default:
            throw new ActionError(`Unbekannte Multicam-Aktion "${action}"`);
        }
      },
      serialize: () => ({ current: state.current, segmentStartedAt: state.segmentStartedAt }),
      restore(data) {
        const d = data as Partial<MulticamState>;
        if (typeof d?.current === 'number' && d.current < segments.length) state.current = d.current;
        if (typeof d?.segmentStartedAt === 'number') state.segmentStartedAt = d.segmentStartedAt;
      },
    };
  },
};
