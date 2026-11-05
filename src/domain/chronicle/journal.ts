/**
 * Tagebuch (Phase 3b, ARCHITECTURE.md „Tagebuch“) – rein: die automatischen Einträge der Abenteuer-Chronik.
 *
 * `journalEvents(data, state, today)` leitet alle Ereignisse bis `today` ab, **neueste zuerst** (Tag absteigend; an
 * einem Tag in umgekehrter Erzählfolge – der Abschluss des Tages oben, z. B. der Wochenrückblick am Sonntag, der
 * Abenteuerbeginn ganz unten). Jedes Ereignis kommt höchstens einmal vor (Schlüssel je Art und Herkunft).
 * - Abenteuerbeginn (`profile.createdDay`)
 * - Level-Ups: Tag aus der XP-Zeitleiste der Engine (`totalXpTimeline`); mehrere Level an einem Tag → ein Eintrag
 * - Klassenwechsel: am Montag der Woche, in der die Klasse wechselte (`classTimeline`, mit Trägheit wie die Engine)
 * - Kapitel (am `doneDay`), Kampagne begonnen (`startDay`) / gemeistert (Tag des letzten Kapitels), Endgegner besiegt
 *   (das letzte Kapitel, `MainQuestState.endBoss` – statt des Kapitel-Eintrags)
 * - Boss-Siege (gespeichert), Erfolge (Freischalttag), Niederlagen (HP-Ledger), eingelöste Belohnungen (je Tag und
 *   Belohnung zusammengefasst), geöffnete Truhen (Spieltag des Öffnens laut Tageswechsel, nie vor dem Fund)
 * - Gefährte gewählt (`chosenDay`) und jede danach erreichte Stufe (Tag des 14./60./180. aktiven Tags)
 * - Wochenrückblicke abgeschlossener Wochen mit XP (am Sonntag der Woche), mit dem ermutigenden Satz
 *
 * Effizient: ein Index, ein Durchlauf über die Tage (`chronicleDays`), die XP-Zeitleiste und je Quelle eine Schleife.
 * Notizen (`JournalNote`) sind keine Ereignisse – die UI mischt sie selbst dazu.
 */
import { BALANCING } from '../balancing'
import { bossById, victoriesByWeek } from '../combat/boss'
import { classDefinition, classNameFor, classTimeline } from '../combat/classes'
import { FRAMES, RARITY_LABELS, TITLES } from '../combat/cosmeticDefinitions'
import { titleNameFor } from '../combat/cosmetics'
import { addDays, compareDays, isValidDayKey, startOfWeek, toDayKey } from '../dates'
import { totalXpTimeline } from '../engine'
import { sortedLedger } from '../hpRules'
import { levelFromXp, rankForLevel } from '../leveling'
import type {
  Chest,
  ChestContent,
  DayKey,
  GameData,
  GameState,
  GrammaticalForm,
  HeroClassId,
  JournalEvent,
  JournalEventKind,
  MainQuestState,
} from '../types'
import { chronicleDays, chronicleIndex, firstXpDay } from './chronicleDays'
import type { ChronicleDay, ChronicleIndex } from './chronicleDays'
import { attributeXpEntries, reviewableWeeks, reviewsFromDays } from './weeklyReview'

/** Was das Tagebuch aus dem Spielzustand braucht (ein ganzer `GameState` passt). */
export type JournalState = Pick<
  GameState,
  'mainQuests' | 'archivedMainQuests' | 'achievements' | 'chests' | 'bosses' | 'heroClass' | 'companion'
>

/**
 * Erzählfolge innerhalb eines Tages (aufsteigend = früher am Tag). Die Liste ist neueste zuerst, an einem Tag steht
 * also der höchste Rang oben.
 */
const KIND_RANK: Record<JournalEventKind, number> = {
  adventureStart: 0,
  classChange: 1,
  companionChosen: 2,
  campaignStart: 3,
  chapter: 4,
  endBossVictory: 5,
  campaignComplete: 6,
  bossVictory: 7,
  levelUp: 8,
  companionStage: 9,
  achievement: 10,
  chestOpened: 11,
  reward: 12,
  defeat: 13,
  weeklyReview: 14,
}

