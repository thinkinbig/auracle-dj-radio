import type { CatalogAlbum, CatalogArtist, CatalogTrack } from "@auracle/shared";

/** Per-artist sonic identity — instruments and groove, not production FX jargon. */
export const ARTIST_SONIC_CHARTER: Record<string, { anchor: string; forbid: string }> = {
  "lana-del-delay": {
    anchor: "cinematic dream-pop and baroque pop: tremolo guitar, orchestral strings, trip-hop beats, vintage vinyl warmth, heavy reverb and tape-delay washes, sad-girl americana mood",
    forbid: "pure ambient drone beds, generic lo-fi study beats, EDM drops, trap 808s, bright supersaw leads",
  },
  "jay-zzz": {
    anchor: "mellow boom-bap drums, dusty jazz samples, sleepy swung groove",
    forbid: "EDM drops, four-on-the-floor club kick, loud aggressive vocals",
  },
  "justin-tiger": {
    anchor: "live electric bass, neo-soul chords, crisp turnstile percussion",
    forbid: "generic house four-on-the-floor, trap hi-hats",
  },
  "kayan-east": {
    anchor: "warm house subs, shuffled garage percussion, bold eastbound groove",
    forbid: "acoustic folk, lo-fi bedroom hiss, slow ballad pacing",
  },
  "taylor-drift": {
    anchor: "arpeggiated Juno synths, synthwave pulse, 1980s pop brightness",
    forbid: "acoustic singer-songwriter guitar, trap drums",
  },
  "dua-lift-a": {
    anchor: "octave disco bass, live shaker, roller-rink energy, gym-ready drive",
    forbid: "ambient drone beds, slow ballad, lo-fi tape texture",
  },
  "blacksync": {
    anchor: "tight k-pop pop drums, bright synth brass, chant hooks, rap-sung verse pockets",
    forbid: "slow ambient drone, acoustic folk, lo-fi tape hiss, sleepy ballad pacing",
  },
  "black-toffee": {
    anchor: "warm log-drum sub bass, hand percussion, shakers, marimba plucks, sunset rooftop pads",
    forbid: "cold techno, trap 808s, aggressive dubstep drops, acoustic folk strumming",
  },
  "nujean": {
    anchor: "airy Y2K k-pop drums, soft sidechain bass, plucky synth bells, dreamy youthful hooks",
    forbid: "aggressive rap-sung delivery, harsh EDM drops, girl-crush brass stabs, trap hi-hats",
  },
  "sawa-node": {
    anchor: "orchestral brass and strings, taiko-like percussion, cinematic synth arpeggios, launch-sequence builds",
    forbid: "lo-fi tape hiss, sleepy ballad pacing, acoustic folk strumming, four-on-the-floor disco groove",
  },
  "zone-render": {
    anchor: "distorted anime-rock guitars, anthemic chant chorus, orchestral hits, mecha-OP energy",
    forbid: "ambient drone beds, mellow jazz chords, soft bedroom pop, slow lo-fi drums",
  },
  "gtr-808": {
    anchor: "Memphis cowbell, distorted 808 bass, drift-phonk groove, dark nightclub grit",
    forbid: "orchestral strings, acoustic piano ballads, bright k-pop brass, ambient pad beds",
  },
  "smoke-shift": {
    anchor: "warehouse cowbell, crushed 808 sub, gym-phonk aggression, smoke-stack reverb",
    forbid: "orchestral score, acoustic guitar, soft pop hooks, slow ballad drums",
  },
  "amen-rush": {
    anchor: "chopped amen break, reese bass wobble, rolling neurofunk drums, 170+ BPM drive",
    forbid: "four-on-the-floor house kick, lo-fi tape hiss, acoustic folk, slow downtempo pacing",
  },
};

const LEAD_BY_GENRE: Record<string, string> = {
  "ambient": "bowed pads and subtle field-recording texture",
  "lo-fi": "detuned Rhodes or muted piano",
  "downtempo": "mallet hits over a slow breakbeat",
  "chillhop": "jazz guitar chops or muted piano",
  "jazztronica": "Rhodes stabs with live bass",
  "deep-house": "warm sub bass and filtered chord stabs",
  "nu-disco": "octave disco bass and live shaker",
  "house": "punchy kick and open-hat groove",
  "synthwave": "arpeggiated Juno lead",
  "future-garage": "shuffled two-step drums and detuned vocal chops",
  "afro-house": "log-drum bass with hand percussion and marimba plucks",
  "k-pop": "tight pop drums, bright synth stabs, chant-ready hook stack",
  "mecha": "orchestral brass swells, taiko percussion, cinematic synth lead, choir hits",
  "phonk": "Memphis cowbell, distorted 808 sub, dark trap hats, drift-phonk groove",
  "dnb": "reese bass, chopped amen break, fast rolling drums, neurofunk stab lead",
};

