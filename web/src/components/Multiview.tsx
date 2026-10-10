import type { FeedInsight, FeedState, ProductionState } from '../../../shared/types';
import { send, useStore } from '../api';
import { formatUi } from '../formats';
import { DeltaText, ScoreBadge, TimerText } from './bits';
import { LiveFeed, canShowLive } from './LiveFrame';
import { CamVideo, startCam, useCommentaryCam } from './CommentaryCam';
import { HOST_FEED_ID, hostOf } from '../../../shared/host';

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
    <section className="multiview" aria-label="Multiview">
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
      {production.commentary && <CommentaryTile production={production} onPick={() => onPick(HOST_FEED_ID)} />}
    </section>
  );
}

/** Kachel der Kommentar-Kamera: wie ein Runner anklicken oder in einen Slot ziehen. */
function CommentaryTile({ production, onPick }: { production: ProductionState; onPick: () => void }) {
  const c = production.commentary!;
  const { state } = useStore();
  const cam = useCommentaryCam(true, state?.obs.mode !== 'obs' || !!state?.obs.virtualCam);
  const inSlot = (comp: ProductionState['program']) => Object.values(comp.slots).includes(HOST_FEED_ID);
  const onProgram = inSlot(production.program) || hostOf(production.program).mode !== 'off';
  const inPreview = inSlot(production.preview) || hostOf(production.preview).mode !== 'off';
  const cls = ['tile', 'host-tile', onProgram ? 'on-program' : '', inPreview ? 'in-preview' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={cls}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/ueb-feed', HOST_FEED_ID);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onPick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onPick();
      }}
      aria-label={`Kommentar-Kamera ${c.label} in die Vorschau`}
    >
      <div className="tile-video">
        {cam.stream ? (
          <CamVideo stream={cam.stream} label={c.label} />
        ) : (
          <div className="tile-placeholder host">
            <button
              className="btn small"
              onClick={(e) => {
                e.stopPropagation();
                void startCam();
              }}
              disabled={cam.starting}
            >
              {cam.starting ? 'Verbinde …' : 'OBS-Bild verbinden'}
            </button>
          </div>
        )}
      </div>
      <div className="tile-top">
        <i className={`dot ${cam.stream ? 'live' : 'unknown'}`} />
        <strong>{c.label}</strong>
      </div>
      <div className="tile-bottom">
        <span className="status">Kommentar</span>
        {cam.error && <span className="status warn">{cam.error}</span>}
      </div>
    </div>
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
          <LiveFeed feed={feed} bitrateKbps={600} scalePct={35} />
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
