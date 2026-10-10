import { useState } from 'react';
import type { Sm64Runner, Sm64Scoring, Sm64State } from '../../../../shared/sm64';
import { formatDelta, formatDuration, parseDuration, timerValue } from '../../../../shared/format';
import { send } from '../../api';
import { DeltaText } from '../../components/bits';
import type { FormatPanelProps } from '..';
import type { ProductionState } from '../../../../shared/types';
import type { BoardColumn, BoardData, BoardRow } from '../board';
import { progressLabel } from '../../../../shared/sm64Categories';

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
        {s.category && (
          <span className="pill" title="Kategorie – in den Einstellungen änderbar">
            {s.category.label}
          </span>
        )}
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
              <RunnerRow
                key={r.feedId}
                r={r}
                goal={s.goalStars}
                splitCount={s.splits.length}
                now={now}
                offset={offset}
              />
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

function RunnerRow({
  r,
  goal,
  splitCount,
  now,
  offset,
}: {
  r: Sm64Runner;
  goal: number;
  splitCount: number;
  now: number;
  offset: number;
}) {
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
      <td className="num">{progressLabel(r.stars, r.splitIndex, goal, splitCount).replace(' ★', '')}</td>
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

/** Tabellendaten für Band, Vollbild-Grafik und Lower Third. */
export function sm64BoardData(production: ProductionState, now: number, offset: number): BoardData | null {
  const s = production.formatState as Sm64State | null;
  if (!s?.leaderboard?.length) return null;
  const runners = new Map(s.runners.map((r) => [r.feedId, r]));
  const columns: BoardColumn[] = [
    { key: 'status', label: 'Status' },
    { key: 'split', label: 'Aktueller Split' },
    { key: 'stars', label: s.goalStars >= 16 ? 'Sterne' : 'Fortschritt', numeric: true },
    { key: 'time', label: 'Zeit', numeric: true },
    { key: 'delta', label: 'Δ PB', numeric: true },
    { key: 'pb', label: 'PB', numeric: true },
  ];
  // Spalte weglassen, die schon als Wertung vorne steht
  if (s.scoring !== 'bestTime') columns.push({ key: 'best', label: 'Event-Best', numeric: true });
  if (s.scoring !== 'finishedRuns') columns.push({ key: 'runs', label: 'Runs', numeric: true });
  columns.push({ key: 'resets', label: 'Resets', numeric: true });
  if (s.scoring !== 'totalStars') columns.push({ key: 'total', label: '★ gesamt', numeric: true });

  const rows: BoardRow[] = s.leaderboard.map((row) => {
    const r = runners.get(row.feedId);
    const active = !!r && (r.phase === 'running' || r.phase === 'paused');
    const time = r && r.phase !== 'idle' && r.phase !== 'reset' ? timerValue(runnerTimer(r), now, offset) : null;
    const detail = !r
      ? ''
      : active
        ? `${progressLabel(r.stars, r.splitIndex, s.goalStars, s.splits.length)} · ${formatDuration(time)}`
        : r.phase === 'finished'
          ? `Ziel ${formatDuration(r.lastFinishMs, true)}`
          : PHASE_LABEL[r.phase];
    return {
      feedId: row.feedId,
      rank: row.rank,
      name: row.name,
      value: row.value,
      detail,
      active,
      cells: {
        status: { text: r ? PHASE_LABEL[r.phase] : '–', tone: active ? 'good' : 'muted' },
        split: { text: active && r?.splitName ? r.splitName : '–', tone: active ? undefined : 'muted' },
        stars: {
          text: r ? progressLabel(r.stars, r.splitIndex, s.goalStars, s.splits.length).replace(' ★', '') : '–',
          tone: 'accent',
        },
        time: { text: formatDuration(time) },
        delta: {
          text: active && r?.deltaMs != null ? formatDelta(r.deltaMs) : '–',
          tone: active && r?.deltaMs != null ? (r.deltaMs < 0 ? 'good' : 'bad') : 'muted',
        },
        pb: { text: formatDuration(r?.pbMs ?? null) },
        best: { text: formatDuration(row.bestEventMs, true) },
        runs: { text: String(row.finishedRuns) },
        resets: { text: String(r?.resets ?? 0) },
        total: { text: `${row.totalStars} ★` },
      },
    };
  });

  return {
    title: 'Tabelle',
    badge: s.category?.label,
    valueLabel: SCORING_LABEL[s.scoring],
    columns,
    rows,
    footer: s.eventBest ? `Event-Bestzeit · ${s.eventBest.name} · ${formatDuration(s.eventBest.ms, true)}` : undefined,
  };
}
