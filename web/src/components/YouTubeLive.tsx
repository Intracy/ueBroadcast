import { memo, useEffect, useRef, useState } from 'react';

// Minimaler Ausschnitt der YouTube-IFrame-API, den die Regie braucht.
interface YtPlayer {
  mute(): void;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getPlayerState(): number;
  destroy(): void;
}

interface YtNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number | undefined>;
      events?: {
        onReady?: (e: { target: YtPlayer }) => void;
        onStateChange?: (e: { target: YtPlayer; data: number }) => void;
        onError?: (e: { target: YtPlayer; data: number }) => void;
      };
    },
  ) => YtPlayer;
}

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Player-Zustände laut IFrame-API
const UNSTARTED = -1;
const ENDED = 0;
const PAUSED = 2;
const CUED = 5;

let apiPromise: Promise<YtNamespace> | null = null;

/** Lädt die offizielle YouTube-IFrame-API einmal pro Seite. */
function loadApi(): Promise<YtNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('YouTube nicht erreichbar'));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

const players = new Set<YtPlayer>();

function kick(p: YtPlayer) {
  try {
    p.mute();
    p.playVideo();
  } catch {
    /* Player noch nicht bereit */
  }
}

// Falls der Browser das automatische Abspielen verweigert: Die erste Bedienung in der Regie startet alle Player.
let gestureHooked = false;
function hookGesture() {
  if (gestureHooked) return;
  gestureHooked = true;
  const start = () => players.forEach(kick);
  document.addEventListener('pointerdown', start, { capture: true });
  document.addEventListener('keydown', start, { capture: true });
}

const ERRORS: Record<number, string> = {
  2: 'Ungültiger YouTube-Link',
  5: 'YouTube-Player-Fehler',
  100: 'Video nicht gefunden oder privat',
  101: 'Kanal erlaubt kein Einbetten',
  150: 'Kanal erlaubt kein Einbetten',
  153: 'YouTube verlangt eine einbettende Seite',
};

/**
 * YouTube-Live-Bild über die offizielle IFrame-API: stumm, ohne Bedienelemente, startet selbst,
 * wird nach Pausen/Ende wieder angestoßen (Endlosschleife bei Videos).
 */
export const YouTubeLive = memo(function YouTubeLive({
  videoId,
  start,
  label,
}: {
  videoId: string;
  start: number | null;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    hookGesture();
    let cancelled = false;
    let player: YtPlayer | null = null;
    let watchdog: ReturnType<typeof setInterval> | undefined;
    setError(null);
    setWaiting(true);
    loadApi()
      .then((YT) => {
        if (cancelled || !host.current) return;
        const el = document.createElement('div');
        host.current.replaceChildren(el);
        player = new YT.Player(el, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            disablekb: 1,
            fs: 0,
            start: start ?? undefined,
            origin: location.origin,
          },
          events: {
            onReady: (e) => {
              players.add(e.target);
              kick(e.target);
            },
            onStateChange: (e) => {
              if (e.data === 1 || e.data === 3) setWaiting(false);
              if (e.data === ENDED) {
                // Endlosschleife von vorn (eine Startzeit hinter dem Videoende würde sonst sofort wieder enden)
                e.target.seekTo(0, true);
                kick(e.target);
              }
            },
            onError: (e) => setError(ERRORS[e.data] ?? `YouTube-Fehler ${e.data}`),
          },
        });
        // Bleibt ein Player stehen (Autoplay verweigert, Pause, Ende), wieder anstoßen
        watchdog = setInterval(() => {
          if (!player || document.hidden) return;
          let state: number;
          try {
            state = player.getPlayerState();
          } catch {
            return;
          }
          if (state === UNSTARTED || state === PAUSED || state === CUED || state === ENDED) kick(player);
        }, 4000);
      })
      .catch((err: Error) => setError(err.message));
    return () => {
      cancelled = true;
      if (watchdog) clearInterval(watchdog);
      if (player) {
        players.delete(player);
        try {
          player.destroy();
        } catch {
          /* bereits entfernt */
        }
      }
      host.current?.replaceChildren();
    };
  }, [videoId, start]);

  return (
    <div className="live-frame yt-live" title={`Live-Bild ${label}`}>
      <div ref={host} className="yt-host" />
      {error ? (
        <span className="live-note">{error}</span>
      ) : (
        waiting && <span className="live-note subtle">Video startet …</span>
      )}
    </div>
  );
});
