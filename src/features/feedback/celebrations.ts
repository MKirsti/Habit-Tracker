/**
 * Warteschlange der großen Szenen (Level-Up, Kampagne gemeistert, die würdevolle Niederlage-Szene der Lebenspunkte –
 * Phase 3a: Boss besiegt und Klassenwechsel; Phase 3b: Endgegner besiegt und die Entwicklung des Gefährten). Sie werden
 * nacheinander gezeigt; der erste Eintrag ist der sichtbare.
 */
import { compareDays } from '../../domain/dates'
import type { DayKey, GameState } from '../../domain/types'
import type { BossDefeatedEvent, ClassChangedEvent } from './combatFeedback'
import type { CompanionEvolvedEvent } from './companionFeedback'
import type { EndBossDefeatedEvent } from './endBossFeedback'
import { feedbackStillHolds } from './feedbackEvents'
import type { CampaignCompletedEvent, FeedbackEvent, LevelUpEvent } from './feedbackEvents'
import type { DefeatEvent } from './hpFeedback'

export type Celebration =
  | { id: number; kind: 'level-up'; event: LevelUpEvent }
  | { id: number; kind: 'campaign'; event: CampaignCompletedEvent }
  | { id: number; kind: 'defeat'; event: DefeatEvent }
  | { id: number; kind: 'boss'; event: BossDefeatedEvent }
  | { id: number; kind: 'class'; event: ClassChangedEvent }
  | { id: number; kind: 'end-boss'; event: EndBossDefeatedEvent }
  | { id: number; kind: 'evolve'; event: CompanionEvolvedEvent }

/**
 * Hängt die Szenen aus `events` an die Warteschlange an: zuerst eine Niederlage (Nachricht der Abrechnung), dann ein
 * Klassenwechsel (neue Woche), Boss-Siege, besiegte Endgegner und – direkt danach – ihre gemeisterten Kampagnen
 * (Ursache), die Entwicklung des Gefährten, dann der Level-Up (Folge). Ein Level-Up, der auf einen noch nicht gezeigten
 * Level-Up folgt, wird mit diesem zusammengefasst (Level 3 → 5 statt zweier Szenen). Der sichtbare erste Eintrag bleibt
 * unverändert.
 *
 * @param nextId liefert fortlaufende, eindeutige IDs.
 */
export function enqueueCelebrations(
  queue: readonly Celebration[],
  events: readonly FeedbackEvent[],
  nextId: () => number,
): Celebration[] {
  const result = [...queue]
  for (const event of events) {
    if (event.type === 'defeat') result.push({ id: nextId(), kind: 'defeat', event })
  }
  for (const event of events) {
    if (event.type === 'class-changed') result.push({ id: nextId(), kind: 'class', event })
  }
  for (const event of events) {
    if (event.type === 'boss-defeated') result.push({ id: nextId(), kind: 'boss', event })
  }
  for (const event of events) {
    if (event.type === 'end-boss-defeated') result.push({ id: nextId(), kind: 'end-boss', event })
  }
  for (const event of events) {
    if (event.type === 'campaign-completed') result.push({ id: nextId(), kind: 'campaign', event })
  }
  for (const event of events) {
    if (event.type === 'companion-evolved') result.push({ id: nextId(), kind: 'evolve', event })
  }
  for (const event of events) {
    if (event.type !== 'level-up') continue
    const lastIndex = result.length - 1
    const last = result[lastIndex]
    if (lastIndex >= 1 && last.kind === 'level-up') {
      result[lastIndex] = { ...last, event: mergeLevelUps(last.event, event) }
    } else {
      result.push({ id: nextId(), kind: 'level-up', event })
    }
  }
  return result
}

function mergeLevelUps(first: LevelUpEvent, second: LevelUpEvent): LevelUpEvent {
  return {
    type: 'level-up',
    from: first.from,
    to: second.to,
    level: second.level,
    rank: second.rank,
    previousRank: first.previousRank,
    rankChanged: second.rank !== first.previousRank,
  }
}

/** Ob die Ereignisse eine Feier-Szene auslösen. */
export function hasCelebration(events: readonly FeedbackEvent[]): boolean {
  return events.some(isCelebrationEvent)
}

/**
 * Level-Up, Kampagne, Niederlage, Boss-Sieg, Klassenwechsel, Endgegner und Entwicklung des Gefährten bekommen eine
 * Szene, alles andere einen Toast.
 */
export function isCelebrationEvent(event: FeedbackEvent): boolean {
  return (
    event.type === 'level-up' ||
    event.type === 'campaign-completed' ||
    event.type === 'defeat' ||
    event.type === 'boss-defeated' ||
    event.type === 'class-changed' ||
    event.type === 'end-boss-defeated' ||
    event.type === 'companion-evolved'
  )
}

/**
 * Gleicht die Warteschlange mit dem aktuellen Zustand ab: Szenen, deren Erfolg rückgängig gemacht
 * wurde (z. B. Haken sofort wieder entfernt), verschwinden; ein Mehrfach-Level-Up wird auf den noch
 * erreichten Level gekürzt. Ohne Änderung kommt dieselbe Warteschlange (gleiche Referenz) zurück.
 */
