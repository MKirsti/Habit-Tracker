/**
 * Mehrere Kampagnen gleichzeitig: Wie viele laufen, wie viele dürfen noch dazukommen?
 *
 * **Aktiv** ist eine Kampagne, die weder archiviert noch abgeschlossen ist. Abgeschlossene (gemeisterte),
 * nicht archivierte Kampagnen belegen keinen Platz mehr. Höchstens `BALANCING.maxActiveCampaigns` Kampagnen
 * dürfen gleichzeitig aktiv sein – das Repository (`createMainQuest`, `restoreMainQuest`, `installBlueprint`)
 * setzt das durch, die UI zeigt es mit `campaignSlotsLeft` vorab an.
 *
 * „Abgeschlossen“ wird mit genau der Kapitel-Auswertung der Engine bestimmt (`evaluateMainQuests`), damit
 * Limit und Anzeige (`MainQuestState.complete`) nie auseinanderlaufen.
 */
import { BALANCING } from './balancing'
import { evaluateMainQuests } from './engine'
import type { DayKey, GameData, MainQuestState } from './types'

/** Meldung, wenn keine weitere Kampagne begonnen werden kann. */
export const CAMPAIGN_LIMIT_MESSAGE = `Du hast schon ${BALANCING.maxActiveCampaigns} aktive Kampagnen. Schließe eine ab oder beende sie, um eine neue zu beginnen.`

/** Meldung, wenn eine archivierte Kampagne nicht zurückgeholt werden kann, weil das Limit erreicht ist. */
export const CAMPAIGN_RESTORE_LIMIT_MESSAGE = `Du hast schon ${BALANCING.maxActiveCampaigns} aktive Kampagnen. Schließe eine ab oder beende sie, um diese fortzusetzen.`

/** Aktiv = nicht archiviert und nicht abgeschlossen. */
export function isCampaignActive(campaign: MainQuestState): boolean {
  return campaign.quest.archived !== true && !campaign.complete
}

/** Die aktiven Kampagnen zum Spieltag `today`, in gespeicherter Reihenfolge. */
export function activeCampaigns(data: GameData, today: DayKey): MainQuestState[] {
  return evaluateMainQuests(data, today).filter(isCampaignActive)
}

/** Anzahl aktiver Kampagnen zum Spieltag `today`. */
export function countActiveCampaigns(data: GameData, today: DayKey): number {
  return activeCampaigns(data, today).length
}

/** Wie viele Kampagnen noch begonnen werden können: max(0, maxActiveCampaigns − aktive). */
export function campaignSlotsLeft(data: GameData, today: DayKey): number {
  return Math.max(0, BALANCING.maxActiveCampaigns - countActiveCampaigns(data, today))
}

/** Läuft gerade (aktiv) eine Kampagne, die aus der Vorlage `blueprintId` gestartet wurde? */
export function isBlueprintActive(data: GameData, today: DayKey, blueprintId: string): boolean {
  return activeCampaigns(data, today).some((campaign) => campaign.quest.blueprint?.id === blueprintId)
}
