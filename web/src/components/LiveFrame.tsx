import type { FeedState } from '../../../shared/types';

/**
 * Vorschau-Adresse für die Regie aufbereiten.
 * - VDO.Ninja: ohne Ton, ohne Bedienelemente, mit begrenzter Bitrate (schont den Upload des Runners)
 * - MediaMTX-WebRTC-Seite: ohne Bedienelemente, stumm, Autoplay
 */
export function previewSrc(url: string, bitrateKbps = 1200): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (/(^|\.)vdo\.ninja$/i.test(u.hostname) || /(^|\.)obs\.ninja$/i.test(u.hostname)) {
    const has = (k: string) => u.searchParams.has(k);
    if (!has('noaudio')) u.searchParams.set('noaudio', '');
    if (!has('cleanoutput') && !has('clean')) u.searchParams.set('cleanoutput', '');
    if (!has('videobitrate')) u.searchParams.set('videobitrate', String(bitrateKbps));
    // VDO.Ninja erwartet Schalter ohne „=“
    return u.toString().replace(/=(?=&|$)/g, '');
  }
  if (!u.search) {
    u.searchParams.set('controls', 'false');
    u.searchParams.set('muted', 'true');
    u.searchParams.set('autoplay', 'true');
  }
  return u.toString();
}

/** Ob die Regie für diesen Feed ein Live-Bild zeigen kann. */
export function canShowLive(feed: FeedState | undefined, simulation: boolean): boolean {
  if (!feed?.previewUrl || simulation) return false;
  if (feed.status === 'live') return true;
  // Browser-Links (VDO.Ninja) lassen sich nicht von außen prüfen – Bild zeigen, solange nichts dagegen spricht
  return feed.sourceKind === 'browser' && feed.status !== 'offline';
}

/** Live-Bild eines Feeds als eingebettete Seite (VDO.Ninja, MediaMTX-WebRTC …). */
export function LiveFrame({ feed, bitrateKbps }: { feed: FeedState; bitrateKbps?: number }) {
  return (
    <iframe
      className="live-frame"
      src={previewSrc(feed.previewUrl!, bitrateKbps)}
      title={`Live-Bild ${feed.label}`}
      allow="autoplay; fullscreen"
      tabIndex={-1}
      loading="eager"
    />
  );
}
