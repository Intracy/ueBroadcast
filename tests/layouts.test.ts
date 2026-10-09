import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUTS,
  assignFeed,
  emptyComposition,
  gridSlots,
  slotTransform,
  switchLayout,
} from '../server/core/layouts';

const layout = (id: string) => DEFAULT_LAYOUTS.find((l) => l.id === id)!;

describe('Layouts', () => {
  it('übernimmt beim Layoutwechsel die Feeds in Slot-Reihenfolge', () => {
    const featured = emptyComposition(layout('featured'));
    featured.slots = { main: 'a', side1: 'b', side2: 'c', side3: 'd' };
    const duo = switchLayout(featured, layout('featured'), layout('duo'));
    expect(duo).toEqual({ layoutId: 'duo', slots: { left: 'a', right: 'b' } });
    const single = switchLayout(duo, layout('duo'), layout('single'));
    expect(single.slots.main).toBe('a');
  });

  it('tauscht Feeds, statt sie doppelt zu belegen', () => {
    const comp = { layoutId: 'duo', slots: { left: 'a', right: 'b' } };
    expect(assignFeed(comp, 'left', 'b').slots).toEqual({ left: 'b', right: 'a' });
    expect(assignFeed(comp, 'right', 'c').slots).toEqual({ left: 'a', right: 'c' });
    expect(assignFeed(comp, 'gibtsnicht', 'c')).toBe(comp);
  });

  it('rechnet Slots in OBS-Transformationen um', () => {
    const t = slotTransform({ x: 0.75, y: 1 / 3, w: 0.25, h: 1 / 3 }, 1920, 1080);
    expect(t).toMatchObject({ positionX: 1440, positionY: 360, boundsWidth: 480, boundsHeight: 360 });
    expect(t.boundsType).toBe('OBS_BOUNDS_SCALE_INNER');
  });

  it('hat in allen Standard-Layouts unbeschnittene 16:9-Slots', () => {
    // Auf der 16:9-Leinwand ist ein Slot genau dann 16:9, wenn normierte Breite und Höhe gleich sind
    for (const l of [
      ...DEFAULT_LAYOUTS,
      ...[1, 2, 3, 5, 7, 12].map((n) => ({ id: `grid${n}`, slots: gridSlots(n) })),
    ]) {
      for (const s of l.slots) expect(s.w, `${l.id}/${s.id}`).toBeCloseTo(s.h, 9);
    }
    // Haupt + 3: Hauptbild 3/4, Nebenbilder stapeln sich genau daneben
    const f = layout('featured').slots;
    expect(f[0]).toMatchObject({ w: 0.75, h: 0.75 });
    expect(f[3].y + f[3].h).toBeCloseTo(0.75, 9);
    // Raster mit 10 Feeds: 4 Spalten, letzte Reihe mittig
    const g = gridSlots(10);
    expect(g[0].w).toBeCloseTo(0.25, 9);
    expect(g[8].x).toBeCloseTo(0.25, 9);
  });

  it('hat alle Slots innerhalb der Leinwand', () => {
    for (const l of DEFAULT_LAYOUTS) {
      for (const s of l.slots) {
        expect(s.x + s.w).toBeLessThanOrEqual(1.0001);
        expect(s.y + s.h).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});
