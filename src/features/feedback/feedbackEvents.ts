/**
 * Erkennt aus zwei aufeinanderfolgenden Spielzuständen, was es zu feiern gibt (XP, Level-Up,
 * Attribut-Aufstieg, Perfekter Tag, Kapitel, Kampagne). Rein und ohne React – die Darstellung
 * übernimmt `GameFeedback`.
 *
 * Grundsätze:
 * - Nur Zuwächse zählen. Rückgänge (Abhaken rückgängig, Quest gelöscht) erzeugen keine Ereignisse.
 * - Massenänderungen (Tageswechsel, Backup-Wiederherstellung, Demo-Daten, anderes Profil) erzeugen
 *   gar keine Ereignisse – sonst würde z. B. ein Backup ein Feuerwerk aus Level-Ups auslösen.
 */
import { ATTRIBUTE_IDS } from '../../domain/attributes'
import { BALANCING } from '../../domain/balancing'
import { compareDays, isValidDayKey } from '../../domain/dates'
import { isDone, questXp } from '../../domain/schedule'
import type { AttributeId, Completion, DayKey, GameState, Habit, LevelInfo, MainQuestState } from '../../domain/types'

/**
 * Ändern sich in einem Schritt mehr als so viele Erledigungen (bzw. perfekte Tage oder Kapitel),
 * gilt die Änderung als Massenänderung (Backup, Demo-Daten …) und bleibt ohne Rückmeldung.
 */
export const BULK_CHANGE_LIMIT = 3

/** Eine Quest, die in diesem Schritt XP gebracht hat. */
export interface XpQuest {
  id: string
  title: string
  /** Emoji der Quest. */
  icon: string
  /** XP der Erledigung (Schwierigkeit laut Snapshot). */
  xp: number
}

/**
 * Eine Erledigung, die in diesem Schritt XP gebracht hat – neu erledigt oder mit höherer Schwierigkeit
 * als vorher (z. B. Leicht → Episch für eine schon erledigte Quest). `day` ist ihr Spieltag.
 */
export interface XpCredit extends XpQuest {
  day: DayKey
}

export interface XpGainedEvent {
  type: 'xp-gained'
  /** Gesamt dieses Ereignisses: Quest-XP + `bonusXp`. */
  amount: number
  /** XP aus erledigten Quests. */
  questXp: number
  /**
   * Zusätzliche Perfekter-Tag-Bonus-XP eines **vergangenen** Tages ohne eigenes Ereignis – z. B. eine
   * nachgetragene Wochenquest an einem schon perfekten Vortag (der Bonus wächst mit den Tages-XP).
   * Der Bonus von heute steckt nie darin: Er wird immer als Tagessumme im Perfekter-Tag-Ereignis gemeldet.
   */
  bonusXp: number
  /**
   * Die Quests hinter dem Gewinn (aus den geänderten Erledigungen, siehe `creditedCompletions`):
   * die von heute – oder, wenn die XP nur von anderen Tagen stammen, die nachgetragenen.
   * Kann leer sein, wenn sich die Quest nicht bestimmen lässt.
   */
  quests: XpQuest[]
  /** true: Die XP stammen nicht von heute (nachgetragen). */
  backfill: boolean
}

export interface LevelUpEvent {
  type: 'level-up'
  from: number
  to: number
  /** Level-Info nach dem Aufstieg (für den XP-Balken). */
  level: LevelInfo
  rank: string
  previousRank: string
  rankChanged: boolean
}

export interface AttributeLevelUpEvent {
  type: 'attribute-level-up'
  attribute: AttributeId
  from: number
  to: number
  xpIntoLevel: number
  xpForNextLevel: number
}

export interface PerfectDayEvent {
  type: 'perfect-day'
  /**
   * Heute: der gesamte Bonus des Tages – dieselbe Zahl wie in der Tagesbilanz („+28 Bonus-XP“).
   * Vergangene Tage: der Bonus der neu perfekten Tage.
   */
  bonusXp: number
  /** Davon in diesem Schritt hinzugekommen (ohne `update`: gleich `bonusXp`). */
  addedXp: number
  /** true: heute ist (bzw. bleibt) perfekt. false: ein vergangener Tag (z. B. per Nachtragen). */
  today: boolean
  /**
   * Nur heute: Der Tag war schon perfekt, sein Bonus ist gewachsen (weitere Quest, auch eine
   * Wochenquest). `bonusXp` ist die neue Tagessumme – der Toast wird ersetzt, nicht ergänzt.
   */
  update?: boolean
}

