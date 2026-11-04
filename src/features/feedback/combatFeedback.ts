/**
 * Rückmeldungen zu Kampf und Beute (Phase 3a) – rein und ohne React, die Darstellung übernimmt `GameFeedback`.
 *
 * Aus zwei aufeinanderfolgenden Spielzuständen (wie `diffGameStates`):
 * - **Boss besiegt**: Der Boss einer Woche (laufende oder – beim Nachtragen am Montag – die Vorwoche) stand vorher noch
 *   und ist jetzt besiegt → Siegesszene mit seiner Truhe (`boss:<Montag>`).
 * - **Truhe gefunden**: neue Quest- und Kapitel-Truhen in `state.chests` → kleine Meldung (Boss-Truhen zeigt die
 *   Siegesszene). Mehr als `bulkLimit` (`BULK_CHANGE_LIMIT`) auf einmal bleiben still.
 *
 * Aus dem Zustand selbst (nicht aus einem Schritt):
 * - **Klassenwechsel**: Klassen wechseln nur zu Wochenbeginn – also immer zusammen mit einem Tageswechsel oder beim
 *   Öffnen der App, die beide sonst still bleiben. Deshalb meldet `classChangeOf` den Wechsel der laufenden Woche aus
 *   `heroClass.previousId`; dass er je Held und Woche nur einmal erscheint, merkt sich der `ClassSceneStore` (auf diesem
 *   Gerät). Zurück zum Abenteurer (Attribute gesunken) feiert nichts.
 *
 * Massenänderungen (Tageswechsel, Backup, anderes Profil) und das erste Laden filtert `GameFeedback` vorher heraus.
 */
import { compareDays } from '../../domain/dates'
import { classDefinition } from '../../domain/combat/classes'
import type {
  AttributeId,
  ChestRarity,
  ChestSource,
  DayKey,
  GameState,
  HeroClassDefinition,
  WeeklyBossState,
} from '../../domain/types'

export interface BossDefeatedEvent {
  type: 'boss-defeated'
  /** Montag der Woche des Bosses. */
  weekStart: DayKey
  bossId: string
  name: string
  /** Emoji des Bosses. */
  icon: string
  /** Satz zum Sieg (`BossDefinition.defeatLine`). */
  defeatLine: string
  maxHp: number
  /** Truhe des Siegs (`boss:<weekStart>`), sofern im Spielzustand. */
  chestId?: string
  /** true: der Boss der Vorwoche (nachgetragen in der Gnadenfrist). */
  lastWeek: boolean
}

/** Eine neu gefundene Truhe (Quest oder Kapitel). */
export interface FoundChest {
  id: string
  source: ChestSource
  rarity: ChestRarity
  /** Wofür („📖 Lesen“) – ergänzt `GameFeedback` aus den Daten (`chestSourceLine`). */
  sourceLine?: string
}

export interface ChestFoundEvent {
  type: 'chest-found'
  chests: FoundChest[]
}

export interface ClassChangedEvent {
  type: 'class-changed'
  /** Montag der Woche, ab der die neue Klasse gilt. */
  weekStart: DayKey
  from: HeroClassDefinition
  to: HeroClassDefinition
  /** Klassen-Bonus der neuen Klasse (`heroClass.classBonus`). */
  classBonus: Partial<Record<AttributeId, number>>
}

export type CombatFeedbackEvent = BossDefeatedEvent | ChestFoundEvent | ClassChangedEvent

/**
 * Rückmeldungen zu Kampf und Beute für den Schritt `prev` → `next` (Reihenfolge: Boss-Siege, dann Truhen).
 * @param bulkLimit Mehr neue Truhen auf einmal gelten als Massenänderung (`BULK_CHANGE_LIMIT` aus `feedbackEvents.ts`).
 */
