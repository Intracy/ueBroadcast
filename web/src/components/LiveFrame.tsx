import { memo } from 'react';
import type { FeedState } from '../../../shared/types';

/** Startzeit aus YouTube-Links („t=90“, „t=1m30s“) in Sekunden. */
function youtubeStart(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || !m[0]) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Video-ID aus allen üblichen YouTube-Links (watch, youtu.be, live, shorts, embed). */
function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  if (u.pathname === '/watch') return u.searchParams.get('v');
  const m = /^\/(?:live|shorts|embed)\/([\w-]{6,})/.exec(u.pathname);
  return m ? m[1] : null;
}

/**
 * Vorschau-Adresse für die Regie aufbereiten.
 * - VDO.Ninja: ohne Ton, ohne Bedienelemente, mit begrenzter Bitrate (schont den Upload des Runners)
 * - YouTube/Twitch: Seiten-Links lassen sich nicht einbetten – stattdessen den Player, stumm mit Autoplay
 * - MediaMTX-WebRTC-Seite: ohne Bedienelemente, stumm, Autoplay
 */
export function previewSrc(url: string, bitrateKbps = 1200, scalePct = 50, parentHost = 'localhost'): string {
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
  const yt = youtubeId(u);
  if (yt) {
    const embed = new URL(`https://www.youtube.com/embed/${encodeURIComponent(yt)}`);
    for (const [k, v] of [
      ['autoplay', '1'],
      ['mute', '1'],
      ['controls', '0'],
      ['playsinline', '1'],
      ['rel', '0'],
      ['iv_load_policy', '3'],
      ['disablekb', '1'],
    ]) {
      embed.searchParams.set(k, v);
    }
    const start = youtubeStart(u.searchParams.get('t') ?? u.searchParams.get('start'));
    if (start) embed.searchParams.set('start', String(start));
    return embed.toString();
  }
  const twitchHost = u.hostname.replace(/^(www|m)\./, '');
  if (twitchHost === 'twitch.tv' || twitchHost === 'player.twitch.tv') {
    const player = new URL('https://player.twitch.tv/');
    if (twitchHost === 'player.twitch.tv') {
      for (const k of ['channel', 'video']) {
        const v = u.searchParams.get(k);
        if (v) player.searchParams.set(k, v);
      }
    } else {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'videos' && parts[1]) player.searchParams.set('video', parts[1]);
      else if (parts[0]) player.searchParams.set('channel', parts[0]);
    }
    if (player.searchParams.has('channel') || player.searchParams.has('video')) {
      // Twitch bettet nur ein, wenn die einbettende Seite als „parent“ genannt ist
      player.searchParams.set('parent', parentHost);
      player.searchParams.set('muted', 'true');
      player.searchParams.set('autoplay', 'true');
      player.searchParams.set('controls', 'false');
      return player.toString();
    }
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
  if (!feed?.previewUrl) return false;
  // Simulation: hinterlegte Browser-Links (VDO.Ninja, YouTube, Twitch …) trotzdem zeigen – nur ein simulierter
  // Ausfall blendet das Bild aus. Ingest-Feeds (MediaMTX) werden in der Simulation nicht überwacht.
  if (simulation) return feed.sourceKind === 'browser' && feed.status !== 'offline';
  if (feed.status === 'live') return true;
  // Browser-Links (VDO.Ninja) lassen sich nicht von außen prüfen – Bild zeigen, solange nichts dagegen spricht
  return feed.sourceKind === 'browser' && feed.status !== 'offline';
}

/**
 * Live-Bild eines Feeds als eingebettete Seite (VDO.Ninja, MediaMTX-WebRTC …).
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
      src={previewSrc(url, bitrateKbps, scalePct, location.hostname)}
      title={`Live-Bild ${label}`}
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      tabIndex={-1}
      loading="eager"
    />
  );
});
