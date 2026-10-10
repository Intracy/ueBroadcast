// Beliebte Speedrun-Kategorien für Super Mario 64.
// Die Splits sind Vorlagen in typischer Routen-Reihenfolge – vor dem Event mit den Runnern abstimmen;
// eigene Splits in formatConfig.splits haben Vorrang. `stars` = Sterne nach dem Split,
// `pbAt` = ungefährer Anteil der PB-Zeit am Split-Ende (für Delta ohne LiveSplit-Delta).
import type { Sm64Split } from './sm64';

export type Sm64CategoryId = '0' | '1' | '16' | '70' | '120';

export interface Sm64Category {
  id: Sm64CategoryId;
  /** Anzeigename, z. B. „70 Star“ */
  label: string;
  /** Sterne zum Abschluss */
  goalStars: number;
  splits: Sm64Split[];
  /** Spanne für Demo-PBs in der Simulation (Minuten) */
  demoPbMin: [number, number];
}

const s = (name: string, stars: number, pbAt: number): Sm64Split => ({ name, stars, pbAt });

export const SM64_CATEGORIES: Sm64Category[] = [
  {
    id: '0',
    label: '0 Star',
    goalStars: 0,
    demoPbMin: [6.6, 8.5],
    splits: [
      s('Bowser in the Dark World', 0, 0.24),
      s('Bowser 1', 0, 0.32),
      s('Untergeschoss', 0, 0.45),
      s('Bowser in the Fire Sea', 0, 0.66),
      s('Bowser 2', 0, 0.74),
      s('Endlose Treppe', 0, 0.84),
      s('Bowser in the Sky', 0, 1),
    ],
  },
  {
    id: '1',
    label: '1 Star',
    goalStars: 1,
    demoPbMin: [6.8, 8.8],
    splits: [
      s('Bowser in the Dark World', 0, 0.22),
      s('Bowser 1', 0, 0.3),
      s('Stern 1', 1, 0.42),
      s('Bowser in the Fire Sea', 1, 0.65),
      s('Bowser 2', 1, 0.73),
      s('Endlose Treppe', 1, 0.84),
      s('Bowser in the Sky', 1, 1),
    ],
  },
  {
    id: '16',
    label: '16 Star',
    goalStars: 16,
    demoPbMin: [15, 19],
    splits: [
      s('Bob-omb Battlefield', 4, 0.13),
      s("Whomp's Fortress", 8, 0.26),
      s('Bowser in the Dark World', 8, 0.37),
      s('Lethal Lava Land', 11, 0.5),
      s('Shifting Sand Land', 14, 0.61),
      s('Dire, Dire Docks', 16, 0.69),
      s('Bowser in the Fire Sea', 16, 0.8),
      s('Endlose Treppe', 16, 0.88),
      s('Bowser in the Sky', 16, 1),
    ],
  },
  {
    id: '70',
    label: '70 Star',
    goalStars: 70,
    demoPbMin: [47, 72],
    splits: [
      s('Bob-omb Battlefield', 5, 0.06),
      s("Whomp's Fortress", 10, 0.12),
      s('Cool, Cool Mountain', 15, 0.18),
      s("Big Boo's Haunt", 19, 0.24),
      s('Bowser in the Dark World', 20, 0.29),
      s('Lethal Lava Land', 25, 0.36),
      s('Shifting Sand Land', 30, 0.43),
      s('Hazy Maze Cave', 34, 0.5),
      s('Dire, Dire Docks', 37, 0.55),
      s('Bowser in the Fire Sea', 38, 0.6),
      s('Wet-Dry World', 43, 0.67),
      s('Tall, Tall Mountain', 48, 0.73),
      s('Tiny-Huge Island', 53, 0.79),
      s('Tick Tock Clock', 58, 0.85),
      s('Rainbow Ride', 63, 0.9),
      s('Secret Stars', 70, 0.96),
      s('Bowser in the Sky', 70, 1),
    ],
  },
  {
    id: '120',
    label: '120 Star',
    goalStars: 120,
    demoPbMin: [100, 130],
    splits: [
      s('Bob-omb Battlefield', 7, 0.05),
      s("Whomp's Fortress", 14, 0.1),
      s('Jolly Roger Bay', 21, 0.16),
      s('Cool, Cool Mountain', 28, 0.21),
      s("Big Boo's Haunt", 35, 0.27),
      s('Bowser in the Dark World', 37, 0.3),
      s('Hazy Maze Cave', 44, 0.36),
      s('Lethal Lava Land', 51, 0.41),
      s('Shifting Sand Land', 58, 0.47),
      s('Dire, Dire Docks', 65, 0.52),
      s('Bowser in the Fire Sea', 67, 0.56),
      s('Snowman’s Land', 74, 0.61),
      s('Wet-Dry World', 81, 0.67),
      s('Tall, Tall Mountain', 88, 0.72),
      s('Tiny-Huge Island', 95, 0.78),
      s('Tick Tock Clock', 102, 0.84),
      s('Rainbow Ride', 109, 0.9),
      s('Secret Stars', 120, 0.97),
      s('Bowser in the Sky', 120, 1),
    ],
  },
];

export const DEFAULT_CATEGORY: Sm64CategoryId = '70';

export function sm64Category(id: unknown): Sm64Category {
  return SM64_CATEGORIES.find((c) => c.id === String(id)) ?? SM64_CATEGORIES.find((c) => c.id === DEFAULT_CATEGORY)!;
}

/** Kategorie aus einer Format-Konfiguration – auch ältere ohne „category“ (dann nach Sternzahl). */
export function categoryOf(formatConfig: Record<string, unknown> | undefined): Sm64CategoryId {
  const c = formatConfig?.category;
  if (typeof c === 'string' || typeof c === 'number') {
    const found = SM64_CATEGORIES.find((x) => x.id === String(c));
    if (found) return found.id;
  }
  const goal = formatConfig?.goalStars;
  const byGoal = SM64_CATEGORIES.find((x) => x.goalStars === goal);
  return byGoal?.id ?? DEFAULT_CATEGORY;
}

/**
 * Fortschritt eines Runs (0–1). Kategorien mit wenigen Sternen (0, 1) zählen nach Splits,
 * sonst nach Sternen.
 */
export function runProgress(stars: number, splitIndex: number, goalStars: number, splitCount: number): number {
  if (goalStars >= 16) return Math.min(1, stars / goalStars);
  return splitCount > 0 ? Math.min(1, splitIndex / splitCount) : 0;
}

/** Kurzer Stand für Anzeigen: „34/70 ★“ bzw. bei sternlosen Kategorien „Split 3/7“. */
export function progressLabel(stars: number, splitIndex: number, goalStars: number, splitCount: number): string {
  if (goalStars >= 16) return `${stars}/${goalStars} ★`;
  const n = Math.min(splitIndex + 1, splitCount);
  return goalStars > 0 ? `${stars}/${goalStars} ★ · Split ${n}/${splitCount}` : `Split ${n}/${splitCount}`;
}
