import type { Sm64Split } from '../../../shared/sm64';

/**
 * Beispiel-Splits für 70 Stars – vor dem Event mit allen Runnern abstimmen
 * und in der Produktions-Konfiguration (formatConfig.splits) hinterlegen.
 * `stars` = Sterne insgesamt nach dem Split, `pbAt` = Anteil der PB-Zeit am Split-Ende.
 */
export const DEFAULT_SPLITS: Sm64Split[] = [
  { name: 'Bob-omb Battlefield', stars: 5, pbAt: 0.06 },
  { name: "Whomp's Fortress", stars: 10, pbAt: 0.12 },
  { name: 'Cool, Cool Mountain', stars: 15, pbAt: 0.18 },
  { name: "Big Boo's Haunt", stars: 19, pbAt: 0.24 },
  { name: 'Bowser in the Dark World', stars: 20, pbAt: 0.29 },
  { name: 'Lethal Lava Land', stars: 25, pbAt: 0.36 },
  { name: 'Shifting Sand Land', stars: 30, pbAt: 0.43 },
  { name: 'Hazy Maze Cave', stars: 34, pbAt: 0.5 },
  { name: 'Dire, Dire Docks', stars: 37, pbAt: 0.55 },
  { name: 'Bowser in the Fire Sea', stars: 38, pbAt: 0.6 },
  { name: 'Wet-Dry World', stars: 43, pbAt: 0.67 },
  { name: 'Tall, Tall Mountain', stars: 48, pbAt: 0.73 },
  { name: 'Tiny-Huge Island', stars: 53, pbAt: 0.79 },
  { name: 'Tick Tock Clock', stars: 58, pbAt: 0.85 },
  { name: 'Rainbow Ride', stars: 63, pbAt: 0.9 },
  { name: 'Secret Stars', stars: 70, pbAt: 0.96 },
  { name: 'Bowser in the Sky', stars: 70, pbAt: 1 },
];

export function validateSplits(raw: unknown): Sm64Split[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_SPLITS;
  const splits = raw.map((s, i) => {
    const o = s as Record<string, unknown>;
    if (typeof o.name !== 'string' || typeof o.stars !== 'number') {
      throw new Error(`formatConfig.splits[${i}] braucht "name" und "stars"`);
    }
    return { name: o.name, stars: o.stars, pbAt: typeof o.pbAt === 'number' ? o.pbAt : undefined };
  });
  for (let i = 1; i < splits.length; i++) {
    if (splits[i].stars < splits[i - 1].stars) throw new Error('Sternzahlen der Splits müssen aufsteigend sein');
  }
  return splits;
}
