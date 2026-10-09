import type { MulticamState } from '../../../../shared/multicam';
import { formatDuration } from '../../../../shared/format';
import { send } from '../../api';
import type { FormatPanelProps } from '..';

export function MulticamPanel({ production, now, offset }: FormatPanelProps) {
  const s = production.formatState as MulticamState;
  const started = s.segmentStartedAt !== null;
  const elapsed = started ? now + offset - (s.segmentStartedAt as number) : null;
  const current = s.segments[s.current];
  const over = current?.durationMin && elapsed !== null && elapsed > current.durationMin * 60_000;
  return (
    <div className="rundown">
      <div className="row">
        <button className="btn" onClick={() => send('format.rundown.prev')} disabled={!started || s.current === 0}>
          ← Zurück
        </button>
        <button
          className="btn primary"
          onClick={() => send('format.rundown.next')}
          disabled={started && s.current >= s.segments.length - 1}
        >
          {started ? 'Nächstes Segment →' : 'Ablauf starten'}
        </button>
        {started && current && (
          <span className={`pill ${over ? 'bad' : 'good'}`}>
            {current.title}: {formatDuration(elapsed)}
            {current.durationMin ? ` / ${current.durationMin} min` : ''}
          </span>
        )}
      </div>
      {s.segments.length === 0 && (
        <p className="muted">Kein Ablaufplan in der Produktions-Konfiguration (formatConfig.rundown).</p>
      )}
      <ol className="segments">
        {s.segments.map((seg, i) => (
          <li key={i} className={started && i === s.current ? 'current' : started && i < s.current ? 'done' : ''}>
            <button className="link" onClick={() => send('format.rundown.goto', { index: i })}>
              {seg.title}
            </button>
            {seg.durationMin && <span className="muted small">{seg.durationMin} min</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
