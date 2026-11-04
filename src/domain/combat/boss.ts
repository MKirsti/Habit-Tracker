/**
 * Wochen-Boss (Phase 3a, ARCHITECTURE.md „Wochen-Boss“) – rein.
 *
 * - **Geplanter Wochenschaden** = Summe über die Tage Mo–So und alle Quests, die an dem Tag Pflicht sind
 *   (`isRequiredOn`, Ruhetage zählen nicht), plus Wochenquests × `times` (Rhythmus vom Montag): jeweils der Schaden
 *   einer Erledigung **ohne** Schwäche (`attackDamage` mit den Kampf-Leveln und dem Klassen-Bonus der Woche).
 *   Wochenquests zählen höchstens so oft, wie die Woche Tage hat, an denen sie aktiv, eine Wochenquest und kein
 *   Ruhetag sind – eine Urlaubswoche plant so keinen Schaden, eine am Samstag angelegte 3×-Quest höchstens 2.
 *   Ist der geplante Schaden 0, gibt es keinen Boss.
 * - `maxHp = max(bossMinHp, round(bossHpShare × geplanter Schaden))`. Später eingetragene Rast senkt ihn (abgeleitet);
 *   ein gespeicherter Sieg bleibt (dann gelten dessen Boss und `maxHp`).
 * - **Boss-Wahl:** Thema = Attribut mit dem größten geplanten Schaden (Gleichstand → `ATTRIBUTE_IDS`), daraus ein Boss
 *   per Hash von `heroSeed + weekStart`. **Schwäche:** per Hash aus den Attributen mit geplantem Schaden > 0, bevorzugt
 *   nicht das Thema (falls es andere gibt). Beide Male Rendezvous-Hashing (`rendezvousPick`): Eine neue Quest mitten
 *   in der Woche ändert Boss und Schwäche nur, wenn sie das Thema kippt bzw. ihr Attribut die Wahl gewinnt.
 * - Angriffe: jede erledigte Quest-Erledigung (Momentaufnahme von Attribut und Schwierigkeit) und jede erledigte
 *   Nebenquest der Woche (bis heute), Schaden mit Schwäche × 1,5. `defeated` ⇔ gespeicherter Sieg oder Schaden ≥ maxHp;
 *   `defeatedDay` = Tag, an dem die Summe maxHp erreichte (bzw. der gespeicherte Tag). Entkommen kostet nichts.
 */
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import { addDays, compareDays, diffDays, isValidDayKey, startOfWeek } from '../dates'
import { isActiveOn, isRequiredOn, scheduleOn } from '../schedule'
import type { HabitTimeline } from '../schedule'
import type {
  AttackEvent,
  AttributeId,
  BossDefinition,
  BossVictory,
  CharacterProfile,
  DayKey,
  Difficulty,
  HeroClassState,
  WeeklyBossState,
} from '../types'
import { ATTACK_NAMES } from './classDefinitions'
import { BOSSES } from './bosses'
import { attackDamage, isAttributeId } from './damage'
import { rendezvousPick } from './hash'

// ---------------------------------------------------------------------------
// Grundlagen
// ---------------------------------------------------------------------------

/**
 * `heroSeed` = `profile.createdDay + profile.name` (ohne Profil leer) – Grundlage aller Kampf-Hashes des Helden.
 * Hat das Repository nach einer Umbenennung den bisherigen Seed festgehalten (`profile.heroSeed`), gilt dieser: So
 * würfelt ein neuer Name weder den Boss der Woche noch seine Schwäche oder offene Truhen-Funde neu aus.
 */
export function heroSeedOf(profile: Pick<CharacterProfile, 'createdDay' | 'name' | 'heroSeed'> | undefined): string {
  if (profile === undefined) return ''
  if (typeof profile.heroSeed === 'string' && profile.heroSeed !== '') return profile.heroSeed
  return `${profile.createdDay}${profile.name}`
}

/** Sonntag der Woche, die am Montag `weekStart` beginnt. */
export function weekEndOf(weekStart: DayKey): DayKey {
  return addDays(startOfWeek(weekStart), 6)
}

/** Die sieben Tage Mo–So der Woche von `weekStart`. */
export function weekDays(weekStart: DayKey): DayKey[] {
  const monday = startOfWeek(weekStart)
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => addDays(monday, offset))
}

