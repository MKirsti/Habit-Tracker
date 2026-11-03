/**
 * Warteschlange der großen Feier-Szenen (Level-Up, Kampagne gemeistert). Sie werden nacheinander
 * gezeigt; der erste Eintrag ist der sichtbare.
 */
import type { GameState } from '../../domain/types'
import { feedbackStillHolds } from './feedbackEvents'
import type { CampaignCompletedEvent, FeedbackEvent, LevelUpEvent } from './feedbackEvents'

export type Celebration =
  | { id: number; kind: 'level-up'; event: LevelUpEvent }
  | { id: number; kind: 'campaign'; event: CampaignCompletedEvent }

/**
 * Hängt die Feier-Szenen aus `events` an die Warteschlange an: erst Kampagnen (Ursache), dann der
 * Level-Up (Folge). Ein Level-Up, der auf einen noch nicht gezeigten Level-Up folgt, wird mit diesem
 * zusammengefasst (Level 3 → 5 statt zweier Szenen). Der sichtbare erste Eintrag bleibt unverändert.
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
    if (event.type === 'campaign-completed') result.push({ id: nextId(), kind: 'campaign', event })
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

/** Level-Up und Kampagne bekommen eine Szene, alles andere einen Toast. */
export function isCelebrationEvent(event: FeedbackEvent): boolean {
  return event.type === 'level-up' || event.type === 'campaign-completed'
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
}

/** Ausgangspunkt: Alles, was im Zustand schon erreicht ist, gilt als gefeiert. */
export function celebrationMemoryOf(state: GameState): CelebrationMemory {
  return {
    level: state.level.level,
    campaigns: new Set(state.mainQuests.filter((campaign) => campaign.complete).map((campaign) => campaign.quest.id)),
  }
}

/** Nach dem Schließen einer Szene: Sie gilt als gesehen. */
export function rememberCelebration(memory: CelebrationMemory, celebration: Celebration): CelebrationMemory {
  if (celebration.kind === 'level-up') {
    return { ...memory, level: Math.max(memory.level, celebration.event.to) }
  }
  return { ...memory, campaigns: new Set([...memory.campaigns, celebration.event.campaignId]) }
}

/** Entfernt Szenen-Ereignisse, die schon gefeiert wurden (Toast-Ereignisse bleiben). */
export function withoutCelebrated(events: readonly FeedbackEvent[], memory: CelebrationMemory): FeedbackEvent[] {
  return events.filter((event) => {
    if (event.type === 'level-up') return event.to > memory.level
    if (event.type === 'campaign-completed') return !memory.campaigns.has(event.campaignId)
    return true
  })
}
