import type { AppState } from '../../../shared/types';
import { send } from '../api';

export function Home({ state, go }: { state: AppState; go: (r: string) => void }) {
  const activeId = state.production?.id;
  return (
    <main className="home">
      <section>
        <div className="section-head">
          <h2>Produktionen</h2>
          <button className="btn ghost" onClick={() => send('productions.reload')}>
            Neu laden
          </button>
        </div>
        <p className="muted">
          Jede Produktion ist eine Datei in <code>productions/</code> und nutzt eines der Formate unten. Aktiv ist immer
          genau eine Produktion – sie steuert OBS.
        </p>
        <div className="cards">
          {state.productions.map((p) => {
            const active = p.id === activeId;
            return (
              <article key={p.id} className={`card ${active ? 'active' : ''}`}>
                <div className="card-head">
                  <h3>{p.name}</h3>
                  {active && <span className="pill good">aktiv</span>}
                </div>
                <div className="muted small">
                  {p.formatName} · {p.feedCount} Feeds · <code>{p.id}</code>
                </div>
                <p>{p.description}</p>
                <div className="card-actions">
                  {active ? (
                    <button className="btn primary" onClick={() => go('regie')}>
                      Zur Regie
                    </button>
                  ) : (
                    <button
                      className="btn"
                      onClick={() => {
                        send('production.activate', { id: p.id });
                        go('regie');
                      }}
                    >
                      Aktivieren
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {state.productions.length === 0 && <p className="muted">Keine Produktionen gefunden.</p>}
        </div>
        {state.configErrors.length > 0 && (
          <div className="notice bad">
            <strong>Konfigurationsfehler</strong>
            <ul>
              {state.configErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section>
        <h2>Formate</h2>
        <p className="muted">
          Formate bringen die inhaltliche Logik einer Produktionsart mit: Datenquellen, Highlight-Bewertung, eigene
          Bedienfelder und Grafiken. Neue Formate entstehen unter <code>server/formats/</code> und{' '}
          <code>web/src/formats/</code>.
        </p>
        <div className="cards">
          {state.formats.map((f) => (
            <article key={f.id} className="card flat">
              <h3>{f.name}</h3>
              <div className="muted small">
                <code>{f.id}</code>
              </div>
              <p>{f.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
