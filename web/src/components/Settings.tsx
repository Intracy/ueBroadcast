import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppState } from '../../../shared/types';
import type {
  AppSettingsPatch,
  FeedSettings,
  ProductionSettings,
  SettingsResponse,
  SourceKind,
} from '../../../shared/settings';
import { ingestAddresses, nextFeedId } from '../../../shared/settings';
import { formatDuration, parseDuration } from '../../../shared/format';
import { apiRequest, pushToast, send } from '../api';
import { Toggle } from './bits';

interface Props {
  state: AppState;
  tab: string | undefined;
  go: (r: string) => void;
}

interface AppDraft {
  obsUrl: string;
  /** undefined = unverändert lassen */
  obsPassword: string | undefined;
  publicUrl: string;
  relayToken: string;
}

const PLATFORMS = ['', 'N64-Konsole', 'Emulator (PC)', 'Wii U / Switch Online', 'Sonstiges'];

const SCORING_LABEL: Record<string, string> = {
  bestTime: 'Beste Zeit des Events',
  finishedRuns: 'Meiste beendete Runs',
  totalStars: 'Meiste gesammelte Sterne',
};

function appDraftFrom(s: SettingsResponse): AppDraft {
  return { obsUrl: s.app.obsUrl, obsPassword: undefined, publicUrl: s.app.publicUrl, relayToken: s.app.relayToken };
}

/** Standard-Pfad im Ingest-Server zu einer Feed-ID: r07 → runner07 */
function defaultIngestPath(id: string): string {
  const m = /^r(\d+)$/.exec(id);
  return m ? `runner${m[1]}` : id;
}

