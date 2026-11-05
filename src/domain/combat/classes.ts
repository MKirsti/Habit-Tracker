/**
 * Heldenklasse (Phase 3a, ARCHITECTURE.md „Klasse“) – rein, automatisch aus den Attribut-Leveln.
 *
 * - Ermittelt pro **Woche** (Montag, ISO-Woche): maßgeblich sind die Attribut-Level am Ende des Vortags vor dem
 *   Montag (`classLevelsDay`). Die Klasse wechselt also nur zu Wochenbeginn – mitten in der Woche ändert ein
 *   Attribut-Aufstieg nichts (nur Nachtragen für den Sonntag am Montag oder Löschen kann den Stand noch bewegen).
 * - Höchstes Attribut < `classMinLevel` (3) → Abenteurer. Sonst die zwei höchsten Attribute (Gleichstand →
 *   Reihenfolge `ATTRIBUTE_IDS`): liegen sie höchstens `hybridMaxLevelGap` (1) auseinander und sind beide ≥ 3 →
 *   Hybridklasse dieses Paares, sonst die Grundklasse des höchsten.
 * - Klassen-Bonus: Grundklasse +20 % auf ihr Attribut, Hybrid +10 % auf beide, Abenteurer keiner.
 * - **Trägheit** (Nachbesserung 3a, gegen Flackern): Die Klasse der Vorwoche bleibt, solange sie noch annähernd passt
 *   (`keepsClass`) – Hybrid (a, b): beide ≥ 3, |a − b| ≤ `hybridMaxLevelGap + 1` und kein anderes Attribut über dem
 *   niedrigeren der beiden; Grundklasse (a): a ≥ 3 und a ist (mit) höchstes Attribut oder liegt höchstens 1 Level
 *   hinter dem höchsten – **außer** die normale Ermittlung ergibt einen Hybrid mit a (a und sein Nachbar oben liegen
 *   höchstens 1 auseinander): Der entsteht wie ohne Trägheit, und ab dann ist er es, der träge bleibt. Die Trägheit
 *   verzögert also nur das **Verlassen** einer Klasse (Hysterese), nie das Entstehen eines Hybrids – so flackert
 *   nichts, und wer zwei Attribute gleich stark trainiert, wird trotzdem Hybrid. Sonst gilt die normale Ermittlung
 *   (`heroClassIdFor`). Die Klasse einer Woche hängt so an der Klasse der Vorwoche: `classTimeline` rechnet die
 *   Wochenfolge ab Abenteuerbeginn in einem Durchlauf.
 *
 * Namen, Icons und Texte stehen in `classDefinitions.ts` (`CLASS_DEFINITIONS`); welche Attribute zu welcher Klasse
 * gehören, legt diese Datei fest (Vertrag); `classes.test.ts` prüft, dass beides übereinstimmt.
 */
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import { addDays, compareDays, diffDays, isValidDayKey, startOfWeek } from '../dates'
import { attributeLevelFromXp } from '../leveling'
import type { AttributeId, DayKey, GrammaticalForm, HeroClassDefinition, HeroClassId, HeroClassState } from '../types'
import { CLASS_DEFINITIONS } from './classDefinitions'
import { isAttributeId } from './damage'

/** Grundklasse je Attribut. */
export const BASE_CLASS_BY_ATTRIBUTE: Readonly<Record<AttributeId, HeroClassId>> = {
  strength: 'warrior',
  intellect: 'mage',
  wisdom: 'druid',
  charisma: 'bard',
  vitality: 'paladin',
  discipline: 'warden',
}

/** Hybridklassen: Attribut-Paar (Reihenfolge wie `ATTRIBUTE_IDS`) → Klasse. */
export const HYBRID_CLASSES: readonly { attributes: readonly [AttributeId, AttributeId]; id: HeroClassId }[] = [
  { attributes: ['strength', 'intellect'], id: 'battlemage' },
  { attributes: ['strength', 'wisdom'], id: 'monk' },
  { attributes: ['strength', 'charisma'], id: 'bannerbearer' },
  { attributes: ['strength', 'vitality'], id: 'berserker' },
  { attributes: ['strength', 'discipline'], id: 'knight' },
  { attributes: ['intellect', 'wisdom'], id: 'archmage' },
  { attributes: ['intellect', 'charisma'], id: 'illusionist' },
  { attributes: ['intellect', 'vitality'], id: 'healer' },
  { attributes: ['intellect', 'discipline'], id: 'runesmith' },
  { attributes: ['wisdom', 'charisma'], id: 'seer' },
  { attributes: ['wisdom', 'vitality'], id: 'shaman' },
  { attributes: ['wisdom', 'discipline'], id: 'templar' },
  { attributes: ['charisma', 'vitality'], id: 'troubadour' },
  { attributes: ['charisma', 'discipline'], id: 'warlord' },
  { attributes: ['vitality', 'discipline'], id: 'sentinel' },
]

