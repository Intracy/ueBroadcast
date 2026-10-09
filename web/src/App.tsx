import { useHashRoute, useStore } from './api';
import { TopBar } from './components/TopBar';
import { Home } from './components/Home';
import { Regie } from './components/Regie';
import { Toasts } from './components/Toasts';
import { Settings } from './components/Settings';

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

  const [section, sub] = route.split('/');
  const page =
    section === 'einstellungen'
      ? 'einstellungen'
      : section === 'produktionen' || !state.production
        ? 'produktionen'
        : 'regie';

  return (
    <div className="app">
      <TopBar state={state} connected={connected} route={page} go={go} offset={offset} />
      {page === 'einstellungen' && <Settings state={state} tab={sub} go={go} />}
      {page === 'produktionen' && <Home state={state} go={go} />}
      {page === 'regie' && <Regie state={state} production={state.production!} offset={offset} />}
      <Toasts />
    </div>
  );
}
