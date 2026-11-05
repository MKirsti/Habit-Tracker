/**
 * Wochen-Boss (Phase 3a, ARCHITECTURE.md „Wochen-Boss“) – rein.
 *
 * - **Geplanter Wochenschaden** = Summe über die Tage Mo–So und alle Quests, die an dem Tag Pflicht sind
 *   (`isRequiredOn`, Ruhetage zählen nicht), plus Wochenquests × `times` (Rhythmus vom Montag): jeweils der Schaden
 *   einer Erledigung **ohne** Schwäche (`attackDamage` mit den Kampf-Leveln und dem Klassen-Bonus der Woche).
 *   Wochenquests zählen höchstens so oft, wie die Woche Tage hat, an denen sie aktiv, eine Wochenquest und kein
 *   Ruhetag sind – eine Urlaubswoche plant so keinen Schaden, eine am Samstag angelegte 3×-Quest höchstens 2.
 *   Ist der geplante Schaden 0, gibt es keinen Boss.
 * - `maxHp = max(min(bossMinHp, geplant), round(bossHpShare × geplant))` – nie mehr als der geplante Schaden
 *   (Nachbesserung 3a: kein unschaffbarer Boss). Später eingetragene Rast senkt ihn (abgeleitet); ein gespeicherter
 *   Sieg bleibt (dann gelten dessen Boss und `maxHp`).
 * - **Boss-Wahl:** Thema = Attribut mit dem größten geplanten Schaden (Gleichstand → `ATTRIBUTE_IDS`); in etwa jeder
 *   4. Woche (`isSecondThemeWeek`, per Hash, `SECOND_THEME_SHARE` = 25 %) das zweitstärkste geplante Attribut, falls es
 *   eins gibt. Daraus ein Boss per Hash von `heroSeed + weekStart` – **nie derselbe wie in der Vorwoche** (Boss der
 *   Vorwoche: gespeicherter Sieg, sonst nach denselben Regeln abgeleitet; `createBossResolver` rechnet die Kette).
 *   **Schwäche:** per Hash aus den Attributen mit geplantem Schaden > 0 außer dem Thema des Bosses (gibt es keine
 *   anderen, das Thema). Alles per Rendezvous-Hashing (`rendezvousPick`): Eine neue Quest mitten in der Woche ändert
 *   Boss und Schwäche nur, wenn sie das Thema kippt bzw. ihr Attribut die Wahl gewinnt.
 * - Angriffe: jede erledigte Quest-Erledigung (Momentaufnahme von Attribut und Schwierigkeit) und jede erledigte
 *   Nebenquest der Woche (bis heute), Schaden mit Schwäche × 1,5. Phase 3b: an jedem Perfekten Tag der Woche (bis heute,
 *   ab der Wahl des Gefährten) zusätzlich ein Treffer des Gefährten (`companionHitDamage`: 10 % des Quest-Schadens des
 *   Tages) – nicht in den geplanten HP. `defeated` ⇔ gespeicherter Sieg oder Schaden ≥ maxHp; `defeatedDay` = Tag, an
 *   dem die Summe maxHp erreichte (bzw. der gespeicherte Tag). Entkommen kostet nichts.
 */
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import { companionHitDamage } from '../companion'
import { addDays, compareDays, diffDays, isValidDayKey, startOfWeek } from '../dates'
import { isActiveOn, isRequiredOn, scheduleOn } from '../schedule'
import type { HabitTimeline } from '../schedule'
import type {
  AttackEvent,
  AttributeId,
  BossDefinition,
  BossVictory,
  CharacterProfile,
  CompanionSpecies,
  DayKey,
  Difficulty,
  HeroClassState,
  WeeklyBossState,
} from '../types'
import { ATTACK_NAMES } from './classDefinitions'
import { BOSSES } from './bosses'
import { attackDamage, isAttributeId } from './damage'
import { hashUnit, rendezvousPick } from './hash'

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
    // Schnell übersprungen: in dieser Woche noch nicht angelegt oder schon archiviert (gleiche Bedeutung wie isActiveOn).
    if (compareDays(habit.createdDay, days[6]) > 0) continue
    if (habit.archivedDay !== undefined && compareDays(habit.archivedDay, days[0]) <= 0) continue
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

/**
 * Lebenspunkte des Bosses: `max(min(bossMinHp, geplant), round(bossHpShare × geplant))` – nie mehr als der geplante
 * Schaden (eine Woche mit wenig Plan bekommt keinen unschaffbaren Boss); ohne geplanten Schaden 0.
 */
export function bossMaxHp(plannedDamage: number): number {
  if (!(plannedDamage > 0) || !Number.isFinite(plannedDamage)) return 0
  const planned = Math.round(plannedDamage)
  return Math.max(Math.min(BALANCING.combat.bossMinHp, planned), Math.round(BALANCING.combat.bossHpShare * plannedDamage))
}

