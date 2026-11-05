/**
 * Klang-Rezepte (Phase 3b) – rein, ohne Web Audio: Welche Töne ein Klang hat, wann sie einsetzen, wie laut und wie lange
 * sie klingen. `engine.ts` spielt sie ab. Leitbild: leise Fantasy-Klänge – weiche Zupfer, Glöckchen, ein warmer Puls;
 * nichts Schrilles, nichts Lautes. Alle Klänge bauen auf C-Dur bzw. der C-Pentatonik auf, so passen auch zwei Klänge
 * zusammen, die kurz nacheinander erklingen (Abhaken → Truhe → Erfolg).
 */

export const SOUND_NAMES = ['check', 'uncheck', 'levelUp', 'chest', 'bossHit', 'victory', 'achievement', 'evolve'] as const

/** Name eines Klangs: Abhaken, Haken entfernen, Level-Up, Truhe, Boss-Treffer, Sieg, Erfolg, Entwicklung des Gefährten. */
export type SoundName = (typeof SOUND_NAMES)[number]

export function isSoundName(value: unknown): value is SoundName {
  return typeof value === 'string' && (SOUND_NAMES as readonly string[]).includes(value)
}

/** Oberton eines Tons (Glocken klingen durch unharmonische Verhältnisse wie 2,76 oder 5,4). */
export interface Overtone {
  /** Frequenz-Verhältnis zum Grundton. */
  ratio: number
  /** Lautstärke relativ zum Grundton. */
  gain: number
  /** Eigene Abklingzeit (s); fehlt = die des Grundtons. Hohe Obertöne verklingen schneller – das macht den Glanz. */
  decay?: number
}

export interface Tone {
  /** Einsatz (s ab Beginn des Klangs). */
  at: number
  /** Frequenz (Hz). */
  freq: number
  /** Gleitet bis zum Ende auf diese Frequenz (Hz) – für Puls, Blip und das Aufsteigen. */
  glideTo?: number
  /** Abklingzeit nach dem Einschwingen (s). */
  dur: number
  /** Spitzenlautstärke 0–1 (vor der Gesamtlautstärke). */
  gain: number
  /** Einschwingzeit (s), Standard 0,005 – kurz für Zupfer, lang für ein sanftes Anschwellen. */
  attack?: number
  /** Wellenform, Standard 'sine'. */
  wave?: 'sine' | 'triangle' | 'sawtooth'
  /** Tiefpass (Hz) – macht Dreieck und Sägezahn weich (Horn statt Summer). */
  cutoff?: number
  overtones?: readonly Overtone[]
}

/** Kurzes, gefiltertes Rauschen – der weiche „Wumms“ des Boss-Treffers. */
export interface NoiseBurst {
  at: number
  dur: number
  gain: number
  /** Tiefpass (Hz). */
  cutoff: number
}

export interface SoundRecipe {
  tones: readonly Tone[]
  noise?: readonly NoiseBurst[]
  /** Anteil, der in den Hall-Schimmer (ein weiches Echo) geht: 0 trocken … 1 viel Raum. */
  echo: number
}

/** Tonhöhen (Hz, gleichstufig, A4 = 440). */
const N = {
  G3: 196,
  C4: 261.63,
  E4: 329.63,
  G4: 392,
  C5: 523.25,
  D5: 587.33,
  E5: 659.26,
  G5: 783.99,
  A5: 880,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760,
  C7: 2093,
  D7: 2349.32,
  E7: 2637.02,
  G7: 3135.96,
} as const

/** Klang eines kleinen Glöckchens: Grundton plus die typischen unharmonischen Teiltöne, oben schnell verklingend. */
const BELL: readonly Overtone[] = [
  { ratio: 2, gain: 0.32 },
  { ratio: 2.76, gain: 0.22, decay: 0.55 },
  { ratio: 5.4, gain: 0.1, decay: 0.25 },
  { ratio: 8.93, gain: 0.04, decay: 0.12 },
]

/** Glasiger Glanz für kurze Töne (Abhaken, Funkeln). */
const GLASS: readonly Overtone[] = [
  { ratio: 2, gain: 0.16, decay: 0.14 },
  { ratio: 3, gain: 0.06, decay: 0.08 },
]

