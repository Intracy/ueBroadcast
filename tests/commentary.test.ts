import { describe, expect, it } from 'vitest';
import { HOST_FEED_ID, TICKER_RESERVE, hostRect } from '../shared/host';
import { DEFAULT_LAYOUTS, feedsInComposition } from '../server/core/layouts';
import { Production } from '../server/core/production';
import { ObsController } from '../server/obs/obsController';
import { TwitchClient } from '../server/integrations/twitch';
import { sm64Format } from '../server/formats/sm64';
import type { ProductionConfig } from '../server/core/config';

const layout = (id: string) => DEFAULT_LAYOUTS.find((l) => l.id === id)!;

describe('Kommentar-Geometrie', () => {
  it('legt das Overlay in die Ecke des Hauptbilds, 16:9 und innerhalb des Bilds', () => {
    const r = hostRect(layout('featured'), { mode: 'pip', corner: 'br' }, 30)!;
    // Hauptbild featured: x 0–0.75, volle Höhe
    expect(r.w).toBeCloseTo(0.225, 3);
    expect(r.h).toBeCloseTo(r.w, 6);
    expect(r.x + r.w).toBeLessThan(0.75);
    expect(r.y + r.h).toBeLessThan(1);
    const tl = hostRect(layout('featured'), { mode: 'pip', corner: 'tl' }, 30)!;
    expect(tl.x).toBeLessThan(0.05);
    expect(tl.y).toBeLessThan(0.05);
  });

  it('nutzt im Raster die ganze Leinwand und macht unten Platz für den Ticker', () => {
    const grid = hostRect(layout('grid'), { mode: 'pip', corner: 'br' }, 30)!;
    expect(grid.x + grid.w).toBeGreaterThan(0.95);
    const lifted = hostRect(layout('single'), { mode: 'pip', corner: 'br' }, 30, TICKER_RESERVE)!;
    expect(lifted.y + lifted.h).toBeLessThanOrEqual(1 - TICKER_RESERVE);
  });

  it('füllt im Vollbild die Leinwand und verschwindet bei „aus“', () => {
    expect(hostRect(layout('duo'), { mode: 'full', corner: 'br' })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(hostRect(layout('duo'), { mode: 'off', corner: 'br' })).toBeNull();
  });
});

function make(commentary?: ProductionConfig['commentary']) {
  const cfg: ProductionConfig = {
    id: 'k',
    name: 'K',
    format: 'sm64-marathon',
    feeds: Array.from({ length: 4 }, (_, i) => ({ id: `r${i + 1}`, label: `R${i + 1}` })),
    simulation: { enabled: true, speed: 1 },
    commentary,
  };
  return new Production(cfg, sm64Format, {
    obs: new ObsController(null),
    twitch: new TwitchClient(null),
    publicUrl: 'http://localhost:4400',
    persist: false,
  });
}

describe('Kommentar in der Produktion', () => {
  it('schaltet Overlay und Vollbild über Vorschau und Take', async () => {
    const p = make({ obsScene: 'Kommentar', label: 'Huebi', corner: 'bl' });
    expect(p.getState().commentary).toEqual({ obsScene: 'Kommentar', label: 'Huebi', size: 30 });
    expect(p.getState().preview.host).toEqual({ mode: 'off', corner: 'bl' });
    await p.handleAction('preview.host', { mode: 'pip' });
    await p.handleAction('take', {});
    expect(p.getState().program.host).toEqual({ mode: 'pip', corner: 'bl' });
    // Layoutwechsel behält den Kommentar
    await p.handleAction('preview.layout', { layoutId: 'duo' });
    expect(p.getState().preview.host?.mode).toBe('pip');
    // Direkt ins Vollbild und per Direktschnitt zurück
    await p.handleAction('host.take', { mode: 'full' });
    expect(p.getState().program.host?.mode).toBe('full');
    expect(p.getLog().at(-1)?.text).toContain('Kommentar im Vollbild');
    await p.handleAction('cut', { feedId: 'r3' });
    expect(p.getState().program.host?.mode).toBe('off');
  });

  it('lehnt Kommentar-Aktionen ohne eingerichtete Szene ab', async () => {
    const p = make();
    expect(p.getState().commentary).toBeNull();
    await expect(p.handleAction('preview.host', { mode: 'full' })).rejects.toThrow(/Kommentar-Szene/);
    await p.handleAction('preview.set', {
      composition: { layoutId: 'single', slots: { main: 'r1' }, host: { mode: 'full' } },
    });
    expect(p.getState().preview.host).toBeUndefined();
  });
});

describe('Kommentar-Kamera im Slot', () => {
  it('lässt sich wie ein Runner in einen Slot legen und füllt genau diesen Slot', async () => {
    const p = make({ obsScene: 'Kommentar', label: 'Huebi' });
    await p.handleAction('preview.layout', { layoutId: 'duo' });
    await p.handleAction('preview.host', { mode: 'pip' });
    await p.handleAction('preview.assign', { slotId: 'right', feedId: HOST_FEED_ID });
    // Kamera im Slot ersetzt das Overlay
    expect(p.getState().preview.slots.right).toBe(HOST_FEED_ID);
    expect(p.getState().preview.host?.mode).toBe('off');
    await p.handleAction('take', {});
    const duo = layout('duo').slots.find((s) => s.id === 'right')!;
    expect(p.hostBox(p.getState().program)).toEqual({ x: duo.x, y: duo.y, w: duo.w, h: duo.h });
    expect(p.getLog().at(-1)?.text).toContain('Kommentar');
    // Runner-Feeds der Belegung ohne Kamera
    expect(feedsInComposition(p.getState().program, layout('duo'))).toEqual(['r1']);
  });

  it('holt die Kamera beim Einblenden als Overlay oder Vollbild aus dem Slot', async () => {
    const p = make({ obsScene: 'Kommentar', label: 'Huebi' });
    await p.handleAction('preview.assign', { slotId: 'main', feedId: HOST_FEED_ID });
    await p.handleAction('take', {});
    await p.handleAction('host.take', { mode: 'full' });
    expect(Object.values(p.getState().program.slots)).not.toContain(HOST_FEED_ID);
    expect(p.getState().program.host?.mode).toBe('full');
  });

  it('lehnt die Kamera ohne eingerichtete Kommentar-Szene ab', async () => {
    const p = make();
    await expect(p.handleAction('preview.assign', { slotId: 'main', feedId: HOST_FEED_ID })).rejects.toThrow(
      /Kommentar-Szene/,
    );
  });
});