/** Kampf-Werte der Woche – Ausschnitt aus `HeroClassState`. */
export type CombatStats = Pick<HeroClassState, 'attributeLevels' | 'classBonus'>

// ---------------------------------------------------------------------------
// Geplanter Wochenschaden
// ---------------------------------------------------------------------------

/** Was die Planung von einer Quest braucht (passt auf `Habit`). */
export type PlannableHabit = HabitTimeline & { attribute: AttributeId; difficulty: Difficulty }

/** Geplante Erledigungen einer Quest in der Woche. */
export interface PlannedAttack {
  attribute: AttributeId
  difficulty: Difficulty
  count: number
}

/**
 * Geplante Erledigungen der Woche je Quest (nur Quests mit mindestens einer): Pflicht-Tage (`isRequiredOn` mit den
 * Ruhetagen) plus – ist die Quest am Montag eine Wochenquest – `times`, höchstens so viele wie Tage der Woche, an
 * denen sie aktiv, eine Wochenquest und kein Ruhetag ist. Attribut und Schwierigkeit: die aktuellen der Quest.
 */
export function plannedWeekAttacks(
  habits: readonly PlannableHabit[],
  weekStart: DayKey,
  restDays: ReadonlySet<DayKey>,
): PlannedAttack[] {
  const days = weekDays(weekStart)
  const planned: PlannedAttack[] = []
  for (const habit of habits) {
    let count = 0
    let weeklyDays = 0
    for (const day of days) {
      if (isRequiredOn(habit, day, restDays)) count++
      else if (!restDays.has(day) && isActiveOn(habit, day) && scheduleOn(habit, day).type === 'weekly') weeklyDays++
    }
    const monday = scheduleOn(habit, days[0])
    if (monday.type === 'weekly' && Number.isFinite(monday.times) && monday.times > 0) {
      count += Math.min(Math.floor(monday.times), weeklyDays)
    }
    if (count > 0) planned.push({ attribute: habit.attribute, difficulty: habit.difficulty, count })
  }
  return planned
}

/** Geplanter Schaden der Woche: gesamt und je Attribut (ohne Schwäche). Unbekannte Attribute zählen nicht. */
export function plannedWeekDamage(
  planned: readonly PlannedAttack[],
  stats: CombatStats,
): { total: number; byAttribute: Record<AttributeId, number> } {
  const byAttribute = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) byAttribute[id] = 0
  let total = 0
  for (const attack of planned) {
    if (!isAttributeId(attack.attribute)) continue
    const damage =
      attackDamage({
        difficulty: attack.difficulty,
        attribute: attack.attribute,
        levels: stats.attributeLevels,
        classBonus: stats.classBonus,
        weakness: false,
      }) * attack.count
    byAttribute[attack.attribute] += damage
    total += damage
  }
  return { total, byAttribute }
}

/** Lebenspunkte des Bosses: `max(bossMinHp, round(bossHpShare × geplanter Schaden))`; ohne geplanten Schaden 0. */
export function bossMaxHp(plannedDamage: number): number {
  if (!(plannedDamage > 0) || !Number.isFinite(plannedDamage)) return 0
  return Math.max(BALANCING.combat.bossMinHp, Math.round(BALANCING.combat.bossHpShare * plannedDamage))
}

// ---------------------------------------------------------------------------
// Boss und Schwäche
// ---------------------------------------------------------------------------

/** Thema: Attribut mit dem größten geplanten Schaden (Gleichstand → Reihenfolge `ATTRIBUTE_IDS`); keins → `undefined`. */
export function bossTheme(byAttribute: Readonly<Record<AttributeId, number>>): AttributeId | undefined {
  let theme: AttributeId | undefined
  let best = 0
  for (const id of ATTRIBUTE_IDS) {
    if (byAttribute[id] > best) {
      theme = id
      best = byAttribute[id]
    }
  }
  return theme
}

/** Hash-Schlüssel der Woche: `heroSeed + weekStart`. */
function weekKey(heroSeed: string, weekStart: DayKey): string {
  return `${heroSeed}${weekStart}`
}

/** Notfall-Boss, falls der Inhalt (noch) keinen Boss für das Thema kennt. */
function fallbackBoss(theme: AttributeId): BossDefinition {
  return {
    id: `shadow-${theme}`,
    name: 'Namenloser Schatten',
    icon: '👤',
    theme,
    description: 'Eine Gestalt ohne Gesicht stellt sich dir in den Weg.',
    defeatLine: 'Der Schatten zerfällt zu Staub.',
    escapeLine: 'Der Schatten verschwindet im Nebel – bis zur nächsten Woche.',
  }
}

