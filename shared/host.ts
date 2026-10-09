// Kommentar-Bild (Host/Kommentatoren) im Programm: aus, als Overlay über dem Hauptbild oder im Vollbild.
import type { Composition, LayoutDef, SlotDef } from './types';

export type HostMode = 'off' | 'pip' | 'full';
export type Corner = 'br' | 'bl' | 'tr' | 'tl';

export interface HostPlacement {
  mode: HostMode;
  corner: Corner;
}

export const DEFAULT_HOST: HostPlacement = { mode: 'off', corner: 'br' };

export const CORNER_LABEL: Record<Corner, string> = {
  br: 'unten rechts',
  bl: 'unten links',
  tr: 'oben rechts',
  tl: 'oben links',
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function hostOf(comp: Composition): HostPlacement {
  return comp.host ?? DEFAULT_HOST;
}

/**
 * Fläche, über der das Overlay liegt: das Hauptbild (erster Slot), wenn es groß genug ist,
 * sonst die ganze Leinwand (z. B. im Raster „Alle“).
 */
export function hostAnchor(layout: LayoutDef | undefined): Rect {
  const main: SlotDef | undefined = layout?.slots[0];
  if (main && main.w >= 0.45) return { x: main.x, y: main.y, w: main.w, h: main.h };
  return { x: 0, y: 0, w: 1, h: 1 };
}

/**
 * Position des Kommentar-Bilds auf der 16:9-Leinwand (Werte 0–1).
 * Das Bild selbst ist 16:9, deshalb ist die normierte Höhe gleich der normierten Breite.
 * `bottomReserve` hält unten Platz frei (z. B. für den Ticker).
 */
export function hostRect(
  layout: LayoutDef | undefined,
  host: HostPlacement,
  sizePct = 30,
  bottomReserve = 0,
): Rect | null {
  if (host.mode === 'off') return null;
  if (host.mode === 'full') return { x: 0, y: 0, w: 1, h: 1 };
  const a = hostAnchor(layout);
  const marginX = 0.012;
  const marginY = marginX * (16 / 9);
  let w = Math.min(a.w * (sizePct / 100), a.w - 2 * marginX);
  let h = w;
  if (h > a.h - 2 * marginY) {
    h = a.h - 2 * marginY;
    w = h;
  }
  const left = host.corner === 'bl' || host.corner === 'tl';
  const top = host.corner === 'tl' || host.corner === 'tr';
  const x = left ? a.x + marginX : a.x + a.w - marginX - w;
  let y = top ? a.y + marginY : a.y + a.h - marginY - h;
  // Nicht in den reservierten Bereich am unteren Rand ragen
  const limit = 1 - bottomReserve - marginY;
  if (!top && y + h > limit) y = Math.max(a.y + marginY, limit - h);
  return { x, y, w, h };
}

/** Platz für den Ticker unten im Overlay (64 px + Rand bei 1080 px Höhe). */
export const TICKER_RESERVE = 72 / 1080;
