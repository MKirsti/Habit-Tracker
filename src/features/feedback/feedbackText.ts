/**
 * Deutsche Texte für die Spiel-Rückmeldungen (Toasts & Feier-Szenen). Rein, damit testbar.
 */
import { ATTRIBUTES } from '../../domain/attributes'
import { RANKS } from '../../domain/balancing'
import { formatNumber } from '../../ui'
import type { AttributeLevelUpEvent, ChapterCompletedEvent, PerfectDayEvent, XpQuest } from './feedbackEvents'

export interface ToastText {
  title: string
  description?: string
}

/** "+1.250 XP" */
export function xpLabel(amount: number): string {
  return `+${formatNumber(amount)} XP`
}

/**
 * Titel-Liste für knappe Texte: "A" · "A und B" · "A, B und C" · "A, B und 2 weitere".
 * Höchstens `max` Titel werden ausgeschrieben.
 */
export function joinTitles(titles: readonly string[], max = 3): string {
  if (titles.length === 0) return ''
  if (titles.length === 1) return titles[0]
  if (titles.length <= max) return `${titles.slice(0, -1).join(', ')} und ${titles[titles.length - 1]}`
  const rest = titles.length - (max - 1)
  return `${titles.slice(0, max - 1).join(', ')} und ${formatNumber(rest)} weitere`
}

/**
 * XP-Toast: "+20 XP" · "Lesen" (bzw. mehrere Quests, "Nachgetragen: …", Bonus-Hinweis).
 * Höchstens zwei Titel werden ausgeschrieben – der Toast soll auch auf schmalen Handys kompakt bleiben.
 */
export function xpToastText(
  amount: number,
  quests: readonly XpQuest[],
  bonusXp: number,
  backfill = false,
): ToastText {
  const parts: string[] = []
  const titles = joinTitles(
    quests.map((quest) => quest.title),
    2,
  )
  if (titles === '') parts.push('Nachgetragene Quest')
  else parts.push(backfill ? `Nachgetragen: ${titles}` : titles)
  if (bonusXp > 0) parts.push(`inkl. ${formatNumber(bonusXp)} Bonus-XP`)
  return { title: xpLabel(amount), description: parts.join(' · ') }
}

export function perfectDayToastText(event: PerfectDayEvent): ToastText {
  const bonus = `+${formatNumber(event.bonusXp)} Bonus-XP`
  return event.today
    ? { title: `Perfekter Tag! ${bonus}`, description: 'Alle heutigen Pflicht-Quests erfüllt.' }
    : { title: `Perfekter Tag! ${bonus}`, description: 'Nachgetragen – ein vergangener Tag ist jetzt makellos.' }
}

export function chapterToastText(event: ChapterCompletedEvent): ToastText {
  return {
    title: `Kapitel abgeschlossen: ${event.chapterTitle} · ${xpLabel(event.xp)}`,
    description: event.campaignTitle,
  }
}

/** "Intelligenz steigt auf Stufe 3" · "Noch 61 XP bis Stufe 4" (das Emoji kommt ins Toast-Icon). */
export function attributeToastText(event: AttributeLevelUpEvent): ToastText {
  const remaining = Math.max(0, Math.ceil(event.xpForNextLevel - event.xpIntoLevel))
  return {
    title: `${ATTRIBUTES[event.attribute].name} steigt auf Stufe ${formatNumber(event.to)}`,
    description: `Noch ${formatNumber(remaining)} XP bis Stufe ${formatNumber(event.to + 1)}`,
  }
}

/** Der nächste Rang oberhalb von `level` – `undefined` auf dem höchsten Rang. */
export function nextRank(level: number): { title: string; minLevel: number } | undefined {
  let best: { title: string; minLevel: number } | undefined
  for (const rank of RANKS) {
    if (rank.minLevel > level && (best === undefined || rank.minLevel < best.minLevel)) best = rank
  }
  return best
}

/** Untertitel der Level-Up-Szene, wenn sich der Rang nicht geändert hat. */
export function rankHint(level: number, rank: string): string {
  const upcoming = nextRank(level)
  if (!upcoming) return `Dein Rang: ${rank}`
  const levels = upcoming.minLevel - level
  return levels === 1
    ? `Nur noch 1 Level bis zum Rang ${upcoming.title}`
    : `Noch ${formatNumber(levels)} Level bis zum Rang ${upcoming.title}`
}
