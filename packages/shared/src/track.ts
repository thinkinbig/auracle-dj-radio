/** Energy is an integer 1–5 (1 = lightest, 5 = most intense). */
export type Energy = 1 | 2 | 3 | 4 | 5;

/** A track in the offline library. `embedding` lives only in the DB layer. */
export interface Track {
  id: string;
  title: string;
  artist: string;
  energy: Energy;
  tempo: number; // BPM
  genre: string;
  mood: string;
  scene: string;
  filePath: string;
  introOffsetMs: number | null;
}

/** The subset of track metadata handed to the Flow model as a candidate. */
export interface TrackCandidate {
  id: string;
  energy: Energy;
  tempo: number;
  genre: string;
  mood: string;
  scene: string;
}

export function toCandidate(t: Track): TrackCandidate {
  return { id: t.id, energy: t.energy, tempo: t.tempo, genre: t.genre, mood: t.mood, scene: t.scene };
}