export const SOUND_RECIPES: Record<SoundName, SoundRecipe> = {
  // Kurzes, helles „Ding-ding“ nach oben – zufrieden, nicht schrill. Der häufigste Klang des Tages und meist zusammen
  // mit dem Boss-Treffer zu hören: Beide zusammen bleiben leiser als die großen Momente (Level-Up, Sieg, Erfolg).
  check: {
    echo: 0.22,
    tones: [
      { at: 0, freq: N.C6, dur: 0.2, gain: 0.36, wave: 'triangle', cutoff: 4200 },
      { at: 0.06, freq: N.G6, dur: 0.42, gain: 0.34, overtones: GLASS },
    ],
  },
  // Weicher, tiefer Blip abwärts – „zurückgenommen“, ganz ohne Vorwurf.
  uncheck: {
    echo: 0,
    // Die Oktave darüber trägt den tiefen Blip auch durch kleine Handy-Lautsprecher.
    tones: [
      {
        at: 0,
        freq: N.G4,
        glideTo: N.C4,
        dur: 0.16,
        gain: 0.6,
        attack: 0.008,
        cutoff: 1400,
        overtones: [{ ratio: 2, gain: 0.35, decay: 0.1 }],
      },
    ],
  },
  // Aufsteigendes Arpeggio C–E–G–C, oben ein klingendes E mit leisem Akkord darunter.
  levelUp: {
    echo: 0.35,
    tones: [
      { at: 0, freq: N.C5, dur: 0.32, gain: 0.36, wave: 'triangle', cutoff: 3200 },
      { at: 0.085, freq: N.E5, dur: 0.32, gain: 0.36, wave: 'triangle', cutoff: 3200 },
      { at: 0.17, freq: N.G5, dur: 0.32, gain: 0.38, wave: 'triangle', cutoff: 3400 },
      { at: 0.255, freq: N.C6, dur: 0.36, gain: 0.38, wave: 'triangle', cutoff: 3600 },
      { at: 0.34, freq: N.E6, dur: 0.9, gain: 0.42, overtones: GLASS },
      { at: 0.34, freq: N.C5, dur: 0.9, gain: 0.16, attack: 0.08 },
      { at: 0.34, freq: N.G5, dur: 0.9, gain: 0.12, attack: 0.08 },
    ],
  },
  // Funkeln: ein warmer Grundton und darüber flinke, glöckchenhelle Sternchen.
  chest: {
    echo: 0.5,
    tones: [
      { at: 0, freq: N.G5, dur: 0.5, gain: 0.32, attack: 0.012, overtones: GLASS },
      { at: 0.03, freq: N.E7, dur: 0.16, gain: 0.16, overtones: [{ ratio: 2.76, gain: 0.08, decay: 0.06 }] },
      { at: 0.08, freq: N.C7, dur: 0.16, gain: 0.16, overtones: [{ ratio: 2.76, gain: 0.08, decay: 0.06 }] },
      { at: 0.125, freq: N.G7, dur: 0.18, gain: 0.13, overtones: [{ ratio: 2.76, gain: 0.06, decay: 0.06 }] },
      { at: 0.175, freq: N.D7, dur: 0.18, gain: 0.15, overtones: [{ ratio: 2.76, gain: 0.08, decay: 0.06 }] },
      { at: 0.23, freq: N.A6, dur: 0.22, gain: 0.16, overtones: [{ ratio: 2.76, gain: 0.08, decay: 0.07 }] },
      { at: 0.29, freq: N.E7, dur: 0.3, gain: 0.14, overtones: [{ ratio: 2.76, gain: 0.07, decay: 0.08 }] },
    ],
  },
  // Weicher Puls (tiefer Ton, der nach unten fällt, mit etwas Rauschen) und ein kleines „Ping“ obendrauf. Er folgt fast
  // jedem Abhaken (ein Boss ist fast immer da) und landet mitten im Ausklingen von „check“: Das Ping auf E ergänzt dessen
  // C–G zum Dur-Dreiklang (statt eines reibenden A über dem G), und der Puls bleibt so sanft, dass beide zusammen nicht
  // lauter sind als ein Level-Up.
  bossHit: {
    echo: 0.18,
    noise: [{ at: 0, dur: 0.07, gain: 0.16, cutoff: 900 }],
    tones: [
      // Die Oktave darüber trägt den Puls auch durch kleine Handy-Lautsprecher, die so tief nicht kommen.
      { at: 0, freq: 150, glideTo: 55, dur: 0.2, gain: 0.65, attack: 0.004, overtones: [{ ratio: 2, gain: 0.4, decay: 0.12 }] },
      { at: 0.035, freq: N.E6, dur: 0.3, gain: 0.16, overtones: [{ ratio: 2.76, gain: 0.2, decay: 0.1 }] },
    ],
  },
  // Kleine Fanfare: Ruf G–C–E–G (warmes Horn: gefilterter Sägezahn) und ein klingender C-Dur-Akkord mit Glöckchen. Der
  // seltenste große Moment (einmal je Woche) – etwas voller als das tägliche Abhaken, die Filter bleiben warm.
  victory: {
    echo: 0.3,
    tones: [
      { at: 0, freq: N.G4, dur: 0.16, gain: 0.3, attack: 0.018, wave: 'sawtooth', cutoff: 1900 },
      { at: 0.13, freq: N.C5, dur: 0.16, gain: 0.3, attack: 0.018, wave: 'sawtooth', cutoff: 2000 },
      { at: 0.26, freq: N.E5, dur: 0.16, gain: 0.3, attack: 0.018, wave: 'sawtooth', cutoff: 2100 },
      { at: 0.39, freq: N.G5, dur: 0.42, gain: 0.32, attack: 0.02, wave: 'sawtooth', cutoff: 2200 },
      { at: 0.72, freq: N.C4, dur: 1.05, gain: 0.18, attack: 0.05, wave: 'triangle', cutoff: 1200 },
      { at: 0.72, freq: N.C5, dur: 1.05, gain: 0.17, attack: 0.05, wave: 'sawtooth', cutoff: 1600 },
      { at: 0.72, freq: N.E5, dur: 1.05, gain: 0.15, attack: 0.05, wave: 'sawtooth', cutoff: 1600 },
      { at: 0.72, freq: N.G5, dur: 1.05, gain: 0.15, attack: 0.05, wave: 'sawtooth', cutoff: 1700 },
      { at: 0.74, freq: N.C7, dur: 0.8, gain: 0.16, overtones: BELL },
    ],
  },
  // Glocke: zwei Schläge (A, dann E darüber), lange ausklingend.
  achievement: {
    echo: 0.35,
    tones: [
      { at: 0, freq: N.A5, dur: 1.3, gain: 0.4, attack: 0.003, overtones: BELL },
      { at: 0.15, freq: N.E6, dur: 1.05, gain: 0.26, attack: 0.003, overtones: BELL },
    ],
  },
  // Aufsteigender Schimmer: ein anschwellender Gleitton, Sternchen die Pentatonik hinauf, zum Schluss ein Glöckchen-Akkord.
  evolve: {
    echo: 0.5,
    tones: [
      { at: 0, freq: N.G3, glideTo: N.G5, dur: 0.7, gain: 0.16, attack: 0.42, wave: 'triangle', cutoff: 2400 },
      { at: 0.08, freq: N.C6, dur: 0.22, gain: 0.13, overtones: GLASS },
      { at: 0.17, freq: N.D6, dur: 0.22, gain: 0.13, overtones: GLASS },
      { at: 0.26, freq: N.E6, dur: 0.22, gain: 0.13, overtones: GLASS },
      { at: 0.35, freq: N.G6, dur: 0.22, gain: 0.13, overtones: GLASS },
      { at: 0.44, freq: N.A6, dur: 0.22, gain: 0.12, overtones: GLASS },
      { at: 0.53, freq: N.C7, dur: 0.24, gain: 0.11, overtones: GLASS },
      { at: 0.62, freq: N.D7, dur: 0.26, gain: 0.1, overtones: GLASS },
      { at: 0.72, freq: N.E6, dur: 0.95, gain: 0.3, attack: 0.004, overtones: BELL },
      { at: 0.72, freq: N.G6, dur: 0.95, gain: 0.2, attack: 0.004, overtones: BELL },
    ],
  },
}

/** Standard-Einschwingzeit (s). */
export const DEFAULT_ATTACK = 0.005

/** Ende eines Tons (s ab Beginn des Klangs) – Einschwingen plus Abklingen. */
export function toneEnd(tone: Tone): number {
  return tone.at + (tone.attack ?? DEFAULT_ATTACK) + tone.dur
}

/** Länge eines Klangs (s): bis der letzte Ton bzw. das letzte Rauschen verklungen ist (ohne Echo-Nachhall). */
export function recipeDuration(recipe: SoundRecipe): number {
  const tones = recipe.tones.map(toneEnd)
  const noise = (recipe.noise ?? []).map((burst) => burst.at + burst.dur)
  return Math.max(0, ...tones, ...noise)
}
