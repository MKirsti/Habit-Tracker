/**
 * Texte zum Endgegner einer Kampagne (Phase 3b, `MainQuestState.endBoss`) – rein (ohne React), einzeln testbar.
 *
 * Das letzte Kapitel ist der Endgegner. Er schläft, solange noch andere Kapitel offen sind (angekündigt, aber noch
 * nicht im Kampf), „erwacht“ danach und ist besiegt, sobald das Kapitel abgeschlossen ist. Ton: verspielt, nie
 * drohend – er wartet einfach am Ende des Weges.
 */
import type { EndBossState } from '../../domain/types'
import { formatValue } from './campaignText'

export type EndBossPhase = 'asleep' | 'awakened' | 'defeated'

/** Zustand des Endgegners: besiegt vor erwacht vor schlafend. */
export function endBossPhase(endBoss: Pick<EndBossState, 'awakened' | 'defeated'>): EndBossPhase {
  if (endBoss.defeated) return 'defeated'
  return endBoss.awakened ? 'awakened' : 'asleep'
}

/** Kurzer Zustand für den Kopf der Kampagne: „schläft noch“ / „ist erwacht“ / „besiegt“. */
export const END_BOSS_PHASE_LABELS: Record<EndBossPhase, string> = {
  asleep: 'schläft noch',
  awakened: 'ist erwacht',
  defeated: 'besiegt',
}

/**
 * Satz unter dem Namen: schlafend „Schläft noch – erwacht, sobald deine übrigen 2 Kapitel geschafft sind.“, erwacht
 * die Beschreibung des Endgegners, besiegt sein Satz zum Sieg.
 */
export function endBossStatusText(
  endBoss: Pick<EndBossState, 'awakened' | 'defeated' | 'definition'>,
  openBefore: number,
): string {
  switch (endBossPhase(endBoss)) {
    case 'defeated':
      return `„${endBoss.definition.defeatLine}“`
    case 'awakened':
      return `Erwacht! ${endBoss.definition.description}`
    case 'asleep': {
      const rest =
        openBefore === 1 ? 'dein letztes übriges Kapitel geschafft ist' : `deine übrigen ${formatValue(openBefore)} Kapitel geschafft sind`
      return `Schläft noch – erwacht, sobald ${rest}.`
    }
  }
}

/**
 * Lebenspunkte als Text: „8 / 30“ (vorgelesen „noch 8 von 30 Lebenspunkten“). Manuelle Kapitel kennen keine Zahl –
 * dort „unbesiegt“ bzw. „besiegt“.
 */
export function endBossHpText(endBoss: Pick<EndBossState, 'hp' | 'maxHp' | 'defeated'>, manual: boolean): {
  value: string
  spoken: string
} {
  if (manual) {
    return endBoss.defeated || endBoss.hp <= 0
      ? { value: 'besiegt', spoken: 'besiegt' }
      : { value: 'unbesiegt', spoken: 'unbesiegt – ein Haken genügt' }
  }
  const hp = formatValue(Math.max(0, endBoss.hp))
  const max = formatValue(endBoss.maxHp)
  return { value: `${hp} / ${max}`, spoken: `noch ${hp} von ${max} Lebenspunkten` }
}
