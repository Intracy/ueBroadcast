import type React from 'react';
import type { FeedInsight, FeedState, ProductionState } from '../../../shared/types';
import { send } from '../api';
import { formatUi } from '../formats';
import { DeltaText, ScoreBadge, TimerText } from './bits';
import { LiveFrame, canShowLive } from './LiveFrame';

/** Spalten so wählen, dass keine Kachel allein in einer Reihe steht: 11 → 6, 16 → 8. */
function multiviewColumns(n: number): number {
  if (n <= 5) return Math.max(n, 1);
  if (n <= 10) return 5;
  return Math.min(8, Math.ceil(n / 2));
}

interface Props {
  production: ProductionState;
  insights: Map<string, FeedInsight>;
  now: number;
  offset: number;
  onPick: (feedId: string) => void;
}

export function Multiview({ production, insights, now, offset, onPick }: Props) {
  const ui = formatUi(production.format);
  return (
    <section
      className="multiview"
      aria-label="Multiview"
      style={{ '--mv-cols': multiviewColumns(production.feeds.length) } as React.CSSProperties}
    >
      {production.feeds.map((feed, i) => (
        <FeedTile
          key={feed.id}
          index={i}
          feed={feed}
          insight={insights.get(feed.id)}
          detail={ui.tileDetail?.(production.formatState, feed.id) ?? null}
          simulation={production.simulation}
          now={now}
          offset={offset}
          onPick={() => onPick(feed.id)}
        />
      ))}
    </section>
  );
}

function FeedTile({
  index,
  feed,
  insight,
  detail,
  simulation,
  now,
  offset,
  onPick,
}: {
  index: number;
  feed: FeedState;
  insight: FeedInsight | undefined;
  detail: string | null;
  simulation: boolean;
  now: number;
  offset: number;
  onPick: () => void;
}) {
  const hotkey = index < 9 ? String(index + 1) : index === 9 ? '0' : null;
  const showVideo = canShowLive(feed, simulation);
  const cls = ['tile', feed.onProgram ? 'on-program' : '', feed.inPreview ? 'in-preview' : '', `status-${feed.status}`]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={cls}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/ueb-feed', feed.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onPick();
      }}
      aria-label={`${feed.label} in die Vorschau`}
    >
      <div className="tile-video">
        {showVideo ? (
          <LiveFrame url={feed.previewUrl!} label={feed.label} bitrateKbps={600} scalePct={35} />
        ) : (
          <div className={`tile-placeholder hue-${index % 6}`}>
            {feed.status === 'offline' ? (
              <span className="nosignal">KEIN SIGNAL</span>
            ) : (
              <>
                <span className="big">{insight?.stats ?? feed.label}</span>
                {detail && <span className="detail">{detail}</span>}
              </>
            )}
          </div>
        )}
      </div>
      <div className="tile-top">
        {hotkey && <kbd>{hotkey}</kbd>}
        <i className={`dot ${feed.status}`} title={feed.status} />
        <strong>{feed.label}</strong>
        <ScoreBadge insight={insight} />
      </div>
      <div className="tile-bottom">
        <span className="status">{insight?.status}</span>
        <TimerText timer={insight?.timer ?? null} now={now} offset={offset} />
        <DeltaText ms={insight?.deltaMs ?? null} />
        {feed.bitrateKbps !== null && <span className="bitrate">{(feed.bitrateKbps / 1000).toFixed(1)} Mb/s</span>}
      </div>
      <div className="tile-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="mini"
          title="Direkt in den Hauptslot auf Sendung"
          onClick={() => send('cut', { feedId: feed.id })}
        >
          Schnitt
        </button>
        {simulation && (
          <button
            className="mini"
            title="Simuliert 15 s Signalverlust"
            onClick={() => send('feed.simulateDrop', { feedId: feed.id })}
          >
            Ausfall
          </button>
        )}
      </div>
    </div>
  );
}
