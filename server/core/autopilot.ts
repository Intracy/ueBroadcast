import type { Composition, FeedInsight, LayoutDef } from '../../shared/types';
import { emptyComposition, feedsInComposition, sameComposition } from './layouts';

export interface AutopilotInput {
  insights: FeedInsight[];
  liveFeedIds: Set<string>;
  program: Composition;
  layouts: LayoutDef[];
  layoutId: string;
  now: number;
  lastTakeAt: number | null;
  minHoldMs: number;
}

/** Ab welchem Vorsprung ein neuer Kandidat den aktuellen Hauptfeed vor Ablauf der doppelten Haltezeit verdrängt. */
const SCORE_MARGIN = 12;

/**
 * Entscheidet, ob der Autopilot umschneiden soll. Gibt die neue Belegung zurück oder null.
 * Regeln: Mindesthaltezeit einhalten, Hauptslot = höchster Score, Nebenslots = die nächsten.
 * Ein klarer Duell-Vorschlag mit hohem Score bekommt das Duell-Layout.
 */
export function decideAutopilot(input: AutopilotInput): Composition | null {
  const { insights, liveFeedIds, program, layouts, now, lastTakeAt, minHoldMs } = input;
  if (lastTakeAt !== null && now - lastTakeAt < minHoldMs) return null;

  const ranked = insights.filter((i) => i.score > 0 && liveFeedIds.has(i.feedId)).sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;

  const top = ranked[0];
  const programLayout = layouts.find((l) => l.id === program.layoutId);
  const currentMain = feedsInComposition(program, programLayout)[0] ?? null;
  const currentMainScore = insights.find((i) => i.feedId === currentMain)?.score ?? 0;
  const holdExpiredTwice = lastTakeAt === null || now - lastTakeAt >= minHoldMs * 2;

  // Duell: beide Partner live und hoher Score → Duell-Layout
  const duo = layouts.find((l) => l.id === 'duo');
  if (duo && top.partnerFeedId && liveFeedIds.has(top.partnerFeedId) && top.score >= 50) {
    const next = emptyComposition(duo);
    next.slots[duo.slots[0].id] = top.feedId;
    next.slots[duo.slots[1].id] = top.partnerFeedId;
    return sameComposition(next, program) ? null : next;
  }

  if (currentMain === top.feedId) {
    // Hauptfeed stimmt; Nebenslots nur bei abgelaufener doppelter Haltezeit auffrischen
    if (!holdExpiredTwice) return null;
  } else if (
    currentMain &&
    liveFeedIds.has(currentMain) &&
    top.score < currentMainScore + SCORE_MARGIN &&
    !holdExpiredTwice
  ) {
    return null;
  }

  const layout = layouts.find((l) => l.id === input.layoutId) ?? layouts.find((l) => l.slots.length > 0);
  if (!layout) return null;
  const next = emptyComposition(layout);
  layout.slots.forEach((slot, i) => {
    next.slots[slot.id] = ranked[i]?.feedId ?? null;
  });
  return sameComposition(next, program) ? null : next;
}
