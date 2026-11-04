/**
 * Erkennt aus zwei aufeinanderfolgenden Spielzuständen, was es zu feiern gibt (XP samt Gold, Level-Up,
 * Attribut-Aufstieg, Perfekter Tag, Kapitel, Kampagne, Erfolg). Rein und ohne React – die Darstellung
 * übernimmt `GameFeedback`.
 *
 * Grundsätze:
 * - Nur Zuwächse zählen. Rückgänge (Abhaken rückgängig, Quest gelöscht) erzeugen keine Ereignisse.
 * - Massenänderungen (Tageswechsel, Backup-Wiederherstellung, Demo-Daten, anderes Profil) erzeugen
 *   gar keine Ereignisse – sonst würde z. B. ein Backup ein Feuerwerk aus Level-Ups auslösen.
 *   Das gilt auch für Erfolge: Was beim ersten Laden (Ausgangszustand) oder durch eine Massenänderung
 *   freigeschaltet ist, wird still übernommen.
 */
import { ATTRIBUTE_IDS } from '../../domain/attributes'
import { BALANCING } from '../../domain/balancing'
import { compareDays, isValidDayKey } from '../../domain/dates'
import { isDone, questXp } from '../../domain/schedule'
import type {
  AchievementTier,
  AttributeId,
  Completion,
  DayKey,
  GameState,
  Habit,
  LevelInfo,
  MainQuestState,
  SideQuest,
} from '../../domain/types'
import { combatFeedbackStillHolds } from './combatFeedback'
import type { CombatFeedbackEvent } from './combatFeedback'
import type { HpFeedbackEvent } from './hpFeedback'

/**
 * Ändern sich in einem Schritt mehr als so viele Erledigungen (bzw. perfekte Tage, Nebenquests, Kapitel oder
 * Erfolge), gilt die Änderung als Massenänderung (Backup, Demo-Daten …) und bleibt ohne Rückmeldung.
 */
export const BULK_CHANGE_LIMIT = 3

