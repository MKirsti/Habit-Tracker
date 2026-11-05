/**
 * Nur in der Entwicklung (`npm run dev`): Hilfsfunktionen im Browser unter `window.questlog`.
 * Nützlich zum Ausprobieren und für automatisierte Screenshots, z. B. in der Konsole:
 *
 *   await questlog.seedDemo(30)   // Held + Gelehrten-Kampagne + 30 Tage Verlauf + Schatzkammer + Nebenquests
 *                                 // + abgerechnete Lebenspunkte (Ledger ab Abenteuerbeginn)
 *   await questlog.seedDemo(30, { missedDays: 3 })      // die letzten 3 abgerechneten Tage verpasst → HP angeschlagen
 *   await questlog.seedDemo(30, { penalties: false })   // Sanfter Modus (keine HP)
 *   await questlog.seedDemo(30, { combat: false })      // ohne Boss-Sieg und Truhen
 *   await questlog.seedDemo(30, { companion: false })   // ohne Gefährten (Einführungskarte „Neu: Gefährten“)
 *   await questlog.seedDemo(30, { companion: 'dragon', journal: false })   // anderer Gefährte, ohne Notizen
 *   await questlog.installBlueprint('body', { level: 'advanced', pathId: 'endurance' })  // weitere Kampagne
 *
 * Phase 3a (Klassen, Bosse, Truhen):
 *   await questlog.grantChest()                          // ungeöffnete Truhe (Seltenheit/Inhalt wie beim Fund)
 *   await questlog.grantChest({ rarity: 'legendary' })   // gezielt eine Seltenheit …
 *   await questlog.grantChest({ content: { kind: 'item', itemId: 'streakFreeze' } })   // … oder einen Inhalt
 *   await questlog.openChest(id)                         // öffnen wie in der App (heutiger Spieltag)
 *   await questlog.defeatBoss()                          // Boss der Vorwoche als besiegt speichern (Bestiarium)
 *   await questlog.defeatBoss(await questlog.today())    // … oder den der Woche dieses Tages
 *   await questlog.reset()        // alles löschen → Onboarding
 *
 * Phase 3b (Gefährte, Tagebuch):
 *   await questlog.repository.setCompanion({ species: 'owl', name: 'Eulalia' }, await questlog.today())
 *   await questlog.repository.saveJournalNote(await questlog.today(), { text: 'Guter Tag!', mood: '😄' }, await questlog.today())
 *   await questlog.repository.markWeeklyReviewSeen(await questlog.today())   // Wochenrückblick weggeklickt
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
import { unrecordedVictories } from '../domain/combat/boss'
import { chestContent, chestCosmetic, chestRarity } from '../domain/combat/chests'
import { addDays, compareDays, dayRange, isoWeekday, startOfWeek, toDayKey } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import { isRequiredOn } from '../domain/schedule'
import type {
  BossVictory,
  Chest,
  ChestContent,
  ChestRarity,
  ChestSource,
  CompanionSpecies,
  DayKey,
} from '../domain/types'
import * as backup from '../data/backup'
import { db, KV_KEYS } from '../data/db'
import type { BlueprintOptions } from '../data/blueprints/types'
import { newId } from '../data/ids'
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
 *
 * Phase 3a (`combat: false` lässt es weg): Der Boss der Vorwoche ist besiegt (`defeatBoss`, gespeichert über
 * `recordProgress`), alles, was der `ProgressRecorder` der App jetzt speichern würde (gerade gefundene Truhen, Siege),
 * ist gespeichert, und es liegen mindestens zwei ungeöffnete Truhen bereit (fehlende per `grantChest`).
 *
 * Phase 3b: Ein Gefährte begleitet den Helden seit dem Abenteuerbeginn (Standard 🦊 Fuchs „Flink“; `companion: 'owl'`
 * wählt eine andere Art, `companion: false` keinen – dann zeigt die App die Einführung „Neu: Gefährten“), und im
 * Tagebuch stehen drei Notizen der letzten Tage (`journal: false` lässt sie weg).
 */