/** Ein Ereignis mit Sortier- und Eindeutigkeits-Schlüssel. */
interface Entry {
  event: JournalEvent
  /** Eindeutig je Ereignis (Art + Herkunft) – doppelte Quellen ergeben nur einen Eintrag. */
  key: string
  /** Reihenfolge innerhalb von Tag und Art (aufsteigend = früher). */
  seq: number
}

function formatNumber(value: number): string {
  return value.toLocaleString('de-DE')
}

/** Gültiger Tag ≤ today. */
function isPastOrToday(day: DayKey | undefined, today: DayKey): day is DayKey {
  return day !== undefined && isValidDayKey(day) && compareDays(day, today) <= 0
}

class JournalBuilder {
  readonly entries: Entry[] = []
  private readonly keys = new Set<string>()
  private readonly today: DayKey

  constructor(today: DayKey) {
    this.today = today
  }

  add(key: string, day: DayKey | undefined, kind: JournalEventKind, icon: string, text: string, detail?: string, seq = 0) {
    if (!isPastOrToday(day, this.today) || this.keys.has(key)) return
    this.keys.add(key)
    const event: JournalEvent = { day, kind, icon, text }
    const trimmed = detail?.trim()
    if (trimmed !== undefined && trimmed !== '') event.detail = trimmed
    this.entries.push({ event, key, seq })
  }

  /** Neueste zuerst: Tag absteigend, dann Erzählfolge des Tages absteigend, dann `seq`, dann Schlüssel. */
  sorted(): JournalEvent[] {
    return this.entries
      .sort(
        (a, b) =>
          compareDays(b.event.day, a.event.day) ||
          KIND_RANK[b.event.kind] - KIND_RANK[a.event.kind] ||
          b.seq - a.seq ||
          (a.key < b.key ? 1 : a.key > b.key ? -1 : 0),
      )
      .map((entry) => entry.event)
  }
}

// ---------------------------------------------------------------------------
// Quellen
// ---------------------------------------------------------------------------

function addAdventureStart(builder: JournalBuilder, data: GameData) {
  const profile = data.profile
  if (profile === undefined) return
  const name = profile.name.trim()
  builder.add('start', profile.createdDay, 'adventureStart', '🌅', 'Dein Abenteuer beginnt', name ? `${name} bricht auf.` : undefined)
}

/** Level-Ups aus der XP-Zeitleiste der Engine – je Tag mit Aufstieg ein Eintrag (das erreichte Level). */
function addLevelUps(builder: JournalBuilder, data: GameData, index: ChronicleIndex, days: readonly DayKey[]) {
  if (days.length === 0) return
  const timeline = totalXpTimeline(data, index.today, { restDays: index.restDays, freeDays: index.freeDays })
  let level = levelFromXp(timeline.totalXpAt(addDays(days[0], -1))).level
  for (const day of days) {
    const reached = levelFromXp(timeline.totalXpAt(day)).level
    if (reached > level) {
      const details: string[] = []
      if (reached - level > 1) details.push(`Gleich ${formatNumber(reached - level)} Level auf einmal`)
      const rank = rankForLevel(reached)
      if (rank !== rankForLevel(level)) details.push(`Neuer Rang: ${rank}`)
      builder.add(`level:${reached}`, day, 'levelUp', '⭐', `Level ${formatNumber(reached)} erreicht`, details.join(' · '), reached)
    }
    level = Math.max(level, reached)
  }
}

/** Klassenwechsel zu Wochenbeginn (Wochenfolge mit Trägheit; die laufende Woche wie im Spielzustand). */
function addClassChanges(
  builder: JournalBuilder,
  state: JournalState,
  days: Iterable<ChronicleDay>,
  today: DayKey,
  form: GrammaticalForm | undefined,
) {
  const timeline = classTimeline(attributeXpEntries(days), startOfWeek(today))
  const current = state.heroClass
  let previous: HeroClassId = 'adventurer'
  for (const week of timeline) {
    const id = current !== undefined && week.weekStart === current.weekStart ? current.definition.id : week.id
    if (id !== previous) {
      const definition =
        current !== undefined && current.definition.id === id ? current.definition : classDefinition(id)
      builder.add(
        `class:${week.weekStart}`,
        week.weekStart,
        'classChange',
        definition.icon,
        `Neue Klasse: ${classNameFor(definition, form)}`,
        definition.description,
      )
    }
    previous = id
  }
}

