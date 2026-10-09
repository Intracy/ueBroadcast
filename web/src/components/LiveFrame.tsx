import { memo, useEffect, useRef, useState } from 'react';
import type { FeedState } from '../../../shared/types';
import { playerUrl } from '../../../shared/streamUrl';

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

/** YouTube-Player per postMessage anstoßen: stumm schalten und abspielen. */
function nudgeYouTube(frame: HTMLIFrameElement | null) {
  const win = frame?.contentWindow;
  if (!win) return;
  for (const func of ['mute', 'playVideo']) {
    win.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube.com');
  }
}

/**
 * Live-Bild eines Feeds als eingebettete Seite (VDO.Ninja, YouTube, Twitch, MediaMTX-WebRTC …).
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
  const ref = useRef<HTMLIFrameElement>(null);
  const src = previewSrc(url, bitrateKbps, scalePct, location.hostname, location.origin);
  const youtube = src.startsWith('https://www.youtube.com/embed/');

  // Autoplay greift bei vielen kleinen YouTube-Playern nicht zuverlässig: nach dem Laden und danach
  // regelmäßig „stumm + abspielen“ schicken, damit kein Player auf dem Startbild stehen bleibt.
  useEffect(() => {
    if (!youtube) return;
    const timers = [800, 2500, 6000].map((ms) => setTimeout(() => nudgeYouTube(ref.current), ms));
    const interval = setInterval(() => nudgeYouTube(ref.current), 15000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, [src, youtube]);

  return (
    <iframe
      ref={ref}
      className="live-frame"
      src={src}
      title={`Live-Bild ${label}`}
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      tabIndex={-1}
      loading="eager"
      onLoad={youtube ? () => nudgeYouTube(ref.current) : undefined}
    />
  );
});

/** VDO.Ninja-Links sind für die Einbettung gebaut und laufen mit geringster Verzögerung direkt. */
export function isNinjaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)(vdo|obs)\.ninja$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export type LiveMode = 'embed' | 'obs' | null;

/**
 * Wie die Regie das Live-Bild eines Feeds zeigt:
 * - `embed`: Link direkt einbetten (VDO.Ninja immer; andere Links, wenn OBS nicht verbunden ist)
 * - `obs`: das Bild, das OBS von der Quelle rendert – zuverlässig für YouTube, Twitch & Co., die
 *   eingebettet oft nicht oder nur auf Klick abspielen, und ohne zusätzliche Last bei den Runnern
 */
export function liveMode(feed: FeedState | undefined, simulation: boolean, obsFrames: boolean): LiveMode {
  if (!feed || !canShowLive(feed, simulation)) return null;
  if (isNinjaUrl(feed.previewUrl)) return 'embed';
  if (obsFrames && feed.sourceKind !== 'none') return 'obs';
  return 'embed';
}

/**
 * Laufendes Vorschaubild aus OBS: holt nacheinander Einzelbilder (~4 pro Sekunde), solange die Seite
 * sichtbar ist. Der Server teilt die Bilder zwischen allen Anzeigen.
 */
export const ObsFrame = memo(function ObsFrame({ feedId, width }: { feedId: string; width: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: string | null = null;
    const schedule = (ms: number) => {
      if (!stopped) timer = setTimeout(next, ms);
    };
    const next = async () => {
      if (stopped) return;
      if (document.hidden) return schedule(1000);
      const started = performance.now();
      try {
        const res = await fetch(`/api/feeds/${encodeURIComponent(feedId)}/frame?w=${width}`, { cache: 'no-store' });
        if (res.status !== 200) return schedule(2000);
        const blob = await res.blob();
        if (stopped) return;
        const url = URL.createObjectURL(blob);
        setSrc(url);
        // Vorheriges Bild erst freigeben, wenn das neue gesetzt ist
        if (current) {
          const old = current;
          setTimeout(() => URL.revokeObjectURL(old), 1000);
        }
        current = url;
        schedule(Math.max(0, 250 - (performance.now() - started)));
      } catch {
        schedule(2000);
      }
    };
    void next();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (current) URL.revokeObjectURL(current);
    };
  }, [feedId, width]);
  return src ? (
    <img className="live-frame obs-frame" src={src} alt="" draggable={false} />
  ) : (
    <div className="live-frame obs-frame loading" />
  );
});

/** Live-Bild eines Feeds im passenden Modus (eingebettet oder aus OBS). */
export function LiveFeed({
  feed,
  mode,
  width,
  bitrateKbps,
  scalePct,
}: {
  feed: FeedState;
  mode: Exclude<LiveMode, null>;
  width: number;
  bitrateKbps?: number;
  scalePct?: number;
}) {
  if (mode === 'obs') return <ObsFrame feedId={feed.id} width={width} />;
  return <LiveFrame url={feed.previewUrl!} label={feed.label} bitrateKbps={bitrateKbps} scalePct={scalePct} />;
}
