import { useEffect, useState } from 'react';
import type { AppState, ProductionState } from '../../../shared/types';
import { clockTime } from '../../../shared/format';
import { send } from '../api';
import { formatUi } from '../formats';
import { Toggle } from './bits';

interface Props {
  state: AppState;
  production: ProductionState;
  now: number;
  offset: number;
}

export function ToolsPanel({ state, production, now, offset }: Props) {
  const ui = formatUi(production.format);
  const tabs = [
    ...(ui.Panel ? [{ id: 'format', label: ui.panelTitle ?? production.formatName }] : []),
    { id: 'grafik', label: 'Grafik' },
    { id: 'sendung', label: 'Sendung' },
    { id: 'obs', label: 'OBS' },
    { id: 'log', label: 'Logbuch' },
  ];
  const [tab, setTab] = useState(tabs[0].id);
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab(tabs[0].id);
  }, [production.format]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="panel tools">
      <div className="tool-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tool-body">
        {tab === 'format' && ui.Panel && <ui.Panel production={production} now={now} offset={offset} />}
        {tab === 'grafik' && <GraphicsTab production={production} />}
        {tab === 'sendung' && <ShowTab state={state} production={production} />}
        {tab === 'obs' && <ObsTab state={state} />}
        {tab === 'log' && <LogTab production={production} />}
      </div>
    </section>
  );
}

function GraphicsTab({ production }: { production: ProductionState }) {
  const g = production.graphics;
  const [title, setTitle] = useState(g.lowerThird.title);
  const [subtitle, setSubtitle] = useState(g.lowerThird.subtitle);
  const patch = (p: Partial<typeof g>) => send('graphics', { patch: p });
  const hasBoard = !!formatUi(production.format).OverlayBoard;
  const hasBoardData = !!formatUi(production.format).boardData;
  return (
    <div className="tool-grid">
      <div>
        <h4>Ebenen im Overlay</h4>
        <Toggle checked={g.slotLabels} onChange={(v) => patch({ slotLabels: v })} label="Namen & Zeiten in den Slots" />
        <Toggle checked={g.ticker} onChange={(v) => patch({ ticker: v })} label="Ticker „Gleich spannend“" />
        {hasBoard && (
          <Toggle
            checked={g.leaderboard}
            onChange={(v) => patch({ leaderboard: v })}
            label="Tabelle rechts über den Feeds"
          />
        )}
        {hasBoardData && (
          <>
            <Toggle
              checked={g.boardStrip}
              onChange={(v) => patch({ boardStrip: v })}
              label="Tabellen-Band unter den Feeds"
              hint="Füllt den freien Platz in „Duell“ und „Haupt + 3“. Weicht der Bauchbinde."
            />
            <Toggle
              checked={g.hostBoard}
              onChange={(v) => patch({ hostBoard: v })}
              label="Tabelle als Lower Third im Kommentar-Vollbild"
            />
          </>
        )}
      </div>
      {hasBoardData && (
        <div>
          <h4>Vollbild-Tabelle</h4>
          <p className="muted small">Komplette Tabelle mit allen Stats über dem Programm. Taste L.</p>
          <div className="row">
            <button
              type="button"
              className={`btn ${g.boardFull ? 'live' : 'primary'}`}
              onClick={() => patch({ boardFull: !g.boardFull })}
            >
              {g.boardFull ? 'Vollbild-Tabelle ausblenden' : 'Vollbild-Tabelle einblenden'}
            </button>
            {g.boardFull && <span className="pill bad">auf Sendung</span>}
          </div>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send('graphics', { patch: { lowerThird: { title, subtitle, visible: true } } });
        }}
      >
        <h4>Bauchbinde</h4>
        <label className="field">
          <span>Zeile 1</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Huebi" />
        </label>
        <label className="field">
          <span>Zeile 2</span>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="z. B. Host" />
        </label>
        <div className="row">
          <button type="submit" className="btn primary">
            Einblenden
          </button>
          <button
            type="button"
            className="btn"
            disabled={!g.lowerThird.visible}
            onClick={() => send('graphics', { patch: { lowerThird: { visible: false } } })}
          >
            Ausblenden
          </button>
          {g.lowerThird.visible && <span className="pill good">sichtbar</span>}
        </div>
      </form>
    </div>
  );
}

