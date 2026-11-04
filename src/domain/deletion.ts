/**
 * Endgültiges Löschen einer Quest – als reine Funktion, mit genau der Bedeutung von
 * `repository.deleteHabit`. Damit lässt sich vorab berechnen, was das Löschen kostet
 * (`deriveGameState(applyHabitDeletion(data, id, today), today)`), ohne etwas zu speichern.
 *
 * Gelöscht werden die Quest und alle ihre Erledigungen. Zurück bleibt ein Grabstein (`DeletedHabit`) mit
 * ihrem Zeitplan: An vergangenen Tagen, an denen sie Pflicht war, bleibt sie Pflicht – nun für immer offen.
 * So macht Löschen keinen Tag nachträglich perfekt und bringt nie XP; es kann nur die XP der Quest selbst,
 * ihren Anteil an Perfekter-Tag-Boni und Kapitel-/Kampagnen-XP kosten.
 */
import { deriveGameState } from './engine'
import { isArchivedOn } from './schedule'
import type { Chapter, DayKey, DeletedHabit, GameData, GameState, Habit, MainQuest, MainQuestState } from './types'

/**
 * Grabstein einer Quest, die am Spieltag `today` gelöscht wird. `archivedDay` ist der Archivierungstag,
 * wenn die Quest schon archiviert ist (≤ today), sonst `today` – ab dem Löschtag zählt sie nicht mehr.
 */
export function habitTombstone(habit: Habit, today: DayKey): DeletedHabit {
  const tombstone: DeletedHabit = {
    id: habit.id,
    createdDay: habit.createdDay,
    archivedDay: habit.archivedDay !== undefined && isArchivedOn(habit, today) ? habit.archivedDay : today,
    schedule: habit.schedule,
  }
  if (habit.scheduleHistory !== undefined && habit.scheduleHistory.length > 0) {
    tombstone.scheduleHistory = habit.scheduleHistory
  }
  if (habit.pauses !== undefined && habit.pauses.length > 0) tombstone.pauses = habit.pauses
  return tombstone
}

/** Hängt einen Grabstein an (ein älterer mit derselben ID – nur bei kaputten Daten möglich – wird ersetzt). */
export function withTombstone(list: readonly DeletedHabit[], tombstone: DeletedHabit): DeletedHabit[] {
  return [...list.filter((entry) => entry.id !== tombstone.id), tombstone]
}

/**
 * Der Datenstand nach dem Löschen der Quest `habitId` am Spieltag `today` (neues Objekt, Eingabe bleibt
 * unverändert). Eine unbekannte Quest ändert nichts – dann kommt `data` selbst zurück.
 */
export function applyHabitDeletion(data: GameData, habitId: string, today: DayKey): GameData {
  const habit = data.habits.find((candidate) => candidate.id === habitId)
  if (habit === undefined) return data
  return {
    ...data,
    habits: data.habits.filter((candidate) => candidate.id !== habitId),
    completions: data.completions.filter((completion) => completion.habitId !== habitId),
    deletedHabits: withTombstone(data.deletedHabits ?? [], habitTombstone(habit, today)),
  }
}

/** Was das Löschen einer Quest an einer Kampagne ändert. */
export interface CampaignDeletionImpact {
  quest: MainQuest
  /** Abgeschlossene Kapitel, die ihren Abschluss verlieren (sie zählen auf die Quest). */
  lostChapters: Chapter[]
  /** Noch offene Kapitel, die auf die Quest zählen – ihr Fortschritt geht verloren. */
  openChapters: Chapter[]
  /** Die Kampagne war gemeistert und ist es danach nicht mehr (Kampagnen-Bonus entfällt). */
  losesCompletion: boolean
}

/** Was das Löschen einer Quest am Spielstand ändert (für die Rückfrage vor dem Löschen). */
export interface DeletionImpact {
  /** Gesamt-XP vorher − nachher; nie negativ (Löschen bringt keine XP). */
  xpLost: number
  levelBefore: number
  levelAfter: number
  /**
   * Gold-Guthaben vorher − nachher (½ Gold pro verlorenem XP, dazu Gold noch nicht gespeicherter Erfolge, die
   * danach nicht mehr erreicht sind); nie negativ. Ausgegebenes Gold bleibt ausgegeben.
   */
  goldLost: number
  /** Gold-Guthaben nach dem Löschen – kann negativ werden (dann ist Einlösen gesperrt). */
  goldAfter: number
  /** Betroffene Kampagnen (auch archivierte – ihre Kapitel-XP zählen ebenfalls), in gespeicherter Reihenfolge. */
  campaigns: CampaignDeletionImpact[]
}

/**
 * Alle Kampagnen eines Spielzustands in gespeicherter Reihenfolge: `deriveGameState` teilt sie (je in
 * gespeicherter Reihenfolge) in nicht archivierte und archivierte – hier wieder zusammengeführt.
 */
function campaignsInStoredOrder(data: GameData, state: GameState): MainQuestState[] {
  let active = 0
  let archived = 0
  return data.mainQuests.map((quest) =>
    quest.archived === true ? state.archivedMainQuests[archived++] : state.mainQuests[active++],
  )
}

/**
 * Exakte Auswirkung von `applyHabitDeletion(data, habitId, today)` auf den Spielstand zum Tag `today` –
 * `deriveGameState` vorher − nachher: verlorene XP (Quest-XP inklusive Streak-Bonus, Perfekter-Tag-Boni,
 * Kapitel- und Kampagnen-XP) samt Level vorher/nachher, verlorenes Gold samt Guthaben danach und die Kapitel
 * (auch archivierter Kampagnen), die ihren Abschluss oder Fortschritt verlieren.
 */
export function deletionImpact(data: GameData, habitId: string, today: DayKey): DeletionImpact {
  const after = applyHabitDeletion(data, habitId, today)
  const stateBefore = deriveGameState(data, today)
  const stateAfter = deriveGameState(after, today)
  // Löschen ändert keine Kampagne selbst – beide Listen stehen in derselben (gespeicherten) Reihenfolge.
  const questsBefore = campaignsInStoredOrder(data, stateBefore)
  const questsAfter = campaignsInStoredOrder(after, stateAfter)

  const campaigns: CampaignDeletionImpact[] = []
  questsBefore.forEach((questBefore, index) => {
    const questAfter = questsAfter[index]
    const lostChapters: Chapter[] = []
    const openChapters: Chapter[] = []
    questBefore.chapters.forEach((chapterBefore, chapterIndex) => {
      const { chapter } = chapterBefore
      if (chapterBefore.done && questAfter.chapters[chapterIndex]?.done !== true) lostChapters.push(chapter)
      else if (!chapterBefore.done && chapter.criterion.type === 'habit' && chapter.criterion.habitId === habitId) {
        openChapters.push(chapter)
      }
    })
    const losesCompletion = questBefore.complete && !questAfter.complete
    if (lostChapters.length > 0 || openChapters.length > 0 || losesCompletion) {
      campaigns.push({ quest: data.mainQuests[index], lostChapters, openChapters, losesCompletion })
    }
  })

  return {
    xpLost: Math.max(0, stateBefore.level.totalXp - stateAfter.level.totalXp),
    levelBefore: stateBefore.level.level,
    levelAfter: stateAfter.level.level,
    goldLost: Math.max(0, stateBefore.gold.balance - stateAfter.gold.balance),
    goldAfter: stateAfter.gold.balance,
    campaigns,
  }
}
