import { memo, useEffect, useRef, useSyncExternalStore } from 'react';

// Live-Bild der Kommentar-Szene aus OBS. OBS gibt die Szene über seine virtuelle Kamera aus
// (Virtuelle Kamera → Ausgabetyp „Szene“ → Kommentar-Szene; ueBroadcast startet sie automatisch).
// Die Regie liest nur dieses Gerät – keine Webcam, keine Standbilder. Ein Stream für die ganze Seite,
// alle Anzeigen hängen sich daran.

/** Name, unter dem die virtuelle Kamera von OBS im System erscheint. */
const OBS_CAM = /obs.*virtual|virtual.*obs|obs[- ]camera/i;

export interface CamState {
  stream: MediaStream | null;
  error: string | null;
  starting: boolean;
}

let state: CamState = { stream: null, error: null, starting: false };
const listeners = new Set<() => void>();
let autoTried = false;

function set(patch: Partial<CamState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const constraints = (deviceId?: string): MediaStreamConstraints => ({
  audio: false,
  video: {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
});

async function findObsCam(): Promise<string | null> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.find((d) => d.kind === 'videoinput' && OBS_CAM.test(d.label))?.deviceId ?? null;
}

/** Verbindet das Live-Bild der Kommentar-Szene (virtuelle Kamera von OBS). */
export async function startCam(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    set({ error: 'Dieser Browser erlaubt hier keinen Videozugriff (nur über localhost oder https).' });
    return;
  }
  if (state.starting) return;
  set({ starting: true, error: null });
  try {
    // Gerätenamen gibt der Browser erst nach der Freigabe heraus – dann gezielt die OBS-Kamera öffnen
    let id = await findObsCam();
    if (!id) {
      const probe = await navigator.mediaDevices.getUserMedia(constraints());
      probe.getTracks().forEach((t) => t.stop());
      id = await findObsCam();
    }
    if (!id) {
      set({
        starting: false,
        error: 'Virtuelle Kamera von OBS nicht gefunden – in OBS „Virtuelle Kamera starten“',
      });
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints(id));
    state.stream?.getTracks().forEach((t) => t.stop());
    // Endet die virtuelle Kamera (OBS beendet), Anzeige zurücksetzen
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (state.stream === stream) set({ stream: null, error: 'Virtuelle Kamera von OBS beendet' });
    });
    set({ stream, starting: false });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    set({
      starting: false,
      error:
        name === 'NotAllowedError'
          ? 'Videozugriff im Browser nicht erlaubt'
          : name === 'NotReadableError'
            ? 'Virtuelle Kamera von OBS ist belegt'
            : 'Live-Bild aus OBS konnte nicht verbunden werden',
    });
  }
}

/**
 * Zustand des Kommentar-Bilds. Verbindet automatisch, sobald der Browser den Videozugriff schon
 * erlaubt hat und OBS die virtuelle Kamera meldet.
 */
export function useCommentaryCam(enabled: boolean, obsVirtualCam = true): CamState {
  useEffect(() => {
    if (!enabled || !obsVirtualCam || state.stream || state.starting) return;
    if (autoTried && state.error) return;
    autoTried = true;
    const perms = navigator.permissions?.query({ name: 'camera' as PermissionName });
    void (perms ?? Promise.reject())
      .then((p) => {
        if (p.state === 'granted') void startCam();
      })
      .catch(() => undefined);
  }, [enabled, obsVirtualCam]);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/** Video-Element am gemeinsamen Stream. */
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
  return <video ref={ref} className="cam-video" autoPlay muted playsInline aria-label={`Live-Bild ${label}`} />;
});
