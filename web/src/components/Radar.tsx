import type { FeedState, ProductionState } from '../../../shared/types';
import { send } from '../api';
import { clockTime } from '../../../shared/format';

interface Props {
  production: ProductionState;
  feeds: Map<string, FeedState>;
  toPreview: (feedId: string) => void;
}

export function Radar({ production, feeds, toPreview }: Props) {
  const ranked = production.insights
    .filter((i) => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const max = Math.max(100, ...ranked.map((r) => r.score));
  const duo = production.layouts.find((l) => l.id === 'duo' && l.slots.length >= 2);

  return (
    <section className="panel radar">
      <div className="panel-head">
        <h3>Highlight-Radar</h3>
        <span className="muted small">Vorschlag – die Regie entscheidet</span>
      </div>
      {ranked.length === 0 && <p className="muted empty-note">Gerade nichts Besonderes los.</p>}
      <ol>
        {ranked.map((ins) => {
          const feed = feeds.get(ins.feedId);
          const partner = ins.partnerFeedId ? feeds.get(ins.partnerFeedId) : undefined;
          return (
            <li key={ins.feedId} className={feed?.onProgram ? 'on-program' : ''}>
              <div className="radar-row">
                <strong>{feed?.label ?? ins.feedId}</strong>
                <span className="muted small">{ins.stats}</span>
                <span className="radar-score">{ins.score}</span>
              </div>
              <div className="bar">
                <span style={{ width: `${(ins.score / max) * 100}%` }} />
              </div>
              <div className="reasons">
                {ins.reasons.map((r) => (
                  <span key={r} className="chip">
                    {r}
                  </span>
                ))}
              </div>
              <div className="radar-actions">
                <button className="mini" onClick={() => toPreview(ins.feedId)}>
                  → Vorschau
                </button>
                {partner && duo && (
                  <button
                    className="mini"
                    onClick={() =>
                      send('preview.set', {
                        composition: {
                          layoutId: duo.id,
                          slots: { [duo.slots[0].id]: ins.feedId, [duo.slots[1].id]: ins.partnerFeedId },
                        },
                      })
                    }
                  >
                    Duell mit {partner.label}
                  </button>
                )}
                <button className="mini" onClick={() => send('cut', { feedId: ins.feedId })}>
                  Schnitt
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Alerts({
  production,
  toPreview,
}: {
  production: ProductionState;
  toPreview: (feedId: string) => void;
}) {
  return (
    <section className="panel alerts">
      <div className="panel-head">
        <h3>Meldungen</h3>
        {production.alerts.length > 0 && (
          <button className="mini" onClick={() => send('alerts.clear')}>
            Alle weg
          </button>
        )}
      </div>
      {production.alerts.length === 0 && <p className="muted empty-note">Keine Meldungen.</p>}
      <ul>
        {production.alerts.map((a) => (
          <li key={a.id} className={`alert ${a.level}`}>
            <span className="time">{clockTime(a.at)}</span>
            <span className="text">{a.text}</span>
            <span className="alert-actions">
              {a.feedId && (
                <button className="mini" onClick={() => toPreview(a.feedId!)} title="In die Vorschau">
                  →
                </button>
              )}
              <button className="mini" onClick={() => send('alert.dismiss', { id: a.id })} title="Erledigt">
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
