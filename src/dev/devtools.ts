/**
 * Nur in der Entwicklung (`npm run dev`): Hilfsfunktionen im Browser unter `window.questlog`.
 * Nützlich zum Ausprobieren und für automatisierte Screenshots, z. B. in der Konsole:
 *
 *   await questlog.seedDemo(30)   // Held + Gelehrten-Kampagne + 30 Tage Verlauf + Schatzkammer + Nebenquests
 *                                 // + abgerechnete Lebenspunkte (Ledger ab Abenteuerbeginn)
 *   await questlog.seedDemo(30, { missedDays: 3 })      // die letzten 3 abgerechneten Tage verpasst → HP angeschlagen
 *   await questlog.seedDemo(30, { penalties: false })   // Sanfter Modus (keine HP)
 *   await questlog.installBlueprint('body', { level: 'advanced', pathId: 'endurance' })  // weitere Kampagne
 *   await questlog.reset()        // alles löschen → Onboarding
 *
 * Alle Repository-Funktionen stehen unter `questlog.repository` bereit, z. B.
 *   await questlog.repository.createReward({ title: 'Pizza', icon: '🍕', price: 400, repeatable: true })
 *   await questlog.repository.createSideQuest({ title: 'Steuer', icon: '🧾', attribute: 'discipline', difficulty: 'hard' }, await questlog.today())
 *   await questlog.repository.purchaseItem('streakFreeze', await questlog.today())
 *   await questlog.repository.addRestPeriod({ from: await questlog.today(), until: await questlog.today() }, await questlog.today())
 *   await questlog.settle()       // Lebenspunkte bis vorgestern abrechnen (wie beim App-Start)
 *
 * Wird in Produktions-Builds nicht eingebunden (siehe main.tsx).
 */
import { DEFAULT_SETTINGS } from '../domain/balancing'
import { addDays, dayRange, isoWeekday, toDayKey } from '../domain/dates'
import { isRequiredOn } from '../domain/schedule'
import type { DayKey } from '../domain/types'
import * as backup from '../data/backup'
import { db, KV_KEYS } from '../data/db'
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
 *
 * Phase 2b: Die Lebenspunkte zählen ab dem Abenteuerbeginn (`penalties.since = start`), der Verlauf bis vorgestern
 * wird abgerechnet (`settleHpDays`) – so sind HP, Ledger und die Vorschau für gestern sofort sichtbar.
 * `missedDays: n` lässt die letzten n abgerechneten Tage (bis vorgestern) ganz aus, damit die HP angeschlagen sind;
 * `penalties: false` startet im Sanften Modus.
 */
async function seedDemo(
  days = 30,
  options: { completeToday?: boolean; seed?: number; purchase?: boolean; penalties?: boolean; missedDays?: number } = {},
): Promise<void> {
  const today = await currentDay()
  const start = addDays(today, -days)
  const rnd = random(options.seed ?? 42)
  const missedDays = Math.max(0, Math.floor(options.missedDays ?? 0))
  const missed = new Set(dayRange(addDays(today, -1 - missedDays), addDays(today, -2)))
  await repository.resetAllData()
  const { mainQuest, habits } = seed.createScholarCampaign(start)
  await db.transaction('rw', db.mainQuests, db.habits, async () => {
    await db.mainQuests.put(mainQuest)
    await db.habits.bulkPut(habits)
  })
  const lastDay = options.completeToday ? today : addDays(today, -1)
  for (const day of dayRange(start, lastDay)) {
    if (missed.has(day)) continue
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
  // Vor dem Profil: Ohne Held rechnet niemand ab – so setzt kein gleichzeitiges settleHpDays `since` auf heute.
  await setPenaltiesSince(start, options.penalties ?? true)
  await repository.saveProfile({ name: 'Aria', avatar: '🧙', createdDay: start })
  await repository.settleHpDays(today)
}

/**
 * Lebenspunkte ab `since` (sonst setzt `settleHpDays` den Beginn nie rückwirkend, sondern auf heute) – nur für die
 * Demo, deshalb direkt im kv-Speicher statt über das Repository.
 */
async function setPenaltiesSince(since: DayKey, enabled: boolean): Promise<void> {
  await db.transaction('rw', db.kv, async () => {
    const entry = await db.kv.get(KV_KEYS.settings)
    const stored = typeof entry?.value === 'object' && entry.value !== null ? entry.value : {}
    await db.kv.put({ key: KV_KEYS.settings, value: { ...stored, penalties: { enabled, since } } })
  })
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
  /** Rechnet die Lebenspunkte bis vorgestern ab (wie die App beim Start); liefert die neuen Ledger-Einträge. */
  settle: async () => repository.settleHpDays(await currentDay()),
}

declare global {
  interface Window {
    questlog?: typeof devtools
  }
}

export function installDevtools(): void {
  window.questlog = devtools
}
