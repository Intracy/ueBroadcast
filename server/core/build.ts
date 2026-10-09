import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { WEB_DIST_DIR } from './config';

const FILES = ['index.html', 'overlay.html'];
let cache: { key: string; id: string | null } = { key: '', id: null };

/**
 * Kennung des aktuellen Web-Builds (Hash über index.html und overlay.html – die verweisen auf die
 * gehashten Assets). Ändert sie sich, laden Regie und Overlay neu, OBS frischt die Browserquelle auf.
 */
export function webBuildId(): string | null {
  const paths = FILES.map((f) => join(WEB_DIST_DIR, f)).filter((p) => existsSync(p));
  if (paths.length === 0) return null;
  const key = paths.map((p) => `${p}:${statSync(p).mtimeMs}`).join('|');
  if (key === cache.key) return cache.id;
  const hash = createHash('sha1');
  for (const p of paths) hash.update(readFileSync(p));
  cache = { key, id: hash.digest('hex').slice(0, 12) };
  return cache.id;
}
