import { useEffect, useState } from 'react';
import type { ObsStatus, ProductionState } from '../../../shared/types';
import type { Corner, HostMode, HostPlacement } from '../../../shared/host';
import { CORNER_LABEL, hostOf } from '../../../shared/host';
import { send } from '../api';
import { CamVideo, startCam, stopCam, useCommentaryCam } from './CommentaryCam';
import { formatUi } from '../formats';

// ------------------------------------------------------------------ Bedienleiste

const MODES: Array<{ mode: HostMode; label: string; key: string }> = [
  { mode: 'off', label: 'Aus', key: '' },
  { mode: 'pip', label: 'Overlay', key: 'O' },
  { mode: 'full', label: 'Vollbild', key: 'K' },
];

const CORNER_ICON: Record<Corner, string> = { tl: '↖', tr: '↗', bl: '↙', br: '↘' };

export function CommentaryBar({ production }: { production: ProductionState; obs?: ObsStatus }) {
  const c = production.commentary;
  const hasBoard = !!formatUi(production.format).boardData;
  const cam = useCommentaryCam(!!c);
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
      <div className="commentary-thumb" title={`Live-Bild der Kommentar-Kamera (OBS-Szene „${c.obsScene}“)`}>
        {cam.stream ? (
          <CamVideo stream={cam.stream} label={c.label} />
        ) : (
          <button className="btn small" onClick={() => void startCam()} disabled={cam.starting}>
            {cam.starting ? 'Kamera startet …' : 'Kamera verbinden'}
          </button>
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
          <span className="muted small label">Kamera</span>
          {cam.devices.length > 0 ? (
            <select
              className="cam-select"
              value={cam.deviceId ?? ''}
              onChange={(e) => void (e.target.value ? startCam(e.target.value) : stopCam())}
              aria-label="Kamera für das Live-Bild der Kommentatoren"
            >
              <option value="">– aus –</option>
              {cam.devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="muted small">
              Live-Bild direkt von der Kamera an diesem Rechner (z. B. Cam Link) – „Kamera verbinden“
            </span>
          )}
          {cam.error && <span className="pill bad">{cam.error}</span>}
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
