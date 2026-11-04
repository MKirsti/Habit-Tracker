/**
 * Ruhmeshalle (Phase 2b, rein): die Chronik aller gemeisterten Kampagnen – laufend abgeschlossene wie archivierte.
 *
 * Für jede gemeisterte Kampagne (`MainQuestState.complete`) eine Bilanz:
 * - Start (`quest.startDay`) und Abschlusstag (der späteste `doneDay` ihrer Kapitel), Dauer in Tagen (beide inklusive)
 * - die Kapitel mit ihren Abschlusstagen
 * - erledigte Quest-Tage der zugehörigen Quests (`linkedHabitIds`) im Zeitraum Start … Abschlusstag und die XP daraus
 *   (inklusive Streak-Bonus, genau wie gutgeschrieben – `creditedCompletions` aus `statistics.ts`); eine geteilte
 *   Quest zählt für jede Kampagne, die sie führt
 * - Kapitel-/Kampagnen-XP (`chapterXp` je Kapitel + `mainQuestXp`), die Belohnung, die Frist (gemeistert vor der
 *   Frist?) und die Hauptfarbe (`dominantAttribute`)
 *
 * Reihenfolge: die zuletzt gemeisterte zuerst (bei gleichem Tag in gespeicherter Reihenfolge).
 */
import { BALANCING } from './balancing'
import { compareDays, diffDays, isValidDayKey } from './dates'
import { evaluateMainQuests } from './engine'
import { creditedCompletions } from './statistics'
import type { AttributeId, DayKey, GameData, Habit, MainQuest, MainQuestState } from './types'

export interface HallOfFameChapter {
  id: string
  title: string
  /** Abschlusstag (falls bekannt). */
  doneDay?: DayKey
}

export interface HallOfFameQuest {
  habit: Habit
  /** Erledigte Tage im Zeitraum der Kampagne. */
  days: number
  /** Gutgeschriebene XP dieser Tage (inklusive Streak-Bonus). */
  xp: number
}

export interface HallOfFameEntry {
  /** Die ausgewertete Kampagne (wie in `GameState.mainQuests` bzw. `archivedMainQuests`). */
  campaign: MainQuestState
  quest: MainQuest
  /** In die Ruhmeshalle gelegt (archiviert) – sonst gemeistert, aber noch nicht abgelegt. */
  archived: boolean
  startDay: DayKey
  /** Tag, an dem das letzte Kapitel abgeschlossen wurde. */
  completedDay: DayKey
  /** Tage von Start bis Abschluss, beide inklusive (mindestens 1). */
  durationDays: number
  chapters: HallOfFameChapter[]
  /** Zugehörige Quests mit ihren erledigten Tagen im Zeitraum (Reihenfolge wie `linkedHabitIds`). */
  quests: HallOfFameQuest[]
  /** Summe der erledigten Quest-Tage. */
  questDays: number
  /** XP aus diesen Quest-Tagen (inklusive Streak-Bonus). */
  questXp: number
  /** Kapitel- und Kampagnen-XP: `chapterXp` je Kapitel + `mainQuestXp`. */
  campaignXp: number
  /** questXp + campaignXp. */
  totalXp: number
  reward: string
  deadline?: DayKey
  /** Nur mit Frist: am oder vor dem Fristtag gemeistert. */
  onTime?: boolean
  dominantAttribute?: AttributeId
}

/** Abschlusstag: der späteste bekannte Kapitel-`doneDay` (nie nach `today`); ohne bekannten Tag `today`. */
function completionDay(campaign: MainQuestState, today: DayKey): DayKey {
  let latest: DayKey | undefined
  for (const chapter of campaign.chapters) {
    const day = chapter.doneDay
    if (day === undefined || !isValidDayKey(day)) continue
    if (latest === undefined || compareDays(day, latest) > 0) latest = day
  }
  if (latest === undefined || compareDays(latest, today) > 0) return today
  return latest
}

/**
 * Die Ruhmeshalle: alle gemeisterten Kampagnen mit ihrer Bilanz, die zuletzt gemeisterte zuerst.
 * @param campaigns ausgewertete Kampagnen, z. B. `[...state.mainQuests, ...state.archivedMainQuests]`
 *                  (Standard: `evaluateMainQuests(data, today)` – dieselbe Auswertung).
 */
export function hallOfFame(
  data: GameData,
  today: DayKey,
  campaigns: readonly MainQuestState[] = evaluateMainQuests(data, today),
): HallOfFameEntry[] {
  const mastered = campaigns.filter((campaign) => campaign.complete)
  if (mastered.length === 0) return []

  const credited = creditedCompletions(data, today)
  const habitsById = new Map(data.habits.map((habit) => [habit.id, habit]))

  const entries = mastered.map((campaign): HallOfFameEntry => {
    const { quest } = campaign
    const completedDay = completionDay(campaign, today)
    const startDay = isValidDayKey(quest.startDay) ? quest.startDay : completedDay
    const quests: HallOfFameQuest[] = []
    let questDays = 0
    let questXp = 0
    for (const habitId of campaign.linkedHabitIds) {
      const habit = habitsById.get(habitId)
      if (!habit) continue
      let days = 0
      let xp = 0
      for (const { completion, xp: credit } of credited.get(habitId) ?? []) {
        if (compareDays(completion.day, startDay) < 0 || compareDays(completion.day, completedDay) > 0) continue
        days++
        xp += credit
      }
      quests.push({ habit, days, xp })
      questDays += days
      questXp += xp
    }
    const campaignXp = campaign.chapters.length * BALANCING.chapterXp + BALANCING.mainQuestXp
    const entry: HallOfFameEntry = {
      campaign,
      quest,
      archived: quest.archived === true,
      startDay,
      completedDay,
      durationDays: Math.max(1, diffDays(startDay, completedDay) + 1),
      chapters: campaign.chapters.map(({ chapter, doneDay }) => ({
        id: chapter.id,
        title: chapter.title,
        ...(doneDay !== undefined ? { doneDay } : {}),
      })),
      quests,
      questDays,
      questXp,
      campaignXp,
      totalXp: questXp + campaignXp,
      reward: quest.reward,
    }
    if (quest.deadline !== undefined && isValidDayKey(quest.deadline)) {
      entry.deadline = quest.deadline
      entry.onTime = compareDays(completedDay, quest.deadline) <= 0
    }
    if (campaign.dominantAttribute !== undefined) entry.dominantAttribute = campaign.dominantAttribute
    return entry
  })

  // Die zuletzt gemeisterte zuerst; bei gleichem Tag bleibt die gespeicherte Reihenfolge (stabile Sortierung).
  return entries.sort((a, b) => compareDays(b.completedDay, a.completedDay))
}
