/**
 * Vorlage-Kampagne "Der Weg des Gelehrten": ein Jahr voller Bücher.
 *
 * Kern ist die tägliche Lese-Quest (10 Seiten). Drumherum gibt es kleine Rituale, die das
 * Lesen leichter machen (Bildschirm weg vor dem Schlafen), vertiefen (Gedanke des Tages,
 * Tiefenlese-Session) und teilen (Bücher-Gespräch). Die Kapitel führen vom ersten Funken
 * bis zum zwölften beendeten Buch.
 */
import { addDays } from '../domain/dates'
import type { Chapter, DayKey, Habit, MainQuest } from '../domain/types'
import { db, type QuestlogDB } from './db'
import { newId } from './ids'

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
 * Die neuen Quests werden hinter bereits vorhandenen einsortiert.
 */
export async function installScholarCampaign(today: DayKey, database: QuestlogDB = db): Promise<void> {
  const { mainQuest, habits } = createScholarCampaign(today)
  await database.transaction('rw', database.habits, database.mainQuests, async () => {
    const last = await database.habits.orderBy('order').last()
    const offset = last ? last.order + 1 : 0
    await database.mainQuests.add(mainQuest)
    await database.habits.bulkAdd(habits.map((habit) => ({ ...habit, order: habit.order + offset })))
  })
}
