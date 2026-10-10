import { useEffect, useState } from 'react';
import type { ObsStatus, ProductionState } from '../../../shared/types';
import type { Corner, HostMode, HostPlacement } from '../../../shared/host';
import { CORNER_LABEL, hostOf } from '../../../shared/host';
import { send } from '../api';
import { CamVideo, startCam, useCommentaryCam } from './CommentaryCam';
import { formatUi } from '../formats';

// ------------------------------------------------------------------ Bedienleiste

const MODES: Array<{ mode: HostMode; label: string; key: string }> = [
  { mode: 'off', label: 'Aus', key: '' },
  { mode: 'pip', label: 'Overlay', key: 'O' },
  { mode: 'full', label: 'Vollbild', key: 'K' },
];

const CORNER_ICON: Record<Corner, string> = { tl: '↖', tr: '↗', bl: '↙', br: '↘' };

export function CommentaryBar({ production, obs }: { production: ProductionState; obs?: ObsStatus }) {
  const c = production.commentary;
  const hasBoard = !!formatUi(production.format).boardData;
  const obsLive = obs?.mode === 'obs' && obs.connected;
  const cam = useCommentaryCam(!!c, !obsLive || !!obs?.virtualCam);
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
      <div className="commentary-thumb" title={`Live-Bild der OBS-Szene „${c.obsScene}“`}>
        {cam.stream ? (
          <CamVideo stream={cam.stream} label={c.label} />
        ) : (
          <button className="btn small" onClick={() => void startCam()} disabled={cam.starting}>
            {cam.starting ? 'Verbinde …' : 'OBS-Bild verbinden'}
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
          <span className="muted small label">Bild</span>
          <span className="muted small">Live aus der OBS-Szene „{c.obsScene}“ (virtuelle Kamera von OBS)</span>
          {obsLive && !obs?.virtualCam && <span className="pill warn">Virtuelle Kamera in OBS aus</span>}
          {cam.stream && <span className="pill good">live</span>}
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
