import type { AlertLevel, FeedInsight, FeedState } from '../../shared/types';
import type { ProductionConfig } from '../core/config';

/**
 * Was der Kern einem Format-Modul zur Verfügung stellt.
 * Ein Format beschreibt eine Art von Produktion (Speedrun-Marathon, Talk, Turnier …).
 */
export interface FormatContext {
  now(): number;
  feeds(): FeedState[];
  alert(
    level: AlertLevel,
    text: string,
    opts?: { feedId?: string; key?: string; cooldownMs?: number; marker?: boolean },
  ): void;
  log(kind: string, text: string): void;
  /** Zustand hat sich geändert → an die Clients senden */
  changed(): void;
  /** Simulationsmodus aktiv (keine echten Feeds/Run-Daten) */
  simulation: boolean;
  simulationSpeed: number;
}

export interface FormatInstance {
  start(): void;
  stop(): void;
  /** Format-spezifischer Zustand für Regie und Overlays */
  getState(): unknown;
  /** Score und Kennzahlen je Feed – Grundlage für Highlight-Radar und Autopilot */
  getInsights(): FeedInsight[];
  /** Format-eigene Aktionen aus der Regie (z. B. „Run starten“) */
  handleAction(action: string, payload: unknown): void;
  /** Daten von außen (z. B. LiveSplit-Relay eines Runners) */
  ingest?(feedId: string, data: unknown): void;
  serialize(): unknown;
  restore(data: unknown): void;
}

export interface FormatDefinition {
  id: string;
  name: string;
  description: string;
  create(config: ProductionConfig, ctx: FormatContext): FormatInstance;
}

export class ActionError extends Error {}
