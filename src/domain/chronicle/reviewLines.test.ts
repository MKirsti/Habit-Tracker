import { describe, expect, it } from 'vitest'
import {
  BOSS_REVIEW_LINES,
  REVIEW_LINES,
  REVIEW_RULES,
  REVIEW_SITUATIONS,
  reviewLine,
  reviewSituation,
} from './reviewLines'
import type { ReviewFacts, ReviewLineTemplate, ReviewSituation } from './reviewLines'

const SEEDS = Array.from({ length: 400 }, (_, i) => `2026-01-01Aria:${i}`)

/** Eine typische Woche je Lage (ohne Boss). */
const WEEKS: Record<ReviewSituation, ReviewFacts> = {
  great: { xp: 900, xpChangePercent: 4, perfectDays: 6, questsCompleted: 30, restDays: 0 },
  better: { xp: 600, xpChangePercent: 23, perfectDays: 3, questsCompleted: 18, restDays: 0 },
  steady: { xp: 400, xpChangePercent: -12, perfectDays: 2, questsCompleted: 14, restDays: 1 },
  rest: { xp: 15, xpChangePercent: -89, perfectDays: 0, questsCompleted: 1, restDays: 7 },
  quiet: { xp: 30, xpChangePercent: -80, perfectDays: 0, questsCompleted: 2, restDays: 0 },
}

/**
 * Fakten-Varianten (Einzahl, Mehrzahl, große Zahlen, Ränder der Schwellen). Jede Vorlage wird mit allen Varianten
 * ihrer Lage gerendert – so, wie `reviewLine` sie auch nur bekommt.
 */
const VARIANTS: ReviewFacts[] = [
  { xp: 0, perfectDays: 0, questsCompleted: 0, restDays: 0 },
  { xp: 10, perfectDays: 0, questsCompleted: 1, restDays: 0 },
  { xp: 45, xpChangePercent: -100, perfectDays: 0, questsCompleted: 3, restDays: 3 },
  { xp: 0, perfectDays: 0, questsCompleted: 0, restDays: 7 },
  { xp: 10, perfectDays: 0, questsCompleted: 1, restDays: 4 },
  { xp: 400, xpChangePercent: 300, perfectDays: 3, questsCompleted: 25, restDays: 5 },
  { xp: 5_000, xpChangePercent: 1_250, perfectDays: 7, questsCompleted: 1_234, restDays: 0 },
  { xp: 300, xpChangePercent: 10, perfectDays: 5, questsCompleted: 4, restDays: 2 },
  { xp: 300, xpChangePercent: 10, perfectDays: 4, questsCompleted: 4, restDays: 0 },
  { xp: 40, xpChangePercent: 1_250, perfectDays: 0, questsCompleted: 1, restDays: 0 },
  { xp: 80, perfectDays: 0, questsCompleted: 4, restDays: 0 },
  { xp: 9_999, xpChangePercent: -9, perfectDays: 4, questsCompleted: 1_234, restDays: 3 },
]

/** Nie beschämend, nie drohend, kein Druck. */
const SHAMING =
  /versag|schande|schäm|enttäusch|schwach|faul|verloren|verlier|schuld|peinlich|leider|strafe|kostet|bereu|verpasst|versäum|wenig|nichts geschafft|endlich|solltest|\bmusst\b/i
const GENDER_MARKERS = /[*_/]|\w:innen?\b|[a-zäöü]In(nen)?\b/u
const GENDERED_NOUNS =
  /\b(Held|Heldin|Helden|Siegerin|Sieger|Kämpferin|Kämpfer|Kriegerin|Krieger|Abenteurerin|Abenteurer|Meisterin|Meister)\b/

function render(template: ReviewLineTemplate, facts: ReviewFacts): string {
  return typeof template === 'string' ? template : template(facts)
}

/** Fakten einer Lage: die typische Woche und alle Varianten, die in diese Lage fallen. */
function factsOf(situation: ReviewSituation): ReviewFacts[] {
  return [WEEKS[situation], ...VARIANTS.filter((facts) => reviewSituation(facts) === situation)]
}

/** Alle Hauptsätze, die die Vorlagen hervorbringen können (je Lage über ihre Fakten). */
function renderedMainLines(): string[] {
  return REVIEW_SITUATIONS.flatMap((situation) =>
    REVIEW_LINES[situation].flatMap((template) => factsOf(situation).map((facts) => render(template, facts))),
  )
}

