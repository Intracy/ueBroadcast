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
    const src = previewSrc('https://vdo.ninja/?view=j5WYcBi&solo=1&room=N64&password=n64', 800);
    expect(src).toBe(
      'https://vdo.ninja/?view=j5WYcBi&solo=1&room=N64&password=n64&noaudio&cleanoutput&videobitrate=800',
    );
    // Vorhandene Angaben bleiben unangetastet
    expect(previewSrc('https://vdo.ninja/?view=a&videobitrate=300&noaudio&clean')).toBe(
      'https://vdo.ninja/?view=a&videobitrate=300&noaudio&clean',
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
    expect(canShowLive(feed({}), true)).toBe(false);
    expect(canShowLive(feed({ sourceKind: 'media', previewUrl: 'http://ingest:8889/r' }), false)).toBe(false);
    expect(canShowLive(feed({ sourceKind: 'media', previewUrl: 'http://ingest:8889/r', status: 'live' }), false)).toBe(
      true,
    );
  });
});
