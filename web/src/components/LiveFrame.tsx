import { memo } from 'react';
import type { FeedState } from '../../../shared/types';
import { playerUrl, youtubeId, youtubeStart } from '../../../shared/streamUrl';
import { YouTubeLive } from './YouTubeLive';

/**
 * Vorschau-Adresse für die Regie aufbereiten.
 * - VDO.Ninja: ohne Ton, ohne Bedienelemente, mit begrenzter Bitrate (schont den Upload des Runners)
 * - YouTube/Twitch: Seiten-Links lassen sich nicht einbetten – stattdessen den Player, stumm mit Autoplay
 * - MediaMTX-WebRTC-Seite: ohne Bedienelemente, stumm, Autoplay
 */
export function previewSrc(
  url: string,
  bitrateKbps = 1200,
  scalePct = 50,
  parentHost = 'localhost',
  origin?: string,
): string {
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
    // Auflösung beim Empfang verkleinern: spart Rechenleistung im Browser und Upload beim Runner
    if (!has('scale')) u.searchParams.set('scale', String(scalePct));
    // VDO.Ninja erwartet Schalter ohne „=“
    return u.toString().replace(/=(?=&|$)/g, '');
  }
  const player = playerUrl(url, { muted: true, parentHost, origin });
  if (player) return player;
  if (!u.search) {
    u.searchParams.set('controls', 'false');
    u.searchParams.set('muted', 'true');
    u.searchParams.set('autoplay', 'true');
  }
  return u.toString();
}

/** Ob die Regie für diesen Feed ein Live-Bild zeigen kann. */
export function canShowLive(feed: FeedState | undefined, simulation: boolean): boolean {
  if (!feed?.previewUrl) return false;
  // Simulation: hinterlegte Browser-Links (VDO.Ninja, YouTube, Twitch …) trotzdem zeigen – nur ein simulierter
  // Ausfall blendet das Bild aus. Ingest-Feeds (MediaMTX) werden in der Simulation nicht überwacht.
  if (simulation) return feed.sourceKind === 'browser' && feed.status !== 'offline';
  if (feed.status === 'live') return true;
  // Browser-Links (VDO.Ninja) lassen sich nicht von außen prüfen – Bild zeigen, solange nichts dagegen spricht
  return feed.sourceKind === 'browser' && feed.status !== 'offline';
}

/**
 * Live-Bild eines Feeds als eingebettete Seite (VDO.Ninja, Twitch, MediaMTX-WebRTC …).
 * Memo: Die Regie zeichnet mehrmals pro Sekunde neu (Timer) – das Bild selbst darf davon nichts merken.
 */
export const LiveFrame = memo(function LiveFrame({
  url,
  label,
  bitrateKbps,
  scalePct,
}: {
  url: string;
  label: string;
  bitrateKbps?: number;
  scalePct?: number;
}) {
  return (
    <iframe
      className="live-frame"
      src={previewSrc(url, bitrateKbps, scalePct, location.hostname, location.origin)}
      title={`Live-Bild ${label}`}
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      tabIndex={-1}
      loading="eager"
    />
  );
});

/** YouTube-Video aus einem Link (für den Player über die offizielle IFrame-API). */
export function youtubeVideo(url: string | null | undefined): { id: string; start: number | null } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const id = youtubeId(u);
    return id ? { id, start: youtubeStart(u.searchParams.get('t') ?? u.searchParams.get('start')) } : null;
  } catch {
    return null;
  }
}

/** Das eingehende Live-Bild eines Feeds – immer der echte Stream, keine Standbilder. */
export function LiveFeed({
  feed,
  bitrateKbps,
  scalePct,
}: {
  feed: FeedState;
  bitrateKbps?: number;
  scalePct?: number;
}) {
  const yt = youtubeVideo(feed.previewUrl);
  if (yt) return <YouTubeLive videoId={yt.id} start={yt.start} label={feed.label} />;
  return <LiveFrame url={feed.previewUrl!} label={feed.label} bitrateKbps={bitrateKbps} scalePct={scalePct} />;
}
