# ueBroadcast

Browserbasiertes Broadcast- und Regie-Tool für OBS. Eine Bildregie-Person steuert damit viele Feeds gleichzeitig: Multiview, Vorschau/Programm, Layouts, Take, Audio-Follow, Grafik-Overlay, Störungsalarm und ein Highlight-Radar, das die spannendsten Momente vorschlägt.

ueBroadcast ist in **Produktionsumgebungen** organisiert. Jede Produktion nutzt ein **Format**, das die inhaltliche Logik mitbringt:

| Format          | Wofür                                                                                | Status                       |
| --------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| `sm64-marathon` | Super-Mario-64-Speedrun-Event (70 Stars) mit ca. 10 Remote-Runnern, Host + Kommentar | erstes Event, voll ausgebaut |
| `multicam`      | Talk, Podcast, Panel, Bühne: Kameras, Bauchbinden, Ablaufplan                        | Vorlage für weitere Formate  |

Weitere Event-Formate lassen sich ergänzen, ohne den Kern anzufassen – siehe [docs/FORMATE.md](docs/FORMATE.md). Das zugrunde liegende Konzept steht in [docs/KONZEPT.md](docs/KONZEPT.md).

## Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.19.

```bash
npm install
npm start
```

Dann im Browser **http://localhost:4400** öffnen. Auf dem Mac geht es auch per Doppelklick auf **„ueBroadcast starten.command“** – das Skript installiert beim ersten Mal die Pakete und öffnet den Browser. Ohne weitere Einstellungen läuft alles im **Simulationsmodus**: zehn simulierte Runner spielen Mario 64 mit sechsfacher Geschwindigkeit, inklusive Splits, Resets, PBs und Feed-Ausfällen. So lässt sich die Regie ohne OBS und ohne Runner ausprobieren und proben.

## Einstellungen

Über den Knopf **Einstellungen** oben rechts (oder einen Klick auf den OBS-Status) öffnet sich die Einstellungsseite mit drei Reitern:

| Reiter                                      | Inhalt                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runner** (bei anderen Formaten **Feeds**) | Runner hinzufügen, bearbeiten, sortieren und entfernen. Pro Runner: Name, Twitch-Kanal, Discord, PB, Plattform, Notizen, Signalquelle (Stream über den Ingest-Server oder Browser-Link), Vorschau-Adresse, Ingest-Pfad. Dazu die Sendeadresse und der Split-Relay-Befehl zum Weitergeben. |
| **Produktion**                              | Name, Beschreibung, Wertung, Simulationsmodus, Ingest-Server (MediaMTX), Autopilot-Haltezeit, zusätzliche OBS-Quellen, Twitch-Marker, Token für das Split-Relay                                                                                                                           |
| **OBS-Verbindung**                          | Status, WebSocket-Adresse und Passwort, „OBS einrichten“, Overlay-Adresse                                                                                                                                                                                                                 |

Änderungen sammeln sich in einer Leiste unten und werden erst mit **Speichern** übernommen. Die Produktion lädt dann sofort neu: Neue Runner erscheinen in Multiview, Radar und Tabelle, das Raster „Alle“ passt sich der Anzahl an. Ist OBS bereits eingerichtet, legt ueBroadcast die Quellen neuer Runner direkt an. Laufende Runs, Bestzeiten und das Logbuch bleiben erhalten.

Gespeichert wird in `productions/<id>.json` (Produktion und Runner) und `data/settings.json` (OBS-Zugang, Overlay-Adresse, Relay-Token; nur lokal, nicht im Repository).

## Mit OBS verbinden

1. In OBS **Werkzeuge → WebSocket-Servereinstellungen** öffnen, Server aktivieren, Port und Passwort notieren.
2. In ueBroadcast unter **Einstellungen → OBS-Verbindung** Adresse (meist `ws://127.0.0.1:4455`) und Passwort eintragen und speichern. Alternativ `OBS_URL` und `OBS_PASSWORD` in einer `.env`-Datei; Werte aus den Einstellungen haben Vorrang.
3. Sobald „Verbunden – OBS ist noch nicht eingerichtet“ erscheint, auf **OBS einrichten** klicken.

