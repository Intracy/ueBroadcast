import type { CSSProperties } from 'react';
import type { Rect } from '../../../shared/host';
import type { BoardData, BoardRow } from '../formats/board';

/** Kompakte Karte eines Runners für Band und Lower Third. */
function BoardCard({ row, onAir }: { row: BoardRow; onAir: boolean }) {
  return (
    <div className={`ovb-card ${row.active ? 'active' : ''} ${onAir ? 'on-air' : ''} ${row.rank === 1 ? 'first' : ''}`}>
      <span className="ovb-rank">{row.rank}</span>
      <span className="ovb-name">
        {row.active && <i className="ovb-dot" aria-hidden />}
        {row.name}
      </span>
      <span className="ovb-value">{row.value}</span>
      <span className="ovb-detail">{row.detail}</span>
    </div>
  );
}

function BoardLabel({ data }: { data: BoardData }) {
  return (
    <div className="ovb-label">
      <strong>{data.title}</strong>
      <small>{data.valueLabel}</small>
    </div>
  );
}

/**
 * Tabellen-Band im freien Platz unter den Feeds. Bis 6 Runner eine Reihe, darüber zwei,
 * sofern die Höhe reicht.
 */
export function BoardStrip({ data, rect, onAir }: { data: BoardData; rect: Rect; onAir: Set<string> }) {
  const heightPx = rect.h * 1080;
  const twoRows = data.rows.length > 6 && heightPx >= 160;
  const rows = twoRows ? 2 : 1;
  const shown = data.rows.slice(0, rows * 8);
  const cols = Math.ceil(shown.length / rows);
  const style: CSSProperties = {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  };
  return (
    <div className={`ovb-strip ${twoRows ? 'two-rows' : 'one-row'}`} style={style}>
      <BoardLabel data={data} />
      <div
        className="ovb-grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {shown.map((row) => (
          <BoardCard key={row.feedId} row={row} onAir={onAir.has(row.feedId)} />
        ))}
      </div>
    </div>
  );
}

/** Tabelle als Lower Third über dem Kommentar-Vollbild: die besten fünf. */
export function BoardLower({ data, onAir, tickerOn }: { data: BoardData; onAir: Set<string>; tickerOn: boolean }) {
  return (
    <div className={`ovb-lower ${tickerOn ? 'above-ticker' : ''}`}>
      <BoardLabel data={data} />
      <div
        className="ovb-grid"
        style={{ gridTemplateColumns: `repeat(${Math.min(5, data.rows.length)}, minmax(0, 1fr))` }}
      >
        {data.rows.slice(0, 5).map((row) => (
          <BoardCard key={row.feedId} row={row} onAir={onAir.has(row.feedId)} />
        ))}
      </div>
    </div>
  );
}

/** Vollbild-Grafik: komplette Tabelle mit allen Stats. */
export function BoardFull({ data, eventName, onAir }: { data: BoardData; eventName: string; onAir: Set<string> }) {
  const dense = data.rows.length > 10;
  return (
    <div className={`ovb-full ${dense ? 'dense' : ''}`}>
      <header className="ovb-full-head">
        <div>
          <span className="ovb-kicker">{eventName}</span>
          <h1>{data.title}</h1>
        </div>
        <span className="ovb-scoring">Wertung: {data.valueLabel}</span>
      </header>
      <table className="ovb-table">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th className="name">Runner</th>
            <th className="num value">{data.valueLabel}</th>
            {data.columns.map((c) => (
              <th key={c.key} className={c.numeric ? 'num' : ''}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr
              key={row.feedId}
              className={`${row.active ? 'active' : ''} ${onAir.has(row.feedId) ? 'on-air' : ''}`}
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <td className="rank">{row.rank}</td>
              <td className="name">
                {row.active && <i className="ovb-dot" aria-hidden />}
                {row.name}
              </td>
              <td className="num value">{row.value}</td>
              {data.columns.map((c) => {
                const cell = row.cells[c.key];
                return (
                  <td key={c.key} className={`${c.numeric ? 'num' : ''} ${cell?.tone ?? ''}`}>
                    {cell?.text ?? '–'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.footer && <footer className="ovb-full-foot">{data.footer}</footer>}
    </div>
  );
}
