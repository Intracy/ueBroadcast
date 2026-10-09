import { describe, expect, it } from 'vitest';
import { FrameCache } from '../server/core/frameCache';
import { liveMode } from '../web/src/components/LiveFrame';
import type { FeedState } from '../shared/types';

describe('Vorschaubilder aus OBS', () => {
  it('teilt ein Bild je Quelle und Breite und fragt OBS nicht öfter als nötig', async () => {
    let calls = 0;
    const cache = new FrameCache(async (source, width) => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return Buffer.from(`${source}@${width}#${calls}`);
    }, 50);
    // Gleichzeitige Anfragen teilen sich einen OBS-Aufruf
    const [a, b] = await Promise.all([cache.get('ueB Feed r01', 480), cache.get('ueB Feed r01', 480)]);
    expect(calls).toBe(1);
    expect(a?.toString()).toBe(b?.toString());
    // Innerhalb des Intervalls aus dem Cache, danach frisch
    await cache.get('ueB Feed r01', 480);
    expect(calls).toBe(1);
    await new Promise((r) => setTimeout(r, 60));
    await cache.get('ueB Feed r01', 480);
    expect(calls).toBe(2);
    // Andere Breite = eigenes Bild
    await cache.get('ueB Feed r01', 960);
    expect(calls).toBe(3);
  });

  it('liefert bei Fehlern null statt zu werfen und rundet Breiten auf Stufen', async () => {
    const cache = new FrameCache(async () => {
      throw new Error('Quelle fehlt');
    });
    await expect(cache.get('x', 480)).resolves.toBeNull();
    expect([100, 320, 400, 600, 2000].map(FrameCache.bucket)).toEqual([320, 320, 480, 640, 960]);
  });
});

describe('Live-Bild-Modus in der Regie', () => {
  const feed = (extra: Partial<FeedState>): FeedState => ({
    id: 'r01',
    label: 'R1',
    status: 'live',
    bitrateKbps: null,
    previewUrl: 'https://www.youtube.com/watch?v=abc',
    sourceKind: 'browser',
    onProgram: false,
    inPreview: false,
    lastProgramAt: null,
    ...extra,
  });

  it('zeigt YouTube & Co. über OBS, VDO.Ninja immer direkt', () => {
    expect(liveMode(feed({}), true, true)).toBe('obs');
    expect(liveMode(feed({}), true, false)).toBe('embed');
    expect(liveMode(feed({ previewUrl: 'https://vdo.ninja/?view=x' }), false, true)).toBe('embed');
    expect(liveMode(feed({ status: 'offline' }), true, true)).toBeNull();
    expect(liveMode(feed({ sourceKind: 'none' }), false, true)).toBe('embed');
  });
});