Das Einrichten legt in OBS an (mehrfach ausführbar, ändert nichts doppelt):

- zwei Szenen **„ueB Programm A“** und **„ueB Programm B“**,
- je Feed eine Quelle **„ueB Feed &lt;id&gt;“** (Medienquelle für SRT/RTMP, Browserquelle z. B. für VDO.Ninja),
- die Browserquelle **„ueB Overlay“** ganz oben,
- vorhandene Zusatzquellen aus `obs.extraSources` (z. B. eine Szene „Kommentar“ mit den Kameras von Huebi, Wadsm und Lino).

Beim **Take** belegt ueBroadcast die gerade nicht gesendete Szene mit dem neuen Layout und blendet über. Ist in OBS der **Studio-Modus** aktiv, wird der dort eingestellte Übergang genutzt. Alle Feeds bleiben dauerhaft geladen, deshalb gibt es beim Umschnitt kein Nachladen.

Feeds ohne `source` in der Konfiguration legt ueBroadcast nicht selbst an. Eine Quelle mit dem Namen `ueB Feed <id>` kann man in OBS auch selbst anlegen, sie wird dann genauso gesteuert.

## Bedienung der Regie

| Aktion                         | Maus                                        | Tastatur                               |
| ------------------------------ | ------------------------------------------- | -------------------------------------- |
| Layout für die Vorschau wählen | Layout-Leiste                               | `Q` `W` `E` `R` `T` `Y` (siehe Knöpfe) |
| Slot in der Vorschau wählen    | Slot anklicken                              | `←` `→`                                |
| Feed in den gewählten Slot     | Kachel anklicken oder auf einen Slot ziehen | `1`–`9`, `0`                           |
| Vorschau auf Sendung           | **TAKE**                                    | `Enter` oder Leertaste                 |
| Feed direkt in den Hauptslot   | „Schnitt“ (Kachel oder Radar)               | –                                      |
| Twitch-Marker setzen           | Reiter „Sendung“                            | `M`                                    |
| Tabelle im Vollbild ein/aus    | „Tabelle Vollbild“ unter TAKE               | `L`                                    |

Weitere Funktionen:

- **Highlight-Radar** (rechts): sortiert die Runner nach Spannung, also PB-Pace, Endphase ab 60 Sternen, Duelle, frische Zieleinläufe und „lange nicht im Bild“. Mit „→ Vorschau“ oder „Duell“ geht der Vorschlag in die Vorschau.
- **Autopilot** (oben rechts): schneidet nach dem Radar selbst, mit Mindesthaltezeit (`autopilot.minHoldSec`). Gedacht für ruhige Phasen und Pausen der Regie. Er startet nach jedem Neustart ausgeschaltet.
- **Audio-Follow**: nur der Feed im Hauptslot ist hörbar.
- **Störungs-Handling**: Fällt ein Feed auf Sendung aus, kommt sofort eine Meldung und der Feed wird durch den nächstbesten ersetzt. Gibt es keinen Ersatz, schaltet ueBroadcast auf das Pausen-Layout.
- **Grafik**: Namen/Zeiten in den Slots, Ticker „Gleich spannend“, Tabelle und Bauchbinde.
- **Tabelle**: als Band im freien Platz unter den Feeds („Duell“, „Haupt + 3“), als Vollbild-Grafik mit allen Stats (Status, Split, Sterne, Zeit, Δ PB, PB, Runs, Resets …) und auf Wunsch als Lower Third, solange der Kommentar im Vollbild ist. Runner auf Sendung sind rot markiert, laufende Runs grün.
- **Logbuch**: Takes, Meldungen und Marker mit Uhrzeit, als CSV für VOD-Schnitt und Nachbereitung.
- Der Zustand (Logbuch, Runs, Tabelle, Bestzeiten) wird in `data/` gespeichert und übersteht Neustarts.

### Kommentar-Szene

Die Kommentatoren haben in OBS eine eigene Szene, z. B. mit der Kamera über einen Cam Link. Unter **Einstellungen → Produktion → Kommentar** trägst du den Namen dieser Szene ein („Szenen aus OBS laden“ listet alle Szenen), dazu die Namen fürs Bild, die Größe des Overlays und die Standard-Ecke. Danach einmal **OBS einrichten**: ueBroadcast bettet die Szene in „ueB Programm A/B“ ein, über den Runnern und unter dem Overlay.

