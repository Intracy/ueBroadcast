// Stream-Links von Plattformen (YouTube, Twitch) in einbettbare Player-Adressen umwandeln.
// Seiten-Links (youtube.com/watch, twitch.tv/kanal) zeigen sonst die ganze Website mit Kopfzeile,
// Empfehlungen und Chat – in OBS wie in der Regie.

/** Startzeit aus YouTube-Links („t=90“, „t=1m30s“) in Sekunden. */
export function youtubeStart(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || !m[0]) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * Video-ID aus allen üblichen YouTube-Links (watch, youtu.be, live, shorts, embed).
 * Tolerant gegenüber Tippfehlern wie „watch?v=ID?start=60“ – YouTube-IDs sind immer 11 Zeichen lang.
 */
export function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let raw: string | null = null;
  if (host === 'youtu.be') raw = u.pathname.slice(1).split('/')[0] || null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') raw = u.searchParams.get('v');
    else raw = /^\/(?:live|shorts|embed|v)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? null;
  }
  return raw ? (/^[\w-]{11}/.exec(raw)?.[0] ?? null) : null;
}

/** Startzeit eines YouTube-Links („t=90“, „start=648“, auch versehentlich als „v=ID?start=648“). */
export function youtubeStartOf(u: URL): number | null {
  const direct = youtubeStart(u.searchParams.get('t') ?? u.searchParams.get('start'));
  if (direct) return direct;
  const v = u.searchParams.get('v') ?? '';
  const q = v.indexOf('?');
  if (q < 0) return null;
  const inner = new URLSearchParams(v.slice(q + 1));
  return youtubeStart(inner.get('t') ?? inner.get('start'));
}

/** Kanal oder Video aus Twitch-Links. */
export function twitchTarget(u: URL): { channel?: string; video?: string } | null {
  const host = u.hostname.replace(/^(www|m)\./, '');
  if (host === 'player.twitch.tv') {
    const channel = u.searchParams.get('channel') ?? undefined;
    const video = u.searchParams.get('video') ?? undefined;
    return channel || video ? { channel, video } : null;
  }
  if (host !== 'twitch.tv') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'videos' && parts[1]) return { video: parts[1] };
  if (parts[0] && !['directory', 'videos', 'settings', 'search'].includes(parts[0])) return { channel: parts[0] };
  return null;
}

export interface PlayerOptions {
  /** Ton aus (Regie-Vorschau) oder an (OBS) */
  muted: boolean;
  /** Domain der einbettenden Seite – Twitch verlangt sie als „parent“ */
  parentHost: string;
  /** Origin der einbettenden Seite für die YouTube-IFrame-API */
  origin?: string;
}

/** Einbettbare Player-Adresse für YouTube/Twitch, sonst `null`. */
export function playerUrl(url: string, opts: PlayerOptions): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const yt = youtubeId(u);
  if (yt) {
    const embed = new URL(`https://www.youtube.com/embed/${encodeURIComponent(yt)}`);
    const params: Array<[string, string]> = [
      ['autoplay', '1'],
      ['mute', opts.muted ? '1' : '0'],
      ['controls', '0'],
      ['playsinline', '1'],
      ['rel', '0'],
      ['iv_load_policy', '3'],
      ['disablekb', '1'],
      // Endlosschleife (sonst bleibt das Bild am Ende stehen) und Steuerung per postMessage
      ['loop', '1'],
      ['playlist', yt],
      ['enablejsapi', '1'],
    ];
    for (const [k, v] of params) embed.searchParams.set(k, v);
    if (opts.origin) embed.searchParams.set('origin', opts.origin);
    const start = youtubeStartOf(u);
    if (start) embed.searchParams.set('start', String(start));
    return embed.toString();
  }
  const tw = twitchTarget(u);
  if (tw) {
    const player = new URL('https://player.twitch.tv/');
    if (tw.video) player.searchParams.set('video', tw.video);
    else if (tw.channel) player.searchParams.set('channel', tw.channel);
    player.searchParams.set('parent', opts.parentHost);
    player.searchParams.set('muted', String(opts.muted));
    player.searchParams.set('autoplay', 'true');
    player.searchParams.set('controls', 'false');
    return player.toString();
  }
  return null;
}

/** Ob ein Link einen Player braucht (YouTube/Twitch), statt direkt geladen zu werden. */
export function needsPlayer(url: string): boolean {
  return playerUrl(url, { muted: true, parentHost: 'localhost' }) !== null;
}
