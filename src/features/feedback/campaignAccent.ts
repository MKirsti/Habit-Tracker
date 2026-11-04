/**
 * Kampagnenfarbe in den Rückmeldungen: Kapitel-Toast, Konfetti und die Feier-Szene „Kampagne gemeistert“
 * tragen die Hauptfarbe der Kampagne (siehe docs/ARCHITECTURE.md „Kampagnenfarben“). Gold bleibt für XP,
 * die Belohnung, den Pokal und „Weiter“.
 */
import { ATTRIBUTES } from '../../domain/attributes'
import type { GameState } from '../../domain/types'
import { campaignAttribute } from '../campaignTheme'

/**
 * Hauptfarbe (Hex) der Kampagne mit dieser ID im aktuellen Zustand (laufend oder archiviert) – die Farbe ihres
 * Attributs laut `campaignAttribute` (berechnetes `dominantAttribute`, sonst Vorlage). `undefined`, wenn sie kein
 * Attribut hat oder es sie nicht (mehr) gibt: Dann bleibt die Rückmeldung wie gewohnt golden.
 */
export function campaignAccentById(
  state: Pick<GameState, 'mainQuests' | 'archivedMainQuests'>,
  campaignId: string,
): string | undefined {
  const campaign =
    state.mainQuests.find((candidate) => candidate.quest.id === campaignId) ??
    state.archivedMainQuests.find((candidate) => candidate.quest.id === campaignId)
  const attribute = campaign === undefined ? undefined : campaignAttribute(campaign)
  return attribute === undefined ? undefined : ATTRIBUTES[attribute].color
}