function ShowTab({ state, production }: { state: AppState; production: ProductionState }) {
  const [marker, setMarker] = useState('');
  const [title, setTitle] = useState(state.twitch.title ?? '');
  const slotLayouts = production.layouts.filter((l) => l.slots.length > 0);
  return (
    <div className="tool-grid">
      <div>
        <h4>Automatik</h4>
        <Toggle
          checked={production.audioFollow}
          onChange={(v) => send('audioFollow', { enabled: v })}
          label="Audio-Follow"
          hint="Nur der Feed im Hauptslot ist hörbar."
        />
        {formatUi(production.format).radar && (
          <>
            <Toggle
              checked={production.autopilot}
              onChange={(v) => send('autopilot', { enabled: v })}
              label="Autopilot"
              hint="Schneidet nach dem Highlight-Radar, mit Mindesthaltezeit."
            />
            <label className="field">
              <span>Autopilot-Layout</span>
              <select
                value={production.autopilotLayoutId}
                onChange={(e) => send('autopilot', { enabled: production.autopilot, layoutId: e.target.value })}
              >
                {slotLayouts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <div>
        <h4>Twitch</h4>
        {!state.twitch.configured && (
          <p className="muted small">
            Nicht verbunden – Marker landen nur im Logbuch. Zugangsdaten in <code>.env</code> eintragen (siehe README).
          </p>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            send('marker', { text: marker });
            setMarker('');
          }}
        >
          <input value={marker} onChange={(e) => setMarker(e.target.value)} placeholder="Marker-Text (optional)" />
          <button className="btn" type="submit" title="Taste M">
            Marker setzen
          </button>
        </form>
        {state.twitch.configured && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) send('twitch.title', { title: title.trim() });
            }}
          >
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Stream-Titel" />
            <button className="btn" type="submit">
              Titel setzen
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ObsTab({ state }: { state: AppState }) {
  const obs = state.obs;
  const overlayUrl = `${location.origin}/overlay.html?view=program`;
  return (
    <div className="tool-grid">
      <div>
        <h4>Verbindung</h4>
        <dl className="kv">
          <dt>Modus</dt>
          <dd>{obs.mode === 'simulation' ? 'Simulation (OBS_URL nicht gesetzt)' : obs.url}</dd>
          <dt>Status</dt>
          <dd>{obs.mode === 'simulation' ? '–' : obs.connected ? 'verbunden' : 'getrennt'}</dd>
          <dt>Studio-Modus</dt>
          <dd>{obs.studioMode ? 'an (Übergang über OBS)' : 'aus (harter Szenenwechsel)'}</dd>
          <dt>Programmszene</dt>
          <dd>{obs.programScene ?? '–'}</dd>
          <dt>Eingerichtet</dt>
          <dd>{obs.setupDone ? 'ja' : 'nein'}</dd>
          {obs.error && (
            <>
              <dt>Fehler</dt>
              <dd className="bad-text">{obs.error}</dd>
            </>
          )}
        </dl>
        <div className="row">
          <button className="btn primary" disabled={!obs.connected} onClick={() => send('obs.setup')}>
            OBS einrichten / aktualisieren
          </button>
          <button className="btn" disabled={obs.mode === 'simulation'} onClick={() => send('obs.reconnect')}>
            Neu verbinden
          </button>
          <a className="btn ghost" href="#/einstellungen/obs">
            Verbindung ändern
          </a>
        </div>
      </div>
      <div>
        <h4>So arbeitet ueBroadcast mit OBS</h4>
        <ul className="small">
          <li>
            „Einrichten“ legt die Szenen <code>ueB Programm A</code> und <code>B</code> an, je eine Quelle pro Feed und
            die Overlay-Browserquelle.
          </li>
          <li>Beim Take wird die nicht gesendete Szene belegt und übergeblendet – die Feeds bleiben geladen.</li>
          <li>
            Overlay-Adresse: <code>{overlayUrl}</code>
          </li>
        </ul>
      </div>
    </div>
  );
}

function LogTab({ production }: { production: ProductionState }) {
  const entries = [...production.log].reverse().slice(0, 150);
  return (
    <div>
      <div className="row">
        <a className="btn" href="/api/log.csv" download>
          Logbuch als CSV
        </a>
        <span className="muted small">
          Takes, Meldungen und Marker mit Uhrzeit – für VOD-Schnitt und Nachbereitung.
        </span>
      </div>
      <ul className="log">
        {entries.map((l, i) => (
          <li key={`${l.at}-${i}`}>
            <span className="time">{clockTime(l.at)}</span>
            <span className={`kind k-${l.kind.split(':')[0]}`}>{l.kind}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