export function reconcileCelebrations(queue: readonly Celebration[], state: GameState): readonly Celebration[] {
  let changed = false
  const result: Celebration[] = []
  for (const celebration of queue) {
    if (feedbackStillHolds(celebration.event, state)) {
      result.push(celebration)
      continue
    }
    changed = true
    if (celebration.kind === 'level-up' && state.level.level > celebration.event.from) {
      const { event } = celebration
      result.push({
        ...celebration,
        event: {
          ...event,
          to: state.level.level,
          level: state.level,
          rank: state.rank,
          rankChanged: state.rank !== event.previousRank,
        },
      })
    }
  }
  return changed ? result : queue
}

/**
 * Was der Spieler schon gefeiert hat. Wird ein Haken entfernt und wieder gesetzt, erscheint dieselbe
 * Szene nicht noch einmal – der XP-Toast schon.
 */
export interface CelebrationMemory {
  /** Höchster Level, der schon gefeiert wurde (bzw. beim Start erreicht war). */
  level: number
  /** Kampagnen, deren Abschluss schon gefeiert wurde (bzw. die beim Start abgeschlossen waren). */
  campaigns: ReadonlySet<string>
  /** Letzte schon gezeigte (bzw. beim Start bekannte) Niederlage – keine Szene für sie oder frühere. */
  lastDefeatDay?: DayKey
  /** Wochen (Montag), deren Boss-Sieg schon gefeiert wurde (bzw. beim Start schon feststand). */
  bossWeeks: ReadonlySet<DayKey>
  /** Kampagnen, deren Endgegner schon gefeiert wurde (bzw. beim Start schon besiegt war). */
  endBosses: ReadonlySet<string>
  /** Höchste Stufe des Gefährten, die schon gefeiert wurde (bzw. beim Start erreicht war; ohne Gefährten 0). */
  companionStage: number
}

/** Ausgangspunkt: Alles, was im Zustand schon erreicht ist, gilt als gefeiert. */
export function celebrationMemoryOf(state: GameState): CelebrationMemory {
  const memory: CelebrationMemory = {
    level: state.level.level,
    campaigns: new Set(state.mainQuests.filter((campaign) => campaign.complete).map((campaign) => campaign.quest.id)),
    bossWeeks: new Set(
      [state.bosses.current, state.bosses.previous].flatMap((boss) => (boss?.defeated ? [boss.weekStart] : [])),
    ),
    endBosses: new Set(
      state.mainQuests.filter((campaign) => campaign.endBoss?.defeated === true).map((campaign) => campaign.quest.id),
    ),
    companionStage: state.companion?.stage ?? 0,
  }
  const lastDefeat = state.hp.lastDefeat?.day
  if (lastDefeat !== undefined) memory.lastDefeatDay = lastDefeat
  return memory
}

/** Nach dem Schließen einer Szene: Sie gilt als gesehen. */
export function rememberCelebration(memory: CelebrationMemory, celebration: Celebration): CelebrationMemory {
  switch (celebration.kind) {
    case 'level-up':
      return { ...memory, level: Math.max(memory.level, celebration.event.to) }
    case 'campaign':
      return { ...memory, campaigns: new Set([...memory.campaigns, celebration.event.campaignId]) }
    case 'defeat': {
      const { day } = celebration.event
      const seen = memory.lastDefeatDay
      return { ...memory, lastDefeatDay: seen !== undefined && compareDays(seen, day) >= 0 ? seen : day }
    }
    case 'boss':
      return { ...memory, bossWeeks: new Set([...memory.bossWeeks, celebration.event.weekStart]) }
    case 'class':
      // Je Held und Woche nur einmal – das merkt sich der `ClassSceneStore` (combatFeedback.ts) dauerhaft.
      return memory
    case 'end-boss':
      return { ...memory, endBosses: new Set([...memory.endBosses, celebration.event.campaignId]) }
    case 'evolve':
      return { ...memory, companionStage: Math.max(memory.companionStage, celebration.event.to) }
  }
}

/** Entfernt Szenen-Ereignisse, die schon gefeiert bzw. gezeigt wurden (Toast-Ereignisse bleiben). */
export function withoutCelebrated(events: readonly FeedbackEvent[], memory: CelebrationMemory): FeedbackEvent[] {
  return events.filter((event) => {
    if (event.type === 'level-up') return event.to > memory.level
    if (event.type === 'campaign-completed') return !memory.campaigns.has(event.campaignId)
    if (event.type === 'defeat') return memory.lastDefeatDay === undefined || compareDays(event.day, memory.lastDefeatDay) > 0
    if (event.type === 'boss-defeated') return !memory.bossWeeks.has(event.weekStart)
    if (event.type === 'end-boss-defeated') return !memory.endBosses.has(event.campaignId)
    if (event.type === 'companion-evolved') return event.to > memory.companionStage
    return true
  })
}
