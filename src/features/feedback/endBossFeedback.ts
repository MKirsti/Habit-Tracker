/**
 * Rückmeldung zum Kampagnen-Endgegner (Phase 3b) – rein und ohne React, die Darstellung übernimmt `GameFeedback`.
 *
 * **Endgegner besiegt:** Das letzte Kapitel einer Kampagne ist ihr Endgegner (`MainQuestState.endBoss`). Wird es in
 * einem Schritt abgeschlossen, zeigt `GameFeedback` die Endgegner-Siegesszene (sein `defeatLine`) – vor der Szene
 * „Kampagne gemeistert“. Ist die Kampagne damit gemeistert, liegt ihre Endgegner-Truhe (`campaign:<questId>`) in der
 * Szene (wie die Boss-Truhe in der Siegesszene des Wochen-Bosses) und erscheint nicht zusätzlich als „Truhe gefunden“.
 * Nur Kampagnen, die es vorher schon gab (eine gerade angelegte oder zurückgeholte ist kein Fortschritt).
 */
import type { GameState, MainQuestState } from '../../domain/types'

export interface EndBossDefeatedEvent {
  type: 'end-boss-defeated'
  campaignId: string
  campaignTitle: string
  /** Emoji der Kampagne. */
  campaignIcon: string
  bossId: string
  name: string
  /** Emoji des Endgegners. */
  icon: string
  /** Satz zum Sieg (`EndBossDefinition.defeatLine`). */
  defeatLine: string
  /** Ist die Kampagne damit gemeistert (alle Kapitel)? */
  campaignComplete: boolean
  /** Endgegner-Truhe (`campaign:<questId>`), sofern im Spielzustand. */
  chestId?: string
}

/** ID der Endgegner-Truhe einer Kampagne. */
export function campaignChestId(campaignId: string): string {
  return `campaign:${campaignId}`
}

/** Neu besiegte Endgegner im Schritt `prev` → `next` (Reihenfolge der Kampagnen). */
export function endBossVictories(
  prev: Pick<GameState, 'mainQuests'>,
  next: Pick<GameState, 'mainQuests' | 'chests'>,
): EndBossDefeatedEvent[] {
  const before = new Map<string, MainQuestState>()
  for (const campaign of prev.mainQuests) before.set(campaign.quest.id, campaign)
  const events: EndBossDefeatedEvent[] = []
  for (const campaign of next.mainQuests) {
    const previous = before.get(campaign.quest.id)
    const boss = campaign.endBoss
    if (previous === undefined || boss === undefined || !boss.defeated) continue
    // Nur ein echter Sieg: Derselbe Endgegner (dasselbe letzte Kapitel) stand vorher noch.
    if (previous.endBoss === undefined || previous.endBoss.defeated || previous.endBoss.chapterId !== boss.chapterId) continue
    const { quest } = campaign
    const event: EndBossDefeatedEvent = {
      type: 'end-boss-defeated',
      campaignId: quest.id,
      campaignTitle: quest.title,
      campaignIcon: quest.icon,
      bossId: boss.definition.id,
      name: boss.definition.name,
      icon: boss.definition.icon,
      defeatLine: boss.definition.defeatLine,
      campaignComplete: campaign.complete,
    }
    const chestId = campaignChestId(quest.id)
    if (campaign.complete && next.chests.some((chest) => chest.id === chestId)) event.chestId = chestId
    events.push(event)
  }
  return events
}

/** Gilt der Sieg im (späteren) Zustand noch? Das letzte Kapitel der Kampagne ist weiter abgeschlossen. */
export function endBossVictoryStillHolds(event: EndBossDefeatedEvent, state: Pick<GameState, 'mainQuests'>): boolean {
  const campaign = state.mainQuests.find((candidate) => candidate.quest.id === event.campaignId)
  return campaign?.endBoss?.defeated ?? false
}