/** Boss der Woche aus den Bossen des Themas (Hash von `heroSeed + weekStart`); ohne passenden Boss ein Notfall-Boss. */
export function chooseBoss(
  theme: AttributeId,
  heroSeed: string,
  weekStart: DayKey,
  bosses: readonly BossDefinition[] = BOSSES,
): BossDefinition {
  const candidates = bosses.filter((boss) => boss.theme === theme)
  return rendezvousPick(candidates, `${weekKey(heroSeed, weekStart)}:boss`, (boss) => boss.id) ?? fallbackBoss(theme)
}

/**
 * Schwäche der Woche: per Hash aus den Attributen mit geplantem Schaden > 0 außer dem Thema; gibt es keine anderen,
 * das Thema selbst.
 */
export function chooseWeakness(
  byAttribute: Readonly<Record<AttributeId, number>>,
  theme: AttributeId,
  heroSeed: string,
  weekStart: DayKey,
): AttributeId {
  const others = ATTRIBUTE_IDS.filter((id) => id !== theme && byAttribute[id] > 0)
  return rendezvousPick(others, `${weekKey(heroSeed, weekStart)}:weakness`, (id) => id) ?? theme
}

/** Boss nach ID (für gespeicherte Siege und das Bestiarium). */
export function bossById(id: string, bosses: readonly BossDefinition[] = BOSSES): BossDefinition | undefined {
  return bosses.find((boss) => boss.id === id)
}

// ---------------------------------------------------------------------------
// Angriffe
// ---------------------------------------------------------------------------

/** Eine erledigte Quest bzw. Nebenquest, die angreift. */
export interface AttackSource {
  day: DayKey
  source: AttackEvent['source']
  /** habitId bzw. sideQuestId. */
  sourceId: string
  /** Momentaufnahme der Erledigung (Nebenquest: ihr Attribut). */
  attribute: AttributeId
  difficulty: Difficulty
  /** Sortierung innerhalb eines Tages (z. B. `updatedAt` der Erledigung); fehlt → 0. */
  order?: number
}

function compareSources(a: AttackSource, b: AttackSource): number {
  if (a.day !== b.day) return compareDays(a.day, b.day)
  if (a.source !== b.source) return a.source === 'quest' ? -1 : 1
  const order = (a.order ?? 0) - (b.order ?? 0)
  if (order !== 0 && Number.isFinite(order)) return order
  return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0
}

/**
 * Angriffe aus den Quellen, chronologisch (Tag; Quests vor Nebenquests; dann `order`, ID). Quellen mit unbekanntem
 * Attribut oder ohne Schaden (unbekannte Schwierigkeit) greifen nicht an.
 */
export function attacksOf(
  sources: readonly AttackSource[],
  stats: CombatStats,
  weakness: AttributeId | undefined,
  attackNames: Readonly<Record<AttributeId, string>> = ATTACK_NAMES,
): AttackEvent[] {
  const attacks: AttackEvent[] = []
  for (const source of [...sources].sort(compareSources)) {
    if (!isAttributeId(source.attribute)) continue
    const hitsWeakness = source.attribute === weakness
    const damage = attackDamage({
      difficulty: source.difficulty,
      attribute: source.attribute,
      levels: stats.attributeLevels,
      classBonus: stats.classBonus,
      weakness: hitsWeakness,
    })
    if (!(damage > 0)) continue
    attacks.push({
      day: source.day,
      source: source.source,
      sourceId: source.sourceId,
      attribute: source.attribute,
      attackName: attackNames[source.attribute] ?? '',
      damage,
      weakness: hitsWeakness,
    })
  }
  return attacks
}

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

export interface WeeklyBossInput {
  /** Montag der Woche (wird sonst auf den Montag gezogen). */
  weekStart: DayKey
  /** Heutiger Spieltag: Angriffe zählen bis heute, `daysLeft` ab heute. */
  today: DayKey
  heroSeed: string
  /** Geplante Erledigungen der Woche (`plannedWeekAttacks`). */
  planned: readonly PlannedAttack[]
  /** Erledigte Quests/Nebenquests (Tage außerhalb der Woche oder nach heute werden ignoriert). */
  sources: readonly AttackSource[]
  /** Kampf-Level und Klassen-Bonus **dieser** Woche. */
  stats: CombatStats
  /** Gespeicherter Sieg dieser Woche, falls vorhanden. */
  victory?: BossVictory
  bosses?: readonly BossDefinition[]
  attackNames?: Readonly<Record<AttributeId, string>>
}