/** Alle Klassen-IDs: Abenteurer, 6 Grundklassen, 15 Hybride. */
export const HERO_CLASS_IDS: readonly HeroClassId[] = [
  'adventurer',
  ...ATTRIBUTE_IDS.map((attribute) => BASE_CLASS_BY_ATTRIBUTE[attribute]),
  ...HYBRID_CLASSES.map((hybrid) => hybrid.id),
]

/** Hybridklasse eines Attribut-Paares (Reihenfolge egal); gleiche Attribute → `undefined`. */
export function hybridClassId(a: AttributeId, b: AttributeId): HeroClassId | undefined {
  return HYBRID_CLASSES.find(
    ({ attributes: [x, y] }) => (x === a && y === b) || (x === b && y === a),
  )?.id
}

/** Attribute einer Klasse laut Vertrag: Abenteurer keine, Grundklasse eins, Hybrid zwei (in `ATTRIBUTE_IDS`-Reihenfolge). */
export function classAttributes(id: HeroClassId): AttributeId[] {
  const base = ATTRIBUTE_IDS.find((attribute) => BASE_CLASS_BY_ATTRIBUTE[attribute] === id)
  if (base !== undefined) return [base]
  const hybrid = HYBRID_CLASSES.find((entry) => entry.id === id)
  return hybrid !== undefined ? [...hybrid.attributes] : []
}

/** Attribut-Level als vollständiger Datensatz (fehlende oder ungültige Werte → 1). */
export function normalizeLevels(levels: Readonly<Partial<Record<AttributeId, number>>>): Record<AttributeId, number> {
  const result = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) {
    const level = levels[id]
    result[id] = level !== undefined && Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1
  }
  return result
}

/**
 * Die zwei stärksten Attribute (absteigend nach Level; Gleichstand → Reihenfolge `ATTRIBUTE_IDS`).
 * Grundlage der Klassenwahl – die UI nutzt sie auch für „Warum diese Klasse?“.
 */
export function topAttributes(levels: Readonly<Partial<Record<AttributeId, number>>>): [AttributeId, AttributeId] {
  const normalized = normalizeLevels(levels)
  const sorted = [...ATTRIBUTE_IDS].sort((a, b) => normalized[b] - normalized[a])
  return [sorted[0], sorted[1]]
}

/** Klasse zu diesen Attribut-Leveln (Regeln siehe Dateikopf). */
export function heroClassIdFor(levels: Readonly<Partial<Record<AttributeId, number>>>): HeroClassId {
  const normalized = normalizeLevels(levels)
  const [first, second] = topAttributes(normalized)
  const { classMinLevel, hybridMaxLevelGap } = BALANCING.combat
  if (normalized[first] < classMinLevel) return 'adventurer'
  if (normalized[second] >= classMinLevel && normalized[first] - normalized[second] <= hybridMaxLevelGap) {
    return hybridClassId(first, second) ?? BASE_CLASS_BY_ATTRIBUTE[first]
  }
  return BASE_CLASS_BY_ATTRIBUTE[first]
}

/**
 * Trägheit: Darf die Klasse der Vorwoche bei diesen Attribut-Leveln bleiben? (Regeln siehe Dateikopf.) Der
 * Abenteurer hat keine Trägheit – sobald eine echte Klasse möglich ist, gibt es sie.
 */
export function keepsClass(previous: HeroClassId, levels: Readonly<Partial<Record<AttributeId, number>>>): boolean {
  const normalized = normalizeLevels(levels)
  const { classMinLevel, hybridMaxLevelGap } = BALANCING.combat
  const attributes = classAttributes(previous)
  if (attributes.length === 2) {
    const [a, b] = attributes
    if (normalized[a] < classMinLevel || normalized[b] < classMinLevel) return false
    if (Math.abs(normalized[a] - normalized[b]) > hybridMaxLevelGap + 1) return false
    const lower = Math.min(normalized[a], normalized[b])
    return ATTRIBUTE_IDS.every((id) => id === a || id === b || normalized[id] <= lower)
  }
  if (attributes.length === 1) {
    const [a] = attributes
    if (normalized[a] < classMinLevel) return false
    const normal = heroClassIdFor(normalized)
    if (normal === previous) return true
    // Ergibt die normale Ermittlung einen Hybrid mit a, entsteht er – wie ohne Trägheit (er ist die passendere Klasse
    // und bleibt seinerseits träge). Die Trägheit hält nur gegen einen Wechsel zu einer Klasse ohne a.
    if (classAttributes(normal).includes(a)) return false
    const highest = Math.max(...ATTRIBUTE_IDS.map((id) => normalized[id]))
    return normalized[a] >= highest - 1
  }
  return false
}

