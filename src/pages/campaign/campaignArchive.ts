/**
 * Beenden einer Kampagne: welche Quests der Schalter „Zugehörige Quests ebenfalls archivieren“ betrifft.
 * Rein, ohne React – dieselbe Regel wie `archiveMainQuest` im Repository.
 */
import { CAMPAIGN_RESTORE_LIMIT_MESSAGE } from '../../domain/campaigns'
import { isArchivedOn } from '../../domain/schedule'
import type { DayKey, Habit, MainQuestState } from '../../domain/types'

export interface CampaignQuestsToArchive {
  /** Eigene Quests (`mainQuestId`), die heute noch laufen und keine andere Kampagne braucht – der Schalter betrifft sie. */
  archived: Habit[]
  /** Eigene Quests, die eine andere nicht archivierte Kampagne mitbenutzt – sie laufen auf jeden Fall weiter. */
  kept: Habit[]
  /**
   * Mitbenutzte Quests einer anderen nicht archivierten Kampagne (z. B. „Wasser trinken“ aus der Sport-Kampagne):
   * Sie stehen bei dieser Kampagne, gehören aber der anderen – und laufen ebenfalls weiter.
   */
  borrowed: Habit[]
}

/**
 * Welche Quests einer Kampagne „Zugehörige Quests ebenfalls archivieren“ betrifft – genau wie
 * `archiveMainQuest`: eigene Quests (`mainQuestId`), die heute noch laufen; geteilte Quests, die eine andere
 * nicht archivierte Kampagne braucht (Kapitel-Verweis oder `sharedHabitIds`), laufen weiter. Dazu die
 * mitbenutzten Quests anderer Kampagnen (`borrowed`), die der Schalter nie berührt.
 */
export function campaignQuestsToArchive(
  campaign: MainQuestState,
  habits: readonly Habit[],
  campaigns: readonly MainQuestState[],
  today: DayKey,
): CampaignQuestsToArchive {
  const id = campaign.quest.id
  const others = campaigns.filter((other) => other.quest.id !== id && other.quest.archived !== true)
  const needed = new Set(
    others.flatMap((other) => [
      ...other.quest.chapters.flatMap((chapter) =>
        chapter.criterion.type === 'habit' ? [chapter.criterion.habitId] : [],
      ),
      ...(other.quest.sharedHabitIds ?? []),
    ]),
  )
  const otherIds = new Set(others.map((other) => other.quest.id))
  const linked = new Set(campaign.linkedHabitIds)
  const running = habits.filter((habit) => !isArchivedOn(habit, today))
  const own = running.filter((habit) => habit.mainQuestId === id)
  return {
    archived: own.filter((habit) => !needed.has(habit.id)),
    kept: own.filter((habit) => needed.has(habit.id)),
    borrowed: running.filter(
      (habit) => linked.has(habit.id) && habit.mainQuestId !== undefined && otherIds.has(habit.mainQuestId),
    ),
  }
}

/**
 * Warum sich eine beendete Kampagne gerade nicht zurückholen lässt – `undefined`, wenn es geht. Dieselben Regeln
 * wie `restoreMainQuest`: Eine gemeisterte Kampagne belegt keinen Platz und geht immer; sonst darf keine andere
 * aktive Kampagne aus derselben Vorlage laufen, und es muss ein Platz frei sein.
 * @param active die aktiven Kampagnen (`isCampaignActive`)
 * @param maxActive `BALANCING.maxActiveCampaigns`
 */
export function restoreBlockedReason(
  campaign: MainQuestState,
  active: readonly MainQuestState[],
  maxActive: number,
): string | undefined {
  if (campaign.complete) return undefined
  const others = active.filter((other) => other.quest.id !== campaign.quest.id)
  const blueprintId = campaign.quest.blueprint?.id
  const sameBlueprint = blueprintId === undefined ? undefined : others.find((other) => other.quest.blueprint?.id === blueprintId)
  if (sameBlueprint !== undefined) {
    return `Aus dieser Vorlage läuft gerade „${sameBlueprint.quest.title}“. Schließe sie ab oder beende sie, um diese fortzusetzen.`
  }
  if (others.length >= maxActive) return CAMPAIGN_RESTORE_LIMIT_MESSAGE
  return undefined
}
