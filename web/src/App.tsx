import { useHashRoute, useStore } from './api';
import { TopBar } from './components/TopBar';
import { Home } from './components/Home';
import { Regie } from './components/Regie';
import { Toasts } from './components/Toasts';

export function App() {
  const { state, connected, offset } = useStore();
  const [route, go] = useHashRoute();

  if (!state) {
    return (
      <div className="splash">
        <div className="brand-mark" />
        <h1>ueBroadcast</h1>
        <p>{connected ? 'Lade Zustand …' : 'Verbinde mit dem ueBroadcast-Server …'}</p>
      </div>
    );
  }

  const showHome = route === 'produktionen' || !state.production;

  return (
    <div className="app">
      <TopBar state={state} connected={connected} route={showHome ? 'produktionen' : 'regie'} go={go} offset={offset} />
      {showHome ? (
        <Home state={state} go={go} />
      ) : (
        <Regie state={state} production={state.production!} offset={offset} />
      )}
      <Toasts />
    </div>
  );
}
