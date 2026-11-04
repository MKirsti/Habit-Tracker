/**
 * Deutsche Texte für die Spiel-Rückmeldungen (Toasts & Feier-Szenen). Rein, damit testbar.
 */
import { ACHIEVEMENT_TIER_LABELS } from '../../domain/achievements/definitions'
import { ATTRIBUTES } from '../../domain/attributes'
import { BALANCING, RANKS } from '../../domain/balancing'
import type { DayKey } from '../../domain/types'
import { formatNumber } from '../../ui'
import type {
  AchievementUnlockedEvent,
  AttributeLevelUpEvent,
  ChapterCompletedEvent,
  PerfectDayEvent,
  XpQuest,
} from './feedbackEvents'
import { settledDayName } from './hpFeedback'
import type { DefeatEvent, FreezeUsedEvent, PotionHealedEvent } from './hpFeedback'

export interface ToastText {
  title: string
  description?: string
}

/** "+1.250 XP" */
export function xpLabel(amount: number): string {
  return `+${formatNumber(amount)} XP`
}

/** "+12 Gold" */
export function goldLabel(amount: number): string {
  return `+${formatNumber(amount)} Gold`
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
 * XP-Toast: "+20 XP · +10 Gold" · "Lesen" (bzw. mehrere Quests, "Nebenquest: …", "Nachgetragen: …",
 * Bonus-Hinweis). Ohne Gold (0) nur die XP. Höchstens zwei Titel werden ausgeschrieben – der Toast soll auch auf
 * schmalen Handys kompakt bleiben.
 */
export function xpToastText(
  amount: number,
  quests: readonly XpQuest[],
  bonusXp: number,
  backfill = false,
  gold = 0,
): ToastText {
  const parts: string[] = []
  const titles = joinTitles(
    quests.map((quest) => quest.title),
    2,
  )
  // Nur Nebenquests: als solche benennen (sie stehen nicht in der Tagesliste).
  const sideOnly = quests.length > 0 && quests.every((quest) => quest.sideQuest)
  const named = sideOnly ? `${quests.length === 1 ? 'Nebenquest' : 'Nebenquests'}: ${titles}` : titles
  if (titles === '') parts.push('Nachgetragene Quest')
  else parts.push(backfill ? `Nachgetragen: ${titles}` : named)
  if (bonusXp > 0) parts.push(`inkl. ${formatNumber(bonusXp)} Bonus-XP`)
  const title = gold > 0 ? `${xpLabel(amount)} · ${goldLabel(gold)}` : xpLabel(amount)
  return { title, description: parts.join(' · ') }
}

/** "+28 Bonus-XP" */
function bonusLabel(bonusXp: number): string {
  return `+${formatNumber(bonusXp)} Bonus-XP`
}

/** Heute: `bonusXp` ist die Tagessumme (wie in der Tagesbilanz), auch nachdem der Bonus gewachsen ist. */
export function perfectDayToastText(event: Pick<PerfectDayEvent, 'bonusXp' | 'today'>): ToastText {
  const title = `Perfekter Tag! ${bonusLabel(event.bonusXp)}`
  return event.today
    ? { title, description: 'Alle heutigen Tagesquests erfüllt.' }
    : { title, description: 'Nachgetragen – ein vergangener Tag ist jetzt makellos.' }
}

/**
 * Kurzer Hinweis, wenn der Bonus eines schon perfekten Tages wächst und der Perfekter-Tag-Toast
 * nicht mehr steht. `bonusXp` ist die neue Tagessumme.
 */
export function bonusGrowthToastText(bonusXp: number): ToastText {
  return { title: `Tagesbonus steigt auf ${bonusLabel(bonusXp)}`, description: 'Perfekter Tag – jede weitere Quest erhöht ihn.' }
}

export function chapterToastText(event: ChapterCompletedEvent): ToastText {
  return {
    title: `Kapitel abgeschlossen: ${event.chapterTitle} · ${xpLabel(event.xp)}`,
    description: event.campaignTitle,
  }
}

/**
 * Erfolgs-Toast: "Ein ganzer Mond · +75 Gold" · "Silber-Erfolg freigeschaltet" (das Emoji kommt ins Toast-Icon,
 * in der Farbe der Stufe). Ohne Gold-Belohnung nur der Titel.
 */
export function achievementToastText(event: Pick<AchievementUnlockedEvent, 'title' | 'tier' | 'gold'>): ToastText {
  return {
    title: event.gold > 0 ? `${event.title} · ${goldLabel(event.gold)}` : event.title,
    description: `${ACHIEVEMENT_TIER_LABELS[event.tier]}-Erfolg freigeschaltet`,
  }
}

/** "Intelligenz steigt auf Level 3" · "Noch 61 XP bis Level 4" (das Emoji kommt ins Toast-Icon). */
export function attributeToastText(event: AttributeLevelUpEvent): ToastText {
  const remaining = Math.max(0, Math.ceil(event.xpForNextLevel - event.xpIntoLevel))
  return {
    title: `${ATTRIBUTES[event.attribute].name} steigt auf Level ${formatNumber(event.to)}`,
    description: `Noch ${formatNumber(remaining)} XP bis Level ${formatNumber(event.to + 1)}`,
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

// ---------------------------------------------------------------------------
// Lebenspunkte (Phase 2b)
// ---------------------------------------------------------------------------

/** "42 / 55 HP" */
export function hpLabel(hp: number, max: number): string {
  return `${formatNumber(hp)} / ${formatNumber(max)} HP`
}

/**
 * Streak-Schutz eingesetzt: "Streak-Schutz eingesetzt" · "Er hat Montag aufgefangen – keine HP verloren, deine Serien
 * bleiben bestehen." (mehrere: "2× Streak-Schutz eingesetzt" · "Sie haben Montag und Dienstag aufgefangen …").
 */
export function freezeToastText(event: Pick<FreezeUsedEvent, 'days'>, today: DayKey): ToastText {
  const count = event.days.length
  const names = joinTitles(event.days.map((day) => settledDayName(day, today)))
  return {
    title: count === 1 ? 'Streak-Schutz eingesetzt' : `${formatNumber(count)}× Streak-Schutz eingesetzt`,
    description: `${count === 1 ? 'Er hat' : 'Sie haben'} ${names} aufgefangen – keine HP verloren, deine Serien bleiben bestehen.`,
  }
}

/** Heiltrank getrunken: "Heiltrank getrunken · +20 HP" · "Lebenspunkte: 42 / 55 HP" (bzw. "… wieder voll: …"). */
export function potionToastText(event: Pick<PotionHealedEvent, 'count' | 'healed' | 'hp' | 'max'>): ToastText {
  const drunk = event.count === 1 ? 'Heiltrank getrunken' : `${formatNumber(event.count)} Heiltränke getrunken`
  return {
    title: event.healed > 0 ? `${drunk} · +${formatNumber(event.healed)} HP` : drunk,
    description:
      event.max > 0 && event.hp >= event.max
        ? `Lebenspunkte wieder voll: ${hpLabel(event.hp, event.max)}`
        : `Lebenspunkte: ${hpLabel(event.hp, event.max)}`,
  }
}

export interface DefeatSceneText {
  eyebrow: string
  title: string
  /** Was passiert ist – würdevoll, ohne Vorwurf. */
  body: string
  /** Zeile unter dem HP-Balken (die Zahlen stehen darüber). */
  hpLine: string
  /** Ermutigung zum Schluss. */
  encouragement: string
  /** Leiser Hinweis auf den Sanften Modus – für den Fall, dass gerade alles zu viel ist. */
  gentleHint: string
}

/**
 * Texte der Niederlage-Szene: „Du bist gefallen – und stehst wieder auf“, das verlorene Gold als Lohn des Heilers
 * (eine Geschichte statt einer Strafe), was bleibt (Level, XP, Serien), die vollen Lebenspunkte und ein leiser Hinweis
 * auf den Sanften Modus. Nie beschämend.
 */
export function defeatSceneText(event: DefeatEvent, today: DayKey): DefeatSceneText {
  const onDay = `am ${settledDayName(event.day, today)}`
  const healer =
    event.goldLost > 0
      ? `Ein Heiler hat dich wieder auf die Beine gebracht – sein Lohn: ${formatNumber(event.goldLost)} Gold.`
      : 'Ein Heiler hat dich wieder auf die Beine gebracht – diesmal ganz ohne Lohn.'
  const times = event.count > 1 ? ` – ${formatNumber(event.count)}× in den letzten Tagen` : ''
  const full = event.max > 0 && event.hp >= event.max
  return {
    eyebrow: 'Ein harter Kampf',
    // Geschütztes Leerzeichen vor dem Gedankenstrich: Er beginnt nie eine Zeile.
    title: 'Du bist gefallen\u00a0– und stehst wieder auf',
    body: `Deine Lebenspunkte sind ${onDay} auf 0 gesunken${times}. ${healer} Level, XP und Serien bleiben dir.`,
    hpLine: full
      ? 'Du stehst mit vollen Lebenspunkten wieder auf.'
      : 'Seitdem hast du weitergekämpft – so stehst du heute da.',
    encouragement: full
      ? 'Heute ist ein neuer Tag – schon eine erledigte Quest ist ein guter Neuanfang.'
      : `Heute ist ein neuer Tag – ein Perfekter Tag heilt +${formatNumber(BALANCING.hpByScore.perfect)} HP.`,
    gentleHint: 'Gerade alles zu viel? Im Sanften Modus (Einstellungen) spielst du ganz ohne Lebenspunkte weiter.',
  }
}
