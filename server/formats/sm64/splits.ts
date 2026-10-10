import type { Sm64Split } from '../../../shared/sm64';
import { sm64Category } from '../../../shared/sm64Categories';

/** Standard-Splits (70 Star). Weitere Kategorien: shared/sm64Categories.ts */
export const DEFAULT_SPLITS: Sm64Split[] = sm64Category('70').splits;

export function validateSplits(raw: unknown, fallback: Sm64Split[] = DEFAULT_SPLITS): Sm64Split[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
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
