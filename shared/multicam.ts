// Datenmodell des Formats „Multicam / Talk“.

export interface RundownSegment {
  title: string;
  durationMin: number | null;
}

export interface MulticamState {
  segments: RundownSegment[];
  current: number;
  segmentStartedAt: number | null;
}
