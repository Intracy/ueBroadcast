import { playerUrl } from '../shared/streamUrl';

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Kleine Player-Seite für OBS-Browserquellen: bettet den offiziellen YouTube-/Twitch-Player bildschirmfüllend
 * ein. Direkt geladene Seiten-Links zeigen sonst die ganze Website, und YouTube-Embeds verlangen eine
 * einbettende Seite (Referrer), sonst bleibt der Player mit einem Fehler stehen.
 */
export function embedPage(url: string, host: string, muted: boolean): string | null {
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '') || 'localhost';
  const player = playerUrl(url, { muted, parentHost: hostname, origin: `http://${host}` });
  if (!player) return null;
  const commands = JSON.stringify(muted ? ['mute', 'playVideo'] : ['unMute', 'playVideo']);
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>ueBroadcast Player</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style>
</head>
<body>
<iframe id="p" src="${escapeAttr(player)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>
<script>
(function () {
  var f = document.getElementById('p');
  if (f.src.indexOf('https://www.youtube.com/embed/') !== 0) return;
  var cmds = ${commands};
  function nudge() {
    var w = f.contentWindow;
    if (!w) return;
    cmds.forEach(function (fn) {
      w.postMessage(JSON.stringify({ event: 'command', func: fn, args: [] }), 'https://www.youtube.com');
    });
  }
  f.addEventListener('load', nudge);
  [1000, 3000, 6000].forEach(function (t) { setTimeout(nudge, t); });
  setInterval(nudge, 15000);
})();
</script>
</body>
</html>`;
}
