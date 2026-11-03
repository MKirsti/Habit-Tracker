/**
 * Test-Helfer für die Inhaltsprüfung der Vorlagen (nur von `*.test.ts` genutzt, nicht von der App).
 *
 * Spielt eine Kampagne mit einem Helden durch, der jede Quest genau nach Plan erledigt – mit genau dem Tagesziel,
 * Wochenquests an den ersten Tagen jeder Woche – und wertet die Kapitel mit der echten Kapitel-Auswertung
 * (`evaluateChapter`) aus. So lässt sich prüfen, wann ein Kapitel frühestens realistisch erreicht ist.
 */
import { evaluateChapter } from '../../domain/chapters'
import { addDays, dayRange, diffDays, startOfWeek } from '../../domain/dates'
import { isRequiredOn } from '../../domain/schedule'
import type { Chapter, Completion, DayKey, Habit, MainQuest, Schedule } from '../../domain/types'
import type { BlueprintContent, BlueprintQuest } from './types'

/** Ein Mittwoch – die erste Woche ist also angebrochen (wie beim echten Start mitten in der Woche). */
export const PLAN_START: DayKey = '2026-11-04'

/** Eine Vorlage-Quest als gespeicherte Quest (ID = Schlüssel), ab `start` aktiv. */
export function habitFromQuest(quest: BlueprintQuest, order: number, start: DayKey = PLAN_START): Habit {
  return {
    id: quest.key,
    title: quest.title,
    icon: quest.icon,
    attribute: quest.attribute,
    difficulty: quest.difficulty,
    schedule: quest.schedule,
    ...(quest.measure ? { measure: quest.measure } : {}),
    order,
    createdDay: start,
  }
}

/** Jeden Tag Pflicht (täglich oder an allen sieben Wochentagen)? */
export function isEveryDay(schedule: Schedule): boolean {
  return schedule.type === 'daily' || (schedule.type === 'weekdays' && new Set(schedule.days).size === 7)
}

/**
 * Tag der Kampagne (1 = Starttag), an dem jedes automatische Kapitel bei Erledigung genau nach Plan abgeschlossen
 * ist – `undefined`, wenn es in `durationDays` Tagen nicht erreicht wird. Schlüssel: Kapiteltitel.
 */
export function daysToReachAtPlanPace(content: BlueprintContent, durationDays: number): Map<string, number | undefined> {
  const habits = content.quests.map((quest, order) => habitFromQuest(quest, order))
  const end = addDays(PLAN_START, durationDays - 1)
  const completionsByHabit = new Map<string, Completion[]>()
  for (const habit of habits) {
    const target = habit.measure?.target ?? 1
    const days = dayRange(PLAN_START, end).filter((day) => {
      if (habit.schedule.type !== 'weekly') return isRequiredOn(habit, day)
      const doneThisWeek = diffDays(startOfWeek(day) < PLAN_START ? PLAN_START : startOfWeek(day), day)
      return doneThisWeek < habit.schedule.times
    })
    completionsByHabit.set(
      habit.id,
      days.map((day) => ({
        id: `${habit.id}:${day}`,
        habitId: habit.id,
        day,
        value: target,
        target,
        difficulty: habit.difficulty,
        attribute: habit.attribute,
        updatedAt: 0,
      })),
    )
  }
  const chapters = content.chapters.map((chapter, index): Chapter => {
    const { criterion } = chapter
    return {
      id: `chapter-${index}`,
      title: chapter.title,
      criterion: criterion.type === 'habit' ? { type: 'habit', habitId: criterion.questKey, metric: criterion.metric, target: criterion.target } : criterion,
    }
  })
  const mainQuest: MainQuest = { id: 'campaign', title: content.title, icon: content.icon, why: '', reward: '', startDay: PLAN_START, chapters, createdAt: 0 }
  const ctx = { habitsById: new Map(habits.map((habit) => [habit.id, habit])), completionsByHabit, today: end }
  const result = new Map<string, number | undefined>()
  for (const chapter of chapters) {
    if (chapter.criterion.type !== 'habit') continue
    const state = evaluateChapter(chapter, mainQuest, ctx)
    result.set(chapter.title, state.done && state.doneDay !== undefined ? diffDays(PLAN_START, state.doneDay) + 1 : undefined)
  }
  return result
}