const SCENE_ATMOSPHERE: Record<string, string> = {
  "study": "late-night desk focus, headphones-on intimacy",
  "chill": "relaxed unwind, soft room ambience",
  "commute": "forward motion, city rhythm, transitional energy",
  "focus": "deep work, steady pulse, low distraction",
  "gym": "high drive, athletic momentum",
  "party": "peak-hour dancefloor, celebratory lift",
};

function durationSec(energy: CatalogTrack["energy"]): number {
  if (energy <= 2) {
    return 90;
  }
  if (energy === 3) {
    return 105;
  }
  return 120;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Energy-tier arrangement timeline (Lyria Pro responds well to [mm:ss] sections). */
function buildArrangement(energy: CatalogTrack["energy"], secs: number, instrumental: boolean): string {
  const end = formatDuration(secs);
  const mid = formatDuration(Math.round(secs * 0.45));
  const lift = formatDuration(Math.round(secs * 0.7));
  const fade = formatDuration(Math.round(secs * 0.85));

  if (energy <= 2) {
    return [
      "Arrangement:",
      `[0:00 - 0:15] Intro: sparse texture, ${instrumental ? "no vocals" : "soft vocal entry or hum"}.`,
      `[0:15 - ${mid}] Body: gentle groove builds slowly, leave space between elements.`,
      `[${lift} - ${fade}] Peak: subtle lift — add one layer, not a drop.`,
      `[${fade} - ${end}] Outro: strip back to core motif and fade.`,
    ].join("\n");
  }
  if (energy === 3) {
    return [
      "Arrangement:",
      `[0:00 - 0:12] Intro: establish tempo and lead instrument.`,
      `[0:12 - ${mid}] Verse / body: full rhythm section, steady momentum.`,
      `[${mid} - ${lift}] Build: add energy, ${instrumental ? "open the mix" : "pre-chorus lift"}.`,
      `[${lift} - ${fade}] Chorus / peak: strongest section, memorable hook.`,
      `[${fade} - ${end}] Outro: resolve and fade cleanly.`,
    ].join("\n");
  }
  return [
    "Arrangement:",
    `[0:00 - 0:10] Intro: immediate pulse, set the tempo hard.`,
    `[0:10 - ${mid}] Body: full groove, driving and forward.`,
    `[${mid} - ${lift}] Build: tension rises toward the peak.`,
    `[${lift} - ${fade}] Peak: maximum energy, ${instrumental ? "biggest drop or hook" : "anthemic chorus"}.`,
    `[${fade} - ${end}] Outro: high energy resolves, don't drag.`,
  ].join("\n");
}

export interface LyriaPromptInput {
  track: CatalogTrack;
  artist: CatalogArtist;
  album: CatalogAlbum;
  /** Optional override from manifest `sonicBrief` when we add it later. */
  sonicBrief?: string;
}

/** Build a Lyria 3 Pro text prompt from manifest rows (offline generation only). */
export function buildLyriaPrompt(input: LyriaPromptInput): string {
  const { track, artist, album } = input;
  const charter = ARTIST_SONIC_CHARTER[artist.slug ?? ""] ?? {
    anchor: artist.persona,
    forbid: "generic stock background music loop",
  };
  const instrumental = track.instrumental !== false;
  const secs = durationSec(track.energy);
  const lead = LEAD_BY_GENRE[track.genreSlug ?? track.genre] ?? "a distinct lead instrument";
  const sceneFeel = SCENE_ATMOSPHERE[track.scene] ?? track.scene;
  const genreLabel = track.genreSlug ?? track.genre;

  const opening = instrumental
    ? `Create a ${secs}-second instrumental track. Instrumental only, no vocals, no lyrics.`
    : `Create a ${secs}-second song with vocals.`;

  const narrative = [
    `A ${track.mood} ${genreLabel} track for ${track.scene} — "${track.title}" from the album "${album.title}".`,
    `${track.tempo} BPM. Energy ${track.energy}/5.`,
    `Mood and atmosphere: ${track.mood}, ${sceneFeel}.`,
    `Lead instrumentation: ${lead}.`,
    `Artist sonic identity: ${charter.anchor}.`,
    input.sonicBrief ? `Additional direction: ${input.sonicBrief}.` : "",
    `Creative cue (do not read aloud): ${track.lore}`,
  ]
    .filter(Boolean)
    .join(" ");

  const blocks = [opening, "", narrative, "", buildArrangement(track.energy, secs, instrumental)];

  if (instrumental) {
    blocks.push("", "Instrumental only, no vocals, no lyrics.");
  } else {
    blocks.push("");
    if (artist.vocalHomage) {
      blocks.push(
        `Vocal delivery (fictional performer — do not impersonate any real person): ${artist.vocalHomage}`,
      );
    }
    if (track.lyrics) {
      blocks.push("", "Lyrics:", track.lyrics);
    } else {
      blocks.push("", `Lyric theme: ${track.lore}`);
    }
  }

  blocks.push("", `Avoid: ${charter.forbid}.`);
  return blocks.join("\n");
}
