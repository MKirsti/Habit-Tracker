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
import { questXp } from '../../domain/schedule'
import type { AttributeId, GameState, LevelInfo, MainQuestState } from '../../domain/types'

/**
 * Ändern sich in einem Schritt mehr als so viele Erledigungen (bzw. perfekte Tage oder Kapitel),
 * gilt die Änderung als Massenänderung (Backup, Demo-Daten …) und bleibt ohne Rückmeldung.
 */
export const BULK_CHANGE_LIMIT = 3

/** Eine Quest, die heute (in diesem Schritt) erledigt wurde. */
export interface XpQuest {
  id: string
  title: string
  /** Emoji der Quest. */
  icon: string
  xp: number
}

export interface XpGainedEvent {
  type: 'xp-gained'
  /** Gesamt dieses Ereignisses: Quest-XP + `bonusXp`. */
  amount: number
  /** XP aus erledigten Quests. */
  questXp: number
  /**
   * Zusätzliche Perfekter-Tag-Bonus-XP ohne eigenes Ereignis – z. B. eine weitere Quest an einem
   * bereits perfekten Tag (der Bonus wächst mit den Tages-XP).
   */
  bonusXp: number
  /**
   * Die Quests hinter dem Gewinn: heute neu erledigte – oder, wenn die XP von einem anderen Tag
   * stammen (Nachtragen für gestern), die Quests, deren Serie bzw. Wochenfortschritt gewachsen ist.
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
  bonusXp: number
  /** true: heute ist perfekt geworden. false: ein vergangener Tag (z. B. per Nachtragen). */
  today: boolean
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
 */
export function diffGameStates(prev: GameState, next: GameState): FeedbackEvent[] {
  if (prev === next || isBulkChange(prev, next)) return []

  const { chapters, campaigns } = campaignEvents(prev, next)
  if (chapters.length > BULK_CHANGE_LIMIT) return []

  const perfect = perfectDayEvents(prev, next)
  const events: FeedbackEvent[] = []
  const xp = xpEvent(prev, next, perfect)
  if (xp) events.push(xp)
  events.push(...perfect, ...chapters, ...campaigns, ...attributeEvents(prev, next))
  const level = levelUpEvent(prev, next)
  if (level) events.push(level)
  return events
}

// ---------------------------------------------------------------------------
// Einzelne Ereignisarten
// ---------------------------------------------------------------------------

function xpEvent(prev: GameState, next: GameState, perfect: readonly PerfectDayEvent[]): XpGainedEvent | undefined {
  const gained = next.totals.xpFromQuests - prev.totals.xpFromQuests
  if (gained <= 0) return undefined
  const reportedBonus = perfect.reduce((sum, event) => sum + event.bonusXp, 0)
  const bonusXp = Math.max(0, next.totals.xpFromPerfectDays - prev.totals.xpFromPerfectDays - reportedBonus)
  const today = newlyDoneToday(prev, next)
  const backfill = today.length === 0
  const quests = backfill ? questsWithGrownProgress(prev, next) : today
  return { type: 'xp-gained', amount: gained + bonusXp, questXp: gained, bonusXp, quests, backfill }
}

/** Quests, die in `prev` heute noch offen waren und in `next` erledigt sind. */
function newlyDoneToday(prev: GameState, next: GameState): XpQuest[] {
  const doneBefore = new Set(prev.todayState.habits.filter((status) => status.done).map((status) => status.habit.id))
  const quests: XpQuest[] = []
  for (const status of next.todayState.habits) {
    if (!status.done || doneBefore.has(status.habit.id)) continue
    quests.push({
      id: status.habit.id,
      title: status.habit.title,
      icon: status.habit.icon,
      // Maßgeblich ist die Schwierigkeit zum Zeitpunkt der Erledigung (Snapshot).
      xp: status.completion ? questXp(status.completion.difficulty) : status.xp,
    })
  }
  return quests
}

/**
 * Für nachgetragene Tage: Quests, deren Serie oder Wochenfortschritt (zum heutigen Tag) gewachsen ist.
 * Das trifft auf eine für gestern nachgetragene Tagesquest (Serie +1) bzw. Wochenquest zu.
 */
function questsWithGrownProgress(prev: GameState, next: GameState): XpQuest[] {
  const before = new Map(prev.todayState.habits.map((status) => [status.habit.id, status]))
  const quests: XpQuest[] = []
  for (const status of next.todayState.habits) {
    const old = before.get(status.habit.id)
    if (!old) continue
    const grew =
      status.streak.current > old.streak.current ||
      status.streak.best > old.streak.best ||
      (status.week?.done ?? 0) > (old.week?.done ?? 0)
    if (grew) quests.push({ id: status.habit.id, title: status.habit.title, icon: status.habit.icon, xp: status.xp })
  }
  return quests
}

function perfectDayEvents(prev: GameState, next: GameState): PerfectDayEvent[] {
  const events: PerfectDayEvent[] = []
  const todayBefore = prev.todayState.perfect
  const todayNow = next.todayState.perfect
  if (todayNow && !todayBefore) {
    events.push({ type: 'perfect-day', bonusXp: next.todayState.perfectBonusXp, today: true })
  }

  // Perfekte Tage außer heute (Nachtragen für gestern).
  const otherDays = next.totals.perfectDays - prev.totals.perfectDays - (Number(todayNow) - Number(todayBefore))
  if (otherDays > 0) {
    const otherBonus =
      next.totals.xpFromPerfectDays -
      prev.totals.xpFromPerfectDays -
      (next.todayState.perfectBonusXp - prev.todayState.perfectBonusXp)
    events.push({ type: 'perfect-day', bonusXp: Math.max(0, otherBonus), today: false })
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
 * Nachgetragene XP lassen sich keiner Quest sicher zuordnen – sie gelten weiter.
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