export function Settings({ state, tab, go }: Props) {
  const production = state.production;
  const isSm64 = production?.format === 'sm64-marathon';
  const feedWord = isSm64 ? 'Runner' : 'Feeds';
  const tabs = [
    ...(production
      ? [
          { id: 'runner', label: feedWord },
          { id: 'produktion', label: 'Produktion' },
        ]
      : []),
    { id: 'obs', label: 'OBS-Verbindung' },
  ];
  const active = tabs.some((t) => t.id === tab) ? tab! : tabs[0].id;

  const [loaded, setLoaded] = useState<SettingsResponse | null>(null);
  const [prodDraft, setProdDraft] = useState<ProductionSettings | null>(null);
  const [appDraft, setAppDraft] = useState<AppDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((s: SettingsResponse) => {
    setLoaded(s);
    setProdDraft(s.production ? structuredClone(s.production) : null);
    setAppDraft(appDraftFrom(s));
  }, []);

  const reload = useCallback(() => {
    apiRequest<SettingsResponse>('/api/settings').then(apply, (err) => setError(err.message));
  }, [apply]);

  useEffect(reload, [reload, production?.id]);

  const prodDirty = !!loaded?.production && JSON.stringify(prodDraft) !== JSON.stringify(loaded.production);
  const appDirty = !!loaded && !!appDraft && JSON.stringify(appDraft) !== JSON.stringify(appDraftFrom(loaded));
  const dirty = prodDirty || appDirty;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      let result: SettingsResponse | null = null;
      if (appDirty && appDraft && loaded) {
        const patch: AppSettingsPatch = {};
        if (appDraft.obsUrl !== loaded.app.obsUrl) patch.obsUrl = appDraft.obsUrl;
        if (appDraft.obsPassword !== undefined) patch.obsPassword = appDraft.obsPassword;
        if (appDraft.publicUrl !== loaded.app.publicUrl) patch.publicUrl = appDraft.publicUrl;
        if (appDraft.relayToken !== loaded.app.relayToken) patch.relayToken = appDraft.relayToken;
        result = await apiRequest<SettingsResponse>('/api/settings/app', patch);
      }
      if (prodDirty && prodDraft) {
        result = await apiRequest<SettingsResponse>('/api/settings/production', prodDraft);
      }
      if (result) apply(result);
      pushToast('ok', 'Einstellungen gespeichert');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (loaded) apply(loaded);
    setError(null);
  };

  const updateProd = (patch: Partial<ProductionSettings>) => setProdDraft((d) => (d ? { ...d, ...patch } : d));
  const updateApp = (patch: Partial<AppDraft>) => setAppDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <main className="settings">
      <header className="settings-head">
        <div>
          <h2>Einstellungen</h2>
          <p className="muted">
            {production ? (
              <>
                Produktion <strong className="text">{production.name}</strong> · {production.formatName}
              </>
            ) : (
              'Keine Produktion aktiv'
            )}
          </p>
        </div>
        <nav className="settings-tabs" role="tablist" aria-label="Bereiche">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={active === t.id}
              className={active === t.id ? 'active' : ''}
              onClick={() => go(`einstellungen/${t.id}`)}
            >
              {t.label}
              {t.id === 'runner' && prodDraft && <span className="count">{prodDraft.feeds.length}</span>}
            </button>
          ))}
        </nav>
      </header>

      {!loaded || !appDraft ? (
        <p className="muted">{error ?? 'Lade Einstellungen …'}</p>
      ) : (
        <>
          {active === 'runner' && prodDraft && (
            <FeedsTab
              draft={prodDraft}
              savedIds={new Set(loaded.production?.feeds.map((f) => f.id) ?? [])}
              update={updateProd}
              state={state}
              isSm64={isSm64}
              word={feedWord}
              relay={{ server: appDraft.publicUrl || location.origin, token: appDraft.relayToken }}
            />
          )}
          {active === 'produktion' && prodDraft && (
            <ProductionTab draft={prodDraft} update={updateProd} isSm64={isSm64} app={appDraft} updateApp={updateApp} />
          )}
          {active === 'obs' && (
            <ObsTab state={state} app={appDraft} passwordSet={loaded.app.obsPasswordSet} updateApp={updateApp} />
          )}
        </>
      )}

      <div className={`savebar ${dirty || error ? 'show' : ''}`} role="region" aria-label="Speichern">
        <span className={error ? 'bad-text' : ''}>
          {error ?? (dirty ? 'Ungespeicherte Änderungen' : 'Alles gespeichert')}
        </span>
        <div className="row">
          <button className="btn" onClick={discard} disabled={!dirty || saving}>
            Verwerfen
          </button>
          <button className="btn primary" onClick={save} disabled={!dirty || saving}>
            {saving ? 'Speichere …' : 'Speichern'}
          </button>
        </div>
      </div>
    </main>
  );
}

// ------------------------------------------------------------------ Runner / Feeds

interface FeedsTabProps {
  draft: ProductionSettings;
  savedIds: Set<string>;
  update: (p: Partial<ProductionSettings>) => void;
  state: AppState;
  isSm64: boolean;
  word: string;
  relay: { server: string; token: string };
}

