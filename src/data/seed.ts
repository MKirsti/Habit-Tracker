/**
 * Vorlage-Kampagne "Der Weg des Gelehrten": ein Jahr voller Bücher.
 *
 * Kern ist die tägliche Lese-Quest (10 Seiten). Drumherum gibt es kleine Rituale, die das
 * Lesen leichter machen (Bildschirm weg vor dem Schlafen), vertiefen (Gedanke des Tages,
 * Tiefenlese-Session) und teilen (Bücher-Gespräch). Die Kapitel führen vom ersten Funken
 * bis zum zwölften beendeten Buch.
 */
import { addDays } from '../domain/dates'
import { isArchivedOn } from '../domain/schedule'
import type { Chapter, CharacterProfile, DayKey, Habit, MainQuest } from '../domain/types'
import { db, type QuestlogDB } from './db'
import { newId } from './ids'
import { saveProfile } from './repository'

/** Laufzeit der Kampagne in Tagen (Deadline = Start + 365 Tage). */
const CAMPAIGN_DAYS = 365

/**
 * Erzeugt die Kampagne samt Quests (noch nicht gespeichert). Alle Quests sind mit der
 * Kampagne verknüpft, ab `today` aktiv und haben die Reihenfolge 0..4.
 *
 * @param createdAt Zeitstempel der Kampagne (Standard: jetzt).
 */
export function createScholarCampaign(
  today: DayKey,
  createdAt: number = Date.now(),
): { mainQuest: MainQuest; habits: Habit[] } {
  // addDays wirft bei einem ungültigen Tag – deshalb zuerst berechnen.
  const deadline = addDays(today, CAMPAIGN_DAYS)
  const mainQuestId = newId()

  const habitBase = { mainQuestId, createdDay: today } as const
  const reading: Habit = {
    id: newId(),
    icon: '📖',
    title: 'Täglich lesen',
    description: '10 Seiten in deinem aktuellen Buch.',
    attribute: 'intellect',
    difficulty: 'medium',
    schedule: { type: 'daily' },
    measure: { target: 10, unit: 'Seiten' },
    order: 0,
    ...habitBase,
  }
  const candlelight: Habit = {
    id: newId(),
    icon: '🕯️',
    title: 'Kerzenlicht statt Bildschirm',
    description: '30 Minuten vor dem Schlafen kein Handy – lieber ein Buch.',
    attribute: 'wisdom',
    difficulty: 'medium',
    schedule: { type: 'daily' },
    order: 1,
    ...habitBase,
  }
  const thought: Habit = {
    id: newId(),
    icon: '✍️',
    title: 'Gedanke des Tages',
    description: 'Ein Zitat oder eine Erkenntnis aus dem Gelesenen notieren.',
    attribute: 'wisdom',
    difficulty: 'easy',
    schedule: { type: 'daily' },
    order: 2,
    ...habitBase,
  }
  const deepReading: Habit = {
    id: newId(),
    icon: '⏳',
    title: 'Tiefenlese-Session',
    description: '30 Minuten am Stück lesen, ohne Ablenkung.',
    attribute: 'intellect',
    difficulty: 'hard',
    schedule: { type: 'weekly', times: 3 },
    order: 3,
    ...habitBase,
  }
  const bookTalk: Habit = {
    id: newId(),
    icon: '🗣️',
    title: 'Bücher-Gespräch',
    description: 'Mit jemandem über ein Buch sprechen oder eine Empfehlung teilen.',
    attribute: 'charisma',
    difficulty: 'medium',
    schedule: { type: 'weekly', times: 1 },
    order: 4,
    ...habitBase,
  }

  const chapters: Chapter[] = [
    {
      id: newId(),
      title: 'Der erste Funke',
      description: 'Lies an 7 Tagen deine 10 Seiten.',
      criterion: { type: 'habit', habitId: reading.id, metric: 'completions', target: 7 },
    },
    {
      id: newId(),
      title: 'Das erste Buch',
      description: 'Beende dein erstes Buch – egal wie dick.',
      criterion: { type: 'manual' },
    },
    {
      id: newId(),
      title: 'Die Gewohnheit erwacht',
      description: '21 Tage am Stück lesen. Jetzt sitzt die Gewohnheit.',
      criterion: { type: 'habit', habitId: reading.id, metric: 'streak', target: 21 },
    },
    {
      id: newId(),
      title: 'Der Gedankensammler',
      description: 'Sammle 50 Gedanken des Tages.',
      criterion: { type: 'habit', habitId: thought.id, metric: 'completions', target: 50 },
    },
    {
      id: newId(),
      title: 'Tausend Seiten',
      description: 'Lies insgesamt 1.000 Seiten.',
      criterion: { type: 'habit', habitId: reading.id, metric: 'total', target: 1000 },
    },
    {
      id: newId(),
      title: 'Der Gelehrte',
      description: 'Beende 12 Bücher.',
      criterion: { type: 'counter', target: 12, label: 'Bücher beendet' },
    },
  ]

  const mainQuest: MainQuest = {
    id: mainQuestId,
    icon: '📚',
    title: 'Der Weg des Gelehrten',
    description: 'Ein Jahr voller Bücher: Aus kleinen täglichen Leseeinheiten wird ein belesener Geist.',
    why: 'Ich will mehr wissen, klarer denken und Geschichten in mir tragen.',
    reward: 'Eine wunderschöne Ausgabe meines Lieblingsbuchs',
    startDay: today,
    deadline,
    chapters,
    createdAt,
  }

  return { mainQuest, habits: [reading, candlelight, thought, deepReading, bookTalk] }
}