/** Abschlusstag einer gemeisterten Kampagne: der späteste bekannte Kapitel-Tag. */
function completionDay(state: MainQuestState, today: DayKey): DayKey | undefined {
  let day: DayKey | undefined
  for (const chapter of state.chapters) {
    if (!isPastOrToday(chapter.doneDay, today)) continue
    if (day === undefined || compareDays(chapter.doneDay, day) > 0) day = chapter.doneDay
  }
  return day
}

function addCampaigns(builder: JournalBuilder, state: JournalState, today: DayKey) {
  const campaigns = [...state.mainQuests, ...state.archivedMainQuests]
  campaigns.forEach((campaign, campaignIndex) => {
    const { quest } = campaign
    const title = quest.title.trim()
    builder.add(
      `campaignStart:${quest.id}`,
      quest.startDay,
      'campaignStart',
      quest.icon,
      `Kampagne „${title}“ begonnen`,
      quest.why,
      campaignIndex,
    )

    const endBoss = campaign.endBoss
    campaign.chapters.forEach((chapter, chapterIndex) => {
      if (!chapter.done) return
      const seq = campaignIndex * 1000 + chapterIndex
      if (endBoss !== undefined && endBoss.defeated && endBoss.chapterId === chapter.chapter.id) {
        builder.add(
          `endBoss:${quest.id}`,
          chapter.doneDay,
          'endBossVictory',
          endBoss.definition.icon,
          `${endBoss.definition.name} besiegt`,
          `Endgegner von „${title}“`,
          seq,
        )
        return
      }
      builder.add(
        `chapter:${quest.id}:${chapter.chapter.id}`,
        chapter.doneDay,
        'chapter',
        '📖',
        `Kapitel „${chapter.chapter.title.trim()}“ abgeschlossen`,
        `${quest.icon} ${title}`,
        seq,
      )
    })

    if (campaign.complete) {
      const reward = quest.reward.trim()
      builder.add(
        `campaignComplete:${quest.id}`,
        completionDay(campaign, today),
        'campaignComplete',
        '🏆',
        `Kampagne „${title}“ gemeistert`,
        reward ? `Deine Belohnung: ${reward}` : undefined,
        campaignIndex,
      )
    }
  })
}

function addBossVictories(builder: JournalBuilder, data: GameData, state: JournalState) {
  for (const victory of victoriesByWeek(data.bossVictories).values()) {
    const live = [state.bosses.current, state.bosses.previous].find(
      (boss) => boss?.weekStart === victory.weekStart && boss.boss.id === victory.bossId,
    )
    const boss = live?.boss ?? bossById(victory.bossId)
    builder.add(
      `boss:${victory.weekStart}`,
      victory.day,
      'bossVictory',
      boss?.icon ?? '⚔️',
      boss !== undefined ? `${boss.name} besiegt` : 'Wochen-Boss besiegt',
      boss?.defeatLine,
    )
  }
}

function addAchievements(builder: JournalBuilder, state: JournalState) {
  state.achievements.forEach((achievement, i) => {
    if (!achievement.unlocked) return
    const { definition } = achievement
    builder.add(
      `achievement:${definition.id}`,
      achievement.unlockedDay,
      'achievement',
      definition.icon,
      `Erfolg „${definition.title}“ freigeschaltet`,
      definition.description,
      i,
    )
  })
}

function addDefeats(builder: JournalBuilder, data: GameData) {
  for (const entry of sortedLedger(data.hpLedger)) {
    if (entry.defeat === undefined) continue
    const goldLost = Number.isFinite(entry.defeat.goldLost) ? Math.max(0, Math.round(entry.defeat.goldLost)) : 0
    builder.add(
      `defeat:${entry.day}`,
      entry.day,
      'defeat',
      '🩹',
      'Gefallen – und wieder aufgestanden',
      goldLost > 0 ? `Lohn des Heilers: ${formatNumber(goldLost)} Gold` : undefined,
    )
  }
}

