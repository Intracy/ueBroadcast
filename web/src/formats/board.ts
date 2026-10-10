// Tabelle/Leaderboard als formatunabhängige Daten: Das Format liefert Zeilen und Spalten,
// das Overlay zeichnet daraus Band, Vollbild-Grafik und Lower Third.

export type BoardTone = 'good' | 'bad' | 'accent' | 'muted';

export interface BoardCell {
  text: string;
  tone?: BoardTone;
}

export interface BoardColumn {
  key: string;
  label: string;
  /** Zahlen rechtsbündig in Monospace */
  numeric?: boolean;
}

export interface BoardRow {
  feedId: string;
  rank: number;
  name: string;
  /** Wert, nach dem die Tabelle sortiert ist (z. B. Bestzeit) */
  value: string;
  /** Kurzer Zusatz für kompakte Ansichten, z. B. „34/70 ★ · 28:35“ */
  detail: string;
  /** Runner ist gerade aktiv (Run läuft) */
  active: boolean;
  /** Spalten der Vollbild-Grafik */
  cells: Record<string, BoardCell>;
}

export interface BoardData {
  title: string;
  /** Wonach sortiert ist, z. B. „Beste Zeit“ */
  valueLabel: string;
  /** Zusatz wie die Kategorie („70 Star“) */
  badge?: string;
  columns: BoardColumn[];
  rows: BoardRow[];
  footer?: string;
}
