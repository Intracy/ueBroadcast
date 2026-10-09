import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ObsStatus, ProductionState } from '../../../shared/types';
import type { Corner, HostMode, HostPlacement } from '../../../shared/host';
import { CORNER_LABEL, hostOf } from '../../../shared/host';
import { send } from '../api';
import { formatUi } from '../formats';

// ------------------------------------------------------------------ Standbild der Kommentar-Szene aus OBS

let snapshotUrl: string | null = null;
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let loading = false;
const listeners = new Set<() => void>();

function poll() {
  // Tab im Hintergrund: OBS nicht unnötig beschäftigen
  if (loading || document.hidden) return;
  loading = true;
  const img = new Image();
  const url = `/api/obs/screenshot?width=320&t=${Date.now()}`;
  img.onload = () => {
    loading = false;
    if (img.naturalWidth > 0) {
      snapshotUrl = url;
      for (const l of listeners) l();
    }
  };
  img.onerror = () => {
    loading = false;
    if (snapshotUrl !== null) {
      snapshotUrl = null;
      for (const l of listeners) l();
    }
  };
  img.src = url;
}

/** Vorschaubild der Kommentar-Szene, alle 2 Sekunden aus OBS geholt (alle Anzeigen teilen sich die Abfrage). */
export function useCommentarySnapshot(enabled: boolean): string | null {
  useEffect(() => {
    if (!enabled) return;
    subscribers += 1;
    if (!timer) {
      poll();
      timer = setInterval(poll, 2000);
    }
    return () => {
      subscribers -= 1;
      if (subscribers === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, [enabled]);
  const url = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshotUrl,
  );
  return enabled ? url : null;
}

/** Ob ein OBS-Standbild möglich ist (verbunden und eingerichtet). */
export function snapshotPossible(obs: ObsStatus, production: ProductionState): boolean {
  return !!production.commentary && obs.mode === 'obs' && obs.connected;
}

// ------------------------------------------------------------------ Bedienleiste

const MODES: Array<{ mode: HostMode; label: string; key: string }> = [
  { mode: 'off', label: 'Aus', key: '' },
  { mode: 'pip', label: 'Overlay', key: 'O' },
  { mode: 'full', label: 'Vollbild', key: 'K' },
];

const CORNER_ICON: Record<Corner, string> = { tl: '↖', tr: '↗', bl: '↙', br: '↘' };

export function CommentaryBar({ production, obs }: { production: ProductionState; obs: ObsStatus }) {
  const c = production.commentary;
  const hasBoard = !!formatUi(production.format).boardData;
  const snapshot = useCommentarySnapshot(!!c && snapshotPossible(obs, production));
  const preview = hostOf(production.preview);
  const program = hostOf(production.program);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [program.mode, program.corner]);

  if (!c) {
    return (
      <section className="commentary-bar empty">
        <strong>Kommentar</strong>
        <span className="muted small">
          Noch keine Kommentar-Szene eingerichtet –{' '}
          <a href="#/einstellungen/produktion">in den Einstellungen die OBS-Szene der Kommentatoren eintragen</a>.
        </span>
      </section>
    );
  }

  const setPreview = (patch: Partial<HostPlacement>) => send('preview.host', patch);
  const onAir = program.mode !== 'off';

  return (
    <section className={`commentary-bar ${onAir ? 'on-air' : ''} ${flash ? 'flash' : ''}`} aria-label="Kommentar">
      <div className="commentary-thumb" title={`OBS-Szene „${c.obsScene}“`}>
        {snapshot ? (
          <img src={snapshot} alt={`Kamera ${c.label}`} />
        ) : (
          <span className="muted small">
            {obs.mode === 'obs' && obs.connected ? 'Kein Bild von OBS' : 'Bild kommt aus OBS'}
          </span>
        )}
        {onAir && <span className="onair-badge">{program.mode === 'full' ? 'VOLLBILD' : 'OVERLAY'}</span>}
      </div>

      <div className="commentary-main">
        <div className="commentary-title">
          <strong>{c.label}</strong>
          <span className="muted small">
            Programm:{' '}
            {program.mode === 'off'
              ? 'aus'
              : program.mode === 'full'
                ? 'Vollbild'
                : `Overlay ${CORNER_LABEL[program.corner]}`}
          </span>
        </div>

        <div className="commentary-row">
          <span className="muted small label">Vorschau</span>
          <div className="segmented" role="radiogroup" aria-label="Kommentar in der Vorschau">
            {MODES.map((m) => (
              <button
                key={m.mode}
                role="radio"
                aria-checked={preview.mode === m.mode}
                className={preview.mode === m.mode ? 'active' : ''}
                onClick={() => setPreview({ mode: m.mode })}
                title={m.key ? `Taste ${m.key}` : undefined}
              >
                {m.key && <kbd>{m.key}</kbd>}
                {m.label}
              </button>
            ))}
          </div>
          <div className="corners" role="radiogroup" aria-label="Ecke des Overlays">
            {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((corner) => (
              <button
                key={corner}
                role="radio"
                aria-checked={preview.corner === corner}
                className={preview.corner === corner ? 'active' : ''}
                disabled={preview.mode !== 'pip'}
                onClick={() => setPreview({ corner })}
                title={`Overlay ${CORNER_LABEL[corner]}`}
              >
                {CORNER_ICON[corner]}
              </button>
            ))}
          </div>
        </div>

        <div className="commentary-row">
          <span className="muted small label">Sofort</span>
          <button
            className={`btn small ${program.mode === 'full' ? 'live' : ''}`}
            onClick={() => send('host.take', { mode: program.mode === 'full' ? 'off' : 'full' })}
          >
            {program.mode === 'full' ? 'Zurück zu den Runnern' : 'Kommentar im Vollbild'}
          </button>
          <button
            className={`btn small ${program.mode === 'pip' ? 'live' : ''}`}
            onClick={() => send('host.take', { mode: program.mode === 'pip' ? 'off' : 'pip', corner: preview.corner })}
          >
            {program.mode === 'pip' ? 'Overlay ausblenden' : 'Overlay einblenden'}
          </button>
          {hasBoard && (
            <label className="inline-check" title="Tabelle als Lower Third, solange der Kommentar im Vollbild ist">
              <input
                type="checkbox"
                checked={production.graphics.hostBoard}
                onChange={(e) => send('graphics', { patch: { hostBoard: e.target.checked } })}
              />
              Tabelle als Lower Third im Vollbild
            </label>
          )}
        </div>
      </div>
    </section>
  );
}
