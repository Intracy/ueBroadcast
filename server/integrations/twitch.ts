/**
 * Minimale Twitch-Helix-Anbindung: Stream-Marker setzen und Titel ändern.
 * Benötigt ein User-Access-Token mit den Scopes channel:manage:broadcast.
 */
export class TwitchClient {
  title: string | null = null;

  constructor(private readonly cfg: { clientId: string; accessToken: string; broadcasterId: string } | null) {}

  get configured(): boolean {
    return this.cfg !== null;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    if (!this.cfg) throw new Error('Twitch ist nicht konfiguriert (TWITCH_* in .env)');
    const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
      method,
      headers: {
        'Client-Id': this.cfg.clientId,
        Authorization: `Bearer ${this.cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Twitch ${res.status}: ${text.slice(0, 200)}`);
    }
    return res;
  }

  /** Marker funktionieren nur, während der Kanal live ist. */
  async createMarker(description: string): Promise<void> {
    await this.request('POST', 'streams/markers', {
      user_id: this.cfg!.broadcasterId,
      description: description.slice(0, 140),
    });
  }

  async setTitle(title: string): Promise<void> {
    await this.request('PATCH', `channels?broadcaster_id=${encodeURIComponent(this.cfg!.broadcasterId)}`, {
      title: title.slice(0, 140),
    });
    this.title = title;
  }
}