/** Klasse zu diesen Attribut-Leveln mit Trägheit: bleibt `previous`, solange sie noch annähernd passt. */
export function heroClassIdWithInertia(
  levels: Readonly<Partial<Record<AttributeId, number>>>,
  previous: HeroClassId | undefined,
): HeroClassId {
  return previous !== undefined && keepsClass(previous, levels) ? previous : heroClassIdFor(levels)
}

/** Klassen-Bonus: Grundklasse `{ [attr]: 0.2 }`, Hybrid `{ [a]: 0.1, [b]: 0.1 }`, Abenteurer `{}`. */
export function classBonusFor(id: HeroClassId): Partial<Record<AttributeId, number>> {
  const attributes = classAttributes(id)
  const bonus: Partial<Record<AttributeId, number>> = {}
  if (attributes.length === 1) bonus[attributes[0]] = BALANCING.combat.classBonus
  if (attributes.length === 2) {
    for (const attribute of attributes) bonus[attribute] = BALANCING.combat.hybridClassBonus
  }
  return bonus
}

/** Montag der Woche, für die die Klasse gilt (ISO-Woche von `today`). */
export function classWeekStart(today: DayKey): DayKey {
  return startOfWeek(today)
}

/** Stichtag der Klassen-Level einer Woche: Ende des Vortags vor dem Montag (der Sonntag davor). */
export function classLevelsDay(weekStart: DayKey): DayKey {
  return addDays(startOfWeek(weekStart), -1)
}

/** Ein Beitrag zu den Attribut-XP: an diesem Tag so viele XP für dieses Attribut. */
export interface AttributeXpEntry {
  day: DayKey
  attribute: AttributeId
  xp: number
}

/**
 * Attribut-XP am Ende jedes Stichtags in `cutoffs` – ein Durchlauf über alle Beiträge (O(Beiträge × Stichtage),
 * die Engine fragt höchstens zwei Stichtage ab). `ergebnis[i]` gehört zu `cutoffs[i]`. Unbekannte Attribute und
 * ungültige XP zählen nicht.
 */
export function attributeXpThrough(
  entries: Iterable<AttributeXpEntry>,
  cutoffs: readonly DayKey[],
): Record<AttributeId, number>[] {
  const result = cutoffs.map(() => {
    const xp = {} as Record<AttributeId, number>
    for (const id of ATTRIBUTE_IDS) xp[id] = 0
    return xp
  })
  for (const entry of entries) {
    if (!isAttributeId(entry.attribute) || !Number.isFinite(entry.xp) || entry.xp <= 0) continue
    cutoffs.forEach((cutoff, i) => {
      if (compareDays(entry.day, cutoff) <= 0) result[i][entry.attribute] += entry.xp
    })
  }
  return result
}

/** Attribut-Level zu den Attribut-XP (wie `GameState.attributes[*].level`). */
export function attributeLevelsFromXp(xp: Readonly<Partial<Record<AttributeId, number>>>): Record<AttributeId, number> {
  const levels = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) levels[id] = attributeLevelFromXp(xp[id] ?? 0).level
  return levels
}

/** Klasse einer Woche in der Wochenfolge (`classTimeline`). */
export interface ClassWeek {
  /** Montag der Woche. */
  weekStart: DayKey
  /** Klasse der Woche (mit Trägheit). */
  id: HeroClassId
  /** Attribut-Level am Ende des Sonntags davor (`classLevelsDay`). */
  attributeLevels: Record<AttributeId, number>
}

/** Sicherheitsgrenze für kaputte Daten (ein Eintrag im Jahr 1970 o. Ä.): höchstens so viele Wochen (≈ 40 Jahre). */
const MAX_TIMELINE_WEEKS = 2_100

/**
 * Klassen über die Wochenfolge bis `untilWeek` (aufsteigend, eine Woche je Eintrag, die letzte ist `untilWeek`):
 * Jede Woche bekommt `heroClassIdWithInertia(Level am Sonntag davor, Klasse der Vorwoche)`. Die Folge beginnt mit der
 * Woche der ersten Attribut-XP – davor stehen alle Attribute auf Level 1 (Abenteurer, ohne Trägheit), ein früherer
 * Beginn änderte also nichts. Ohne Beiträge (oder nur spätere) ist es nur `untilWeek`.
 *
 * Ein Durchlauf: Beiträge einmal nach Tag sortiert, dann je Woche die neuen aufaddiert – O(Beiträge · log + Wochen).
 * Unbekannte Attribute, ungültige Tage und ungültige XP zählen nicht (wie `attributeXpThrough`).
 */
