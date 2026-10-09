import type { Composition, LayoutDef, SlotDef } from '../../shared/types';

function grid(cols: number, rows: number, count: number, top = 0.08, height = 0.84): SlotDef[] {
  const slots: SlotDef[] = [];
  const w = 1 / cols;
  const h = height / rows;
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    slots.push({ id: `s${i + 1}`, x: c * w, y: top + r * h, w, h });
  }
  return slots;
}

/** Standard-Layouts für Multi-Feed-Produktionen (16:9-Leinwand). */
export const DEFAULT_LAYOUTS: LayoutDef[] = [
  { id: 'single', name: 'Einzel', hotkey: 'q', slots: [{ id: 'main', x: 0, y: 0, w: 1, h: 1 }] },
  {
    id: 'duo',
    name: 'Duell',
    hotkey: 'w',
    slots: [
      { id: 'left', x: 0, y: 0.12, w: 0.5, h: 0.72 },
      { id: 'right', x: 0.5, y: 0.12, w: 0.5, h: 0.72 },
    ],
  },
  {
    id: 'featured',
    name: 'Haupt + 3',
    hotkey: 'e',
    slots: [
      { id: 'main', x: 0, y: 0, w: 0.75, h: 1 },
      { id: 'side1', x: 0.75, y: 0, w: 0.25, h: 1 / 3 },
      { id: 'side2', x: 0.75, y: 1 / 3, w: 0.25, h: 1 / 3 },
      { id: 'side3', x: 0.75, y: 2 / 3, w: 0.25, h: 1 / 3 },
    ],
  },
  { id: 'quad', name: '4er', hotkey: 'r', slots: grid(2, 2, 4, 0, 1) },
  { id: 'grid', name: 'Alle', hotkey: 't', slots: grid(5, 2, 10, 0.18, 0.64) },
  { id: 'pause', name: 'Pause', hotkey: 'y', slots: [] },
];

export function emptyComposition(layout: LayoutDef): Composition {
  return { layoutId: layout.id, slots: Object.fromEntries(layout.slots.map((s) => [s.id, null])) };
}

/**
 * Wechselt das Layout und übernimmt die bisherigen Feeds der Reihe nach
 * in die neuen Slots – so bleibt der Hauptfeed beim Layoutwechsel im ersten Slot.
 */
export function switchLayout(current: Composition, from: LayoutDef | undefined, to: LayoutDef): Composition {
  const ordered = (from?.slots ?? []).map((s) => current.slots[s.id]).filter((f): f is string => !!f);
  const next = emptyComposition(to);
  to.slots.forEach((slot, i) => {
    next.slots[slot.id] = ordered[i] ?? null;
  });
  return next;
}

/** Setzt einen Feed in einen Slot; steckt er schon in einem anderen Slot, werden die beiden getauscht. */
export function assignFeed(comp: Composition, slotId: string, feedId: string | null): Composition {
  if (!(slotId in comp.slots)) return comp;
  const slots = { ...comp.slots };
  const previous = slots[slotId];
  if (feedId) {
    for (const [sid, fid] of Object.entries(slots)) {
      if (fid === feedId && sid !== slotId) slots[sid] = previous ?? null;
    }
  }
  slots[slotId] = feedId;
  return { ...comp, slots };
}

/** Feeds einer Belegung in Slot-Reihenfolge. */
export function feedsInComposition(comp: Composition, layout: LayoutDef | undefined): string[] {
  if (!layout) return Object.values(comp.slots).filter((f): f is string => !!f);
  return layout.slots.map((s) => comp.slots[s.id]).filter((f): f is string => !!f);
}

export function sameComposition(a: Composition, b: Composition): boolean {
  if (a.layoutId !== b.layoutId) return false;
  const keys = new Set([...Object.keys(a.slots), ...Object.keys(b.slots)]);
  for (const k of keys) if ((a.slots[k] ?? null) !== (b.slots[k] ?? null)) return false;
  return true;
}

/** OBS-Transform für einen Slot auf einer Leinwand der Größe width × height. */
export function slotTransform(slot: SlotDef, width: number, height: number) {
  return {
    positionX: Math.round(slot.x * width),
    positionY: Math.round(slot.y * height),
    alignment: 5, // oben links
    boundsType: 'OBS_BOUNDS_SCALE_INNER',
    boundsAlignment: 0, // zentriert innerhalb des Slots
    boundsWidth: Math.max(1, Math.round(slot.w * width)),
    boundsHeight: Math.max(1, Math.round(slot.h * height)),
  };
}
