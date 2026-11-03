/**
 * XP-Folgen beim Bearbeiten einer Kampagne. Quest-Ziel-Kapitel werden live aus den Erledigungen
 * ab `startDay` berechnet (domain/chapters.ts) – ein späterer Start oder ein höheres Ziel kann ein
 * abgeschlossenes Kapitel (und damit die gemeisterte Kampagne) wieder öffnen. Vor dem Speichern
 * fragt die Seite deshalb nach. Reine Funktionen (nur lesender Zugriff auf die Domain).
 */
import { BALANCING } from '../../domain/balancing'
import { deriveGameState } from '../../domain/engine'
import type { DayKey, GameData, MainQuest } from '../../domain/types'
import { formatNumber } from '../../ui'

export interface CampaignEditLoss {
  /**
   * Um so viel sinken die Gesamt-XP, wenn `patched` gespeichert wird (genau deriveGameState vorher − nachher).
   * 0, wenn nichts verloren geht (oder Gewinne den Verlust ausgleichen).
   */
  xp: number
  /** Titel der Kapitel, die bleiben, aber ihren Abschluss verlieren (in der Reihenfolge von `patched`). */
  chapters: string[]
  /** Titel abgeschlossener Kapitel, die beim Speichern entfernt werden. */
  removedChapters: string[]
  /** Die Kampagne war gemeistert und ist es danach nicht mehr (Kampagnen-Bonus entfällt). */
  campaignBonusLost: boolean
}

/** Was kostet es, die Kampagne `questId` durch `patched` zu ersetzen? */
export function campaignEditLoss(data: GameData, today: DayKey, questId: string, patched: MainQuest): CampaignEditLoss {
  const none: CampaignEditLoss = { xp: 0, chapters: [], removedChapters: [], campaignBonusLost: false }
  if (!data.mainQuests.some((quest) => quest.id === questId)) return none

  const after: GameData = {
    ...data,
    mainQuests: data.mainQuests.map((quest) => (quest.id === questId ? { ...patched, id: questId } : quest)),
  }
  const stateBefore = deriveGameState(data, today)
  const stateAfter = deriveGameState(after, today)
  const xp = Math.max(0, stateBefore.level.totalXp - stateAfter.level.totalXp)

  // Archivierte Kampagnen fehlen in `mainQuests` – dann bleibt es bei der XP-Summe.
  const before = stateBefore.mainQuests.find((campaign) => campaign.quest.id === questId)
  const now = stateAfter.mainQuests.find((campaign) => campaign.quest.id === questId)
  if (!before || !now) return { ...none, xp }

  const doneBefore = new Set(before.chapters.filter((state) => state.done).map((state) => state.chapter.id))
  const keptIds = new Set(now.chapters.map((state) => state.chapter.id))
  return {
    xp,
    chapters: now.chapters
      .filter((state) => doneBefore.has(state.chapter.id) && !state.done)
      .map((state) => state.chapter.title),
    removedChapters: before.chapters
      .filter((state) => state.done && !keptIds.has(state.chapter.id))
      .map((state) => state.chapter.title),
    campaignBonusLost: before.complete && !now.complete,
  }
}

/**
 * Text für die Rückfrage, z. B. „Kapitel „Drei Tage“ verliert seinen Abschluss. Die Kampagne gilt dann
 * nicht mehr als gemeistert. Dadurch entfallen 600 XP (davon 500 XP Kampagnen-Bonus).“
 */
export function campaignEditLossText(loss: CampaignEditLoss): string {
  const parts: string[] = []
  if (loss.chapters.length === 1) parts.push(`Kapitel „${loss.chapters[0]}“ verliert seinen Abschluss.`)
  else if (loss.chapters.length > 1) parts.push(`Die Kapitel ${titleList(loss.chapters)} verlieren ihren Abschluss.`)
  if (loss.removedChapters.length === 1) {
    parts.push(`Das abgeschlossene Kapitel „${loss.removedChapters[0]}“ wird entfernt.`)
  } else if (loss.removedChapters.length > 1) {
    parts.push(`Die abgeschlossenen Kapitel ${titleList(loss.removedChapters)} werden entfernt.`)
  }
  if (loss.campaignBonusLost) parts.push('Die Kampagne gilt dann nicht mehr als gemeistert.')
  const bonus = formatNumber(BALANCING.mainQuestXp)
  if (loss.campaignBonusLost && loss.xp === BALANCING.mainQuestXp && parts.length === 1) {
    // Nur der Bonus (z. B. ein neues, offenes Kapitel in einer gemeisterten Kampagne).
    parts.push(`Dadurch entfällt der Kampagnen-Bonus von ${bonus}\u00a0XP.`)
  } else {
    // Geschützte Leerzeichen: „100 XP“ bricht nicht um.
    const total = `${formatNumber(loss.xp)}\u00a0XP`
    const bonusPart = loss.campaignBonusLost ? ` (davon ${bonus}\u00a0XP Kampagnen-Bonus)` : ''
    parts.push(`Dadurch entfallen ${total}${bonusPart}.`)
  }
  return parts.join(' ')
}

/** „„A““, „„A“ und „B““, „„A“, „B“ und „C““. */
function titleList(titles: readonly string[]): string {
  const quoted = titles.map((title) => `„${title}“`)
  return quoted.length === 1 ? quoted[0] : `${quoted.slice(0, -1).join(', ')} und ${quoted[quoted.length - 1]}`
}
