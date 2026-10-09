import type { FormatDefinition } from './types';
import { sm64Format } from './sm64';
import { multicamFormat } from './multicam';

/**
 * Alle verfügbaren Produktionsformate. Ein neues Format = neuer Ordner unter
 * server/formats/<name> mit einer FormatDefinition, hier eintragen, fertig.
 */
export const FORMATS: FormatDefinition[] = [sm64Format, multicamFormat];

export function formatById(id: string): FormatDefinition | undefined {
  return FORMATS.find((f) => f.id === id);
}