const BOSS_LINES = [...BOSS_REVIEW_LINES.defeated, ...BOSS_REVIEW_LINES.escaped]

describe('reviewSituation – Lage der Woche', () => {
  it('jede Lage ist erreichbar', () => {
    for (const situation of REVIEW_SITUATIONS) expect(reviewSituation(WEEKS[situation]), situation).toBe(situation)
  })

  it('Rast geht vor: ab 4 Ruhetagen ist es eine Rast-Woche, auch mit mehr XP oder wenigen Quests', () => {
    expect(REVIEW_RULES.restDays).toBe(4)
    expect(reviewSituation({ xp: 50, xpChangePercent: 40, perfectDays: 3, questsCompleted: 9, restDays: 4 })).toBe('rest')
    expect(reviewSituation({ xp: 0, perfectDays: 0, questsCompleted: 0, restDays: 7 })).toBe('rest')
    expect(reviewSituation({ xp: 50, perfectDays: 0, questsCompleted: 2, restDays: 3 })).toBe('quiet')
  })

  it('großartig ab 5 Perfekten Tagen – vor dem Vergleich mit der Vorwoche', () => {
    expect(reviewSituation({ xp: 500, xpChangePercent: 60, perfectDays: 5, questsCompleted: 20, restDays: 0 })).toBe('great')
    expect(reviewSituation({ xp: 500, xpChangePercent: -30, perfectDays: 7, questsCompleted: 20, restDays: 0 })).toBe('great')
    expect(reviewSituation({ xp: 500, perfectDays: 4, questsCompleted: 20, restDays: 0 })).toBe('steady')
  })

  it('besser ab 10 % mehr XP – auch nach einer ruhigen Woche ein Aufwärtstrend', () => {
    expect(reviewSituation({ xp: 300, xpChangePercent: 10, perfectDays: 2, questsCompleted: 12, restDays: 0 })).toBe('better')
    expect(reviewSituation({ xp: 300, xpChangePercent: 9, perfectDays: 2, questsCompleted: 12, restDays: 0 })).toBe('steady')
    expect(reviewSituation({ xp: 40, xpChangePercent: 100, perfectDays: 0, questsCompleted: 2, restDays: 0 })).toBe('better')
  })

  it('ruhig bis 3 erledigte Quests, sonst beständig – ohne Vergleichswoche genauso', () => {
    expect(reviewSituation({ xp: 0, perfectDays: 0, questsCompleted: 0, restDays: 0 })).toBe('quiet')
    expect(reviewSituation({ xp: 45, perfectDays: 0, questsCompleted: 3, restDays: 0 })).toBe('quiet')
    expect(reviewSituation({ xp: 60, perfectDays: 0, questsCompleted: 4, restDays: 0 })).toBe('steady')
    expect(reviewSituation({ xp: 60, xpChangePercent: -50, perfectDays: 1, questsCompleted: 4, restDays: 0 })).toBe('steady')
  })

  it('Unsinn in den Fakten zählt als 0 (keine Ausnahme, keine falsche Lage)', () => {
    const broken = { xp: Number.NaN, xpChangePercent: Number.NaN, perfectDays: -3, questsCompleted: Infinity, restDays: Number.NaN }
    expect(reviewSituation(broken)).toBe('quiet')
    expect(() => reviewLine(broken, 'x')).not.toThrow()
  })
})

