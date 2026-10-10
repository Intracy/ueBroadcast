// Datenmodell des Formats „SM64 Marathon“ (Super Mario 64, 70 Stars).

export interface Sm64Split {
  name: string;
  /** Sterne insgesamt nach Abschluss dieses Splits */
  stars: number;
  /** Anteil der PB-Zeit am Ende dieses Splits (0–1), für Delta ohne LiveSplit-Delta */
  pbAt?: number;
}

export type Sm64Phase = 'idle' | 'running' | 'paused' | 'finished' | 'reset';

export type Sm64Scoring = 'bestTime' | 'finishedRuns' | 'totalStars';

export interface Sm64Runner {
  feedId: string;
  name: string;
  phase: Sm64Phase;
  /** Index des aktuellen (noch offenen) Splits; = Anzahl abgeschlossener Splits */
  splitIndex: number;
  splitName: string | null;
  stars: number;
  /** Laufzeit in ms zum Zeitpunkt `at` */
  currentMs: number;
  at: number;
  /** Uhr-Geschwindigkeit (Simulation > 1) */
  rate: number;
  /** Abstand zur PB am letzten Split (negativ = schneller) */
  deltaMs: number | null;
  pbMs: number | null;
  bestEventMs: number | null;
  bestTodayMs: number | null;
  finishedRuns: number;
  finishedToday: number;
  resets: number;
  /** Summe aller erreichten Sterne über alle Runs des Events */
  totalStars: number;
  lastFinishMs: number | null;
  lastFinishAt: number | null;
  /** Quelle der letzten Daten: relay | manual | simulation */
  source: string | null;
  lastDataAt: number | null;
}

export interface Sm64LeaderboardRow {
  rank: number;
  feedId: string;
  name: string;
  value: string;
  bestEventMs: number | null;
  finishedRuns: number;
  totalStars: number;
}

export interface Sm64State {
  scoring: Sm64Scoring;
  /** Speedrun-Kategorie, z. B. { id: '70', label: '70 Star' } */
  category: { id: string; label: string };
  goalStars: number;
  splits: Sm64Split[];
  runners: Sm64Runner[];
  leaderboard: Sm64LeaderboardRow[];
  eventBest: { feedId: string; name: string; ms: number; at: number } | null;
  day: string;
  simulationSpeed: number | null;
}

/** Snapshot, wie ihn das Split-Relay aus LiveSplit liefert. */
export interface RunSnapshot {
  phase: 'NotRunning' | 'Running' | 'Paused' | 'Ended';
  /** LiveSplit-Splitindex: −1 = nicht gestartet, sonst Index des aktuellen Splits */
  splitIndex: number;
  currentMs: number;
  deltaMs?: number | null;
  finalMs?: number | null;
  /** Uhr-Geschwindigkeit, nur für Simulation */
  rate?: number;
}
