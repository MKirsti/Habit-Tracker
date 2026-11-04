/** Reiter der Quests-Seite: IDs, URL-Parameter und DOM-IDs (getrennt von der Komponente für Fast Refresh). */

export type QuestTabId = 'habits' | 'side'

/** Wert des URL-Parameters `?tab=` je Reiter (Gewohnheiten = ohne Parameter). */
export const QUEST_TAB_PARAM: Record<QuestTabId, string | null> = { habits: null, side: 'nebenquests' }

/** Reiter aus dem URL-Parameter `?tab=` – Unbekanntes zeigt die Gewohnheiten. */
export function questTabFromParam(value: string | null): QuestTabId {
  return value === QUEST_TAB_PARAM.side ? 'side' : 'habits'
}

export function questTabId(tab: QuestTabId): string {
  return `quests-tab-${tab}`
}

export function questPanelId(tab: QuestTabId): string {
  return `quests-panel-${tab}`
}
