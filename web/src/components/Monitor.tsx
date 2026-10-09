import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  CommentaryInfo,
  Composition,
  FeedInsight,
  FeedState,
  GraphicsState,
  LayoutDef,
} from '../../../shared/types';
import { TICKER_RESERVE, boardBand, hostOf, hostRect } from '../../../shared/host';
import { useCommentarySnapshot } from './Commentary';
import { DeltaText, TimerText } from './bits';
import { LiveFrame, canShowLive } from './LiveFrame';
import type { BoardData } from '../formats/board';
import { BoardFull, BoardLower, BoardStrip } from '../overlay/Boards';

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
  /** Grafik-Ebenen (Tabelle), wenn das Format eine Tabelle hat */
  graphics?: GraphicsState | null;
  /** Tabellendaten des Formats */
  board?: BoardData | null;
  /** Name der Produktion (Kopf der Vollbild-Tabelle) */
  eventName?: string;
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
  graphics,
  board,
  eventName = '',
  snapshotAvailable,
}: Props) {
  const title = kind === 'program' ? 'Programm' : 'Vorschau';
  const host = hostOf(comp);
  const box = commentary ? hostRect(layout, host, commentary.size, tickerOn ? TICKER_RESERVE : 0) : null;
  const snapshot = useCommentarySnapshot(!!box && snapshotAvailable);
  // Tabellen-Grafiken: Band unter den Feeds, Lower Third im Kommentar-Vollbild, Vollbild (nur Programm)
  const band =
    board && graphics?.boardStrip && host.mode !== 'full' && !graphics.lowerThird.visible
      ? boardBand(layout, tickerOn)
      : null;
  const lowerBoard = !!board && !!graphics?.hostBoard && host.mode === 'full' && !!box;
  const fullBoard = kind === 'program' && !!board && !!graphics?.boardFull;
  // Live-Bild-Schalter auch in der Simulation, sobald Runner Links hinterlegt haben
  const hasLinks = [...feeds.values()].some((f) => !!f.previewUrl);
  const onAir = new Set(Object.values(comp.slots).filter((f): f is string => !!f));
  return (
    <div className={`monitor ${kind}`}>
      <div className="monitor-head">
        <span className="tally" />
        <strong>{title}</strong>
        <span className="muted">{layout?.name ?? comp.layoutId}</span>
        {(!simulation || hasLinks) && (
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
                <LiveFrame
                  url={feed!.previewUrl!}
                  label={feed!.label}
                  bitrateKbps={kind === 'program' ? 1500 : 1000}
                  scalePct={kind === 'program' ? 66 : 50}
                />
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
            className={`host-box ${host.mode} ${lowerBoard ? 'label-top' : ''}`}
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
        {board && (band || lowerBoard || fullBoard) && (
          <OverlayStage>
            {band && <BoardStrip data={board} rect={band} onAir={onAir} />}
            {lowerBoard && <BoardLower data={board} onAir={onAir} tickerOn={tickerOn} />}
            {fullBoard && <BoardFull data={board} eventName={eventName} onAir={onAir} />}
          </OverlayStage>
        )}
      </div>
    </div>
  );
}

/** Zeichnet Overlay-Grafiken in Originalgröße (1920×1080) und skaliert sie auf den Monitor. */
function OverlayStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / 1920);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="monitor-stage" ref={ref} aria-hidden>
      {scale > 0 && (
        <div className="monitor-stage-inner" style={{ transform: `scale(${scale})` }}>
          {children}
        </div>
      )}
    </div>
  );
}
