import { describe, expect, it } from 'vitest';
import { needsPlayer, playerUrl } from '../shared/streamUrl';
import { embedPage } from '../server/embedPage';
import { Production } from '../server/core/production';
import { ObsController, type ObsSetupSpec } from '../server/obs/obsController';
import { TwitchClient } from '../server/integrations/twitch';
import { sm64Format } from '../server/formats/sm64';

describe('Player-Adressen für OBS', () => {
  it('spielt in OBS mit Ton, in der Regie stumm', () => {
    const url = 'https://www.youtube.com/watch?v=tBhamFUoyJk';
    expect(playerUrl(url, { muted: false, parentHost: 'localhost' })).toContain('mute=0');
    expect(playerUrl(url, { muted: true, parentHost: 'localhost' })).toContain('mute=1');
    expect(playerUrl('https://twitch.tv/huebi', { muted: false, parentHost: 'localhost' })).toContain('muted=false');
    expect(needsPlayer('https://vdo.ninja/?view=x')).toBe(false);
    expect(needsPlayer('https://www.twitch.tv/directory')).toBe(false);
  });

  it('baut eine Player-Seite mit eingebettetem Player und Twitch-parent des Servers', () => {
    const html = embedPage('https://twitch.tv/huebi', 'localhost:4400', false)!;
    expect(html).toContain('src="https://player.twitch.tv/?channel=huebi&amp;parent=localhost&amp;muted=false');
    expect(embedPage('https://www.youtube.com/watch?v=abcdefghijk', 'localhost:4400', false)).toContain(
      'https://www.youtube.com/embed/abcdefghijk?autoplay=1&amp;mute=0',
    );
    expect(embedPage('https://example.com/stream', 'localhost:4400', false)).toBeNull();
    // Kein HTML aus der Adresse ins Dokument
    expect(embedPage('https://youtu.be/abc"><script>', 'localhost', false) ?? '').not.toContain('"><script>');
  });

  it('gibt OBS für YouTube-/Twitch-Links die Player-Seite, andere Links unverändert', () => {
    const obs = new ObsController(null);
    let spec: ObsSetupSpec | null = null;
    obs.setSpec = (s: ObsSetupSpec) => {
      spec = s;
    };
    const p = new Production(
      {
        id: 'p',
        name: 'P',
        format: 'sm64-marathon',
        feeds: [
          { id: 'r1', label: 'R1', source: { kind: 'browser', url: 'https://www.youtube.com/watch?v=tBhamFUoyJk' } },
          { id: 'r2', label: 'R2', source: { kind: 'browser', url: 'https://vdo.ninja/?view=abc' } },
          { id: 'r3', label: 'R3', source: { kind: 'media', url: 'srt://ingest:8890?streamid=read:r3' } },
        ],
        simulation: { enabled: true, speed: 1 },
      },
      sm64Format,
      { obs, twitch: new TwitchClient(null), publicUrl: 'http://localhost:4400', persist: false },
    );
    p.start();
    p.stop();
    const feeds = spec!.feeds;
    expect(feeds[0].source?.url).toBe(
      `http://localhost:4400/embed?url=${encodeURIComponent('https://www.youtube.com/watch?v=tBhamFUoyJk')}`,
    );
    expect(feeds[1].source?.url).toBe('https://vdo.ninja/?view=abc');
    expect(feeds[2].source?.url).toBe('srt://ingest:8890?streamid=read:r3');
    // Die Regie zeigt weiterhin den Original-Link
    expect(p.getState().feeds[0].previewUrl).toBe('https://www.youtube.com/watch?v=tBhamFUoyJk');
  });
});