/**
 * Boss einer Woche. `undefined`, wenn kein Schaden geplant ist und kein Sieg gespeichert ist. Ein gespeicherter Sieg
 * bleibt ein Sieg: Boss (sofern bekannt), `maxHp`, `defeatedDay` kommen dann aus ihm, `hp` ist 0.
 */
export function weeklyBossState(input: WeeklyBossInput): WeeklyBossState | undefined {
  const bosses = input.bosses ?? BOSSES
  const weekStart = startOfWeek(input.weekStart)
  const weekEnd = weekEndOf(weekStart)
  const { total, byAttribute } = plannedWeekDamage(input.planned, input.stats)
  const victory = input.victory !== undefined && input.victory.weekStart === weekStart ? input.victory : undefined
  if (total <= 0 && victory === undefined) return undefined

  const derivedTheme = bossTheme(byAttribute)
  const storedBoss = victory !== undefined ? bossById(victory.bossId, bosses) : undefined
  const theme = storedBoss?.theme ?? derivedTheme ?? ATTRIBUTE_IDS[0]
  const boss = storedBoss ?? chooseBoss(theme, input.heroSeed, weekStart, bosses)
  const weakness = chooseWeakness(byAttribute, theme, input.heroSeed, weekStart)
  const storedMaxHp = victory !== undefined && Number.isFinite(victory.maxHp) && victory.maxHp > 0 ? victory.maxHp : 0
  const maxHp = storedMaxHp > 0 ? Math.round(storedMaxHp) : Math.max(bossMaxHp(total), BALANCING.combat.bossMinHp)

  const sources = input.sources.filter(
    (source) =>
      isValidDayKey(source.day) &&
      compareDays(source.day, weekStart) >= 0 &&
      compareDays(source.day, weekEnd) <= 0 &&
      compareDays(source.day, input.today) <= 0,
  )
  const attacks = attacksOf(sources, input.stats, weakness, input.attackNames)
  let damage = 0
  let reachedDay: DayKey | undefined
  for (const attack of attacks) {
    damage += attack.damage
    if (reachedDay === undefined && damage >= maxHp) reachedDay = attack.day
  }

  const defeated = victory !== undefined || reachedDay !== undefined
  const state: WeeklyBossState = {
    boss,
    weekStart,
    weekEnd,
    weakness,
    maxHp,
    damage,
    hp: victory !== undefined ? 0 : Math.max(0, maxHp - damage),
    defeated,
    daysLeft: Math.min(7, Math.max(0, diffDays(input.today, weekEnd) + 1)),
    attacks,
  }
  const defeatedDay = victory !== undefined && isValidDayKey(victory.day) ? victory.day : reachedDay
  if (defeated && defeatedDay !== undefined) state.defeatedDay = defeatedDay
  return state
}

/** Gespeicherte Siege nach Woche (je Woche der erste gültige Eintrag). */
export function victoriesByWeek(victories: readonly BossVictory[] | undefined): Map<DayKey, BossVictory> {
  const byWeek = new Map<DayKey, BossVictory>()
  for (const victory of victories ?? []) {
    if (!isValidDayKey(victory.weekStart) || byWeek.has(victory.weekStart)) continue
    byWeek.set(victory.weekStart, victory)
  }
  return byWeek
}

/**
 * Siege, die abgeleitet feststehen, aber noch nicht gespeichert sind – das speichert der Recorder
 * (`recordProgress({ bossVictories })`): `{ weekStart, bossId, day: defeatedDay, maxHp }`.
 */
export function unrecordedVictories(
  states: readonly (WeeklyBossState | undefined)[],
  stored: readonly BossVictory[] | undefined,
): BossVictory[] {
  const known = victoriesByWeek(stored)
  const result: BossVictory[] = []
  for (const state of states) {
    if (state === undefined || !state.defeated || state.defeatedDay === undefined) continue
    if (known.has(state.weekStart) || result.some((victory) => victory.weekStart === state.weekStart)) continue
    result.push({ weekStart: state.weekStart, bossId: state.boss.id, day: state.defeatedDay, maxHp: state.maxHp })
  }
  return result
}