In der Regie gibt es dafür eine eigene Leiste mit Live-Standbild aus OBS:

| Modus        | Wirkung                                                                                                                              | Taste |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **Aus**      | nur Runner                                                                                                                           | –     |
| **Overlay**  | Kommentar-Bild in einer Ecke des Hauptbilds (im Raster „Alle“ in der Ecke der Leinwand), mit Rahmen und Namen; weicht dem Ticker aus | `O`   |
| **Vollbild** | nur die Kommentar-Szene, Spielton stumm, Autopilot pausiert                                                                          | `K`   |

Die Auswahl gilt für die Vorschau und geht mit **Take** auf Sendung, zusammen mit dem Layout. Über **Sofort** schaltest du Vollbild oder Overlay direkt aufs Programm, ohne die Runner-Belegung zu ändern. Ein Direktschnitt auf einen Runner beendet das Vollbild.

### Overlay

Die Overlay-Seite ist eine transparente 1920×1080-Browserquelle:

- `http://localhost:4400/overlay.html?view=program` – Programm-Overlay (wird von „OBS einrichten“ automatisch angelegt)
- `http://localhost:4400/overlay.html?view=leaderboard` – nur die Tabelle, z. B. für eine eigene Szene

Läuft OBS auf einem anderen Rechner als ueBroadcast, `UEB_PUBLIC_URL` in der `.env` auf die erreichbare Adresse setzen.

### Stream Deck / Bitfocus Companion

Alle Regie-Aktionen sind per HTTP erreichbar, z. B. über das Generic-HTTP-Modul von Companion:

| Endpunkt                                                     | Wirkung                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `POST /api/take`                                             | Vorschau auf Sendung                                                           |
| `POST /api/layout/<layoutId>`                                | Vorschau-Layout setzen (`single`, `duo`, `featured`, `quad`, `grid`, `pause`)  |
| `POST /api/cut/<feedId>`                                     | Feed direkt in den Hauptslot                                                   |
| `POST /api/autopilot/on` · `/off`                            | Autopilot schalten                                                             |
| `POST /api/action` mit `{"action": "...", "payload": {...}}` | jede andere Aktion, z. B. `{"action":"marker","payload":{"text":"Highlight"}}` |
| `GET /api/state`                                             | kompletter Zustand als JSON                                                    |
| `GET /api/log.csv`                                           | Logbuch                                                                        |

## Das Mario-64-Event einrichten

Die Vorlage ist [`productions/sm64-marathon.json`](productions/sm64-marathon.json). Für den Echtbetrieb:

1. **Runner eintragen:** unter **Einstellungen → Runner** alle Runner anlegen (Name, PB, Twitch, Kontakt …). Die PB lässt sich auch live in der Regie im Reiter „Runs & Tabelle“ ändern.
2. **Ingest-Server:** [MediaMTX](https://github.com/bluenviron/mediamtx) auf einem VPS betreiben, API aktivieren (Port 9997). Je Runner einen Pfad `runner01` … `runner10` mit eigenem Publish-Passwort anlegen.
   - Runner senden aus OBS per SRT an `srt://<ingest>:8890?streamid=publish:runner01:<user>:<pass>` (720p60, 4–6 Mbit/s, Keyframe 1–2 s).
   - Unter **Einstellungen → Produktion** die Adresse des Ingest-Servers eintragen. Danach füllt **„Adressen vom Ingest-Server übernehmen“** beim Runner Stream-Adresse (`srt://<ingest>:8890?streamid=read:runner01`), Vorschau (`http://<ingest>:8889/runner01`) und Pfad aus; die API-Adresse (`http://<ingest>:9997`, für Verbindungsstatus und Bitrate) lässt sich ebenso ableiten.
   - Genaue Syntax für Pfade und Zugangsdaten in der MediaMTX-Dokumentation prüfen.
3. **Splits abstimmen:** Alle Runner nutzen LiveSplit mit derselben Split-Einteilung. Die Einteilung steht als `formatConfig.splits` in der Konfiguration (`name`, `stars` = Sterne nach dem Split, `pbAt` = Anteil der PB-Zeit). Ohne Angabe gelten die Beispiel-Splits aus `server/formats/sm64/splits.ts` – die vorab mit den Runnern abstimmen.
4. **Split-Relay bei jedem Runner:** In LiveSplit den TCP-Server starten (Control → Start TCP Server, Port 16834). Dann beim Runner:
   ```bash
   node split-relay.mjs --server https://<regie-adresse> --feed r01 --token <UEB_RELAY_TOKEN>
   ```
   Den fertigen Befehl je Runner zeigt **Einstellungen → Runner** zum Kopieren an. Das Relay ([`tools/split-relay.mjs`](tools/split-relay.mjs)) hat keine Abhängigkeiten und braucht nur Node.js. Es sendet ausgehend, beim Runner ist keine Portfreigabe nötig. Fällt ein Relay aus, bedient die Regie den Run im Reiter „Runs & Tabelle“ von Hand.
5. **Wertung** und **Simulationsmodus** unter **Einstellungen → Produktion** festlegen. Für das echte Event die Simulation ausschalten; mit Simulation lässt sich auch mit echtem OBS proben.

Damit die Runner die Regie erreichen, muss ueBroadcast von außen erreichbar sein (z. B. hinter einem Reverse-Proxy mit HTTPS). Dann unbedingt unter **Einstellungen → Produktion** ein Relay-Token erzeugen.

## Twitch

Optional in der `.env`: `TWITCH_CLIENT_ID`, `TWITCH_ACCESS_TOKEN` (User-Token mit Scope `channel:manage:broadcast`) und `TWITCH_BROADCASTER_ID`. Dann setzt ueBroadcast Stream-Marker (manuell und mit `twitch.autoMarkers` automatisch bei PBs und Event-Bestzeiten) und kann den Titel ändern. Ohne Zugangsdaten landen Marker nur im Logbuch.

## Entwicklung

```bash
npm run dev        # Server mit Neustart bei Änderungen + Oberfläche mit Hot-Reload auf http://localhost:5173
npm test           # Tests (Layouts, Autopilot, SM64-Logik, Radar, Produktion, Relay)
npm run typecheck
npm run format
```

Aufbau:

```
server/
  core/            Produktion, Layouts, Autopilot, Feed-Monitor (MediaMTX), Konfiguration
  obs/             OBS-Steuerung über obs-websocket v5
  formats/         Formate: sm64/ (Run-Logik, Radar, Simulator), multicam/
  integrations/    Twitch
  http.ts          HTTP-API + WebSocket
web/src/
  components/      Regie: Monitore, Multiview, Radar, Meldungen, Werkzeuge
  formats/         Format-Bedienfelder und Overlay-Bausteine
  overlay/         OBS-Overlay
shared/            Typen und Helfer für Server und Browser
productions/       Produktionen (eine JSON-Datei je Produktion)
tools/             Split-Relay für die Runner
```

Technik: TypeScript durchgehend, Node.js-Server (`ws`, `obs-websocket-js`), Oberfläche mit React und Vite. Server und Browser teilen sich die Typen in `shared/`.

## Grenzen und nächste Schritte

- **Kein Login:** ueBroadcast ist für das lokale Netz gedacht. Wer es öffentlich erreichbar macht (für das Split-Relay), sollte die Regie-Seite hinter einen Reverse-Proxy mit Zugangsschutz legen und das Relay-Token setzen.
- **OBS** ist gegen einen nachgebauten obs-websocket-Server getestet. Vor dem Event einmal mit echtem OBS und echten SRT-Feeds proben, besonders die Last beim Dekodieren von zehn Feeds.
- **therun.gg** ist nicht angebunden. Das eigene Split-Relay liefert dieselben Daten direkt aus LiveSplit.
- Noch offen aus dem Konzept: Replays aus der Ingest-Aufzeichnung, Twitch-Umfragen und Predictions, Runner-Check-in, Runner-Interviews per VDO.Ninja.