describe('reviewLine – Auswahl', () => {
  it('deterministisch: gleiche Fakten und gleicher Seed → derselbe Satz', () => {
    for (const situation of REVIEW_SITUATIONS) {
      for (const seed of SEEDS.slice(0, 20)) {
        expect(reviewLine(WEEKS[situation], seed)).toBe(reviewLine({ ...WEEKS[situation] }, seed))
      }
    }
  })

  it('je Lage mindestens 4 Sätze, und jeder davon kommt bei irgendeinem Seed vor', () => {
    for (const situation of REVIEW_SITUATIONS) {
      const pool = REVIEW_LINES[situation].map((template) => render(template, WEEKS[situation]))
      expect(pool.length, situation).toBeGreaterThanOrEqual(4)
      expect(new Set(pool).size, situation).toBe(pool.length)
      const seen = new Set(SEEDS.map((seed) => reviewLine(WEEKS[situation], seed)))
      for (const line of pool) expect(seen.has(line), line).toBe(true)
      for (const line of seen) expect(pool, situation).toContain(line)
    }
  })

  it('verschiedene Wochen desselben Helden bekommen verschiedene Sätze (nicht immer derselbe)', () => {
    const lines = new Set(SEEDS.slice(0, 12).map((seed) => reviewLine(WEEKS.steady, seed)))
    expect(lines.size).toBeGreaterThan(1)
  })

  it('ohne bekannten Boss kein Nachsatz; besiegt bzw. entkommen hängt den passenden an', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const plain = reviewLine(WEEKS.great, seed)
      expect(BOSS_LINES.some((line) => plain.endsWith(line))).toBe(false)
      const won = reviewLine({ ...WEEKS.great, bossDefeated: true }, seed)
      const escaped = reviewLine({ ...WEEKS.quiet, bossDefeated: false }, seed)
      expect(won.startsWith(`${plain} `)).toBe(true)
      expect(BOSS_REVIEW_LINES.defeated.some((line) => won === `${plain} ${line}`), won).toBe(true)
      expect(BOSS_REVIEW_LINES.escaped.some((line) => escaped === `${reviewLine(WEEKS.quiet, seed)} ${line}`), escaped).toBe(true)
    }
  })

  it('Boss-Nachsätze: je mindestens 4, alle erreichbar', () => {
    for (const [kind, pool] of Object.entries(BOSS_REVIEW_LINES)) {
      expect(pool.length, kind).toBeGreaterThanOrEqual(4)
      expect(new Set(pool).size, kind).toBe(pool.length)
      const bossDefeated = kind === 'defeated'
      const seen = new Set(SEEDS.map((seed) => reviewLine({ ...WEEKS.steady, bossDefeated }, seed).slice(reviewLine(WEEKS.steady, seed).length + 1)))
      for (const line of pool) expect(seen.has(line), line).toBe(true)
    }
  })

  it('der Boss-Nachsatz ändert den Hauptsatz nicht', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      for (const situation of REVIEW_SITUATIONS) {
        const plain = reviewLine(WEEKS[situation], seed)
        expect(reviewLine({ ...WEEKS[situation], bossDefeated: false }, seed).startsWith(plain)).toBe(true)
      }
    }
  })
})

