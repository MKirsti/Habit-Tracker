/**
 * Nur in der Entwicklung (`npm run dev`): Hilfsfunktionen im Browser unter `window.questlog`.
 * Nützlich zum Ausprobieren und für automatisierte Screenshots, z. B. in der Konsole:
 *
 *   await questlog.seedDemo(30)   // Held + Gelehrten-Kampagne + 30 Tage Verlauf + Schatzkammer + Nebenquests
 *   await questlog.installBlueprint('body', { level: 'advanced', pathId: 'endurance' })  // weitere Kampagne
 *   await questlog.reset()        // alles löschen → Onboarding
 *
 * Alle Repository-Funktionen stehen unter `questlog.repository` bereit, z. B.
 *   await questlog.repository.createReward({ title: 'Pizza', icon: '🍕', price: 400, repeatable: true })
 *   await questlog.repository.createSideQuest({ title: 'Steuer', icon: '🧾', attribute: 'discipline', difficulty: 'hard' }, await questlog.today())
 *
 * Wird in Produktions-Builds nicht eingebunden (siehe main.tsx).
 */
import { DEFAULT_SETTINGS } from '../domain/balancing'
import { addDays, dayRange, isoWeekday, toDayKey } from '../domain/dates'
import { isRequiredOn } from '../domain/schedule'
import type { DayKey } from '../domain/types'
import * as backup from '../data/backup'
import { db } from '../data/db'
import type { BlueprintOptions } from '../data/blueprints/types'
import * as repository from '../data/repository'
import * as seed from '../data/seed'

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
 *
 * Dazu (Phase 2a) drei Belohnungen in der Schatzkammer (zwei wiederholbare, eine einmalige teure), eine
 * Einlösung vor zwei Tagen (nur, wenn das Gold reicht – `purchase: false` lässt sie weg) und zwei
 * Nebenquests: eine vor ein paar Tagen erledigte und eine offene mit Termin übermorgen.
 */
async function seedDemo(
  days = 30,
  options: { completeToday?: boolean; seed?: number; purchase?: boolean } = {},
): Promise<void> {
  const today = await currentDay()
  const start = addDays(today, -days)
  const rnd = random(options.seed ?? 42)
  await repository.resetAllData()
  const { mainQuest, habits } = seed.createScholarCampaign(start)
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
  await seedTreasuryAndSideQuests(today, start, options.purchase ?? true)
  await repository.saveProfile({ name: 'Aria', avatar: '🧙', createdDay: start })
}

/** Beispiel-Belohnungen und -Nebenquests für `seedDemo` (Abenteuerbeginn `start`, heutiger Spieltag `today`). */
async function seedTreasuryAndSideQuests(today: DayKey, start: DayKey, purchase: boolean): Promise<void> {
  await repository.createReward({
    title: 'Pizza bestellen',
    icon: '🍕',
    description: 'Ohne schlechtes Gewissen – du hast sie dir verdient.',
    price: 400,
    repeatable: true,
  })
  const movie = await repository.createReward({ title: 'Kinoabend', icon: '🎬', price: 250, repeatable: true })
  await repository.createReward({
    title: 'Neue Kopfhörer',
    icon: '🎧',
    description: 'Der große Wunsch für später.',
    price: 2500,
    repeatable: false,
  })
  // Vor 10 Tagen angelegt, vor 4 Tagen erledigt – bei kurzen Demos frühestens am ersten Abenteuertag.
  const created = latest(start, addDays(today, -10))
  const taxes = await repository.createSideQuest(
    {
      title: 'Steuererklärung abgeben',
      icon: '🧾',
      description: 'Belege sortieren und abschicken.',
      attribute: 'discipline',
      difficulty: 'hard',
    },
    created,
  )
  await repository.completeSideQuest(taxes.id, latest(created, addDays(today, -4)))
  await repository.createSideQuest(
    { title: 'Zahnarzttermin vereinbaren', icon: '🦷', attribute: 'vitality', difficulty: 'easy', dueDay: addDays(today, 2) },
    latest(start, addDays(today, -1)),
  )

  if (purchase) {
    // Eine Einlösung für die Chronik – nur, wenn das Gold zwei Tage vorher schon reicht (kurze Demos: keine).
    const day = addDays(today, -2)
    if (day < start) return
    try {
      await repository.purchaseReward(movie.id, day)
    } catch (error) {
      console.info('[questlog] Demo-Einlösung übersprungen:', error instanceof Error ? error.message : error)
    }
  }
}

/** Der spätere zweier Spieltage. */
function latest(a: DayKey, b: DayKey): DayKey {
  return a > b ? a : b
}

/** Startet eine Kampagne aus der Bibliothek am heutigen Spieltag (wie die App, gleiche Prüfungen). */
async function installBlueprint(blueprintId: string, options: BlueprintOptions = { level: 'beginner' }) {
  return seed.installBlueprint(blueprintId, options, await currentDay())
}

export const devtools = {
  db,
  repository,
  backup,
  seed,
  seedDemo,
  installBlueprint,
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
