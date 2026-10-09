import { describe, expect, it } from 'vitest';
import type { FeedState } from '../shared/types';
import { canShowLive, previewSrc } from '../web/src/components/LiveFrame';

const feed = (extra: Partial<FeedState>): FeedState => ({
  id: 'r01',
  label: 'Runner',
  status: 'unknown',
  bitrateKbps: null,
  previewUrl: 'https://vdo.ninja/?view=abc',
  sourceKind: 'browser',
  onProgram: false,
  inPreview: false,
  lastProgramAt: null,
  ...extra,
});

describe('Live-Bild in der Regie', () => {
  it('ergänzt VDO.Ninja-Links um stumm, ohne Bedienelemente und begrenzte Bitrate', () => {
    const src = previewSrc('https://vdo.ninja/?view=j5WYcBi&solo=1&room=N64&password=n64', 800, 35);
    expect(src).toBe(
      'https://vdo.ninja/?view=j5WYcBi&solo=1&room=N64&password=n64&noaudio&cleanoutput&videobitrate=800&scale=35',
    );
    // Vorhandene Angaben bleiben unangetastet
    expect(previewSrc('https://vdo.ninja/?view=a&videobitrate=300&noaudio&clean&scale=20')).toBe(
      'https://vdo.ninja/?view=a&videobitrate=300&noaudio&clean&scale=20',
    );
  });

  it('macht aus YouTube- und Twitch-Seiten einbettbare Player (stumm, Autoplay)', () => {
    const yt =
      'https://www.youtube.com/embed/tBhamFUoyJk?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&iv_load_policy=3&disablekb=1&loop=1&playlist=tBhamFUoyJk&enablejsapi=1';
    expect(previewSrc('https://www.youtube.com/watch?v=tBhamFUoyJk&fs=1')).toBe(yt);
    expect(previewSrc('https://youtu.be/tBhamFUoyJk')).toBe(yt);
    expect(previewSrc('https://youtube.com/live/tBhamFUoyJk?feature=share')).toBe(yt);
    expect(previewSrc('https://m.youtube.com/watch?v=tBhamFUoyJk&t=1m30s')).toBe(`${yt}&start=90`);
    expect(previewSrc('https://youtu.be/tBhamFUoyJk', 1200, 50, 'localhost', 'http://localhost:4400')).toBe(
      `${yt}&origin=http%3A%2F%2Flocalhost%3A4400`,
    );
    expect(previewSrc('https://www.twitch.tv/huebi', 1200, 50, 'localhost')).toBe(
      'https://player.twitch.tv/?channel=huebi&parent=localhost&muted=true&autoplay=true&controls=false',
    );
    expect(previewSrc('https://twitch.tv/videos/123456', 1200, 50, 'regie.local')).toBe(
      'https://player.twitch.tv/?video=123456&parent=regie.local&muted=true&autoplay=true&controls=false',
    );
  });

  it('lässt MediaMTX-Vorschauen wie gehabt', () => {
    expect(previewSrc('http://ingest:8889/runner01')).toBe(
      'http://ingest:8889/runner01?controls=false&muted=true&autoplay=true',
    );
  });

  it('zeigt VDO.Ninja-Bilder auch ohne Statusmeldung, Ingest-Feeds nur mit Signal', () => {
    expect(canShowLive(feed({}), false)).toBe(true);
    expect(canShowLive(feed({ status: 'offline' }), false)).toBe(false);
    // Simulation: hinterlegte Links zeigen, außer bei simuliertem Ausfall oder ohne Link
    expect(canShowLive(feed({ status: 'live' }), true)).toBe(true);
    expect(canShowLive(feed({ sourceKind: 'media', previewUrl: 'http://ingest:8889/r', status: 'live' }), true)).toBe(
      false,
    );
    expect(canShowLive(feed({ status: 'offline' }), true)).toBe(false);
    expect(canShowLive(feed({ previewUrl: null }), true)).toBe(false);
    expect(canShowLive(feed({ sourceKind: 'media', previewUrl: 'http://ingest:8889/r' }), false)).toBe(false);
    expect(canShowLive(feed({ sourceKind: 'media', previewUrl: 'http://ingest:8889/r', status: 'live' }), false)).toBe(
      true,
    );
  });
});