function FeedsTab({ draft, savedIds, update, state, isSm64, word, relay }: FeedsTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(draft.feeds[0]?.id ?? null);
  const selectedIndex = draft.feeds.findIndex((f) => f.id === selectedId);
  const selected = selectedIndex >= 0 ? draft.feeds[selectedIndex] : null;
  const liveStatus = useMemo(
    () => new Map((state.production?.feeds ?? []).map((f) => [f.id, f.status])),
    [state.production?.feeds],
  );
  const singular = isSm64 ? 'Runner' : 'Feed';

  useEffect(() => {
    if (!selected && draft.feeds.length) setSelectedId(draft.feeds[0].id);
  }, [selected, draft.feeds]);

  const setFeeds = (feeds: FeedSettings[]) => update({ feeds });

  const addFeed = () => {
    const id = nextFeedId(
      draft.feeds.map((f) => f.id),
      isSm64 ? 'r' : 'cam',
    );
    const ingestPath = defaultIngestPath(id);
    const fromIngest = draft.ingestHost ? ingestAddresses(draft.ingestHost, ingestPath) : null;
    const feed: FeedSettings = {
      id,
      label: `${singular} ${draft.feeds.length + 1}`,
      sourceKind: fromIngest ? 'media' : 'none',
      sourceUrl: fromIngest?.sourceUrl ?? '',
      previewUrl: fromIngest?.previewUrl ?? '',
      ingestPath: fromIngest ? ingestPath : '',
      meta: {},
    };
    setFeeds([...draft.feeds, feed]);
    setSelectedId(id);
  };

  const patchFeed = (index: number, patch: Partial<FeedSettings>) =>
    setFeeds(draft.feeds.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= draft.feeds.length) return;
    const feeds = [...draft.feeds];
    [feeds[index], feeds[to]] = [feeds[to], feeds[index]];
    setFeeds(feeds);
  };

  const remove = (index: number) => {
    const feeds = draft.feeds.filter((_, i) => i !== index);
    setFeeds(feeds);
    setSelectedId(feeds[Math.min(index, feeds.length - 1)]?.id ?? null);
  };

  return (
    <div className="feeds-tab">
      <aside className="feed-list" aria-label={`${word}-Liste`}>
        <div className="feed-list-head">
          <strong>
            {draft.feeds.length} {word}
          </strong>
          <button className="btn primary small" onClick={addFeed}>
            + {singular} hinzufügen
          </button>
        </div>
        <ol>
          {draft.feeds.map((f, i) => {
            const status = liveStatus.get(f.id);
            const isNew = !savedIds.has(f.id);
            const missing = !f.label.trim() || (f.sourceKind !== 'none' && !f.sourceUrl.trim());
            return (
              <li key={f.id}>
                <button
                  className={`feed-item ${f.id === selectedId ? 'active' : ''}`}
                  onClick={() => setSelectedId(f.id)}
                  aria-current={f.id === selectedId}
                >
                  <span className="feed-num">{i + 1}</span>
                  <span className="feed-name">
                    <strong>{f.label || 'Ohne Namen'}</strong>
                    <small className="muted">
                      {f.id}
                      {isSm64 && typeof f.meta.pbMs === 'number' ? ` · PB ${formatDuration(f.meta.pbMs)}` : ''}
                    </small>
                  </span>
                  {isNew ? (
                    <span className="tag new">neu</span>
                  ) : missing ? (
                    <span className="tag warn">unvollständig</span>
                  ) : f.sourceKind === 'none' ? (
                    <span className="tag">kein Signal</span>
                  ) : (
                    <i className={`dot ${status ?? ''}`} title={status === 'live' ? 'Signal da' : 'kein Signal'} />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        {draft.feeds.length === 0 && <p className="muted small">Noch keine {word}. Lege den ersten an.</p>}
      </aside>

      {selected ? (
        <FeedForm
          key={selected.id}
          feed={selected}
          index={selectedIndex}
          count={draft.feeds.length}
          isNew={!savedIds.has(selected.id)}
          allIds={draft.feeds.map((f) => f.id)}
          isSm64={isSm64}
          singular={singular}
          ingestHost={draft.ingestHost}
          relay={relay}
          onChange={(patch) => {
            patchFeed(selectedIndex, patch);
            if (patch.id) setSelectedId(patch.id);
          }}
          onMove={(dir) => move(selectedIndex, dir)}
          onRemove={() => remove(selectedIndex)}
        />
      ) : (
        <div className="feed-form empty">
          <p className="muted">Wähle links einen Eintrag oder lege einen neuen an.</p>
        </div>
      )}
    </div>
  );
}

interface FeedFormProps {
  feed: FeedSettings;
  index: number;
  count: number;
  isNew: boolean;
  allIds: string[];
  isSm64: boolean;
  singular: string;
  ingestHost: string;
  relay: { server: string; token: string };
  onChange: (patch: Partial<FeedSettings>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

function FeedForm({
  feed,
  index,
  count,
  isNew,
  allIds,
  isSm64,
  singular,
  ingestHost,
  relay,
  onChange,
  onMove,
  onRemove,
}: FeedFormProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pbText, setPbText] = useState(typeof feed.meta.pbMs === 'number' ? formatDuration(feed.meta.pbMs) : '');
  const meta = (key: string) => (typeof feed.meta[key] === 'string' ? (feed.meta[key] as string) : '');
  const setMeta = (key: string, value: unknown) => {
    const next = { ...feed.meta };
    if (value === '' || value === null || value === undefined) delete next[key];
    else next[key] = value;
    onChange({ meta: next });
  };
  const pbInvalid = pbText.trim() !== '' && parseDuration(pbText) === null;
  const idTaken = allIds.filter((x) => x === feed.id).length > 1;
  const fid = (name: string) => `feed-${name}`;

  const fillFromIngest = () => {
    const path = feed.ingestPath.trim() || defaultIngestPath(feed.id);
    const a = ingestAddresses(ingestHost, path);
    onChange({ sourceKind: 'media', sourceUrl: a.sourceUrl, previewUrl: a.previewUrl, ingestPath: path });
  };

  const relayCmd = `node split-relay.mjs --server ${relay.server} --feed ${feed.id}${relay.token ? ` --token ${relay.token}` : ''}`;
  const publishUrl =
    ingestHost.trim() && feed.ingestPath.trim() ? ingestAddresses(ingestHost, feed.ingestPath.trim()).publishUrl : null;

  return (
    <section className="feed-form" aria-label={`${singular} bearbeiten`}>
      <div className="feed-form-head">
        <h3 className="feed-title">{feed.label || 'Ohne Namen'}</h3>
        <div className="row">
          <span className="muted small">
            Position {index + 1} von {count}
            {index < 10 ? ` · Taste ${index === 9 ? 0 : index + 1}` : ''}
          </span>
          <button className="mini" onClick={() => onMove(-1)} disabled={index === 0} title="Nach oben">
            ↑
          </button>
          <button className="mini" onClick={() => onMove(1)} disabled={index === count - 1} title="Nach unten">
            ↓
          </button>
        </div>
      </div>

      <fieldset>
        <legend>{isSm64 ? 'Runner' : 'Allgemein'}</legend>
        <div className="form-grid">
          <label className="field" htmlFor={fid('label')}>
            <span>Name (wird eingeblendet) *</span>
            <input
              id={fid('label')}
              value={feed.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder={isSm64 ? 'z. B. SpeedyMario' : 'z. B. Totale'}
              aria-invalid={!feed.label.trim()}
            />
          </label>
          <label className="field" htmlFor={fid('id')}>
            <span>ID {isNew ? '' : '(fest)'}</span>
            <input
              id={fid('id')}
              value={feed.id}
              disabled={!isNew}
              onChange={(e) => onChange({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
              aria-invalid={idTaken}
            />
            {idTaken && <small className="bad-text">Diese ID gibt es schon.</small>}
          </label>
          <label className="field" htmlFor={fid('twitch')}>
            <span>Twitch-Kanal</span>
            <input
              id={fid('twitch')}
              value={meta('twitch')}
              onChange={(e) => setMeta('twitch', e.target.value)}
              placeholder="kanalname"
            />
          </label>
          <label className="field" htmlFor={fid('discord')}>
            <span>Discord / Kontakt</span>
            <input
              id={fid('discord')}
              value={meta('discord')}
              onChange={(e) => setMeta('discord', e.target.value)}
              placeholder="name"
            />
          </label>
          {isSm64 && (
            <>
              <label className="field" htmlFor={fid('pb')}>
                <span>Persönliche Bestzeit (PB) 70 Stars</span>
                <input
                  id={fid('pb')}
                  value={pbText}
                  inputMode="numeric"
                  placeholder="z. B. 52:13"
                  aria-invalid={pbInvalid}
                  onChange={(e) => {
                    setPbText(e.target.value);
                    const ms = parseDuration(e.target.value);
                    if (e.target.value.trim() === '') setMeta('pbMs', null);
                    else if (ms !== null) setMeta('pbMs', ms);
                  }}
                />
                {pbInvalid ? (
                  <small className="bad-text">Format mm:ss oder h:mm:ss</small>
                ) : (
                  <small className="muted">Grundlage für „PB-Pace“ im Highlight-Radar</small>
                )}
              </label>
              <label className="field" htmlFor={fid('platform')}>
                <span>Plattform</span>
                <select
                  id={fid('platform')}
                  value={meta('platform')}
                  onChange={(e) => setMeta('platform', e.target.value)}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p || '– nicht angegeben –'}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        <label className="field" htmlFor={fid('notes')}>
          <span>Notizen für die Regie</span>
          <textarea
            id={fid('notes')}
            rows={2}
            value={meta('notes')}
            onChange={(e) => setMeta('notes', e.target.value)}
            placeholder="z. B. Aussprache des Namens, Zeitzone, verfügbare Tage"
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Signal</legend>
        <div className="radio-row" role="radiogroup" aria-label="Signalquelle">
          {(
            [
              ['media', 'Stream (SRT/RTMP über Ingest-Server)'],
              ['browser', 'Browser-Link (z. B. VDO.Ninja)'],
              ['none', 'Noch kein Signal'],
            ] as Array<[SourceKind, string]>
          ).map(([kind, label]) => (
            <label key={kind} className={`radio ${feed.sourceKind === kind ? 'on' : ''}`}>
              <input
                type="radio"
                name={fid('kind')}
                checked={feed.sourceKind === kind}
                onChange={() => onChange({ sourceKind: kind })}
              />
              {label}
            </label>
          ))}
        </div>
        {feed.sourceKind !== 'none' && (
          <div className="form-grid">
            <label className="field wide" htmlFor={fid('source')}>
              <span>{feed.sourceKind === 'media' ? 'Stream-Adresse, die OBS abspielt *' : 'Browser-Adresse *'}</span>
              <input
                id={fid('source')}
                value={feed.sourceUrl}
                onChange={(e) => onChange({ sourceUrl: e.target.value })}
                placeholder={
                  feed.sourceKind === 'media'
                    ? 'srt://ingest.example.com:8890?streamid=read:runner01'
                    : 'https://vdo.ninja/?view=…'
                }
                aria-invalid={!feed.sourceUrl.trim()}
              />
            </label>
            <label className="field" htmlFor={fid('preview')}>
              <span>Vorschau für die Multiview</span>
              <input
                id={fid('preview')}
                value={feed.previewUrl}
                onChange={(e) => onChange({ previewUrl: e.target.value })}
                placeholder="http://ingest.example.com:8889/runner01"
              />
            </label>
            <label className="field" htmlFor={fid('path')}>
              <span>Pfad im Ingest-Server</span>
              <input
                id={fid('path')}
                value={feed.ingestPath}
                onChange={(e) => onChange({ ingestPath: e.target.value })}
                placeholder={defaultIngestPath(feed.id)}
              />
            </label>
          </div>
        )}
        <div className="row">
          <button className="btn small" onClick={fillFromIngest} disabled={!ingestHost.trim()}>
            Adressen vom Ingest-Server übernehmen
          </button>
          <span className="muted small">
            {ingestHost.trim()
              ? `Erzeugt die Adressen für ${ingestHost.trim()} (MediaMTX-Standardports).`
              : 'Dafür im Reiter „Produktion“ den Ingest-Server eintragen.'}
          </span>
        </div>
      </fieldset>

      {(isSm64 || publishUrl) && (
        <fieldset>
          <legend>Für den {singular} zum Weitergeben</legend>
          {publishUrl && (
            <CopyLine label="Sendeadresse für sein OBS (Benutzer/Passwort aus MediaMTX ergänzen)" value={publishUrl} />
          )}
          {isSm64 && (
            <>
              <CopyLine label="Split-Relay starten (LiveSplit-TCP-Server muss laufen)" value={relayCmd} />
              {isNew && <p className="muted small">Das Relay funktioniert erst, nachdem du gespeichert hast.</p>}
            </>
          )}
        </fieldset>
      )}

      <div className="danger-zone">
        {confirmRemove ? (
          <>
            <span>
              {feed.label || singular} wirklich entfernen? Er verschwindet aus Multiview, Tabelle und OBS-Steuerung.
            </span>
            <button className="btn danger" onClick={onRemove}>
              Ja, entfernen
            </button>
            <button className="btn" onClick={() => setConfirmRemove(false)}>
              Abbrechen
            </button>
          </>
        ) : (
          <button className="btn ghost danger-text" onClick={() => setConfirmRemove(true)}>
            {singular} entfernen
          </button>
        )}
      </div>
    </section>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copyline">
      <span className="muted small">{label}</span>
      <div className="copyline-row">
        <code>{value}</code>
        <button
          className="mini"
          onClick={() => {
            navigator.clipboard.writeText(value).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => pushToast('error', 'Kopieren nicht möglich – Text bitte markieren'),
            );
          }}
        >
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Produktion

function ProductionTab({
  draft,
  update,
  isSm64,
  app,
  updateApp,
}: {
  draft: ProductionSettings;
  update: (p: Partial<ProductionSettings>) => void;
  isSm64: boolean;
  app: AppDraft;
  updateApp: (p: Partial<AppDraft>) => void;
}) {
  const [extra, setExtra] = useState(draft.extraSources.join(', '));
  return (
    <div className="settings-grid">
      <fieldset>
        <legend>Allgemein</legend>
        <label className="field" htmlFor="prod-name">
          <span>Name der Produktion *</span>
          <input id="prod-name" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label className="field" htmlFor="prod-desc">
          <span>Beschreibung</span>
          <textarea
            id="prod-desc"
            rows={3}
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
          />
        </label>
        {isSm64 && (
          <label className="field" htmlFor="prod-scoring">
            <span>Wertung für Tabelle und Leaderboard</span>
            <select
              id="prod-scoring"
              value={draft.scoring ?? 'bestTime'}
              onChange={(e) => update({ scoring: e.target.value })}
            >
              {Object.entries(SCORING_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Simulation</legend>
        <Toggle
          checked={draft.simulationEnabled}
          onChange={(v) => update({ simulationEnabled: v })}
          label="Simulationsmodus"
          hint={
            isSm64
              ? 'Erzeugt Runs und Feeds zum Proben. Für das echte Event ausschalten.'
              : 'Alle Feeds gelten als live – zum Proben ohne Signale.'
          }
        />
        {isSm64 && (
          <label className="field" htmlFor="prod-speed">
            <span>Tempo der Simulation (× Echtzeit)</span>
            <input
              id="prod-speed"
              type="number"
              min={1}
              max={60}
              value={draft.simulationSpeed}
              disabled={!draft.simulationEnabled}
              onChange={(e) => update({ simulationSpeed: Number(e.target.value) })}
            />
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Ingest-Server (MediaMTX)</legend>
        <label className="field" htmlFor="prod-ingest-host">
          <span>Adresse des Servers</span>
          <input
            id="prod-ingest-host"
            value={draft.ingestHost}
            onChange={(e) => update({ ingestHost: e.target.value })}
            placeholder="ingest.example.com"
          />
          <small className="muted">
            Daraus erzeugt ueBroadcast die Stream- und Vorschau-Adressen der {isSm64 ? 'Runner' : 'Feeds'}.
          </small>
        </label>
        <label className="field" htmlFor="prod-ingest-api">
          <span>MediaMTX-API für Signalstatus und Bitrate</span>
          <input
            id="prod-ingest-api"
            value={draft.ingestApi}
            onChange={(e) => update({ ingestApi: e.target.value })}
            placeholder="http://ingest.example.com:9997"
          />
        </label>
        <button
          className="btn small"
          disabled={!draft.ingestHost.trim()}
          onClick={() => update({ ingestApi: ingestAddresses(draft.ingestHost, '').apiUrl })}
        >
          API-Adresse aus Server ableiten
        </button>
      </fieldset>

      <fieldset>
        <legend>Regie</legend>
        <label className="field" htmlFor="prod-hold">
          <span>Autopilot: Mindesthaltezeit pro Bild (Sekunden)</span>
          <input
            id="prod-hold"
            type="number"
            min={5}
            max={600}
            value={draft.autopilotMinHoldSec}
            onChange={(e) => update({ autopilotMinHoldSec: Number(e.target.value) })}
          />
        </label>
        <label className="field" htmlFor="prod-extra">
          <span>Zusätzliche OBS-Quellen über den Feeds (kommagetrennt)</span>
          <input
            id="prod-extra"
            value={extra}
            onChange={(e) => {
              setExtra(e.target.value);
              update({
                extraSources: e.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              });
            }}
            placeholder="z. B. Kommentar"
          />
          <small className="muted">Namen von Quellen oder Szenen in OBS, z. B. die Kameras des Kommentarteams.</small>
        </label>
        <Toggle
          checked={draft.twitchAutoMarkers}
          onChange={(v) => update({ twitchAutoMarkers: v })}
          label="Twitch-Marker automatisch setzen"
          hint="Bei PBs, Event-Bestzeiten und PB-Pace (nur mit Twitch-Zugang in der .env)."
        />
      </fieldset>

      {isSm64 && (
        <fieldset>
          <legend>Split-Relay der Runner</legend>
          <label className="field" htmlFor="app-relay-token">
            <span>Zugangs-Token</span>
            <input
              id="app-relay-token"
              value={app.relayToken}
              onChange={(e) => updateApp({ relayToken: e.target.value })}
              placeholder="leer = ohne Schutz (nur im lokalen Netz)"
            />
          </label>
          <button
            className="btn small"
            onClick={() =>
              updateApp({
                relayToken: Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
                  b.toString(16).padStart(2, '0'),
                ).join(''),
              })
            }
          >
            Zufälliges Token erzeugen
          </button>
          <p className="muted small">
            Pflicht, sobald ueBroadcast aus dem Internet erreichbar ist. Das Token steht im Relay-Befehl jedes Runners.
          </p>
        </fieldset>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ OBS

function ObsTab({
  state,
  app,
  passwordSet,
  updateApp,
}: {
  state: AppState;
  app: AppDraft;
  passwordSet: boolean;
  updateApp: (p: Partial<AppDraft>) => void;
}) {
  const obs = state.obs;
  const overlayUrl = `${(app.publicUrl || location.origin).replace(/\/$/, '')}/overlay.html?view=program`;
  let tone = 'neutral';
  let headline = 'Simulationsmodus – keine OBS-Verbindung eingetragen';
  if (obs.mode === 'obs') {
    if (!obs.connected) {
      tone = 'bad';
      headline = obs.error ? `Keine Verbindung: ${obs.error}` : 'Verbinde …';
    } else if (!obs.setupDone) {
      tone = 'warn';
      headline = 'Verbunden – OBS ist noch nicht eingerichtet';
    } else {
      tone = 'good';
      headline = 'Verbunden und eingerichtet';
    }
  }

  return (
    <div className="settings-grid">
      <fieldset className="span-2">
        <legend>Status</legend>
        <div className={`status-card ${tone}`}>
          <i className="dot" />
          <div>
            <strong>{headline}</strong>
            <div className="muted small">
              {obs.mode === 'obs'
                ? obs.url
                : 'ueBroadcast läuft ohne OBS. Takes und Grafiken wirken nur in der Oberfläche.'}
              {obs.connected &&
                ` · Studio-Modus ${obs.studioMode ? 'an' : 'aus'} · Programmszene: ${obs.programScene ?? '–'}`}
            </div>
          </div>
          <div className="row">
            <button className="btn" disabled={obs.mode !== 'obs'} onClick={() => send('obs.reconnect')}>
              Neu verbinden
            </button>
            <button className="btn primary" disabled={!obs.connected} onClick={() => send('obs.setup')}>
              {obs.setupDone ? 'OBS erneut einrichten' : 'OBS einrichten'}
            </button>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Verbindung</legend>
        <label className="field" htmlFor="obs-url">
          <span>WebSocket-Adresse von OBS</span>
          <input
            id="obs-url"
            value={app.obsUrl}
            onChange={(e) => updateApp({ obsUrl: e.target.value })}
            placeholder="ws://127.0.0.1:4455"
          />
          <small className="muted">Leer lassen für den Simulationsmodus ohne OBS.</small>
        </label>
        <label className="field" htmlFor="obs-pass">
          <span>Passwort</span>
          <input
            id="obs-pass"
            type="password"
            autoComplete="off"
            value={app.obsPassword ?? ''}
            onChange={(e) => updateApp({ obsPassword: e.target.value })}
            placeholder={passwordSet ? 'gespeichert – leer lassen, um es zu behalten' : 'kein Passwort gesetzt'}
          />
        </label>
        <div className="row">
          {passwordSet && app.obsPassword === undefined && (
            <button className="btn small" onClick={() => updateApp({ obsPassword: '' })}>
              Gespeichertes Passwort entfernen
            </button>
          )}
          {!app.obsUrl && (
            <button className="btn small" onClick={() => updateApp({ obsUrl: 'ws://127.0.0.1:4455' })}>
              OBS auf diesem Rechner eintragen
            </button>
          )}
        </div>
        <p className="muted small">
          Nach dem Speichern verbindet ueBroadcast sich sofort. Das Passwort liegt nur lokal in{' '}
          <code>data/settings.json</code>.
        </p>
      </fieldset>

      <fieldset>
        <legend>In OBS vorbereiten</legend>
        <ol className="steps small">
          <li>
            In OBS <strong>Werkzeuge → WebSocket-Servereinstellungen</strong> öffnen.
          </li>
          <li>„WebSocket-Server aktivieren“ einschalten, Port (Standard 4455) und Passwort übernehmen.</li>
          <li>Adresse und Passwort hier eintragen und speichern.</li>
          <li>
            Auf <strong>OBS einrichten</strong> klicken: ueBroadcast legt die Szenen „ueB Programm A/B“, eine Quelle pro{' '}
            Feed und das Overlay an.
          </li>
          <li>Für weiche Übergänge in OBS den Studio-Modus einschalten.</li>
        </ol>
      </fieldset>

      <fieldset className="span-2">
        <legend>Overlay</legend>
        <label className="field" htmlFor="public-url">
          <span>Adresse, unter der OBS ueBroadcast erreicht</span>
          <input
            id="public-url"
            value={app.publicUrl}
            onChange={(e) => updateApp({ publicUrl: e.target.value })}
            placeholder={`http://localhost:${location.port || 4400}`}
          />
          <small className="muted">
            Läuft OBS auf einem anderen Rechner, hier die Netzwerkadresse dieses Rechners eintragen (z. B.
            http://192.168.1.20:4400).
          </small>
        </label>
        <CopyLine
          label="Overlay als Browserquelle (1920 × 1080) – wird beim Einrichten automatisch angelegt"
          value={overlayUrl}
        />
      </fieldset>
    </div>
  );
}