export interface ChapterCompletedEvent {
  type: 'chapter-completed'
  campaignId: string
  campaignTitle: string
  /** Emoji der Kampagne. */
  campaignIcon: string
  chapterId: string
  chapterTitle: string
  xp: number
}

export interface CampaignCompletedEvent {
  type: 'campaign-completed'
  campaignId: string
  title: string
  /** Emoji der Kampagne. */
  icon: string
  reward: string
  chapterCount: number
  xp: number
}

export type FeedbackEvent =
  | XpGainedEvent
  | LevelUpEvent
  | AttributeLevelUpEvent
  | PerfectDayEvent
  | ChapterCompletedEvent
  | CampaignCompletedEvent

/**
 * Massenänderung? Dann gibt es keine Rückmeldung, nur der neue Zustand wird zur Vergleichsbasis.
 * - anderer Spieltag (Tageswechsel, geänderter Tagesbeginn)
 * - anderer Abenteuertag am selben Spieltag → das Profil wurde ersetzt (Backup, Demo-Daten)
 * - mehr als `BULK_CHANGE_LIMIT` Erledigungen oder perfekte Tage auf einmal geändert
 */
export function isBulkChange(prev: GameState, next: GameState): boolean {
  if (prev.today !== next.today) return true
  if (prev.adventureDay !== next.adventureDay) return true
  if (Math.abs(next.totals.questsCompleted - prev.totals.questsCompleted) > BULK_CHANGE_LIMIT) return true
  if (Math.abs(next.totals.perfectDays - prev.totals.perfectDays) > BULK_CHANGE_LIMIT) return true
  return false
}

/**
 * Alle Rückmeldungen für den Schritt `prev` → `next`, in Anzeige-Reihenfolge:
 * XP, Perfekter Tag, Kapitel, Kampagnen, Attribute, Level-Up.
 *
 * @param credits Die Erledigungen hinter dem XP-Gewinn (`creditedCompletions` aus den Daten beider
 *   Schritte). Ohne sie werden nur heute neu erledigte bzw. höher bewertete Quests erkannt.
 */
export function diffGameStates(prev: GameState, next: GameState, credits?: readonly XpCredit[]): FeedbackEvent[] {
  if (prev === next || isBulkChange(prev, next)) return []

  const { chapters, campaigns } = campaignEvents(prev, next)
  if (chapters.length > BULK_CHANGE_LIMIT) return []

  const perfect = perfectDayEvents(prev, next)
  const events: FeedbackEvent[] = []
  const xp = xpEvent(prev, next, perfect, credits ?? creditsFromToday(prev, next))
  if (xp) events.push(xp)
  events.push(...perfect, ...chapters, ...campaigns, ...attributeEvents(prev, next))
  const level = levelUpEvent(prev, next)
  if (level) events.push(level)
  return events
}

// ---------------------------------------------------------------------------
// Einzelne Ereignisarten
// ---------------------------------------------------------------------------

function xpEvent(
  prev: GameState,
  next: GameState,
  perfect: readonly PerfectDayEvent[],
  credits: readonly XpCredit[],
): XpGainedEvent | undefined {
  const gained = next.totals.xpFromQuests - prev.totals.xpFromQuests
  if (gained <= 0) return undefined
  // Was die Perfekter-Tag-Ereignisse melden (heute: den Zuwachs), zählt nicht noch einmal als Bonus.
  const reportedBonus = perfect.reduce((sum, event) => sum + event.addedXp, 0)
  const bonusXp = Math.max(0, next.totals.xpFromPerfectDays - prev.totals.xpFromPerfectDays - reportedBonus)
  const today = credits.filter((credit) => credit.day === next.today)
  const backfill = today.length === 0
  const quests = uniqueQuests(backfill ? credits : today)
  return { type: 'xp-gained', amount: gained + bonusXp, questXp: gained, bonusXp, quests, backfill }
}

/** Jede Quest nur einmal (die erste Erledigung zählt), ohne den Tag. */
function uniqueQuests(credits: readonly XpCredit[]): XpQuest[] {
  const seen = new Set<string>()
  const quests: XpQuest[] = []
  for (const { id, title, icon, xp } of credits) {
    if (seen.has(id)) continue
    seen.add(id)
    quests.push({ id, title, icon, xp })
  }
  return quests
}

