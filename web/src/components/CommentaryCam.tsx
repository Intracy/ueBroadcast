import { memo, useEffect, useRef, useSyncExternalStore } from 'react';

// Live-Bild der Kommentar-Kamera direkt von der Kamera (z. B. Cam Link) am Regie-Rechner.
// Ein einziger Kamera-Stream für die ganze Seite; alle Anzeigen hängen sich an denselben Stream.
// Die Auswahl gilt pro Browser (sie hängt am Rechner, an dem die Kamera steckt).

const KEY = 'ueb.commentaryCam';

export interface CamState {
  stream: MediaStream | null;
  deviceId: string | null;
  devices: Array<{ deviceId: string; label: string }>;
  error: string | null;
  starting: boolean;
}

let state: CamState = { stream: null, deviceId: loadDevice(), devices: [], error: null, starting: false };
const listeners = new Set<() => void>();
let autoTried = false;

function loadDevice(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function saveDevice(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* Speicher nicht verfügbar – gilt dann nur bis zum Neuladen */
  }
}

function set(patch: Partial<CamState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

/** Bevorzugte Geräte für die Kommentar-Kamera (Capture-Karten). */
const PREFERRED = /cam ?link|elgato|capture|hdmi|uvc/i;

async function listDevices(): Promise<CamState['devices']> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Kamera ${i + 1}` }));
}

function stopTracks() {
  state.stream?.getTracks().forEach((t) => t.stop());
}

/** Startet die Kamera (ohne Gerät: gespeichertes, sonst Capture-Karte, sonst erste Kamera). */
export async function startCam(deviceId?: string | null): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    set({ error: 'Dieser Browser erlaubt hier keinen Kamerazugriff (nur über localhost oder https).' });
    return;
  }
  set({ starting: true, error: null });
  const wanted = deviceId ?? state.deviceId;
  const constraints = (id: string | null): MediaStreamConstraints => ({
    audio: false,
    video: {
      ...(id ? { deviceId: { exact: id } } : {}),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  });
  try {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints(wanted));
    } catch (err) {
      // Gespeicherte Kamera nicht mehr da → irgendeine nehmen und unten neu wählen
      if (!wanted) throw err;
      stream = await navigator.mediaDevices.getUserMedia(constraints(null));
    }
    const devices = await listDevices();
    let active = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
    // Erste Einrichtung: Capture-Karte (Cam Link …) bevorzugen, falls nicht schon gewählt
    if (!wanted) {
      const preferred = devices.find((d) => PREFERRED.test(d.label));
      if (preferred && preferred.deviceId !== active) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await navigator.mediaDevices.getUserMedia(constraints(preferred.deviceId));
        active = preferred.deviceId;
      }
    }
    stopTracks();
    saveDevice(active);
    set({ stream, deviceId: active, devices, starting: false });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    set({
      starting: false,
      error:
        name === 'NotAllowedError'
          ? 'Kamerazugriff im Browser nicht erlaubt'
          : name === 'NotReadableError'
            ? 'Kamera ist belegt oder nicht lesbar'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'Keine Kamera gefunden'
              : 'Kamera konnte nicht gestartet werden',
    });
  }
}

export function stopCam(): void {
  stopTracks();
  saveDevice(null);
  set({ stream: null, deviceId: null });
}

/** Kamera-Zustand; startet die zuletzt gewählte Kamera automatisch, wenn der Browser es schon erlaubt hat. */
export function useCommentaryCam(enabled: boolean): CamState {
  useEffect(() => {
    if (!enabled || autoTried || state.stream || !state.deviceId) return;
    autoTried = true;
    const perms = navigator.permissions?.query({ name: 'camera' as PermissionName });
    void (perms ?? Promise.reject())
      .then((p) => {
        if (p.state === 'granted') void startCam(state.deviceId);
      })
      .catch(() => undefined);
  }, [enabled]);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/** Video-Element am gemeinsamen Kamera-Stream. */
export const CamVideo = memo(function CamVideo({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    void v.play().catch(() => undefined);
    return () => {
      v.srcObject = null;
    };
  }, [stream]);
  return <video ref={ref} className="cam-video" autoPlay muted playsInline aria-label={`Kamera ${label}`} />;
});
