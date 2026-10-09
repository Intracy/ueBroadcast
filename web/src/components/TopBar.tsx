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
        <span className={`pill ${obsTone}`} title={obs.error ?? obs.url ?? ''}>
          <i className="dot" />
          {obsLabel}
        </span>
        {obs.mode === 'obs' && obs.connected && !obs.setupDone && (
          <button className="pill action" onClick={() => send('obs.setup')}>
            OBS einrichten
          </button>
        )}
        <span className={`pill ${connected ? 'good' : 'bad'}`}>
          <i className="dot" />
          {connected ? 'Server' : 'Offline'}
        </span>
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