/**
 * Die Erledigungen, die im Schritt `before` → `after` XP gebracht haben: bis `today` neu erledigt
 * (vorher fehlend oder Teilfortschritt) oder mit höherer Schwierigkeit als vorher. So lassen sich auch
 * nachgetragene Quests benennen, die heute nicht anstehen (Mo/Mi/Fr-Quest am Dienstag für Montag,
 * Wochenquest am Montag für den Sonntag der Vorwoche). Erledigungen gelöschter Quests zählen nicht –
 * wie in der Engine.
 */
export function creditedCompletions(
  before: readonly Completion[],
  after: readonly Completion[],
  habits: readonly Habit[],
  today: DayKey,
): XpCredit[] {
  if (before === after) return []
  const habitsById = new Map<string, Habit>()
  for (const habit of habits) habitsById.set(habit.id, habit)
  const previous = latestPerQuestAndDay(before)
  const credits: XpCredit[] = []
  for (const [key, completion] of latestPerQuestAndDay(after)) {
    if (!isDone(completion) || compareDays(completion.day, today) > 0) continue
    const habit = habitsById.get(completion.habitId)
    if (!habit) continue
    const xp = questXp(completion.difficulty)
    const old = previous.get(key)
    if (old && isDone(old) && questXp(old.difficulty) >= xp) continue
    credits.push({ id: habit.id, title: habit.title, icon: habit.icon, xp, day: completion.day })
  }
  return credits
}

/** Pro Quest und Tag die zuletzt geänderte Erledigung (wie die Engine bei doppelten Einträgen). */
function latestPerQuestAndDay(completions: readonly Completion[]): Map<string, Completion> {
  const latest = new Map<string, Completion>()
  for (const completion of completions) {
    if (!isValidDayKey(completion.day)) continue
    const key = `${completion.habitId}|${completion.day}`
    const existing = latest.get(key)
    if (existing === undefined || completion.updatedAt >= existing.updatedAt) latest.set(key, completion)
  }
  return latest
}

/**
 * Ohne Daten (nur Zustände): heute neu erledigte bzw. höher bewertete Quests aus der Tagesansicht.
 * Nachgetragene Quests lassen sich so nicht bestimmen.
 */
function creditsFromToday(prev: GameState, next: GameState): XpCredit[] {
  const before = new Map(prev.todayState.habits.map((status) => [status.habit.id, status]))
  const credits: XpCredit[] = []
  for (const status of next.todayState.habits) {
    if (!status.done) continue
    // Maßgeblich ist die Schwierigkeit zum Zeitpunkt der Erledigung (Snapshot).
    const xp = status.completion ? questXp(status.completion.difficulty) : status.xp
    const old = before.get(status.habit.id)
    if (old?.done && (old.completion ? questXp(old.completion.difficulty) : old.xp) >= xp) continue
    credits.push({ id: status.habit.id, title: status.habit.title, icon: status.habit.icon, xp, day: next.today })
  }
  return credits
}

/**
 * Perfekter Tag: heute neu perfekt, heute mit gewachsenem Bonus (`update`, neue Tagessumme) oder
 * vergangene, neu perfekte Tage (Nachtragen).
 */
function perfectDayEvents(prev: GameState, next: GameState): PerfectDayEvent[] {
  const events: PerfectDayEvent[] = []
  const before = prev.todayState
  const now = next.todayState
  const todayGrowth = now.perfectBonusXp - before.perfectBonusXp
  if (now.perfect && !before.perfect) {
    events.push({ type: 'perfect-day', bonusXp: now.perfectBonusXp, addedXp: now.perfectBonusXp, today: true })
  } else if (now.perfect && before.perfect && todayGrowth > 0) {
    events.push({ type: 'perfect-day', bonusXp: now.perfectBonusXp, addedXp: todayGrowth, today: true, update: true })
  }

  // Perfekte Tage außer heute (Nachtragen für gestern).
  const otherDays = next.totals.perfectDays - prev.totals.perfectDays - (Number(now.perfect) - Number(before.perfect))
  if (otherDays > 0) {
    const otherBonus = Math.max(0, next.totals.xpFromPerfectDays - prev.totals.xpFromPerfectDays - todayGrowth)
    events.push({ type: 'perfect-day', bonusXp: otherBonus, addedXp: otherBonus, today: false })
  }
  return events
}

