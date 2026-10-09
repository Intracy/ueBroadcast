#!/bin/bash
# ueBroadcast starten – Doppelklick im Finder öffnet ein Terminal und startet die App.
cd "$(dirname "$0")" || exit 1

# Node.js suchen (Homebrew, offizieller Installer, nvm, Volta, fnm)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
if ! command -v node >/dev/null 2>&1 && command -v fnm >/dev/null 2>&1; then eval "$(fnm env)"; fi

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js ist auf diesem Mac nicht installiert."
  echo "  Bitte die LTS-Version von https://nodejs.org installieren und dann erneut doppelklicken."
  echo ""
  open "https://nodejs.org/de/download"
  read -n 1 -s -r -p "  Taste drücken zum Schließen …"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
NODE_MINOR=$(node -p "process.versions.node.split('.')[1]")
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
  echo "  Node.js $(node -v) ist zu alt – benötigt wird mindestens 20.19. Bitte über https://nodejs.org aktualisieren."
  open "https://nodejs.org/de/download"
  read -n 1 -s -r -p "  Taste drücken zum Schließen …"
  exit 1
fi

PORT="${UEB_PORT:-4400}"
if [ -f .env ]; then
  ENV_PORT=$(grep -E '^UEB_PORT=' .env | tail -1 | cut -d= -f2)
  [ -n "$ENV_PORT" ] && PORT="$ENV_PORT"
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "  Port $PORT ist schon belegt – läuft ueBroadcast bereits? Öffne http://localhost:$PORT"
  open "http://localhost:$PORT"
  read -n 1 -s -r -p "  Taste drücken zum Schließen …"
  exit 0
fi

# Pakete installieren, wenn sie fehlen oder sich die Paketliste geändert hat
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "  Installiere Pakete (einmalig, ca. 1 Minute) …"
  npm install --no-fund --no-audit || { read -n 1 -s -r -p "  Installation fehlgeschlagen. Taste drücken …"; exit 1; }
fi

# Browser öffnen, sobald der Server antwortet
(
  for _ in $(seq 1 90); do
    if curl -fs "http://localhost:$PORT/api/health" >/dev/null 2>&1; then open "http://localhost:$PORT"; exit 0; fi
    sleep 1
  done
) &

echo ""
echo "  ueBroadcast startet – zum Beenden dieses Fenster schließen oder Ctrl+C drücken."
echo ""
npm start
