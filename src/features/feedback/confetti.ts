/**
 * Konfetti-Partikel: reine Berechnung der Flugbahnen (Zufall kommt als Parameter herein, damit
 * Tests deterministisch sind). Die Darstellung übernimmt `Confetti.tsx`.
 */

/** Gold, Pergament und die sechs Attributfarben – als Theme-Variablen, keine freien Hex-Werte. */
export const CONFETTI_COLORS: readonly string[] = [
  'var(--color-gold-bright)',
  'var(--color-gold)',
  'var(--color-gold-bright)',
  'var(--color-parchment)',
  'var(--color-attr-strength)',
  'var(--color-attr-intellect)',
  'var(--color-attr-wisdom)',
  'var(--color-attr-charisma)',
  'var(--color-attr-vitality)',
  'var(--color-attr-discipline)',
]

/**
 * Farben für eine Kampagnen-Feier (Kapitel, Kampagne gemeistert): Gold und Pergament wie immer, dazu etwa zur
 * Hälfte die Kampagnenfarbe (pur und leicht aufgehellt) – statt aller Attributfarben. Ohne Farbe: `CONFETTI_COLORS`.
 */
export function confettiColors(accent?: string): readonly string[] {
  if (accent === undefined) return CONFETTI_COLORS
  const light = `color-mix(in srgb, ${accent} 65%, var(--color-parchment))`
  return ['var(--color-gold-bright)', 'var(--color-gold)', 'var(--color-parchment)', accent, accent, light]
}

export type ConfettiShape = 'rect' | 'sliver' | 'circle' | 'spark'

/**
 * - burst: Explosion in alle Richtungen (Feier-Szenen)
 * - cannon: Fontäne nach oben (aus dem Toast-Stapel unten, Desktop)
 * - spray: Fächer nach unten (aus dem Toast-Stapel oben, Handy – nach oben flöge alles aus dem Bild)
 */
export type ConfettiMode = 'burst' | 'cannon' | 'spray'

export interface ConfettiParticle {
  id: number
  color: string
  shape: ConfettiShape
  /** Breite/Höhe in px. */
  width: number
  height: number
  /** Keyframes relativ zum Ursprung in px: Start → Ende des Wurfs (meist höchster Punkt) → Ende. */
  x: [number, number, number]
  y: [number, number, number]
  rotate: [number, number, number]
  /** Sekunden. */
  duration: number
  delay: number
}

export interface ConfettiOptions {
  count: number
  mode: ConfettiMode
  /** Typische Flugweite in px (z. B. ein Anteil der Bildschirmgröße). */
  distance: number
  /** Farbmischung (Standard: `CONFETTI_COLORS`, für Kampagnen `confettiColors(accent)`). */
  colors?: readonly string[]
}

const SHAPES: readonly ConfettiShape[] = ['rect', 'rect', 'sliver', 'circle', 'spark']

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
}

function between(min: number, max: number, random: () => number): number {
  return min + random() * (max - min)
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** Erzeugt `count` Partikel mit Flugbahn (erst schnell nach außen, dann mit „Schwerkraft“ nach unten). */
export function createConfettiParticles(
  { count, mode, distance, colors = CONFETTI_COLORS }: ConfettiOptions,
  random: () => number = Math.random,
): ConfettiParticle[] {
  const particles: ConfettiParticle[] = []
  for (let id = 0; id < count; id++) {
    const shape = pick(SHAPES, random)
    const angle =
      mode === 'burst'
        ? random() * Math.PI * 2
        : mode === 'cannon'
          ? -Math.PI / 2 + (random() - 0.5) * Math.PI * 0.75 // ±67° um die Senkrechte, nach oben
          : Math.PI / 2 + (random() - 0.5) * Math.PI * 0.85 // ±76° um die Senkrechte, nach unten
    const reach =
      distance *
      (mode === 'burst' ? between(0.3, 1, random) : mode === 'cannon' ? between(0.55, 1.1, random) : between(0.3, 0.75, random))
    const dx = Math.cos(angle) * reach
    // Explosion leicht nach oben verschoben, damit das Konfetti „aufsteigt“, bevor es fällt.
    const dy = Math.sin(angle) * reach * (mode === 'burst' ? 0.8 : 1) - (mode === 'burst' ? distance * 0.18 : 0)
    const fall = distance * between(0.45, 0.95, random)
    const drift = (random() - 0.5) * distance * 0.35
    const spin = (random() - 0.5) * 1440

    const size = between(6, 10, random)
    const dims =
      shape === 'rect'
        ? { width: size, height: size * 0.6 }
        : shape === 'sliver'
          ? { width: size * 0.4, height: size * 1.5 }
          : shape === 'circle'
            ? { width: size * 0.7, height: size * 0.7 }
            : { width: size * 0.5, height: size * 0.5 }

    particles.push({
      id,
      color: pick(colors.length > 0 ? colors : CONFETTI_COLORS, random),
      shape,
      width: round(dims.width),
      height: round(dims.height),
      x: [0, round(dx), round(dx + drift)],
      y: [0, round(dy), round(dy + fall)],
      rotate: [0, round(spin * 0.4), round(spin)],
      duration: round(between(1.5, 2.4, random)),
      delay: round(between(0, mode === 'burst' ? 0.12 : 0.2, random)),
    })
  }
  return particles
}

/** Längste Flugzeit (Sekunden) – danach kann der Burst entfernt werden. */
export function confettiLifetime(particles: readonly ConfettiParticle[]): number {
  return particles.reduce((max, particle) => Math.max(max, particle.delay + particle.duration), 0)
}
