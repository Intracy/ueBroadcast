import { useEffect, useMemo, useState } from 'react';
import type { AppState, ProductionState } from '../../../shared/types';
import { send, useNow } from '../api';
import { Monitor } from './Monitor';
import { CommentaryBar } from './Commentary';
import { Multiview } from './Multiview';
import { Alerts, Radar } from './Radar';
import { ToolsPanel } from './ToolsPanel';
import { formatUi } from '../formats';

const LIVE_MONITORS_KEY = 'ueb.liveMonitors';

/** Standard: Live-Bild im Programm an, in der Vorschau aus (jede Ansicht kostet die Runner Upload). */
function loadLiveMonitors(): { preview: boolean; program: boolean } {
  try {
    const raw = localStorage.getItem(LIVE_MONITORS_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { preview?: unknown; program?: unknown };
      return { preview: v.preview === true, program: v.program !== false };
    }
  } catch {
    /* ignorieren */
  }
  return { preview: false, program: true };
}

interface Props {
  state: AppState;
  production: ProductionState;
  offset: number;
}

export function Regie({ state, production, offset }: Props) {
  const now = useNow(250);
  const feeds = useMemo(() => new Map(production.feeds.map((f) => [f.id, f])), [production.feeds]);
  const insights = useMemo(() => new Map(production.insights.map((i) => [i.feedId, i])), [production.insights]);
  const previewLayout = production.layouts.find((l) => l.id === production.preview.layoutId);
  const programLayout = production.layouts.find((l) => l.id === production.program.layoutId);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(previewLayout?.slots[0]?.id ?? null);
  const [liveMonitors, setLiveMonitors] = useState<{ preview: boolean; program: boolean }>(loadLiveMonitors);
  const toggleLive = (kind: 'preview' | 'program') =>
    setLiveMonitors((m) => {
      const next = { ...m, [kind]: !m[kind] };
      try {
        localStorage.setItem(LIVE_MONITORS_KEY, JSON.stringify(next));
      } catch {
        /* Speicher nicht verfügbar – Einstellung gilt nur bis zum Neuladen */
      }
      return next;
    });

  // Auswahl gültig halten, wenn das Layout wechselt
  useEffect(() => {
    if (!previewLayout?.slots.some((s) => s.id === selectedSlot)) setSelectedSlot(previewLayout?.slots[0]?.id ?? null);
  }, [previewLayout, selectedSlot]);

  const assign = (slotId: string, feedId: string) => send('preview.assign', { slotId, feedId });

  /** Feed in den gewählten Slot, danach springt die Auswahl zum nächsten Slot. */
  const pick = (feedId: string) => {
    if (!previewLayout || previewLayout.slots.length === 0) return;
    const slotId = selectedSlot ?? previewLayout.slots[0].id;
    assign(slotId, feedId);
    const idx = previewLayout.slots.findIndex((s) => s.id === slotId);
    const next = previewLayout.slots[idx + 1];
    if (next) setSelectedSlot(next.id);
  };

  const toPreviewMain = (feedId: string) => {
    const main = previewLayout?.slots[0]?.id;
    if (main) assign(main, feedId);
  };

  // Tastatur: 1–0 Feed in Slot, Enter/Leertaste Take, Layout-Kürzel, ←/→ Slot, M Marker
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter' || e.key === ' ') {
        if (t.closest('button')) return;
        e.preventDefault();
        send('take');
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        const idx = e.key === '0' ? 9 : Number(e.key) - 1;
        const feed = production.feeds[idx];
        if (feed) pick(feed.id);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const slots = previewLayout?.slots ?? [];
        const i = slots.findIndex((s) => s.id === selectedSlot);
        const next = slots[(i + (e.key === 'ArrowRight' ? 1 : slots.length - 1)) % Math.max(1, slots.length)];
        if (next) setSelectedSlot(next.id);
        return;
      }
      if (production.commentary && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'o')) {
        const want = e.key.toLowerCase() === 'k' ? 'full' : 'pip';
        const current = production.preview.host?.mode ?? 'off';
        send('preview.host', { mode: current === want ? 'off' : want });
        return;
      }
      if (e.key.toLowerCase() === 'm') {
        send('marker', { text: 'Highlight' });
        return;
      }
      const layout = production.layouts.find((l) => l.hotkey && l.hotkey.toLowerCase() === e.key.toLowerCase());
      if (layout) send('preview.layout', { layoutId: layout.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const sinceTake = production.lastTakeAt ? Math.round((now + offset - production.lastTakeAt) / 1000) : null;

  return (
    <main className="regie">
      <div className="regie-main">
        <div className="monitors">
          <Monitor
            kind="preview"
            layout={previewLayout}
            comp={production.preview}
            feeds={feeds}
            insights={insights}
            now={now}
            offset={offset}
            selectedSlot={selectedSlot}
            onSelectSlot={setSelectedSlot}
            onDropFeed={assign}
            simulation={production.simulation}
            commentary={production.commentary}
            tickerOn={production.graphics.ticker}
            snapshotAvailable={state.obs.mode === 'obs' && state.obs.connected}
            live={liveMonitors.preview}
            onToggleLive={() => toggleLive('preview')}
          />
          <div className="take-col">
            <button className="take" onClick={() => send('take')} title="Enter oder Leertaste">
              TAKE
            </button>
            <button className="btn ghost small" onClick={() => send('preview.fromProgram')}>
              Programm → Vorschau
            </button>
            <div className="muted small center">
              {sinceTake !== null
                ? `letzter Take vor ${sinceTake < 120 ? `${sinceTake} s` : `${Math.round(sinceTake / 60)} min`}`
                : 'noch kein Take'}
            </div>
            {production.autopilot && <div className="pill warn">Autopilot aktiv</div>}
          </div>
          <Monitor
            kind="program"
            layout={programLayout}
            comp={production.program}
            feeds={feeds}
            insights={insights}
            now={now}
            offset={offset}
            simulation={production.simulation}
            commentary={production.commentary}
            tickerOn={production.graphics.ticker}
            snapshotAvailable={state.obs.mode === 'obs' && state.obs.connected}
            live={liveMonitors.program}
            onToggleLive={() => toggleLive('program')}
          />
        </div>

        <div className="layoutbar" role="toolbar" aria-label="Layouts">
          {production.layouts.map((l) => (
            <button
              key={l.id}
              className={production.preview.layoutId === l.id ? 'active' : ''}
              onClick={() => send('preview.layout', { layoutId: l.id })}
            >
              {l.hotkey && <kbd>{l.hotkey.toUpperCase()}</kbd>}
              {l.name}
            </button>
          ))}
          <span className="hint muted small">
            Slot wählen → Feed klicken (1–0) oder ziehen · Enter = Take · K/O = Kommentar · M = Marker
          </span>
        </div>

        <CommentaryBar production={production} obs={state.obs} />

        <Multiview production={production} insights={insights} now={now} offset={offset} onPick={pick} />
      </div>

      <aside className="regie-side">
        {formatUi(production.format).radar && <Radar production={production} feeds={feeds} toPreview={toPreviewMain} />}
        <Alerts production={production} toPreview={toPreviewMain} />
      </aside>

      <div className="regie-tools">
        <ToolsPanel state={state} production={production} now={now} offset={offset} />
      </div>
    </main>
  );
}