/** Eine Quest (bzw. Nebenquest), die in diesem Schritt XP gebracht hat. */
export interface XpQuest {
  id: string
  title: string
  /** Emoji der Quest. */
  icon: string
  /** XP der Erledigung (Schwierigkeit laut Snapshot, ohne Streak-Bonus). */
  xp: number
  /** true: eine Nebenquest (einmalige Aufgabe) statt einer Gewohnheit. */
  sideQuest?: true
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
  /** XP aus erledigten Quests (inklusive Streak-Bonus) und Nebenquests. */
  questXp: number
  /**
   * Gold, das diese XP bringen (½ Gold pro XP, abgerundet auf den Gesamtstand): genau der Zuwachs von
   * `gold.fromXp`, wenn sonst keine XP hinzukommen – sonst der Anteil dieser XP (zuerst gezählt).
   */
  gold: number
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

/** Ein neu freigeschalteter Erfolg. */
export interface AchievementUnlockedEvent {
  type: 'achievement-unlocked'
  /** ID der Erfolgs-Definition. */
  id: string
  title: string
  /** Emoji des Erfolgs. */
  icon: string
  tier: AchievementTier
  /** Gold-Belohnung des Erfolgs. */
  gold: number
}

/**
 * Alle Rückmeldungen. Die Lebenspunkte-Ereignisse (Niederlage, Streak-Schutz, Heiltrank) erkennt `hpFeedbackEvents`
 * (`hpFeedback.ts`) aus Ledger und Käufen, die Kampf-Ereignisse (Boss besiegt, Truhe gefunden, Klassenwechsel)
 * `combatFeedback.ts` – nicht `diffGameStates`.
 */
export type FeedbackEvent =
  | XpGainedEvent
  | LevelUpEvent
  | AttributeLevelUpEvent
  | PerfectDayEvent
  | ChapterCompletedEvent
  | CampaignCompletedEvent
  | AchievementUnlockedEvent
  | HpFeedbackEvent
  | CombatFeedbackEvent

/**
 * Massenänderung? Dann gibt es keine Rückmeldung, nur der neue Zustand wird zur Vergleichsbasis.
 * - anderer Spieltag (Tageswechsel, geänderter Tagesbeginn)
 * - anderer Abenteuertag am selben Spieltag → das Profil wurde ersetzt (Backup, Demo-Daten)
 * - mehr als `BULK_CHANGE_LIMIT` Erledigungen, perfekte Tage oder erledigte Nebenquests auf einmal geändert
 */
export function isBulkChange(prev: GameState, next: GameState): boolean {
  if (prev.today !== next.today) return true
  if (prev.adventureDay !== next.adventureDay) return true
  if (Math.abs(next.totals.questsCompleted - prev.totals.questsCompleted) > BULK_CHANGE_LIMIT) return true
  if (Math.abs(next.totals.perfectDays - prev.totals.perfectDays) > BULK_CHANGE_LIMIT) return true
  if (Math.abs(next.totals.sideQuestsCompleted - prev.totals.sideQuestsCompleted) > BULK_CHANGE_LIMIT) return true
  return false
}

/**
 * Alle Rückmeldungen für den Schritt `prev` → `next`, in Anzeige-Reihenfolge:
 * XP, Perfekter Tag, Kapitel, Kampagnen, Attribute, Erfolge, Level-Up.
 * Wie bei den Kapiteln gilt ein Schritt mit mehr als `BULK_CHANGE_LIMIT` neuen Erfolgen als Massenänderung.
 *
 * @param credits Die Erledigungen hinter dem XP-Gewinn (`creditedCompletions` und `creditedSideQuests` aus den
 *   Daten beider Schritte). Ohne sie werden nur heute neu erledigte bzw. höher bewertete Quests und Nebenquests
 *   erkannt.
 */
export function diffGameStates(prev: GameState, next: GameState, credits?: readonly XpCredit[]): FeedbackEvent[] {
  if (prev === next || isBulkChange(prev, next)) return []

  const { chapters, campaigns } = campaignEvents(prev, next)
  if (chapters.length > BULK_CHANGE_LIMIT) return []
  const achievements = achievementEvents(prev, next)
  if (achievements.length > BULK_CHANGE_LIMIT) return []

  const perfect = perfectDayEvents(prev, next)
  const events: FeedbackEvent[] = []
  const xp = xpEvent(prev, next, perfect, credits ?? creditsFromToday(prev, next))
  if (xp) events.push(xp)
  events.push(...perfect, ...chapters, ...campaigns, ...attributeEvents(prev, next), ...achievements)
  const level = levelUpEvent(prev, next)
  if (level) events.push(level)
  return events
}

/**
 * Gold aus XP bei `totalXp` Gesamt-XP – dieselbe Formel wie `gold.fromXp` in der Engine
 * (floor(XP × goldPerXp), mit Toleranz gegen Gleitkomma-Rauschen).
 */
export function goldForTotalXp(totalXp: number): number {
  return Math.max(0, Math.floor(totalXp * BALANCING.goldPerXp + 1e-9))
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
  // Quest-XP (inkl. Streak-Bonus) und Nebenquest-XP – jede Quelle zählt nur, wenn sie gewachsen ist.
  const gained =
    Math.max(0, next.totals.xpFromQuests - prev.totals.xpFromQuests) +
    Math.max(0, next.totals.xpFromSideQuests - prev.totals.xpFromSideQuests)
  if (gained <= 0) return undefined
  // Was die Perfekter-Tag-Ereignisse melden (heute: den Zuwachs), zählt nicht noch einmal als Bonus.
  const reportedBonus = perfect.reduce((sum, event) => sum + event.addedXp, 0)
  const bonusXp = Math.max(0, next.totals.xpFromPerfectDays - prev.totals.xpFromPerfectDays - reportedBonus)
  const amount = gained + bonusXp
  const today = credits.filter((credit) => credit.day === next.today)
  const backfill = today.length === 0
  const quests = uniqueQuests(backfill ? credits : today)
  // Gold dieser XP, gezählt vor allen anderen XP des Schritts (Perfekter Tag, Kapitel): Kommen keine dazu,
  // ist das genau der Zuwachs des Guthabens aus XP.
  const base = prev.level.totalXp
  const gold = Math.max(0, goldForTotalXp(base + amount) - goldForTotalXp(base))
  return { type: 'xp-gained', amount, questXp: gained, gold, bonusXp, quests, backfill }
}

/** Jede Quest nur einmal (die erste Erledigung zählt), ohne den Tag. */
function uniqueQuests(credits: readonly XpCredit[]): XpQuest[] {
  const seen = new Set<string>()
  const quests: XpQuest[] = []
  for (const { day: _day, ...quest } of credits) {
    const key = questKey(quest)
    if (seen.has(key)) continue
    seen.add(key)
    quests.push(quest)
  }
  return quests
}

/** Eindeutiger Schlüssel einer Quest bzw. Nebenquest (getrennte Tabellen, getrennte IDs). */
export function questKey(quest: Pick<XpQuest, 'id' | 'sideQuest'>): string {
  return `${quest.sideQuest ? 'side' : 'habit'}:${quest.id}`
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

/**
 * Die Nebenquests, die im Schritt `before` → `after` XP gebracht haben: bis `today` neu erledigt oder (schon
 * erledigt) mit höherer Schwierigkeit als vorher. `day` ist ihr Erledigungstag.
 */
export function creditedSideQuests(
  before: readonly SideQuest[] | undefined,
  after: readonly SideQuest[] | undefined,
  today: DayKey,
): XpCredit[] {
  if (before === after || after === undefined) return []
  const previous = new Map<string, SideQuest>()
  for (const quest of before ?? []) previous.set(quest.id, quest)
  const credits: XpCredit[] = []
  for (const quest of after) {
    const doneDay = sideQuestDoneDay(quest, today)
    if (doneDay === undefined) continue
    const xp = questXp(quest.difficulty)
    const old = previous.get(quest.id)
    if (old && sideQuestDoneDay(old, today) !== undefined && questXp(old.difficulty) >= xp) continue
    credits.push({ id: quest.id, title: quest.title, icon: quest.icon, xp, day: doneDay, sideQuest: true })
  }
  return credits
}

/** Erledigungstag einer Nebenquest, wenn sie zum Stichtag erledigt ist (wie in der Engine), sonst undefined. */
function sideQuestDoneDay(quest: SideQuest, today: DayKey): DayKey | undefined {
  const { doneDay } = quest
  return doneDay !== undefined && isValidDayKey(doneDay) && compareDays(doneDay, today) <= 0 ? doneDay : undefined
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
 * Ohne Daten (nur Zustände): heute neu erledigte bzw. höher bewertete Quests aus der Tagesansicht und heute
 * erledigte Nebenquests. Nachgetragene Quests lassen sich so nicht bestimmen.
 */
function creditsFromToday(prev: GameState, next: GameState): XpCredit[] {
  const before = new Map(prev.todayState.habits.map((status) => [status.habit.id, status]))
  const credits: XpCredit[] = []
  for (const status of next.todayState.habits) {
    if (!status.done) continue
    // Maßgeblich ist die Schwierigkeit zum Zeitpunkt der Erledigung (Snapshot).
    const xp = status.completion ? questXp(status.completion.difficulty) : status.baseXp
    const old = before.get(status.habit.id)
    if (old?.done && (old.completion ? questXp(old.completion.difficulty) : old.baseXp) >= xp) continue
    credits.push({ id: status.habit.id, title: status.habit.title, icon: status.habit.icon, xp, day: next.today })
  }
  const sideBefore = new Map(prev.sideQuests.map((state) => [state.quest.id, state]))
  for (const state of next.sideQuests) {
    if (!state.done) continue
    const old = sideBefore.get(state.quest.id)
    if (old?.done && old.xp >= state.xp) continue
    const { id, title, icon, doneDay } = state.quest
    credits.push({ id, title, icon, xp: state.xp, day: doneDay ?? next.today, sideQuest: true })
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

/** Neu freigeschaltete Erfolge (vorher bekannt und gesperrt, jetzt freigeschaltet), in Definitions-Reihenfolge. */
function achievementEvents(prev: GameState, next: GameState): AchievementUnlockedEvent[] {
  const before = new Map<string, boolean>()
  for (const achievement of prev.achievements) before.set(achievement.definition.id, achievement.unlocked)
  const events: AchievementUnlockedEvent[] = []
  for (const { definition, unlocked } of next.achievements) {
    // Nur vorher gesperrte: Ein Erfolg ohne Vorgänger (neue Definition) ist kein Fortschritt.
    if (!unlocked || before.get(definition.id) !== false) continue
    const reward = definition.goldReward
    events.push({
      type: 'achievement-unlocked',
      id: definition.id,
      title: definition.title,
      icon: definition.icon,
      tier: definition.tier,
      gold: Number.isFinite(reward) && reward > 0 ? reward : 0,
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
      const done = new Set<string>()
      for (const status of state.todayState.habits) if (status.done) done.add(questKey({ id: status.habit.id }))
      for (const side of state.sideQuests) if (side.done) done.add(questKey({ id: side.quest.id, sideQuest: true }))
      return event.quests.every((quest) => done.has(questKey(quest)))
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
    case 'achievement-unlocked':
      return state.achievements.some((achievement) => achievement.definition.id === event.id && achievement.unlocked)
    // Abgerechnete Tage ändern sich nie; ein Heiltrank ist getrunken – diese Meldungen bleiben stehen.
    case 'defeat':
    case 'freeze-used':
    case 'potion-healed':
      return true
    case 'boss-defeated':
    case 'chest-found':
    case 'class-changed':
      return combatFeedbackStillHolds(event, state)
  }
}
