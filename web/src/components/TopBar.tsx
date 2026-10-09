import type { AppState } from '../../../shared/types';
import { send, useNow } from '../api';
import { formatUi } from '../formats';

interface Props {
  state: AppState;
  connected: boolean;
  route: string;
  go: (r: string) => void;
  offset: number;
}

export function TopBar({ state, connected, route, go, offset }: Props) {
  const now = useNow(1000);
  const prod = state.production;
  const obs = state.obs;

  let obsLabel: string;
  let obsTone: string;
  if (obs.mode === 'simulation') {
    obsLabel = 'OBS: Simulation';
    obsTone = 'neutral';
  } else if (!obs.connected) {
    obsLabel = 'OBS getrennt';
    obsTone = 'bad';
  } else if (!obs.setupDone) {
    obsLabel = 'OBS: nicht eingerichtet';
    obsTone = 'warn';
  } else {
    obsLabel = `OBS ${obs.studioMode ? '· Studio' : ''}`;
    obsTone = 'good';
  }

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" />
        <span>ueBroadcast</span>
      </div>
      <nav className="tabs">
        <button className={route === 'regie' ? 'active' : ''} onClick={() => go('regie')} disabled={!prod}>
          Regie
        </button>
        <button className={route === 'produktionen' ? 'active' : ''} onClick={() => go('produktionen')}>
          Produktionen
        </button>
      </nav>
      {prod && (
        <div className="prod-title">
          <strong>{prod.name}</strong>
          <span className="muted">{prod.formatName}</span>
          {prod.simulation && <span className="pill warn">Simulation</span>}
        </div>
      )}
      <div className="topbar-right">
        {prod && formatUi(prod.format).radar && (
          <button
            className={`pill toggle ${prod.autopilot ? 'on' : ''}`}
            title="Autopilot schneidet selbstständig nach dem Highlight-Radar"
            onClick={() => send('autopilot', { enabled: !prod.autopilot })}
          >
            Autopilot {prod.autopilot ? 'an' : 'aus'}
          </button>
        )}
        <button
          className={`pill toggle ${obsTone}`}
          title={obs.error ?? (obs.url ? `${obs.url} – OBS-Einstellungen öffnen` : 'OBS-Einstellungen öffnen')}
          onClick={() => go('einstellungen/obs')}
        >
          <i className="dot" />
          {obsLabel}
        </button>
        {obs.mode === 'obs' && obs.connected && !obs.setupDone && (
          <button className="pill action" onClick={() => send('obs.setup')}>
            OBS einrichten
          </button>
        )}
        <span className={`pill ${connected ? 'good' : 'bad'}`}>
          <i className="dot" />
          {connected ? 'Server' : 'Offline'}
        </span>
        <button
          className={`settings-btn ${route === 'einstellungen' ? 'active' : ''}`}
          onClick={() => go('einstellungen')}
          title="Einstellungen: Runner, Produktion, OBS"
        >
          <GearIcon />
          <span>Einstellungen</span>
        </button>
        <span className="clock">
          {new Date(now + offset).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </div>
    </header>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.6 7.6 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0-.5.4l-.4 2.7a7.6 7.6 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5a.5.5 0 0 0 .6.2l2.5-1a7.6 7.6 0 0 0 1.7 1l.4 2.6a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.4l.4-2.7a7.6 7.6 0 0 0 1.7-1l2.5 1a.5.5 0 0 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
      />
    </svg>
  );
}
