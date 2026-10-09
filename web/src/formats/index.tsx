import type { ComponentType } from 'react';
import type { ProductionState } from '../../../shared/types';
import { Sm64Board, Sm64Panel, sm64BoardData, sm64TileDetail } from './sm64/Sm64';
import type { BoardData } from './board';
import { MulticamPanel } from './multicam/Multicam';

export interface FormatPanelProps {
  production: ProductionState;
  now: number;
  offset: number;
}

/** Was ein Format in der Oberfläche beiträgt. Alles optional. */
export interface FormatUi {
  /** Zeigt das Highlight-Radar */
  radar: boolean;
  /** Eigenes Bedienfeld in der Regie */
  Panel?: ComponentType<FormatPanelProps>;
  panelTitle?: string;
  /** Zusatzzeile in der Multiview-Kachel */
  tileDetail?: (formatState: unknown, feedId: string) => string | null;
  /** Tabelle/Leaderboard im Overlay */
  OverlayBoard?: ComponentType<FormatPanelProps>;
  /** Tabellendaten für Band, Vollbild-Grafik und Lower Third */
  boardData?: (production: ProductionState, now: number, offset: number) => BoardData | null;
}

const FORMAT_UI: Record<string, FormatUi> = {
  'sm64-marathon': {
    radar: true,
    Panel: Sm64Panel,
    panelTitle: 'Runs & Tabelle',
    tileDetail: sm64TileDetail,
    OverlayBoard: Sm64Board,
    boardData: sm64BoardData,
  },
  multicam: {
    radar: false,
    Panel: MulticamPanel,
    panelTitle: 'Ablauf',
  },
};

export function formatUi(formatId: string): FormatUi {
  return FORMAT_UI[formatId] ?? { radar: false };
}