async function seedDemo(
  days = 30,
  options: {
    completeToday?: boolean
    seed?: number
    purchase?: boolean
    penalties?: boolean
    missedDays?: number
    combat?: boolean
    companion?: CompanionSpecies | false
    journal?: boolean
  } = {},
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
  // Nach dem Profil (beides braucht den Helden), vor dem Kampf: Der Gefährte trifft an Perfekten Tagen mit.
  const species = options.companion ?? 'fox'
  if (species !== false) await repository.setCompanion({ species, name: DEMO_COMPANION_NAMES[species] }, start)
  if (options.journal ?? true) await seedJournal(today, start)
  // Nach dem Profil: Boss-Wahl und Quest-Truhen hängen vom Helden ab (`heroSeed`).
  if (options.combat ?? true) await seedCombat(today)
}

/** Namen der Demo-Gefährten je Art. */
const DEMO_COMPANION_NAMES: Record<CompanionSpecies, string> = {
  dragon: 'Glut',
  raccoon: 'Krümel',
  snake: 'Sira',
  owl: 'Eulalia',
  fox: 'Flink',
}

/**
 * Drei Tagebuch-Notizen der letzten Tage (vor wie vielen Tagen, Stimmung, Text) – bei kurzen Demos ab dem Beginn.
 * Die Stimmungen stammen aus der Auswahl der App (`JOURNAL_MOODS` in `pages/dashboard/journalText.ts`), damit sie beim
 * Bearbeiten vorgewählt erscheinen.
 */
const DEMO_NOTES: readonly { daysAgo: number; mood: string; text: string }[] = [
  { daysAgo: 1, mood: '😄', text: 'Vor dem Frühstück gelesen – so in den Tag zu starten fühlt sich richtig gut an.' },
  { daysAgo: 3, mood: '😴', text: 'Etwas müde, aber drangeblieben. Ein Kapitel ist besser als keins.' },
  { daysAgo: 8, mood: '🙂', text: 'Neues Buch angefangen! Ich bin gespannt, wohin die Reise geht.' },
]

/** Tagebuch-Notizen für `seedDemo` (über das Repository, gleiche Prüfungen wie in der App). */
async function seedJournal(today: DayKey, start: DayKey): Promise<void> {
  const written = new Set<DayKey>()
  for (const note of DEMO_NOTES) {
    const day = latest(start, addDays(today, -note.daysAgo))
    if (written.has(day)) continue
    written.add(day)
    await repository.saveJournalNote(day, { text: note.text, mood: note.mood }, today)
  }
}

/** Mindestens so viele ungeöffnete Truhen legt `seedDemo` bereit. */
const DEMO_UNOPENED_CHESTS = 2

/** Phase 3a für `seedDemo`: Sieg über den Boss der Vorwoche, Fortschritt speichern, ungeöffnete Truhen auffüllen. */
async function seedCombat(today: DayKey): Promise<void> {
  await defeatBoss(addDays(startOfWeek(today), -7))
  await recordCurrentProgress(today)
  const unopened = (await db.chests.toArray()).filter((chest) => chest.openedAt === undefined).length
  // Fehlende als abwechslungsreiche Funde: zuerst eine seltene (Streak-Schutz oder Rahmen), dann Gold.
  const extra: ChestRarity[] = ['rare', 'uncommon']
  for (let i = 0; i < DEMO_UNOPENED_CHESTS - unopened; i++) await grantChest({ rarity: extra[i] ?? 'common' })
}

/** Speichert, was der `ProgressRecorder` der App jetzt speichern würde: neue Erfolge, Boss-Siege und Truhen. */
async function recordCurrentProgress(today: DayKey): Promise<void> {
  const data = await repository.loadGameData()
  const state = deriveGameState(data, today)
  const storedChests = new Set((data.chests ?? []).map((chest) => chest.id))
  const storedUnlocks = new Set((data.achievementUnlocks ?? []).map((unlock) => unlock.id))
  await repository.recordProgress({
    achievementUnlocks: state.achievements
      .filter((achievement) => achievement.unlocked && !storedUnlocks.has(achievement.definition.id))
      .map((achievement) => ({ id: achievement.definition.id, day: achievement.unlockedDay ?? today })),
    bossVictories: unrecordedVictories([state.bosses.current, state.bosses.previous], data.bossVictories),
    chests: state.chests.filter((chest) => !storedChests.has(chest.id)),
  })
}

