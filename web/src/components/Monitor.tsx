import type { Composition, FeedInsight, FeedState, LayoutDef } from '../../../shared/types';
import { DeltaText, TimerText } from './bits';

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
}

/** Schematische Vorschau/Programm-Ansicht: zeigt das Layout mit den belegten Slots. */
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
}: Props) {
  const title = kind === 'program' ? 'Programm' : 'Vorschau';
  return (
    <div className={`monitor ${kind}`}>
      <div className="monitor-head">
        <span className="tally" />
        <strong>{title}</strong>
        <span className="muted">{layout?.name ?? comp.layoutId}</span>
      </div>
      <div className="canvas">
        {layout && layout.slots.length === 0 && <div className="slate">Pause / Grafik</div>}
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
      </div>
    </div>
  );
}