/**
 * Neu abgeschlossene Kapitel und Kampagnen. Nur Kampagnen, die es vorher schon gab: Eine gerade
 * angelegte oder wieder hervorgeholte Kampagne ist kein Fortschritt.
 */
function campaignEvents(
  prev: GameState,
  next: GameState,
): { chapters: ChapterCompletedEvent[]; campaigns: CampaignCompletedEvent[] } {
  const before = new Map<string, MainQuestState>()
  for (const campaign of prev.mainQuests) before.set(campaign.quest.id, campaign)

  const chapters: ChapterCompletedEvent[] = []
  const campaigns: CampaignCompletedEvent[] = []
  for (const campaign of next.mainQuests) {
    const previous = before.get(campaign.quest.id)
    if (!previous) continue
    const { quest } = campaign
    const doneBefore = new Set(previous.chapters.filter((state) => state.done).map((state) => state.chapter.id))
    for (const state of campaign.chapters) {
      if (!state.done || doneBefore.has(state.chapter.id)) continue
      chapters.push({
        type: 'chapter-completed',
        campaignId: quest.id,
        campaignTitle: quest.title,
        campaignIcon: quest.icon,
        chapterId: state.chapter.id,
        chapterTitle: state.chapter.title,
        xp: BALANCING.chapterXp,
      })
    }
    if (campaign.complete && !previous.complete) {
      campaigns.push({
        type: 'campaign-completed',
        campaignId: quest.id,
        title: quest.title,
        icon: quest.icon,
        reward: quest.reward,
        chapterCount: campaign.chapters.length,
        xp: BALANCING.mainQuestXp,
      })
    }
  }
  return { chapters, campaigns }
}

function attributeEvents(prev: GameState, next: GameState): AttributeLevelUpEvent[] {
  const events: AttributeLevelUpEvent[] = []
  for (const id of ATTRIBUTE_IDS) {
    const before = prev.attributes[id]
    const after = next.attributes[id]
    if (after.level <= before.level) continue
    events.push({
      type: 'attribute-level-up',
      attribute: id,
      from: before.level,
      to: after.level,
      xpIntoLevel: after.xpIntoLevel,
      xpForNextLevel: after.xpForNextLevel,
    })
  }
  return events
}

function levelUpEvent(prev: GameState, next: GameState): LevelUpEvent | undefined {
  if (next.level.level <= prev.level.level) return undefined
  return {
    type: 'level-up',
    from: prev.level.level,
    to: next.level.level,
    level: next.level,
    rank: next.rank,
    previousRank: prev.rank,
    rankChanged: next.rank !== prev.rank,
  }
}

// ---------------------------------------------------------------------------
// Gilt die Rückmeldung noch?
// ---------------------------------------------------------------------------

/**
 * Stimmt die Rückmeldung im (späteren) Zustand `state` noch? Wird ein Haken gleich wieder entfernt,
 * sollen weder ein „+20 XP“ noch ein „Perfekter Tag!“ oder eine Level-Up-Szene stehen bleiben.
 * Nachgetragene XP gelten weiter (der Zustand kennt nur den heutigen Tag im Detail). Ein XP-Gewinn von
 * heute enthält nie den heutigen Bonus (der steht im Perfekter-Tag-Ereignis) – nach dem Rückgängigmachen
 * des Perfekten Tages bleibt also kein Bonus-Hinweis stehen.
 */
export function feedbackStillHolds(event: FeedbackEvent, state: GameState): boolean {
  switch (event.type) {
    case 'xp-gained': {
      if (event.backfill) return true
      const doneToday = new Set(state.todayState.habits.filter((status) => status.done).map((status) => status.habit.id))
      return event.quests.every((quest) => doneToday.has(quest.id))
    }
    case 'perfect-day':
      return !event.today || state.todayState.perfect
    case 'chapter-completed': {
      const campaign = state.mainQuests.find((candidate) => candidate.quest.id === event.campaignId)
      return campaign?.chapters.some((chapter) => chapter.chapter.id === event.chapterId && chapter.done) ?? false
    }
    case 'campaign-completed':
      return state.mainQuests.some((candidate) => candidate.quest.id === event.campaignId && candidate.complete)
    case 'attribute-level-up':
      return state.attributes[event.attribute].level >= event.to
    case 'level-up':
      return state.level.level >= event.to
  }
}