/**
 * Speichert einen Sieg über den Boss der Woche, zu der `day` gehört (Standard: Vorwoche) – so, wie die Engine ihn am
 * Sonntag dieser Woche (bzw. heute, für die laufende Woche) sieht: echter Sieg-Tag, falls der Verlauf ihn schon besiegt
 * hat, sonst dieser Tag. Ein schon gespeicherter Sieg bleibt (idempotent). Ohne Boss (in der Woche keine Quests geplant,
 * kein Held) → `undefined`. Die Boss-Truhe dazu zeigt die Engine sofort; gespeichert wird sie vom Recorder bzw. von
 * `seedDemo`.
 */
async function defeatBoss(day?: DayKey): Promise<BossVictory | undefined> {
  const today = await currentDay()
  const weekStart = startOfWeek(day ?? addDays(startOfWeek(today), -7))
  const sunday = addDays(weekStart, 6)
  const asOf = compareDays(sunday, today) < 0 ? sunday : today
  if (compareDays(weekStart, asOf) > 0) return undefined
  const data = await repository.loadGameData()
  if (data.profile === undefined) return undefined
  const stored = data.bossVictories?.find((victory) => victory.weekStart === weekStart)
  if (stored !== undefined) return stored
  const boss = deriveGameState(data, asOf).bosses.current
  if (boss === undefined || boss.weekStart !== weekStart) return undefined
  const victory: BossVictory = { weekStart, bossId: boss.boss.id, day: boss.defeatedDay ?? asOf, maxHp: boss.maxHp }
  await repository.recordProgress({ bossVictories: [victory] })
  return victory
}

/** Optionen für `grantChest`. */
interface GrantChestOptions {
  /** Seltenheit (Standard: wie beim Fund per Hash der ID). */
  rarity?: ChestRarity
  /** Inhalt (Standard: nach den Regeln der Seltenheit – Kosmetik nur, was noch zu haben ist). */
  content?: ChestContent
  /** Fundort (Standard: 'chapter' – zählt nicht gegen das Tageslimit der Quest-Truhen). */
  source?: ChestSource
  /** Fundtag (Standard: heute). */
  foundDay?: DayKey
}

/**
 * Legt eine ungeöffnete Truhe in den Beutel (nur zum Ausprobieren der Truhen-Oberflächen). Die ID `<source>:dev-…`
 * kollidiert nie mit echten Fundorten. Gespeichert über `recordProgress` (gleiche Prüfungen; eine zweite Quest-Truhe
 * an einem Tag wird abgelehnt).
 */
async function grantChest(options: GrantChestOptions = {}): Promise<Chest> {
  const today = await currentDay()
  const source = options.source ?? 'chapter'
  const id = `${source}:dev-${newId()}`
  const rarity = options.rarity ?? (options.content === undefined ? chestRarity(id) : rarityOf(options.content))
  const content = options.content ?? chestContent(id, rarity, { taken: await takenCosmetics(today) })
  await repository.recordProgress({ chests: [{ id, source, foundDay: options.foundDay ?? today, rarity, content }] })
  const stored = await db.chests.get(id)
  if (stored === undefined) throw new Error('An diesem Tag gibt es schon eine Quest-Truhe – wähle einen anderen Tag oder Fundort.')
  return stored
}

/** Passende Seltenheit zu einem vorgegebenen Inhalt (Gold: nach Betrag). */
function rarityOf(content: ChestContent): ChestRarity {
  if (content.kind === 'item') return 'rare'
  if (content.kind === 'cosmetic') return 'legendary'
  return content.amount > 50 ? 'uncommon' : 'common'
}

/** Titel/Rahmen, die eine neue Truhe nicht mehr bringen soll: freigeschaltete und in anderen Truhen versprochene. */
async function takenCosmetics(today: DayKey): Promise<Set<string>> {
  const state = deriveGameState(await repository.loadGameData(), today)
  const taken = new Set<string>([
    ...state.cosmetics.titles.map((id) => `title:${id}`),
    ...state.cosmetics.frames.map((id) => `frame:${id}`),
  ])
  for (const chest of state.chests) {
    const cosmetic = chestCosmetic(chest)
    if (cosmetic !== undefined) taken.add(`${cosmetic.kind}:${cosmetic.id}`)
  }
  return taken
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
  defeatBoss,
  grantChest,
  /** Öffnet eine Truhe am heutigen Spieltag (wie die App); liefert den tatsächlichen Inhalt. */
  openChest: async (id: string) => repository.openChest(id, await currentDay()),
}

declare global {
  interface Window {
    questlog?: typeof devtools
  }
}

export function installDevtools(): void {
  window.questlog = devtools
}
