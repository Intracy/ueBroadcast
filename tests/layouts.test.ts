import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUTS, assignFeed, emptyComposition, slotTransform, switchLayout } from '../server/core/layouts';

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
    const t = slotTransform({ id: 'x', x: 0.75, y: 1 / 3, w: 0.25, h: 1 / 3 }, 1920, 1080);
    expect(t).toMatchObject({ positionX: 1440, positionY: 360, boundsWidth: 480, boundsHeight: 360 });
    expect(t.boundsType).toBe('OBS_BOUNDS_SCALE_INNER');
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