// ---------------------------------------------------------------------------
// Boss und Schwäche
// ---------------------------------------------------------------------------

/** Thema: Attribut mit dem größten geplanten Schaden (Gleichstand → Reihenfolge `ATTRIBUTE_IDS`); keins → `undefined`. */
export function bossTheme(byAttribute: Readonly<Record<AttributeId, number>>): AttributeId | undefined {
  return rankedThemes(byAttribute)[0]
}

/**
 * Zweitstärkstes geplantes Attribut (Schaden > 0; Gleichstand → Reihenfolge `ATTRIBUTE_IDS`); gibt es nur eins oder
 * keins → `undefined`.
 */
export function secondBossTheme(byAttribute: Readonly<Record<AttributeId, number>>): AttributeId | undefined {
  return rankedThemes(byAttribute)[1]
}

/** Attribute mit geplantem Schaden > 0, absteigend (Gleichstand → Reihenfolge `ATTRIBUTE_IDS`). */
function rankedThemes(byAttribute: Readonly<Record<AttributeId, number>>): AttributeId[] {
  return ATTRIBUTE_IDS.filter((id) => byAttribute[id] > 0).sort((a, b) => byAttribute[b] - byAttribute[a])
}

/** Anteil der Wochen, in denen der Boss aus dem Thema des zweitstärksten Attributs kommt (Nachbesserung 3a). */
export const SECOND_THEME_SHARE = 0.25

/** Hash-Schlüssel der Woche: `heroSeed + weekStart`. */
function weekKey(heroSeed: string, weekStart: DayKey): string {
  return `${heroSeed}${weekStart}`
}

/**
 * Kommt der Boss dieser Woche aus dem zweitstärksten Thema? `hash(heroSeed + weekStart + ':second-theme') < 0,25` –
 * deterministisch je Held und Woche, im Mittel jede 4. Woche.
 */
export function isSecondThemeWeek(heroSeed: string, weekStart: DayKey): boolean {
  return hashUnit(`${weekKey(heroSeed, startOfWeek(weekStart))}:second-theme`) < SECOND_THEME_SHARE
}

/**
 * Thema des Bosses der Woche: das stärkste geplante Attribut – in einer Woche mit `isSecondThemeWeek` das
 * zweitstärkste, falls es eins gibt. Ohne Plan `undefined`.
 */