export function combatFeedbackEvents(prev: GameState, next: GameState, bulkLimit: number): CombatFeedbackEvent[] {
  if (prev === next) return []
  const events: CombatFeedbackEvent[] = []
  const before = bossesOf(prev)
  for (const [boss, lastWeek] of [
    [next.bosses.current, false],
    [next.bosses.previous, true],
  ] as const) {
    if (boss === undefined || !boss.defeated) continue
    const earlier = before.find((candidate) => candidate.weekStart === boss.weekStart)
    // Nur ein echter Sieg in diesem Schritt: Der Boss derselben Woche stand vorher noch.
    if (earlier === undefined || earlier.defeated) continue
    const chestId = `boss:${boss.weekStart}`
    const event: BossDefeatedEvent = {
      type: 'boss-defeated',
      weekStart: boss.weekStart,
      bossId: boss.boss.id,
      name: boss.boss.name,
      icon: boss.boss.icon,
      defeatLine: boss.boss.defeatLine,
      maxHp: boss.maxHp,
      lastWeek,
    }
    if (next.chests.some((chest) => chest.id === chestId)) event.chestId = chestId
    events.push(event)
  }

  const known = new Set(prev.chests.map((chest) => chest.id))
  const found: FoundChest[] = next.chests
    .filter((chest) => !known.has(chest.id) && chest.source !== 'boss' && chest.openedAt === undefined)
    .map((chest) => ({ id: chest.id, source: chest.source, rarity: chest.rarity }))
  if (found.length > 0 && found.length <= bulkLimit) events.push({ type: 'chest-found', chests: found })
  return events
}

function bossesOf(state: GameState): WeeklyBossState[] {
  return [state.bosses.current, state.bosses.previous].filter((boss): boss is WeeklyBossState => boss !== undefined)
}

/**
 * Der Klassenwechsel der laufenden Woche – falls die Klasse sich gegenüber der Vorwoche geändert hat und die neue
 * eine echte Klasse ist (nicht wieder der Abenteurer).
 */
export function classChangeOf(state: Pick<GameState, 'heroClass'>): ClassChangedEvent | undefined {
  const { heroClass } = state
  const previous = heroClass.previousId
  if (previous === undefined || previous === heroClass.definition.id || heroClass.definition.id === 'adventurer') {
    return undefined
  }
  return {
    type: 'class-changed',
    weekStart: heroClass.weekStart,
    from: classDefinition(previous),
    to: heroClass.definition,
    classBonus: heroClass.classBonus,
  }
}

/** Gilt die Kampf-Rückmeldung im (späteren) Zustand `state` noch? */
export function combatFeedbackStillHolds(event: CombatFeedbackEvent, state: GameState): boolean {
  switch (event.type) {
    case 'boss-defeated': {
      // Nach dem Speichern verschwindet der Vorwochen-Boss aus dem Zustand – der Sieg bleibt.
      const boss = bossesOf(state).find((candidate) => candidate.weekStart === event.weekStart)
      return boss === undefined || boss.defeated
    }
    case 'chest-found': {
      const ids = new Set(state.chests.map((chest) => chest.id))
      return event.chests.every((chest) => ids.has(chest.id))
    }
    case 'class-changed':
      return state.heroClass.weekStart === event.weekStart && state.heroClass.definition.id === event.to.id
  }
}

// ---------------------------------------------------------------------------
// Klassenwechsel: schon gezeigt? (je Held und Woche, auf diesem Gerät)
// ---------------------------------------------------------------------------

const CLASS_SCENE_KEY = 'questlog:class-scene'

/** Speicher für „Wechsel-Szene dieser Woche schon gezeigt“ – austauschbar für Tests. */
export interface ClassSceneStore {
  get(hero: string): DayKey | undefined
  set(hero: string, weekStart: DayKey): void
}

/** Rückfall, wenn der Browser-Speicher fehlt oder gesperrt ist: wenigstens für diese Sitzung. */
const sessionSeen = new Map<string, DayKey>()

/** `localStorage` (je Held der zuletzt gezeigte Montag), bei Fehlern still die Sitzung. */
export const browserClassSceneStore: ClassSceneStore = {
  get(hero) {
    let stored: DayKey | undefined
    try {
      const raw = window.localStorage.getItem(`${CLASS_SCENE_KEY}:${hero}`)
      stored = raw !== null && raw !== '' ? raw : undefined
    } catch {
      stored = undefined
    }
    const session = sessionSeen.get(hero)
    if (stored === undefined) return session
    if (session === undefined) return stored
    return compareDays(stored, session) >= 0 ? stored : session
  },
  set(hero, weekStart) {
    sessionSeen.set(hero, weekStart)
    try {
      window.localStorage.setItem(`${CLASS_SCENE_KEY}:${hero}`, weekStart)
    } catch {
      // Privater Modus o. Ä.: Die Sitzung merkt es sich trotzdem.
    }
  },
}

/** Wurde die Wechsel-Szene der Woche `weekStart` für diesen Helden schon gezeigt (oder bewusst übersprungen)? */
export function classSceneSeen(store: ClassSceneStore, hero: string, weekStart: DayKey): boolean {
  const seen = store.get(hero)
  return seen !== undefined && compareDays(seen, weekStart) >= 0
}
