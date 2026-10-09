import { useEffect, useState } from 'react';
import type { FeedInsight, ProductionState } from '../../../shared/types';
import { formatDelta, timerValue, formatDuration } from '../../../shared/format';
import { useNow, useStore } from '../api';
import { formatUi } from '../formats';
import { TICKER_RESERVE, hostOf, hostRect } from '../../../shared/host';

/** Overlay als OBS-Browserquelle: 1920×1080, transparenter Hintergrund, skaliert auf die Quellgröße. */
export function Overlay() {
  const { state, offset } = useStore();
  const now = useNow(200);
  const [scale, setScale] = useState(1);
  const view = new URLSearchParams(location.search).get('view') ?? 'program';

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const prod = state?.production;
  return (
    <div className="ov-stage" style={{ transform: `scale(${scale})` }}>
      {prod && view === 'program' && <ProgramOverlay prod={prod} now={now} offset={offset} />}
      {prod && view === 'leaderboard' && <BoardOnly prod={prod} now={now} offset={offset} />}
    </div>
  );
}

function BoardOnly({ prod, now, offset }: { prod: ProductionState; now: number; offset: number }) {
  const Board = formatUi(prod.format).OverlayBoard;
  return Board ? (
    <div className="ov-board-wrap center">
      <Board production={prod} now={now} offset={offset} />
    </div>
  ) : null;
}

function ProgramOverlay({ prod, now, offset }: { prod: ProductionState; now: number; offset: number }) {
  const layout = prod.layouts.find((l) => l.id === prod.program.layoutId);
  const insights = new Map(prod.insights.map((i) => [i.feedId, i]));
  const feeds = new Map(prod.feeds.map((f) => [f.id, f]));
  const g = prod.graphics;
  const Board = formatUi(prod.format).OverlayBoard;
  const host = hostOf(prod.program);
  const hostBox =
    prod.commentary && host.mode !== 'off'
      ? hostRect(layout, host, prod.commentary.size, g.ticker ? TICKER_RESERVE : 0)
      : null;
  const fullHost = host.mode === 'full' && !!hostBox;
  const pause = !fullHost && (!layout || layout.slots.length === 0);
  const tickerItems = g.ticker ? tickerCandidates(prod) : [];
  // Namensschilder unten nicht unter den Ticker schieben
  const bottomEdge = tickerItems.length > 0 ? 1 - 72 / 1080 : 1;

  return (
    <>
      {pause && (
        <div className="ov-slate">
          <div className="ov-slate-title">{prod.name}</div>
          <div className="ov-slate-sub">Gleich geht’s weiter</div>
          {Board && (
            <div className="ov-board-wrap">
              <Board production={prod} now={now} offset={offset} />
            </div>
          )}
        </div>
      )}

      {!pause &&
        !fullHost &&
        g.slotLabels &&
        layout!.slots.map((slot) => {
          const feedId = prod.program.slots[slot.id];
          if (!feedId) return null;
          const feed = feeds.get(feedId);
          const ins = insights.get(feedId);
          const t = timerValue(ins?.timer ?? null, now, offset);
          const compact = slot.w * 1920 < 760;
          const plateTop = Math.min(slot.y + slot.h, bottomEdge);
          // Bauchbinde hat Vorrang: Schilder im Bereich unten links ausblenden
          if (g.lowerThird.visible && slot.x < 0.32 && plateTop > 0.76) return null;
          return (
            <div
              key={slot.id}
              className={`ov-plate ${compact ? 'compact' : ''}`}
              style={{
                left: `${slot.x * 100}%`,
                top: `${plateTop * 100}%`,
                maxWidth: `${slot.w * 1920 - (compact ? 16 : 28)}px`,
              }}
            >
              <span className="ov-name">{feed?.label}</span>
              {ins?.stats && <span className="ov-stat">{ins.stats}</span>}
              {t !== null && <span className="ov-time">{formatDuration(t)}</span>}
              {ins?.deltaMs != null && (
                <span className={`ov-delta ${ins.deltaMs < 0 ? 'ahead' : 'behind'}`}>{formatDelta(ins.deltaMs)}</span>
              )}
            </div>
          );
        })}

      {!pause && g.leaderboard && Board && (
        <div className="ov-board-wrap side">
          <Board production={prod} now={now} offset={offset} />
        </div>
      )}

      {hostBox && prod.commentary && host.mode === 'pip' && (
        <div
          className="ov-host-frame"
          style={{
            left: `${hostBox.x * 100}%`,
            top: `${hostBox.y * 100}%`,
            width: `${hostBox.w * 100}%`,
            height: `${hostBox.h * 100}%`,
          }}
        >
          <span className="ov-host-tag">{prod.commentary.label}</span>
        </div>
      )}
      {fullHost && prod.commentary && !g.lowerThird.visible && (
        <div className="ov-host-full">
          <span className="ov-host-kicker">Kommentar</span>
          <span className="ov-host-names">{prod.commentary.label}</span>
        </div>
      )}

      <div className={`ov-lower ${g.lowerThird.visible ? 'show' : ''}`}>
        <div className="ov-lower-title">{g.lowerThird.title}</div>
        {g.lowerThird.subtitle && <div className="ov-lower-sub">{g.lowerThird.subtitle}</div>}
      </div>

      {tickerItems.length > 0 && <Ticker prod={prod} items={tickerItems} />}
    </>
  );
}

/** Spannende Runner, die gerade nicht auf Sendung sind. */
function tickerCandidates(prod: ProductionState): FeedInsight[] {
  const onProgram = new Set(Object.values(prod.program.slots).filter(Boolean));
  return prod.insights
    .filter((i) => i.score >= 35 && !onProgram.has(i.feedId))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function Ticker({ prod, items }: { prod: ProductionState; items: FeedInsight[] }) {
  const labels = new Map(prod.feeds.map((f) => [f.id, f.label]));
  return (
    <div className="ov-ticker">
      <span className="ov-ticker-label">Gleich spannend</span>
      {items.map((i) => (
        <span key={i.feedId} className="ov-ticker-item">
          <strong>{labels.get(i.feedId)}</strong>
          {i.stats && <span>{i.stats}</span>}
          {viewerReason(i) && <em>{viewerReason(i)}</em>}
        </span>
      ))}
    </div>
  );
}

/** Gründe, die für Zuschauer interessant sind (Regie-interne wie „nicht im Bild“ fallen weg). */
function viewerReason(i: FeedInsight): string | undefined {
  return i.reasons.find((r) => !/nicht (im Bild|gezeigt)/.test(r));
}