export function classTimeline(entries: Iterable<AttributeXpEntry>, untilWeek: DayKey): ClassWeek[] {
  const until = startOfWeek(untilWeek)
  const valid: AttributeXpEntry[] = []
  for (const entry of entries) {
    if (!isAttributeId(entry.attribute) || !Number.isFinite(entry.xp) || entry.xp <= 0) continue
    if (typeof entry.day !== 'string' || !isValidDayKey(entry.day)) continue
    valid.push(entry)
  }
  valid.sort((a, b) => compareDays(a.day, b.day))

  let week = until
  if (valid.length > 0) {
    const first = startOfWeek(valid[0].day)
    if (compareDays(first, until) < 0) week = first
  }
  if (diffDays(week, until) > MAX_TIMELINE_WEEKS * 7) week = addDays(until, -MAX_TIMELINE_WEEKS * 7)

  const xp = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) xp[id] = 0
  const timeline: ClassWeek[] = []
  let next = 0
  let previous: HeroClassId | undefined
  for (; compareDays(week, until) <= 0; week = addDays(week, 7)) {
    const cutoff = classLevelsDay(week)
    while (next < valid.length && compareDays(valid[next].day, cutoff) <= 0) {
      xp[valid[next].attribute] += valid[next].xp
      next++
    }
    const attributeLevels = attributeLevelsFromXp(xp)
    const id = heroClassIdWithInertia(attributeLevels, previous)
    timeline.push({ weekStart: week, id, attributeLevels })
    previous = id
  }
  return timeline
}

/** Notfall-Definition, falls der Inhalt eine Klasse (noch) nicht kennt – die App stürzt so nie ab. */
function fallbackDefinition(id: HeroClassId): HeroClassDefinition {
  const name = id === 'adventurer' ? 'Abenteurer' : id
  return {
    id,
    names: { female: id === 'adventurer' ? 'Abenteurerin' : name, male: name, neutral: name },
    icon: id === 'adventurer' ? '🧭' : '⚔️',
    attributes: classAttributes(id),
    description: '',
  }
}

/** Definition einer Klasse (aus `CLASS_DEFINITIONS` bzw. den übergebenen Definitionen). */
export function classDefinition(
  id: HeroClassId,
  definitions: Readonly<Partial<Record<HeroClassId, HeroClassDefinition>>> = CLASS_DEFINITIONS,
): HeroClassDefinition {
  return definitions[id] ?? fallbackDefinition(id)
}

/** Name der Klasse in der Sprachform des Helden (fehlt → neutral). */
export function classNameFor(definition: Pick<HeroClassDefinition, 'names'>, form?: GrammaticalForm): string {
  return definition.names[form ?? 'neutral'] ?? definition.names.neutral
}

export interface HeroClassInput {
  /** Montag der Woche (wird sonst auf den Montag gezogen). */
  weekStart: DayKey
  /** Attribut-Level am Ende von `classLevelsDay(weekStart)`. */
  attributeLevels: Readonly<Partial<Record<AttributeId, number>>>
  /**
   * Klasse der Vorwoche, wie sie in der Wochenfolge tatsächlich war (`classTimeline`) – Grundlage der Trägheit und
   * der Wechsel-Szene. Hat Vorrang vor `previousLevels`.
   */
  previousClassId?: HeroClassId
  /**
   * Attribut-Level am Ende des Sonntags davor: Ohne `previousClassId` gilt als Klasse der Vorwoche die normale
   * Ermittlung daraus (eine Wochenfolge der Länge 2).
   */
  previousLevels?: Readonly<Partial<Record<AttributeId, number>>>
  definitions?: Readonly<Partial<Record<HeroClassId, HeroClassDefinition>>>
}

/**
 * `GameState.heroClass`: Klasse (mit Trägheit gegenüber der Vorwoche), Woche, Kampf-Level, Bonus und – falls anders –
 * die Klasse der Vorwoche.
 */
export function heroClassState(input: HeroClassInput): HeroClassState {
  const attributeLevels = normalizeLevels(input.attributeLevels)
  const previous =
    input.previousClassId ?? (input.previousLevels !== undefined ? heroClassIdFor(input.previousLevels) : undefined)
  const id = heroClassIdWithInertia(attributeLevels, previous)
  const state: HeroClassState = {
    definition: classDefinition(id, input.definitions),
    weekStart: startOfWeek(input.weekStart),
    attributeLevels,
    classBonus: classBonusFor(id),
  }
  if (previous !== undefined && previous !== id) state.previousId = previous
  return state
}