describe('reviewLine – Texte', () => {
  it('Zahlen im deutschen Format, Prozent mit geschütztem Leerzeichen, Einzahl und Mehrzahl stimmen', () => {
    const big = { xp: 5_000, xpChangePercent: 1_250, perfectDays: 3, questsCompleted: 1_234, restDays: 0 }
    const betterLines = REVIEW_LINES.better.map((template) => render(template, big))
    expect(betterLines).toContain('1.250 % mehr XP als in der Woche davor – du bist im Aufwind!')
    expect(betterLines).toContain('Plus 1.250 % gegenüber der Vorwoche. Die Gilde sieht genau, wie du wächst.')
    expect(REVIEW_LINES.steady.map((template) => render(template, big))).toContain(
      '1.234 Quests erledigt – Woche für Woche baust du an etwas Großem.',
    )
    const one = { xp: 10, perfectDays: 0, questsCompleted: 1, restDays: 5 }
    const rest = REVIEW_LINES.rest.map((template) => render(template, one))
    expect(rest).toContain('Rast eingelegt und trotzdem eine Quest erledigt – Erholung und Abenteuer zugleich. Stark!')
    const quiet = REVIEW_LINES.quiet.map((template) => render(template, one))
    expect(quiet).toContain('Eine Quest in einer ruhigen Woche – jede einzelne ist ein Funke, der weiterglüht.')
    for (const line of renderedMainLines()) {
      expect(line, line).not.toMatch(/\b1 Quests\b|\b0 Quests\b/)
      expect(line, line).not.toMatch(/\d %/) // nie ein normales Leerzeichen vor dem Prozentzeichen
    }
  })

  it('eine leere Woche nennt keine Null und bleibt aufbauend', () => {
    const empty = { xp: 0, perfectDays: 0, questsCompleted: 0, restDays: 0 }
    for (const seed of SEEDS.slice(0, 100)) {
      const line = reviewLine(empty, seed)
      expect(line, line).not.toMatch(/\b0\b|keine Quest|nichts/)
      expect(line, line).not.toMatch(SHAMING)
    }
    for (const template of REVIEW_LINES.quiet) expect(render(template, empty), String(template)).not.toMatch(/\b0\b/)
    for (const template of REVIEW_LINES.rest) expect(render(template, { ...empty, restDays: 7 })).not.toMatch(/\b0\b/)
  })

  it('Hauptsatz höchstens 140, Boss-Nachsatz höchstens 100, zusammen höchstens 240 Zeichen', () => {
    for (const line of renderedMainLines()) expect(line.length, line).toBeLessThanOrEqual(140)
    for (const line of BOSS_LINES) expect(line.length, line).toBeLessThanOrEqual(100)
    for (const seed of SEEDS.slice(0, 100)) {
      for (const situation of REVIEW_SITUATIONS) {
        for (const bossDefeated of [true, false]) {
          expect(reviewLine({ ...WEEKS[situation], bossDefeated }, seed).length).toBeLessThanOrEqual(240)
        }
      }
    }
  })

  it('nie beschämend, ohne Sprachformen, Du-Form-tauglich und sauber gesetzt', () => {
    for (const line of [...renderedMainLines(), ...BOSS_LINES]) {
      expect(line, line).not.toMatch(SHAMING)
      expect(line, line).not.toMatch(GENDER_MARKERS)
      expect(line, line).not.toMatch(GENDERED_NOUNS)
      expect(line.trim(), line).toBe(line)
      expect(line, line).toMatch(/^[A-ZÄÖÜ0-9„]/)
      expect(line, line).toMatch(/[.!?]$/)
      expect(line, line).not.toMatch(/["']/)
      expect(line, line).not.toMatch(/ - |\s{2}/)
      expect(line, line).not.toMatch(/undefined|NaN/)
    }
  })

  it('ruhige Woche mit erledigten Quests: Anerkennung statt Neuanfang – passt auch zu einer erfüllten Wochenquest-Woche', () => {
    // Wer nur Wochenquests hat (3× Sport), kommt mit allem Geplanten auf 3 Quests – und besiegt womöglich den Boss.
    const smallButDone = { xp: 90, xpChangePercent: 0, perfectDays: 0, questsCompleted: 3, restDays: 0 }
    const restart = /anders als geplant|frisches Blatt|Fang ganz klein an|wann immer du bereit bist|nächsten Schritt|geht mit einem einzigen Schritt/i
    const sideQuestsOnly = { xp: 40, perfectDays: 0, questsCompleted: 0, restDays: 0 }
    for (const facts of [smallButDone, { ...smallButDone, questsCompleted: 1 }, sideQuestsOnly]) {
      for (const template of REVIEW_LINES.quiet) expect(render(template, facts), String(template)).not.toMatch(restart)
    }
    for (const seed of SEEDS.slice(0, 100)) {
      const line = reviewLine({ ...smallButDone, bossDefeated: true }, seed)
      expect(line, line).not.toMatch(restart)
    }
    // Ohne erledigte Quest nennt kein Satz Quests, die es nicht gab.
    const empty = { xp: 0, perfectDays: 0, questsCompleted: 0, restDays: 0 }
    for (const template of REVIEW_LINES.quiet) expect(render(template, empty)).not.toMatch(/erledigt|unterwegs|am Ball/)
  })

  it('Boss-Nachsätze sind zeitlos: kein „nächste Woche“, kein Versprechen eines schon wartenden Gegners', () => {
    for (const line of BOSS_LINES) expect(line, line).not.toMatch(/nächste Woche|diese Woche|wartet schon/i)
  })

  it('Ruhige und Rast-Wochen klingen nie nach Vorwurf; der entkommene Boss droht nie', () => {
    for (const situation of ['quiet', 'rest'] as const) {
      for (const template of REVIEW_LINES[situation]) {
        for (const facts of factsOf(situation)) expect(render(template, facts)).not.toMatch(/\bnur\b|zu wenig|schon wieder/i)
      }
    }
    for (const line of BOSS_REVIEW_LINES.escaped) expect(line).not.toMatch(/rache|warte nur|bereu|strafe/i)
  })
})