/** Eingelöste Belohnungen (keine Gegenstände) – mehrere Einlösungen derselben Belohnung an einem Tag: ein Eintrag. */
function addRewards(builder: JournalBuilder, data: GameData) {
  const groups = new Map<string, { day: DayKey; title: string; icon: string; count: number; gold: number; seq: number }>()
  const seen = new Set<string>()
  for (const purchase of data.purchases ?? []) {
    if (purchase.kind === 'item' || !isValidDayKey(purchase.day) || seen.has(purchase.id)) continue
    seen.add(purchase.id)
    const title = purchase.title.trim()
    const key = `${purchase.day}:${purchase.rewardId ?? `${purchase.icon}|${title}`}`
    const price = Number.isFinite(purchase.price) && purchase.price > 0 ? purchase.price : 0
    const createdAt = Number.isFinite(purchase.createdAt) ? purchase.createdAt : 0
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, { day: purchase.day, title, icon: purchase.icon, count: 1, gold: price, seq: createdAt })
    } else {
      group.count++
      group.gold += price
      group.seq = Math.max(group.seq, createdAt)
    }
  }
  for (const [key, group] of groups) {
    const times = group.count > 1 ? ` (${formatNumber(group.count)}×)` : ''
    builder.add(
      `reward:${key}`,
      group.day,
      'reward',
      group.icon,
      `${group.title} eingelöst${times}`,
      `${formatNumber(group.gold)} Gold`,
      group.seq,
    )
  }
}

const CHEST_SOURCE_NAMES: Record<Chest['source'], string> = {
  boss: 'Boss-Truhe',
  quest: 'Quest-Truhe',
  chapter: 'Kapitel-Truhe',
  campaign: 'Endgegner-Truhe',
}

function chestContentText(content: ChestContent, form: GrammaticalForm | undefined): string {
  switch (content.kind) {
    case 'gold':
      return `${formatNumber(content.amount)} Gold`
    case 'item':
      return 'Streak-Schutz'
    case 'cosmetic': {
      if (content.cosmeticKind === 'title') {
        const title = TITLES.find((entry) => entry.id === content.cosmeticId)
        return title !== undefined ? `Titel „${titleNameFor(title, form)}“` : 'ein neuer Titel'
      }
      const frame = FRAMES.find((entry) => entry.id === content.cosmeticId)
      return frame !== undefined ? `Rahmen „${frame.name}“` : 'ein neuer Rahmen'
    }
    default:
      return 'Beute'
  }
}

/** Geöffnete Truhen am Spieltag des Öffnens (wie `chestFreezeDays`: laut Tageswechsel, nie vor dem Fundtag). */
function addChests(builder: JournalBuilder, data: GameData, state: JournalState, form: GrammaticalForm | undefined) {
  const hour = Number.isFinite(data.settings.dayStartHour) ? data.settings.dayStartHour : 4
  for (const chest of state.chests) {
    if (typeof chest.openedAt !== 'number' || !Number.isFinite(chest.openedAt) || chest.content === undefined) continue
    const opened = new Date(chest.openedAt)
    if (Number.isNaN(opened.getTime())) continue
    const openedDay = toDayKey(opened, hour)
    const day = isValidDayKey(chest.foundDay) && compareDays(chest.foundDay, openedDay) > 0 ? chest.foundDay : openedDay
    const rarity = RARITY_LABELS[chest.rarity] as string | undefined
    const source = CHEST_SOURCE_NAMES[chest.source] as string | undefined
    builder.add(
      `chest:${chest.id}`,
      day,
      'chestOpened',
      '🎁',
      `Truhe geöffnet: ${chestContentText(chest.content, form)}`,
      [rarity, source].filter((part) => part !== undefined).join(' · '),
      chest.openedAt,
    )
  }
}

