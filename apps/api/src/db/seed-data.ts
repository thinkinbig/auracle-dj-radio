import type { Track } from "@auracle/shared";

/**
 * Small demo library spanning energy 1–5 with varied genres so the energy arc
 * and the "no consecutive genre" rule are satisfiable. mp3 files are produced
 * by the offline music pipeline (not present yet); audio routes 404 until then.
 */
export const SEED_TRACKS: Track[] = [
  { id: "t01", title: "Paper Lanterns", artist: "Auracle", energy: 1, tempo: 62, genre: "ambient", mood: "calm", scene: "study", filePath: "data/tracks/t01.mp3", introOffsetMs: null },
  { id: "t02", title: "Soft Static", artist: "Auracle", energy: 1, tempo: 68, genre: "lo-fi", mood: "mellow", scene: "study", filePath: "data/tracks/t02.mp3", introOffsetMs: null },
  { id: "t03", title: "Morning Steam", artist: "Auracle", energy: 2, tempo: 74, genre: "downtempo", mood: "warm", scene: "focus", filePath: "data/tracks/t03.mp3", introOffsetMs: null },
  { id: "t04", title: "Quiet Desk", artist: "Auracle", energy: 2, tempo: 80, genre: "chillhop", mood: "focused", scene: "study", filePath: "data/tracks/t04.mp3", introOffsetMs: null },
  { id: "t05", title: "Tide Pool", artist: "Auracle", energy: 2, tempo: 84, genre: "ambient", mood: "calm", scene: "chill", filePath: "data/tracks/t05.mp3", introOffsetMs: null },
  { id: "t06", title: "Glass Garden", artist: "Auracle", energy: 3, tempo: 92, genre: "downtempo", mood: "warm", scene: "focus", filePath: "data/tracks/t06.mp3", introOffsetMs: null },
  { id: "t07", title: "Neon Commute", artist: "Auracle", energy: 3, tempo: 98, genre: "jazztronica", mood: "uplifting", scene: "commute", filePath: "data/tracks/t07.mp3", introOffsetMs: null },
  { id: "t08", title: "City Pulse", artist: "Auracle", energy: 3, tempo: 104, genre: "deep-house", mood: "focused", scene: "focus", filePath: "data/tracks/t08.mp3", introOffsetMs: null },
  { id: "t09", title: "Run Lights", artist: "Auracle", energy: 4, tempo: 112, genre: "nu-disco", mood: "uplifting", scene: "gym", filePath: "data/tracks/t09.mp3", introOffsetMs: null },
  { id: "t10", title: "Open Road", artist: "Auracle", energy: 4, tempo: 116, genre: "house", mood: "energetic", scene: "gym", filePath: "data/tracks/t10.mp3", introOffsetMs: null },
  { id: "t11", title: "Skyline Drive", artist: "Auracle", energy: 4, tempo: 120, genre: "synthwave", mood: "energetic", scene: "commute", filePath: "data/tracks/t11.mp3", introOffsetMs: null },
  { id: "t12", title: "Peak Hour", artist: "Auracle", energy: 5, tempo: 124, genre: "house", mood: "euphoric", scene: "party", filePath: "data/tracks/t12.mp3", introOffsetMs: null },
  { id: "t13", title: "Full Send", artist: "Auracle", energy: 5, tempo: 128, genre: "nu-disco", mood: "euphoric", scene: "party", filePath: "data/tracks/t13.mp3", introOffsetMs: null },
  { id: "t14", title: "Afterglow", artist: "Auracle", energy: 3, tempo: 100, genre: "synthwave", mood: "warm", scene: "chill", filePath: "data/tracks/t14.mp3", introOffsetMs: null },
  { id: "t15", title: "Cooldown", artist: "Auracle", energy: 2, tempo: 82, genre: "future-garage", mood: "mellow", scene: "chill", filePath: "data/tracks/t15.mp3", introOffsetMs: null },
  { id: "t16", title: "Last Light", artist: "Auracle", energy: 1, tempo: 66, genre: "downtempo", mood: "calm", scene: "chill", filePath: "data/tracks/t16.mp3", introOffsetMs: null },
];