export function weekBossTheme(
  byAttribute: Readonly<Record<AttributeId, number>>,
  heroSeed: string,
  weekStart: DayKey,
): AttributeId | undefined {
  const [first, second] = rankedThemes(byAttribute)
  if (second !== undefined && isSecondThemeWeek(heroSeed, weekStart)) return second
  return first
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

/**
 * Boss der Woche aus den Bossen des Themas (Hash von `heroSeed + weekStart`); ohne passenden Boss ein Notfall-Boss.
 * `excludeId` (der Boss der Vorwoche) kommt nicht in Frage – außer er ist der einzige des Themas.
 */
export function chooseBoss(
  theme: AttributeId,
  heroSeed: string,
  weekStart: DayKey,
  bosses: readonly BossDefinition[] = BOSSES,
  excludeId?: string,
): BossDefinition {
  const candidates = bosses.filter((boss) => boss.theme === theme)
  const allowed = excludeId === undefined ? candidates : candidates.filter((boss) => boss.id !== excludeId)
  const key = `${weekKey(heroSeed, weekStart)}:boss`
  return (
    rendezvousPick(allowed.length > 0 ? allowed : candidates, key, (boss) => boss.id) ?? fallbackBoss(theme)
  )
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

/** Was die Boss-Wahl über eine Woche wissen muss. */
export interface BossWeekPlan {
  /** Geplanter Schaden je Attribut (`plannedWeekDamage(...).byAttribute`). */
  byAttribute: Readonly<Record<AttributeId, number>>
  /** Geplanter Schaden gesamt. */
  total: number
  /** Gespeicherter Sieg dieser Woche, falls vorhanden. */
  victory?: BossVictory
}

/**
 * Boss einer Woche: der des gespeicherten Siegs (sofern bekannt), sonst aus dem Thema der Woche (`weekBossTheme`) –
 * nie `previousBossId` (Boss der Vorwoche). Ohne Plan und ohne Sieg `undefined`.
 */
export function weekBoss(
  plan: BossWeekPlan,
  heroSeed: string,
  weekStart: DayKey,
  previousBossId: string | undefined,
  bosses: readonly BossDefinition[] = BOSSES,
): BossDefinition | undefined {
  const week = startOfWeek(weekStart)
  const victory = plan.victory !== undefined && plan.victory.weekStart === week ? plan.victory : undefined
  if (victory !== undefined) {
    const stored = bossById(victory.bossId, bosses)
    if (stored !== undefined) return stored
  } else if (!(plan.total > 0)) {
    return undefined
  }
  const theme = weekBossTheme(plan.byAttribute, heroSeed, week) ?? ATTRIBUTE_IDS[0]
  return chooseBoss(theme, heroSeed, week, bosses, previousBossId)
}

export interface BossResolverInput {
  heroSeed: string
  /** Erste Woche, in der es Bosse gibt (Woche des Abenteuerbeginns); davor zählt nichts. */
  fromWeek: DayKey
  /** Plan und gespeicherter Sieg einer Woche (wird je Woche höchstens einmal abgefragt). */
  planOf: (weekStart: DayKey) => BossWeekPlan
  bosses?: readonly BossDefinition[]
}

export interface BossResolver {
  /** Boss der Woche (mit „nie zweimal in Folge“), `undefined` ohne Boss bzw. vor `fromWeek`. */
  bossOf(weekStart: DayKey): BossDefinition | undefined
  /** Plan der Woche (zwischengespeichert). */
  planOf(weekStart: DayKey): BossWeekPlan
}

/** Sicherheitsgrenze der Kette (≈ 40 Jahre); kaputte Daten dürfen die App nie aufhalten. */
const MAX_CHAIN_WEEKS = 2_100

/**
 * Bosse über die Wochenfolge: Der Boss einer Woche hängt am Boss der Vorwoche (nie derselbe zweimal in Folge), dieser
 * an dem davor … Gerechnet wird nur so weit zurück wie nötig: Die Kette endet an einer Woche mit gespeichertem Sieg
 * (Boss steht fest), an einer Woche ohne Boss, am Abenteuerbeginn – oder sobald die Vorwoche ein anderes Thema hatte
 * (dann kann ihr Boss ohnehin nicht derselbe sein). Ergebnisse und Pläne werden zwischengespeichert.
 */
export function createBossResolver(input: BossResolverInput): BossResolver {
  const bosses = input.bosses ?? BOSSES
  const fromWeek = startOfWeek(input.fromWeek)
  const plans = new Map<DayKey, BossWeekPlan>()
  const resolved = new Map<DayKey, BossDefinition | undefined>()
  const planOf = (week: DayKey): BossWeekPlan => {
    let plan = plans.get(week)
    if (plan === undefined) plans.set(week, (plan = input.planOf(week)))
    return plan
  }
  const themeOf = (week: DayKey): AttributeId | undefined => {
    const plan = planOf(week)
    return plan.total > 0 ? weekBossTheme(plan.byAttribute, input.heroSeed, week) : undefined
  }
  const anchored = (week: DayKey): boolean => {
    const victory = planOf(week).victory
    return victory !== undefined && bossById(victory.bossId, bosses) !== undefined
  }

  const bossOf = (weekStart: DayKey): BossDefinition | undefined => {
    const target = startOfWeek(weekStart)
    if (compareDays(target, fromWeek) < 0) return undefined
    if (resolved.has(target)) return resolved.get(target)
    // Rückwärts: die Wochen, deren Bosse den Boss von `target` bestimmen.
    const hasBoss = (plan: BossWeekPlan) => plan.total > 0 || plan.victory !== undefined
    const chain: DayKey[] = [target]
    if (!hasBoss(planOf(target))) {
      resolved.set(target, undefined)
      return undefined
    }
    let week = target
    // Thema der zuletzt (in Zeitrichtung: nächsten) Woche MIT Boss – Wochen ohne Boss (z. B. Urlaub) werden
    // übersprungen: Der Boss nach einer bosslosen Woche darf nicht der von davor sein.
    let nextTheme = themeOf(target)
    while (chain.length < MAX_CHAIN_WEEKS && !anchored(week) && compareDays(week, fromWeek) > 0) {
      const previous = addDays(week, -7)
      const previousPlan = planOf(previous)
      if (resolved.has(previous) && (resolved.get(previous) !== undefined || hasBoss(previousPlan))) {
        chain.push(previous)
        break
      }
      if (hasBoss(previousPlan)) {
        if (previousPlan.victory === undefined && themeOf(previous) !== nextTheme) break
        nextTheme = themeOf(previous)
      }
      chain.push(previous)
      week = previous
    }
    // Vorwärts: vom ältesten Glied bis `target`. Eine Woche ohne Boss reicht den letzten Boss weiter.
    let previousId: string | undefined
    for (let i = chain.length - 1; i >= 0; i--) {
      const current = chain[i]
      let boss: BossDefinition | undefined
      if (resolved.has(current)) boss = resolved.get(current)
      else {
        boss = weekBoss(planOf(current), input.heroSeed, current, previousId, bosses)
        resolved.set(current, boss)
      }
      previousId = boss?.id ?? previousId
    }
    return resolved.get(target)
  }
  return { bossOf, planOf }
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
  /**
   * Boss der Vorwoche (gespeicherter Sieg bzw. abgeleitet, `createBossResolver`) – kommt diese Woche nicht noch
   * einmal. Fehlt = keine Einschränkung.
   */
  previousBossId?: string
  /** Phase 3b: der Gefährte – trifft an jedem Perfekten Tag der Woche mit. Fehlt = kein Gefährte. */
  companion?: CompanionAttackInput
  bosses?: readonly BossDefinition[]
  attackNames?: Readonly<Record<AttributeId, string>>
}

/** Was die Treffer des Gefährten brauchen. */
export interface CompanionAttackInput {
  species: CompanionSpecies
  /** Name des Gefährten – steht als `attackName` am Treffer. */
  name: string
  /** Perfekte Tage (beliebig viele; zählen nur die der Woche bis heute und ab `fromDay`). */
  perfectDays: ReadonlySet<DayKey>
  /** Ab diesem Tag ist der Gefährte dabei (Tag der Wahl); fehlt = immer. */
  fromDay?: DayKey
}

/**
 * Treffer des Gefährten (Phase 3b): an jedem Perfekten Tag der Angriffe ein Bonus-Treffer von
 * `companionHitDamage(Quest-Schaden des Tages)` (nur Quests, inklusive Schwäche; ohne Nebenquests) – direkt nach den
 * Angriffen des Tages, mit dem Attribut, das an dem Tag am meisten Quest-Schaden machte (Gleichstand →
 * `ATTRIBUTE_IDS`), `source: 'companion'`, `sourceId` = Art, `weakness: false`. Ein Treffer von 0 entfällt.
 * @param attacks Angriffe der Woche, chronologisch (`attacksOf`).
 */
export function withCompanionHits(attacks: readonly AttackEvent[], companion: CompanionAttackInput | undefined): AttackEvent[] {
  if (companion === undefined || companion.perfectDays.size === 0) return [...attacks]
  const fromDay = companion.fromDay !== undefined && isValidDayKey(companion.fromDay) ? companion.fromDay : undefined
  const result: AttackEvent[] = []
  let day: DayKey | undefined
  let byAttribute: Partial<Record<AttributeId, number>> = {}
  const flush = () => {
    if (day === undefined || !companion.perfectDays.has(day)) return
    if (fromDay !== undefined && compareDays(day, fromDay) < 0) return
    let questDamage = 0
    let attribute: AttributeId | undefined
    for (const id of ATTRIBUTE_IDS) {
      const damage = byAttribute[id] ?? 0
      questDamage += damage
      if (damage > 0 && (attribute === undefined || damage > (byAttribute[attribute] ?? 0))) attribute = id
    }
    const damage = companionHitDamage(questDamage)
    if (attribute === undefined || !(damage > 0)) return
    result.push({
      day,
      source: 'companion',
      sourceId: companion.species,
      attribute,
      attackName: companion.name,
      damage,
      weakness: false,
    })
  }
  for (const attack of attacks) {
    if (attack.day !== day) {
      flush()
      day = attack.day
      byAttribute = {}
    }
    result.push(attack)
    if (attack.source === 'quest') byAttribute[attack.attribute] = (byAttribute[attack.attribute] ?? 0) + attack.damage
  }
  flush()
  return result
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

  const boss =
    weekBoss({ byAttribute, total, victory }, input.heroSeed, weekStart, input.previousBossId, bosses) ??
    fallbackBoss(ATTRIBUTE_IDS[0])
  const weakness = chooseWeakness(byAttribute, boss.theme, input.heroSeed, weekStart)
  const storedMaxHp = victory !== undefined && Number.isFinite(victory.maxHp) && victory.maxHp > 0 ? victory.maxHp : 0
  // Ein gespeicherter Sieg ohne gültige HP (kaputte Daten) und ohne Plan: die Untergrenze, damit nichts durch 0 teilt.
  const maxHp = storedMaxHp > 0 ? Math.round(storedMaxHp) : total > 0 ? bossMaxHp(total) : BALANCING.combat.bossMinHp

  const sources = input.sources.filter(
    (source) =>
      isValidDayKey(source.day) &&
      compareDays(source.day, weekStart) >= 0 &&
      compareDays(source.day, weekEnd) <= 0 &&
      compareDays(source.day, input.today) <= 0,
  )
  const attacks = withCompanionHits(attacksOf(sources, input.stats, weakness, input.attackNames), input.companion)
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