/** Gefährte gewählt und jede danach erreichte Stufe (Tag des n-ten aktiven Tags, `BALANCING.companion.stageDays`). */
function addCompanion(builder: JournalBuilder, state: JournalState, index: ChronicleIndex) {
  const companion = state.companion
  if (companion === undefined) return
  const { choice, definition } = companion
  const name = choice.name.trim() || definition.label
  builder.add('companion', choice.chosenDay, 'companionChosen', definition.icon, `${name} schließt sich dir an`, definition.label)
  if (!isValidDayKey(choice.chosenDay)) return
  BALANCING.companion.stageDays.forEach((threshold, stage) => {
    if (stage === 0 || threshold < 1) return
    const day = index.activeDays[threshold - 1]
    if (day === undefined || compareDays(day, choice.chosenDay) <= 0) return
    const stageDefinition = definition.stages[stage]
    builder.add(
      `companionStage:${stage}`,
      day,
      'companionStage',
      definition.icon,
      stageDefinition !== undefined ? `Neue Stufe für ${name}: ${stageDefinition.name}` : `${name} ist gewachsen`,
      stageDefinition?.description,
      stage,
    )
  })
}

function perfectDaysText(count: number): string {
  return count === 1 ? '1 Perfekter Tag' : `${formatNumber(count)} Perfekte Tage`
}

/** Wochenrückblicke der abgeschlossenen Wochen mit XP – am Sonntag der Woche. */
function addWeeklyReviews(
  builder: JournalBuilder,
  data: GameData,
  state: JournalState,
  index: ChronicleIndex,
  days: ReadonlyMap<DayKey, ChronicleDay>,
) {
  const weeks = reviewableWeeks(data, index.today)
  if (weeks.length === 0) return
  // Die Tage sind ohne Streaks gerechnet: Das Tagebuch zeigt nur XP, Perfekte Tage und den Satz (der Streak fließt
  // nicht in ihn ein). Die Attribut-XP für einen abzuleitenden Vorwochen-Boss stecken schon in den Tagen.
  const reviews = reviewsFromDays(data, state, { index, days, attributeEntries: () => attributeXpEntries(days.values()) }, weeks)
  for (const review of reviews) {
    if (!(review.xp > 0) && review.questsCompleted === 0) continue
    const perfect = review.perfectDays > 0 ? ` · ${perfectDaysText(review.perfectDays)}` : ''
    builder.add(
      `review:${review.weekStart}`,
      review.weekEnd,
      'weeklyReview',
      '📜',
      `Wochenrückblick: ${formatNumber(review.xp)} XP${perfect}`,
      review.line,
    )
  }
}

// ---------------------------------------------------------------------------
// Einstieg
// ---------------------------------------------------------------------------

/** Frühester Tag mit Bedeutung für die Chronik: Abenteuerbeginn, erste XP, erstes Kapitel. */
function chronicleStart(data: GameData, state: JournalState, index: ChronicleIndex): DayKey {
  let start = index.today
  const consider = (day: DayKey | undefined) => {
    if (isPastOrToday(day, index.today) && compareDays(day, start) < 0) start = day
  }
  consider(data.profile?.createdDay)
  consider(firstXpDay(index, data))
  for (const campaign of [...state.mainQuests, ...state.archivedMainQuests]) {
    for (const chapter of campaign.chapters) if (chapter.done) consider(chapter.doneDay)
  }
  return start
}

/**
 * Alle automatischen Tagebuch-Einträge bis `today`, neueste zuerst (siehe Dateikopf). `state` ist der Spielzustand
 * zum selben Tag (`deriveGameState(data, today)`).
 */
export function journalEvents(data: GameData, state: JournalState, today: DayKey): JournalEvent[] {
  if (!isValidDayKey(today)) return []
  const index = chronicleIndex(data, today)
  const { days } = chronicleDays(index, data, state, { from: chronicleStart(data, state, index), to: today })
  const dayList = [...days.keys()]
  const form = data.profile?.form
  const builder = new JournalBuilder(today)

  addAdventureStart(builder, data)
  addLevelUps(builder, data, index, dayList)
  addClassChanges(builder, state, days.values(), today, form)
  addCampaigns(builder, state, today)
  addBossVictories(builder, data, state)
  addAchievements(builder, state)
  addDefeats(builder, data)
  addRewards(builder, data)
  addChests(builder, data, state, form)
  addCompanion(builder, state, index)
  addWeeklyReviews(builder, data, state, index, days)
  return builder.sorted()
}

