# Neue Event-Formate anlegen

Ein **Format** beschreibt eine Art von Produktion. Der Kern von ueBroadcast (Feeds, Layouts, Vorschau/Programm, Take, OBS, Audio-Follow, Failover, Grafik, Logbuch, Autopilot) ist für alle Formate gleich. Ein Format liefert nur die inhaltliche Logik:

- **Daten:** woher Informationen über die Feeds kommen (LiveSplit-Relay, API eines Turniersystems, Ablaufplan …),
- **Insights:** je Feed ein Score mit Gründen und Kennzahlen. Daraus speisen sich Highlight-Radar, Autopilot, Kachel-Infos, Slot-Beschriftungen und der Ticker,
- **Aktionen:** eigene Bedienelemente in der Regie,
- **Grafik:** optional eigene Overlay-Bausteine, z. B. eine Tabelle.

## 1. Server-Teil

Neuer Ordner `server/formats/<name>/index.ts` mit einer `FormatDefinition` (Schnittstelle in `server/formats/types.ts`):

```ts
import { ActionError, type FormatDefinition } from '../types';

export const quizFormat: FormatDefinition = {
  id: 'quiz',
  name: 'Quiz-Show',
  description: 'Teams mit Buzzer, Punktestand und Fragenrunden.',
  create(config, ctx) {
    const scores = new Map(config.feeds.map((f) => [f.id, 0]));
    return {
      start() {},
      stop() {},
      getState: () => ({ scores: Object.fromEntries(scores) }),
      getInsights: () =>
        ctx.feeds().map((f) => ({
          feedId: f.id,
          score: 0,
          reasons: [],
          status: f.status === 'live' ? 'bereit' : 'kein Signal',
          stats: `${scores.get(f.id)} Punkte`,
          deltaMs: null,
          timer: null,
          partnerFeedId: null,
        })),
      handleAction(action, payload) {
        const p = payload as { feedId?: string; points?: number };
        if (action !== 'points' || !p.feedId) throw new ActionError('Unbekannte Aktion');
        scores.set(p.feedId, (scores.get(p.feedId) ?? 0) + (p.points ?? 1));
        ctx.log('quiz', `Punkte für ${p.feedId}`);
      },
      serialize: () => Object.fromEntries(scores),
      restore: (data) => Object.entries(data as Record<string, number>).forEach(([k, v]) => scores.set(k, v)),
    };
  },
};
```

Dann in `server/formats/index.ts` in die Liste `FORMATS` eintragen.

Wichtige Werkzeuge aus dem Kontext `ctx`:

| Methode                                                       | Zweck                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `ctx.feeds()`                                                 | aktuelle Feeds inkl. Status, „auf Sendung“, „zuletzt gesendet“            |
| `ctx.alert(level, text, { feedId, key, cooldownMs, marker })` | Meldung in der Regie, optional mit Twitch-Marker                          |
| `ctx.log(kind, text)`                                         | Logbuch-Eintrag                                                           |
| `ctx.changed()`                                               | Zustand hat sich außerhalb einer Aktion geändert, z. B. durch einen Timer |
| `ctx.simulation`                                              | Simulationsmodus aktiv: Daten selbst erzeugen                             |

Aktionen aus der Oberfläche kommen als `format.<aktion>` an und landen ohne Präfix in `handleAction`. Externe Daten (`POST /api/feeds/<feedId>/run`) landen in `ingest`.

## 2. Oberfläche (optional)

In `web/src/formats/index.tsx` einen Eintrag ergänzen:

```ts
quiz: {
  radar: false,            // Highlight-Radar und Autopilot anzeigen?
  Panel: QuizPanel,        // eigener Reiter in der Regie
  panelTitle: 'Punkte',
  tileDetail: (state, feedId) => '…',  // Zusatzzeile in der Multiview-Kachel
  OverlayBoard: QuizBoard, // Tabelle im Overlay und auf dem Pausen-Slate
  boardData: quizBoardData, // Zeilen/Spalten für Tabellen-Band, Vollbild-Tabelle und Lower Third
},
```

Ohne Eintrag funktioniert das Format trotzdem: Regie, Layouts, Take und Overlay laufen mit den Insights des Formats.

## 3. Produktion anlegen

Eine JSON-Datei in `productions/`:

```json
{
  "id": "quiz-dezember",
  "name": "Quiz im Dezember",
  "format": "quiz",
  "feeds": [
    { "id": "team1", "label": "Team Rot", "source": { "kind": "browser", "url": "https://vdo.ninja/?view=team1" } }
  ],
  "layouts": [
    { "id": "single", "name": "Einzel", "hotkey": "q", "slots": [{ "id": "main", "x": 0, "y": 0, "w": 1, "h": 1 }] }
  ],
  "formatConfig": {}
}
```

Felder der Produktions-Konfiguration:

| Feld                                  | Bedeutung                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`, `name`, `format`, `description` | Grunddaten; `format` muss einem registrierten Format entsprechen                                             |
| `feeds[]`                             | `id`, `label`, optional `source` (`kind`: `media` oder `browser`, `url`), `previewUrl`, `ingestPath`, `meta` |
| `layouts[]`                           | eigene Layouts (sonst Standard-Layouts); Slots relativ zur Leinwand (0–1)                                    |
| `defaultLayout`                       | Startlayout                                                                                                  |
| `ingest.mediamtxApi`                  | MediaMTX-API für Feed-Status und Bitrate                                                                     |
| `obs.extraSources`                    | vorhandene OBS-Quellen/Szenen, die über den Feeds liegen                                                     |
| `simulation`                          | `enabled`, `speed`                                                                                           |
| `autopilot`                           | `layoutId`, `minHoldSec`                                                                                     |
| `twitch.autoMarkers`                  | Marker automatisch bei Highlight-Meldungen mit `marker: true`                                                |
| `formatConfig`                        | alles, was das Format braucht                                                                                |

Nach dem Anlegen in der Oberfläche unter **Produktionen → Neu laden** auswählen und aktivieren.
