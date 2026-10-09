import { useState } from 'react';
import type { Sm64Runner, Sm64Scoring, Sm64State } from '../../../../shared/sm64';
import { formatDuration, parseDuration, timerValue } from '../../../../shared/format';
import { send } from '../../api';
import { DeltaText } from '../../components/bits';
import type { FormatPanelProps } from '..';

const SCORING_LABEL: Record<Sm64Scoring, string> = {
  bestTime: 'Beste Zeit',
  finishedRuns: 'Beendete Runs',
  totalStars: 'Gesammelte Sterne',
};

const PHASE_LABEL: Record<Sm64Runner['phase'], string> = {
  idle: 'wartet',
  running: 'läuft',
  paused: 'Pause',
  finished: 'im Ziel',
  reset: 'Reset',
};

export function sm64TileDetail(formatState: unknown, feedId: string): string | null {
  const s = formatState as Sm64State;
  const r = s?.runners?.find((x) => x.feedId === feedId);
  if (!r) return null;
  if (r.phase === 'running' || r.phase === 'paused') return r.splitName;
  if (r.phase === 'finished') return `Ziel ${formatDuration(r.lastFinishMs, true)}`;
  return PHASE_LABEL[r.phase];
}

function runnerTimer(r: Sm64Runner) {
  return { baseMs: r.currentMs, running: r.phase === 'running', at: r.at, rate: r.rate };
}

export function Sm64Panel({ production, now, offset }: FormatPanelProps) {
  const s = production.formatState as Sm64State;
  return (
    <div className="sm64">
      <div className="sm64-head">
        <label className="field inline">
          <span>Wertung</span>
          <select value={s.scoring} onChange={(e) => send('format.scoring', { mode: e.target.value })}>
            {Object.entries(SCORING_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {s.eventBest && (
          <span className="pill good">
            Event-Bestzeit: {s.eventBest.name} {formatDuration(s.eventBest.ms, true)}
          </span>
        )}
        <span className="muted small">Eventtag {s.day}</span>
        {s.simulationSpeed && <span className="pill warn">Simulation × {s.simulationSpeed}</span>}
      </div>
      <div className="sm64-grid">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Runner</th>
              <th>{SCORING_LABEL[s.scoring]}</th>
              <th title="Beendete Runs">Runs</th>
              <th title="Gesammelte Sterne">★</th>
            </tr>
          </thead>
          <tbody>
            {s.leaderboard.map((row) => (
              <tr key={row.feedId}>
                <td>{row.rank}</td>
                <td>{row.name}</td>
                <td className="num">{row.value}</td>
                <td className="num">{row.finishedRuns}</td>
                <td className="num">{row.totalStars}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="data runs">
          <thead>
            <tr>
              <th>Runner</th>
              <th>Status</th>
              <th>Split</th>
              <th>★</th>
              <th>Zeit</th>
              <th>Δ PB</th>
              <th>PB</th>
              <th>Steuerung</th>
            </tr>
          </thead>
          <tbody>
            {s.runners.map((r) => (
              <RunnerRow key={r.feedId} r={r} goal={s.goalStars} now={now} offset={offset} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Run-Daten kommen automatisch vom Split-Relay der Runner (LiveSplit). Die Knöpfe sind die manuelle Notlösung,
        falls ein Relay ausfällt.
      </p>
    </div>
  );
}

function RunnerRow({ r, goal, now, offset }: { r: Sm64Runner; goal: number; now: number; offset: number }) {
  const [editPb, setEditPb] = useState<string | null>(null);
  const active = r.phase === 'running' || r.phase === 'paused';
  const act = (a: string) => send(`format.run.${a}`, { feedId: r.feedId });
  const time = r.phase === 'idle' || r.phase === 'reset' ? null : timerValue(runnerTimer(r), now, offset);
  return (
    <tr className={`phase-${r.phase}`}>
      <td>
        <strong>{r.name}</strong>
        {r.source && (
          <small className="muted block">
            {r.source === 'relay' ? 'Relay' : r.source === 'manual' ? 'manuell' : 'Simulation'}
          </small>
        )}
      </td>
      <td>{PHASE_LABEL[r.phase]}</td>
      <td className="split">{active ? r.splitName : '–'}</td>
      <td className="num">
        {r.stars}/{goal}
      </td>
      <td className="num">{formatDuration(time)}</td>
      <td className="num">
        <DeltaText ms={r.deltaMs} />
      </td>
      <td className="num">
        {editPb === null ? (
          <button className="link" title="PB ändern" onClick={() => setEditPb(r.pbMs ? formatDuration(r.pbMs) : '')}>
            {formatDuration(r.pbMs)}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const ms = parseDuration(editPb);
              send('format.runner.pb', { feedId: r.feedId, pbMs: ms });
              setEditPb(null);
            }}
          >
            <input
              className="pb-input"
              autoFocus
              value={editPb}
              onChange={(e) => setEditPb(e.target.value)}
              onBlur={() => setEditPb(null)}
              placeholder="52:13"
            />
          </form>
        )}
      </td>
      <td className="controls">
        {!active ? (
          <button className="mini" onClick={() => act('start')}>
            Start
          </button>
        ) : (
          <>
            <button className="mini" onClick={() => act('split')}>
              Split
            </button>
            <button className="mini" onClick={() => act('undo')} disabled={r.splitIndex === 0}>
              ↶
            </button>
            <button className="mini" onClick={() => act('pause')}>
              {r.phase === 'paused' ? '▶' : '❚❚'}
            </button>
            <button className="mini" onClick={() => act('finish')}>
              Ziel
            </button>
            <button className="mini danger" onClick={() => act('reset')}>
              Reset
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

/** Tabelle für das Overlay (Pausen-Slate und eingeblendetes Leaderboard). */
export function Sm64Board({ production }: FormatPanelProps) {
  const s = production.formatState as Sm64State;
  return (
    <div className="ov-board">
      <div className="ov-board-head">
        <span>Tabelle</span>
        <small>{SCORING_LABEL[s.scoring]}</small>
      </div>
      <ol>
        {s.leaderboard.slice(0, 10).map((row) => (
          <li key={row.feedId}>
            <span className="rank">{row.rank}</span>
            <span className="name">{row.name}</span>
            <span className="value">{row.value}</span>
          </li>
        ))}
      </ol>
      {s.eventBest && (
        <div className="ov-board-foot">
          Event-Bestzeit · {s.eventBest.name} · {formatDuration(s.eventBest.ms, true)}
        </div>
      )}
    </div>
  );
}
