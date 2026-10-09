import type { CommentaryInfo, Composition, FeedInsight, FeedState, LayoutDef } from '../../../shared/types';
import { TICKER_RESERVE, hostOf, hostRect } from '../../../shared/host';
import { useCommentarySnapshot } from './Commentary';
import { DeltaText, TimerText } from './bits';
import { LiveFrame, canShowLive } from './LiveFrame';

interface Props {
  kind: 'preview' | 'program';
  layout: LayoutDef | undefined;
  comp: Composition;
  feeds: Map<string, FeedState>;
  insights: Map<string, FeedInsight>;
  now: number;
  offset: number;
  selectedSlot?: string | null;
  onSelectSlot?: (slotId: string) => void;
  onDropFeed?: (slotId: string, feedId: string) => void;
  simulation: boolean;
  /** Live-Bilder in den Slots zeigen */
  live: boolean;
  onToggleLive: () => void;
  commentary: CommentaryInfo | null;
  tickerOn: boolean;
  /** OBS verbunden – Standbild der Kommentar-Szene abrufbar */
  snapshotAvailable: boolean;
}

/** Vorschau/Programm-Monitor: zeigt das Layout mit den belegten Slots, auf Wunsch mit Live-Bild. */
export function Monitor({
  kind,
  layout,
  comp,
  feeds,
  insights,
  now,
  offset,
  selectedSlot,
  onSelectSlot,
  onDropFeed,
  simulation,
  live,
  onToggleLive,
  commentary,
  tickerOn,
  snapshotAvailable,
}: Props) {
  const title = kind === 'program' ? 'Programm' : 'Vorschau';
  const host = hostOf(comp);
  const box = commentary ? hostRect(layout, host, commentary.size, tickerOn ? TICKER_RESERVE : 0) : null;
  const snapshot = useCommentarySnapshot(!!box && snapshotAvailable);
  return (
    <div className={`monitor ${kind}`}>
      <div className="monitor-head">
        <span className="tally" />
        <strong>{title}</strong>
        <span className="muted">{layout?.name ?? comp.layoutId}</span>
        {!simulation && (
          <button
            className={`live-toggle ${live ? 'on' : ''}`}
            onClick={onToggleLive}
            aria-pressed={live}
            title={
              live
                ? 'Live-Bilder ausblenden (spart Bandbreite bei den Runnern)'
                : 'Live-Bilder in diesem Monitor zeigen'
            }
          >
            Live-Bild {live ? 'an' : 'aus'}
          </button>
        )}
      </div>
      <div className="canvas">
        {layout && layout.slots.length === 0 && host.mode !== 'full' && <div className="slate">Pause / Grafik</div>}
        {layout?.slots.map((slot, i) => {
          const feedId = comp.slots[slot.id];
          const feed = feedId ? feeds.get(feedId) : undefined;
          const ins = feedId ? insights.get(feedId) : undefined;
          const selected = selectedSlot === slot.id;
          return (
            <div
              key={slot.id}
              className={`slot ${feed ? '' : 'empty'} ${selected ? 'selected' : ''} ${feed?.status === 'offline' ? 'lost' : ''}`}
              style={{
                left: `${slot.x * 100}%`,
                top: `${slot.y * 100}%`,
                width: `${slot.w * 100}%`,
                height: `${slot.h * 100}%`,
              }}
              onClick={() => onSelectSlot?.(slot.id)}
              onDragOver={(e) => {
                if (onDropFeed && e.dataTransfer.types.includes('text/ueb-feed')) e.preventDefault();
              }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData('text/ueb-feed');
                if (id && onDropFeed) onDropFeed(slot.id, id);
              }}
              title={onSelectSlot ? 'Slot wählen, dann Feed anklicken oder Feed hierher ziehen' : undefined}
            >
              {live && host.mode !== 'full' && canShowLive(feed, simulation) && (
                <LiveFrame feed={feed!} bitrateKbps={kind === 'program' ? 2000 : 1200} />
              )}
              {i === 0 && layout.slots.length > 1 && <span className="slot-main">Haupt</span>}
              {feed ? (
                <div className="slot-info">
                  <strong>{feed.label}</strong>
                  <span>
                    {ins?.stats} <TimerText timer={ins?.timer ?? null} now={now} offset={offset} />{' '}
                    <DeltaText ms={ins?.deltaMs ?? null} />
                  </span>
                </div>
              ) : (
                <div className="slot-info empty">leer</div>
              )}
            </div>
          );
        })}
        {box && commentary && (
          <div
            className={`host-box ${host.mode}`}
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
            title={`Kommentar-Szene „${commentary.obsScene}“`}
          >
            {snapshot && <img src={snapshot} alt="" />}
            <span className="host-label">
              {commentary.label}
              {host.mode === 'full' ? ' · Vollbild' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
