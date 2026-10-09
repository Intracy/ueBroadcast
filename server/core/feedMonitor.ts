import type { FeedConfig } from './config';

export interface FeedHealth {
  live: boolean;
  bitrateKbps: number | null;
}

interface MediaMtxPath {
  name: string;
  ready: boolean;
  bytesReceived?: number;
}

/**
 * Fragt den Ingest-Server (MediaMTX, API v3) nach dem Zustand der Runner-Pfade.
 * Bitrate = Differenz der empfangenen Bytes zwischen zwei Abfragen.
 */
export class MediaMtxMonitor {
  private lastBytes = new Map<string, { bytes: number; at: number }>();

  constructor(
    private readonly apiUrl: string,
    private readonly feeds: FeedConfig[],
  ) {}

  async poll(now = Date.now()): Promise<Map<string, FeedHealth>> {
    const res = await fetch(`${this.apiUrl.replace(/\/$/, '')}/v3/paths/list?itemsPerPage=1000`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`MediaMTX antwortet mit ${res.status}`);
    const body = (await res.json()) as { items?: MediaMtxPath[] };
    const byName = new Map((body.items ?? []).map((p) => [p.name, p]));
    const result = new Map<string, FeedHealth>();
    for (const feed of this.feeds) {
      // Nur Feeds, die über den Ingest-Server laufen; Browser-Links (VDO.Ninja) kennt MediaMTX nicht
      if (feed.source?.kind === 'browser' || (!feed.ingestPath && feed.source?.kind !== 'media')) continue;
      const path = byName.get(feed.ingestPath ?? feed.id);
      if (!path) {
        result.set(feed.id, { live: false, bitrateKbps: null });
        continue;
      }
      let bitrateKbps: number | null = null;
      if (typeof path.bytesReceived === 'number') {
        const prev = this.lastBytes.get(feed.id);
        if (prev && now > prev.at && path.bytesReceived >= prev.bytes) {
          bitrateKbps = Math.round(((path.bytesReceived - prev.bytes) * 8) / (now - prev.at));
        }
        this.lastBytes.set(feed.id, { bytes: path.bytesReceived, at: now });
      }
      result.set(feed.id, { live: path.ready, bitrateKbps });
    }
    return result;
  }
}
