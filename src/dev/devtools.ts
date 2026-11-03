/**
 * Nur in der Entwicklung (`npm run dev`): Hilfsfunktionen im Browser unter `window.questlog`.
 * Nützlich zum Ausprobieren und für automatisierte Screenshots, z. B. in der Konsole:
 *
 *   await questlog.seedDemo(30)   // Held + Gelehrten-Kampagne + 30 Tage Verlauf
 *   await questlog.reset()        // alles löschen → Onboarding
 *
 * Wird in Produktions-Builds nicht eingebunden (siehe main.tsx).
 */
import { DEFAULT_SETTINGS } from '../domain/balancing'
import { addDays, dayRange, isoWeekday, toDayKey } from '../domain/dates'
import { isRequiredOn } from '../domain/schedule'
import type { DayKey } from '../domain/types'
import * as backup from '../data/backup'
import { db } from '../data/db'
import * as repository from '../data/repository'
import { createScholarCampaign } from '../data/seed'

/** Deterministischer Pseudo-Zufall (mulberry32), damit Demo-Daten reproduzierbar sind. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function currentDay(): Promise<DayKey> {
  const data = await repository.loadGameData()
  return toDayKey(new Date(), data.settings.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour)
}

/**
 * Legt (nach vollständigem Zurücksetzen) einen Demo-Helden mit der Gelehrten-Kampagne an,
 * die vor `days` Tagen begonnen hat, und erzeugt einen plausiblen Verlauf bis gestern.
 * Heute bleibt offen, damit man das Abhaken selbst ausprobieren kann.
 */
async function seedDemo(days = 30, options: { completeToday?: boolean; seed?: number } = {}): Promise<void> {
  const today = await currentDay()
  const start = addDays(today, -days)
  const rnd = random(options.seed ?? 42)
  await repository.resetAllData()
  const { mainQuest, habits } = createScholarCampaign(start)
  await db.transaction('rw', db.mainQuests, db.habits, async () => {
    await db.mainQuests.put(mainQuest)
    await db.habits.bulkPut(habits)
  })
  const lastDay = options.completeToday ? today : addDays(today, -1)
  for (const day of dayRange(start, lastDay)) {
    for (const habit of habits) {
      const weekly = habit.schedule.type === 'weekly'
      // Wochenquests: an ein paar Tagen pro Woche; Tagesquests: meistens erledigt.
      const chance = weekly ? (habit.schedule.type === 'weekly' ? habit.schedule.times / 6 : 0) : 0.85
      if (!weekly && !isRequiredOn(habit, day)) continue
      if (weekly && isoWeekday(day) === 7 && rnd() < 0.5) continue
      if (rnd() > chance) continue
      const value = habit.measure ? Math.round(habit.measure.target * (0.6 + rnd() * 1.2)) : 1
      await repository.setCompletionValue(habit.id, day, value)
    }
  }
  // Ein paar manuelle Kapitel-Fortschritte für eine lebendige Kampagne.
  const manual = mainQuest.chapters.find((c) => c.criterion.type === 'manual')
  if (manual && days >= 20) await repository.setChapterManual(mainQuest.id, manual.id, true, addDays(today, -3))
  const counter = mainQuest.chapters.find((c) => c.criterion.type === 'counter')
  if (counter) await repository.setChapterCounter(mainQuest.id, counter.id, Math.floor(days / 25), today)
  await repository.saveProfile({ name: 'Aria', avatar: '🧙', createdDay: start })
}

export const devtools = {
  db,
  repository,
  backup,
  seedDemo,
  reset: () => repository.resetAllData(),
  today: currentDay,
}

declare global {
  interface Window {
    questlog?: typeof devtools
  }
}

export function installDevtools(): void {
  window.questlog = devtools
}