/**
 * Speichert die Vorlage-Kampagne samt Quests in einer Transaktion.
 *
 * Wiederholbar: Gibt es schon eine Quest mit dem (getrimmten) Titel einer Vorlage-Quest, die am Tag `today`
 * nicht archiviert und mit keiner Kampagne verknüpft ist (z. B. nachdem die Kampagne gelöscht wurde), wird
 * sie mit der neuen Kampagne verknüpft und von deren Kapiteln verwendet – statt sie zu verdoppeln. Nur
 * fehlende Vorlage-Quests werden neu angelegt, hinter allen vorhandenen.
 */
export async function installScholarCampaign(today: DayKey, database: QuestlogDB = db): Promise<void> {
  await database.transaction('rw', database.habits, database.mainQuests, () => writeScholarCampaign(today, database))
}

/** Womit das Abenteuer beginnt: mit der Vorlage-Kampagne oder ohne. */
export type AdventureTemplate = 'scholar' | 'none'

/**
 * Beginnt das Abenteuer (Abschluss des Onboardings) in **einer** Transaktion: legt bei `'scholar'` die
 * Vorlage-Kampagne an (wie `installScholarCampaign`) und speichert das Profil (wie `saveProfile`, gleiche
 * Prüfung und Normalisierung). Beides gelingt oder nichts davon – schlägt z. B. das Speichern des Profils
 * fehl, bleibt auch keine Kampagne zurück, und ein neuer Versuch (auch nach einem Neuladen oder mit anderer
 * Wahl) beginnt sauber.
 */
export async function startAdventure(
  profile: CharacterProfile,
  template: AdventureTemplate,
  today: DayKey,
  database: QuestlogDB = db,
): Promise<void> {
  await database.transaction('rw', database.habits, database.mainQuests, database.kv, async () => {
    if (template === 'scholar') await writeScholarCampaign(today, database)
    // Erst zum Schluss: Das gespeicherte Profil schaltet die App vom Onboarding in den Spielmodus.
    await saveProfile(profile, database)
  })
}

/**
 * Schreibt die Vorlage-Kampagne (siehe `installScholarCampaign`). Muss innerhalb einer rw-Transaktion über
 * `habits` und `mainQuests` laufen.
 */
async function writeScholarCampaign(today: DayKey, database: QuestlogDB): Promise<void> {
  const { mainQuest, habits: templates } = createScholarCampaign(today)
  const existing = (await database.habits.toArray()).sort((a, b) => a.order - b.order)

  // Wiederverwendbar: nicht archiviert, nicht verknüpft. Pro Titel die erste in der Listen-Reihenfolge.
  const reusable = new Map<string, Habit>()
  for (const habit of existing) {
    const key = habit.title.trim()
    if (habit.mainQuestId !== undefined || isArchivedOn(habit, today) || reusable.has(key)) continue
    reusable.set(key, habit)
  }

  let nextOrder = existing.reduce((max, habit) => (Number.isFinite(habit.order) ? Math.max(max, habit.order) : max), -1) + 1
  const idFor = new Map<string, string>() // Vorlage-ID → tatsächliche ID
  const writes: Habit[] = []
  for (const template of templates) {
    const key = template.title.trim()
    const match = reusable.get(key)
    if (match) {
      reusable.delete(key)
      idFor.set(template.id, match.id)
      writes.push({ ...match, mainQuestId: mainQuest.id })
    } else {
      writes.push({ ...template, order: nextOrder++ })
    }
  }

  const chapters = mainQuest.chapters.map((chapter): Chapter => {
    const { criterion } = chapter
    if (criterion.type !== 'habit') return chapter
    return { ...chapter, criterion: { ...criterion, habitId: idFor.get(criterion.habitId) ?? criterion.habitId } }
  })
  await database.mainQuests.add({ ...mainQuest, chapters })
  await database.habits.bulkPut(writes)
}
