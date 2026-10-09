/**
 * Zwischenspeicher für Vorschaubilder aus OBS (GetSourceScreenshot).
 * Mehrere Anzeigen in der Regie (Multiview, Vorschau, Programm, weitere Browser) teilen sich ein Bild
 * je Quelle und Breite; OBS wird höchstens alle `minIntervalMs` pro Quelle gefragt.
 */
export class FrameCache {
  private entries = new Map<string, { at: number; jpg: Buffer | null; pending: Promise<Buffer | null> | null }>();

  constructor(
    private readonly grab: (source: string, width: number) => Promise<Buffer>,
    private readonly minIntervalMs = 200,
  ) {}

  /** Bildbreiten werden auf wenige Stufen gerundet, damit sich Anzeigen den Cache teilen. */
  static bucket(width: number): number {
    if (!Number.isFinite(width) || width <= 320) return 320;
    if (width <= 480) return 480;
    if (width <= 640) return 640;
    return 960;
  }

  get(source: string, width: number): Promise<Buffer | null> {
    const key = `${source}|${width}`;
    let entry = this.entries.get(key);
    if (entry?.jpg && Date.now() - entry.at < this.minIntervalMs) return Promise.resolve(entry.jpg);
    if (entry?.pending) return entry.pending;
    if (!entry) {
      entry = { at: 0, jpg: null, pending: null };
      this.entries.set(key, entry);
    }
    const e = entry;
    e.pending = this.grab(source, width)
      .then((jpg) => {
        e.jpg = jpg;
        e.at = Date.now();
        return jpg;
      })
      .catch(() => null)
      .finally(() => {
        e.pending = null;
      });
    return e.pending;
  }

  clear(): void {
    this.entries.clear();
  }
}
