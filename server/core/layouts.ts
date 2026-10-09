import type { Composition, LayoutDef, SlotDef } from '../../shared/types';

/**
 * Raster aus 16:9-Kacheln auf der 16:9-Leinwand. Auf dieser Leinwand ist eine Kachel genau dann 16:9,
 * wenn ihre normierte Breite gleich ihrer normierten Höhe ist. Das Raster wird mittig gesetzt,
 * eine unvollständige letzte Reihe ebenfalls.
 */
function grid16x9(cols: number, rows: number, count: number): SlotDef[] {
  const size = Math.min(1 / cols, 1 / rows);
  const top = (1 - rows * size) / 2;
  const slots: SlotDef[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = Math.min(cols, count - r * cols);
    const left = (1 - inRow * size) / 2;
    slots.push({ id: `s${i + 1}`, x: left + c * size, y: top + r * size, w: size, h: size });
  }
  return slots;
}

/** Standard-Layouts für Multi-Feed-Produktionen (16:9-Leinwand). */
const BASE_LAYOUTS: LayoutDef[] = [
  { id: 'single', name: 'Einzel', hotkey: 'q', slots: [{ id: 'main', x: 0, y: 0, w: 1, h: 1 }] },
  {
    id: 'duo',
    name: 'Duell',
    hotkey: 'w',
    slots: [
      // Zwei volle 16:9-Bilder nebeneinander, darunter Platz für Bauchbinde und Ticker
      { id: 'left', x: 0, y: 0.2, w: 0.5, h: 0.5 },
      { id: 'right', x: 0.5, y: 0.2, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: 'featured',
    name: 'Haupt + 3',
    hotkey: 'e',
    slots: [
      // Hauptbild 3/4 und drei Nebenbilder 1/4 – alle 16:9; unten bleibt ein Band für Infos und Ticker
      { id: 'main', x: 0, y: 0, w: 0.75, h: 0.75 },
      { id: 'side1', x: 0.75, y: 0, w: 0.25, h: 0.25 },
      { id: 'side2', x: 0.75, y: 0.25, w: 0.25, h: 0.25 },
      { id: 'side3', x: 0.75, y: 0.5, w: 0.25, h: 0.25 },
    ],
  },
  { id: 'quad', name: '4er', hotkey: 'r', slots: grid16x9(2, 2, 4) },
  { id: 'grid', name: 'Alle', hotkey: 't', slots: [] },
  { id: 'pause', name: 'Pause', hotkey: 'y', slots: [] },
];

/** Raster „Alle“ passend zur Anzahl der Feeds: so viele Spalten, dass die 16:9-Kacheln möglichst groß werden. */
export function gridSlots(count: number): SlotDef[] {
  if (count <= 0) return [];
  let best = { cols: 1, rows: 1, size: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const size = Math.min(1 / cols, 1 / rows);
    // Bei Gleichstand mehr Spalten: weniger Reihen, mehr Platz unten für Ticker und Bauchbinde
    if (size >= best.size - 1e-9) best = { cols, rows, size };
  }
  return grid16x9(best.cols, best.rows, count);
}

export function defaultLayouts(feedCount: number): LayoutDef[] {
  return BASE_LAYOUTS.map((l) => (l.id === 'grid' ? { ...l, slots: gridSlots(feedCount) } : l));
}

/** Standard-Layouts für 10 Feeds (Rückwärtskompatibilität, Tests). */
export const DEFAULT_LAYOUTS: LayoutDef[] = defaultLayouts(10);

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
  if (current.host) next.host = { ...current.host };
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
  const ha = a.host ?? { mode: 'off', corner: 'br' };
  const hb = b.host ?? { mode: 'off', corner: 'br' };
  if (ha.mode !== hb.mode || (ha.mode === 'pip' && ha.corner !== hb.corner)) return false;
  const keys = new Set([...Object.keys(a.slots), ...Object.keys(b.slots)]);
  for (const k of keys) if ((a.slots[k] ?? null) !== (b.slots[k] ?? null)) return false;
  return true;
}

/** OBS-Transform für einen Slot auf einer Leinwand der Größe width × height. */
export function slotTransform(slot: { x: number; y: number; w: number; h: number }, width: number, height: number) {
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
