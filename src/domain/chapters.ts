/**
 * Auswertung von Kampagnen-Kapiteln (Meilensteinen).
 *
 * Kapitel werden unabhängig voneinander ausgewertet (die Reihenfolge ist nur Erzählung):
 * - manual:  von Hand abgehakt → 0/1
 * - counter: manueller Zähler, z. B. "Bücher beendet: 3 / 12"
 * - habit:   automatisch aus einer Quest; es zählen nur Erledigungen mit `quest.startDay ≤ day ≤ today`.
 *            Metriken: completions (erledigte Tage), total (Summe aller Werte inkl. Teilfortschritt),
 *            streak (bester Streak seit Kampagnenstart).
 */
import { compareDays } from './dates'
import { isDone, reachesTarget } from './schedule'
import { computeStreak, streakReachedDay } from './streaks'
import type { Chapter, ChapterState, Completion, DayKey, Habit, MainQuest } from './types'

export interface ChapterContext {
  habitsById: ReadonlyMap<string, Habit>
  /** Je Quest nach `day` aufsteigend sortiert. */
  completionsByHabit: ReadonlyMap<string, Completion[]>
  today: DayKey
}

/** min(current / target, 1), robust gegen Ziele ≤ 0 (gelten als sofort erreicht). */
function progressOf(current: number, target: number): number {
  if (target <= 0) return 1
  return Math.min(1, Math.max(0, current / target))
}

function buildState(chapter: Chapter, current: number, target: number, doneDay?: DayKey): ChapterState {
  // Gleicher (rauschtoleranter) Vergleich wie bei den "erreicht am"-Schleifen unten – sonst könnte ein
  // Kapitel erledigt sein, ohne dass ein Abschlusstag gefunden wird. Erledigt ⇒ voller Balken.
  const done = reachesTarget(current, target)
  const progress = done ? 1 : progressOf(current, target)
  const state: ChapterState = { chapter, current, target, progress, done }
  // Ein Abschlusstag ergibt nur Sinn, wenn das Kapitel tatsächlich (noch) abgeschlossen ist.
  if (done && doneDay !== undefined) state.doneDay = doneDay
  return state
}

/** Erledigungen im Kampagnenzeitraum [startDay, today], aufsteigend nach Tag. */
function completionsInRange(completions: readonly Completion[], startDay: DayKey, today: DayKey): Completion[] {
  const inRange = completions.filter(
    (c) => compareDays(startDay, c.day) <= 0 && compareDays(c.day, today) <= 0,
  )
  // Der Vertrag garantiert eine Sortierung; zur Sicherheit wird nur bei Bedarf (O(n)-Prüfung) sortiert,
  // denn alle "erreicht am"-Berechnungen hängen davon ab.
  for (let i = 1; i < inRange.length; i++) {
    if (compareDays(inRange[i - 1].day, inRange[i].day) > 0) {
      return inRange.sort((a, b) => compareDays(a.day, b.day))
    }
  }
  return inRange
}

function evaluateHabitChapter(
  chapter: Chapter,
  criterion: Extract<Chapter['criterion'], { type: 'habit' }>,
  quest: MainQuest,
  ctx: ChapterContext,
): ChapterState {
  const { target } = criterion
  const habit = ctx.habitsById.get(criterion.habitId)
  if (!habit) {
    // Die verknüpfte Quest wurde gelöscht: Kapitel kann nicht mehr automatisch fortschreiten.
    return { chapter, current: 0, target, progress: 0, done: false, brokenReference: true }
  }

  const completions = completionsInRange(ctx.completionsByHabit.get(habit.id) ?? [], quest.startDay, ctx.today)

  switch (criterion.metric) {
    case 'completions': {
      let count = 0
      let reachedOn: DayKey | undefined
      for (const c of completions) {
        if (!isDone(c)) continue
        count++
        if (reachedOn === undefined && reachesTarget(count, target)) reachedOn = c.day
      }
      return buildState(chapter, count, target, reachedOn)
    }
    case 'total': {
      let sum = 0
      let reachedOn: DayKey | undefined
      for (const c of completions) {
        sum += c.value
        if (reachedOn === undefined && reachesTarget(sum, target)) reachedOn = c.day
      }
      return buildState(chapter, sum, target, reachedOn)
    }
    case 'streak': {
      const doneDays = new Set<DayKey>()
      for (const c of completions) if (isDone(c)) doneDays.add(c.day)
      const best = computeStreak(habit, doneDays, ctx.today, quest.startDay).best
      const reachedOn =
        best >= target ? streakReachedDay(habit, doneDays, target, ctx.today, quest.startDay) : undefined
      return buildState(chapter, best, target, reachedOn)
    }
  }
}

/** Fortschritt eines Kapitels einer Kampagne zum Tag `ctx.today`. */
export function evaluateChapter(chapter: Chapter, quest: MainQuest, ctx: ChapterContext): ChapterState {
  const { criterion } = chapter
  switch (criterion.type) {
    case 'manual':
      return buildState(chapter, chapter.manualDone === true ? 1 : 0, 1, chapter.completedDay)
    case 'counter':
      return buildState(chapter, Math.max(0, chapter.counter ?? 0), criterion.target, chapter.completedDay)
    case 'habit':
      return evaluateHabitChapter(chapter, criterion, quest, ctx)
  }
}
