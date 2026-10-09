import { describe, expect, it } from 'vitest';
import { BOARD_BAND_MIN, TICKER_RESERVE, boardBand } from '../shared/host';
import { DEFAULT_LAYOUTS } from '../server/core/layouts';
import { Production } from '../server/core/production';
import { ObsController } from '../server/obs/obsController';
import { TwitchClient } from '../server/integrations/twitch';
import { sm64Format } from '../server/formats/sm64';

const layout = (id: string) => DEFAULT_LAYOUTS.find((l) => l.id === id)!;

describe('Tabellen-Band', () => {
  it('füllt in „Duell“ und „Haupt + 3“ den Platz zwischen Feeds und Ticker', () => {
    for (const id of ['duo', 'featured']) {
      const band = boardBand(layout(id), true)!;
      const feedsBottom = Math.max(...layout(id).slots.map((s) => s.y + s.h));
      expect(band, id).not.toBeNull();
      expect(band.y).toBeGreaterThan(feedsBottom);
      expect(band.y + band.h).toBeLessThanOrEqual(1 - TICKER_RESERVE);
      expect(band.h).toBeGreaterThanOrEqual(BOARD_BAND_MIN);
    }
    // Ohne Ticker wird das Band höher
    expect(boardBand(layout('featured'), false)!.h).toBeGreaterThan(boardBand(layout('featured'), true)!.h);
  });

  it('erscheint nicht, wenn die Feeds die Leinwand füllen', () => {
    expect(boardBand(layout('single'), true)).toBeNull();
    expect(boardBand(layout('quad'), true)).toBeNull();
    expect(boardBand(layout('pause'), true)).toBeNull();
  });
});

describe('Tabellen-Grafiken in der Produktion', () => {
  const make = () =>
    new Production(
      {
        id: 'b',
        name: 'B',
        format: 'sm64-marathon',
        feeds: Array.from({ length: 4 }, (_, i) => ({ id: `r${i + 1}`, label: `R${i + 1}` })),
        simulation: { enabled: true, speed: 1 },
      },
      sm64Format,
      { obs: new ObsController(null), twitch: new TwitchClient(null), publicUrl: 'http://x', persist: false },
    );

  it('hat Band an, Vollbild und Lower Third aus und schaltet sie per Grafik-Aktion', async () => {
    const p = make();
    expect(p.getState().graphics).toMatchObject({ boardStrip: true, boardFull: false, hostBoard: false });
    await p.handleAction('graphics', { patch: { boardFull: true, hostBoard: true } });
    expect(p.getState().graphics).toMatchObject({ boardFull: true, hostBoard: true, boardStrip: true });
    expect(p.getLog().at(-1)?.text).toContain('Tabelle im Vollbild');
    await p.handleAction('graphics', { patch: { boardFull: false } });
    expect(p.getLog().at(-1)?.text).toContain('ausgeblendet');
  });
});
