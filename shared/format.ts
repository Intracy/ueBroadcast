// Kleine Helfer für Zeitanzeigen – genutzt von Server, Regie und Overlays.
import type { TimerInfo } from './types';

/** 3723400 → „1:02:03“ (mit `tenths` → „1:02:03,4“) */
export function formatDuration(ms: number | null | undefined, tenths = false): string {
  if (ms == null || !Number.isFinite(ms)) return '–';
  const neg = ms < 0;
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  let out = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  if (tenths) out += `,${Math.floor((abs % 1000) / 100)}`;
  return neg ? `−${out}` : out;
}

/** Delta zur PB: −12,3 s / +1:04,2 */
export function formatDelta(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  const sign = ms < 0 ? '−' : '+';
  const abs = Math.abs(ms);
  if (abs < 60_000) return `${sign}${(abs / 1000).toFixed(1).replace('.', ',')} s`;
  return `${sign}${formatDuration(abs, true)}`;
}

/** Aktueller Timerstand, hochgerechnet ab dem Server-Zeitstempel. */
export function timerValue(timer: TimerInfo | null | undefined, now: number, serverOffsetMs = 0): number | null {
  if (!timer) return null;
  if (!timer.running) return timer.baseMs;
  const serverNow = now + serverOffsetMs;
  return timer.baseMs + Math.max(0, serverNow - timer.at) * (timer.rate || 1);
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** „52:13“, „1:02:03“, „52:13,4“ → Millisekunden (null bei ungültiger Eingabe) */
export function parseDuration(text: string): number | null {
  const parts = text.trim().replace(',', '.').split(':');
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => p === '' || Number.isNaN(Number(p)))) return null;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + Number(p);
  return sec > 0 ? Math.round(sec * 1000) : null;
}
