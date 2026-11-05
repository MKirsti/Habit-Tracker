/**
 * Texte des Wochenrückblicks („Bericht des Gildenmeisters“, Phase 3b) auf der Tagesübersicht. Rein (ohne React).
 *
 * Ton: anerkennend und warm. Eine Woche mit weniger XP als die davor bekommt kein Rot und kein „schlechter“ – nur ein
 * ruhiges ▼ mit der Zahl; ein entwischter Boss „ist entwischt“ (kostet ja nichts). Den ermutigenden Satz der Woche
 * liefert die Domain (`WeeklyReview.line`).
 */
import { ATTRIBUTES } from '../../domain/attributes'
import { formatDay } from '../../domain/dates'
import type { DayKey, WeeklyReview } from '../../domain/types'
import { formatNumber } from '../../ui'

/** Überschrift der Karte. */
export const REVIEW_TITLE = 'Bericht des Gildenmeisters'

/** „Woche vom 2. Nov.“ */
export function reviewWeekLabel(weekStart: DayKey): string {
  return `Woche vom ${formatDay(weekStart, 'short')}`
}

/** „+1.240 XP“ */
export function reviewXpLabel(xp: number): string {
  return `+${formatNumber(Math.max(0, Math.round(xp)))} XP`
}

export interface XpChange {
  /** ▲ / ▼ / = */
  arrow: '▲' | '▼' | '='
  /** „12 %“ – ohne Vorzeichen, das zeigt der Pfeil. */
  text: string
  /** Vorgelesen: „12 % mehr als in der Vorwoche“. */
  spoken: string
  trend: 'up' | 'down' | 'same'
}

/** Vergleich mit der Vorwoche – ohne Vergleichswoche `undefined`. */
export function xpChange(percent: number | undefined): XpChange | undefined {
  if (percent === undefined || !Number.isFinite(percent)) return undefined
  const n = Math.round(percent)
  const amount = `${formatNumber(Math.abs(n))} %`
  if (n > 0) return { arrow: '▲', text: amount, spoken: `${amount} mehr als in der Vorwoche`, trend: 'up' }
  if (n < 0) return { arrow: '▼', text: amount, spoken: `${amount} weniger als in der Vorwoche`, trend: 'down' }
  return { arrow: '=', text: 'wie zuvor', spoken: 'genauso viel wie in der Vorwoche', trend: 'same' }
}

/**
 * Vergleich, wie ihn Karte und Tagebuch zeigen: nach einer Woche ohne XP keiner – ein „▼ 100 %“ hilft niemandem,
 * dort spricht nur der ermutigende Satz des Gildenmeisters.
 */
export function reviewXpChange(review: Pick<WeeklyReview, 'xp' | 'xpChangePercent'>): XpChange | undefined {
  if (!(review.xp > 0)) return undefined
  return xpChange(review.xpChangePercent)
}

export interface ReviewStat {
  key: 'quests' | 'perfect' | 'streak' | 'attribute' | 'boss' | 'rest'
  /** Emoji. */
  icon: string
  /** Die Zahl bzw. der Name („23“, „12 Tage“, „Intelligenz“). */
  value: string
  /** Wofür („Quests erledigt“, „Bester Streak“ …). */
  label: string
  /** Optionale Farbe (Hex) des Werts – das stärkste Attribut in seiner Farbe. */
  color?: string
  /** Hervorgehoben (besiegter Boss). */
  highlight?: boolean
}

function days(n: number): string {
  return n === 1 ? '1 Tag' : `${formatNumber(n)} Tage`
}

/** Kachel für eine Woche ohne erledigte Quest (und ohne Ruhetage): ein freundlicher Ausblick statt einer Reihe Nullen. */
export const FRESH_START_STAT: ReviewStat = { key: 'quests', icon: '🌱', value: 'Neue Woche', label: 'neues Abenteuer' }

function restStat(restDays: number): ReviewStat {
  return { key: 'rest', icon: '⛺', value: formatNumber(restDays), label: restDays === 1 ? 'Ruhetag' : 'Ruhetage' }
}

/**
 * Kennzahlen der Woche als kleine Kacheln: erledigte Quests, Perfekte Tage, bester Streak, stärkstes Attribut, Boss
 * (besiegt / entwischt) und – nur wenn es welche gab – Ruhetage.
 *
 * Die Kacheln zeigen, was war – nicht, was fehlte: Zähler mit 0 („0 Perfekte Tage“, „0 Tage Streak“) fallen weg (wer nur
 * Wochenquests hat, hat z. B. nie Perfekte Tage). Eine ganz leere Woche (keine erledigte Quest, keine XP – Nebenquests
 * bringen XP und treffen den Boss, die zählen also) zeigt auch den entwischten Boss nicht – das erzählt der Satz des
 * Gildenmeisters schon sanft. Dann stehen nur die Ruhetage da (Urlaub!) bzw. ein Ausblick.
 */
export function reviewStats(review: WeeklyReview): ReviewStat[] {
  if (!(review.questsCompleted > 0) && !(review.xp > 0)) {
    return review.restDays > 0 ? [restStat(review.restDays)] : [FRESH_START_STAT]
  }
  const stats: ReviewStat[] = []
  if (review.questsCompleted > 0) {
    stats.push({
      key: 'quests',
      icon: '✅',
      value: formatNumber(review.questsCompleted),
      label: review.questsCompleted === 1 ? 'Quest erledigt' : 'Quests erledigt',
    })
  }
  if (review.perfectDays > 0) {
    stats.push({
      key: 'perfect',
      icon: '⭐',
      value: formatNumber(review.perfectDays),
      label: review.perfectDays === 1 ? 'Perfekter Tag' : 'Perfekte Tage',
    })
  }
  if (review.bestStreak > 0) stats.push({ key: 'streak', icon: '🔥', value: days(review.bestStreak), label: 'Bester Streak' })
  const top = review.topAttribute !== undefined ? ATTRIBUTES[review.topAttribute] : undefined
  if (top !== undefined) {
    stats.push({ key: 'attribute', icon: top.icon, value: top.name, label: 'Stärkstes Attribut', color: top.color })
  }
  if (review.boss !== undefined) {
    stats.push({
      key: 'boss',
      icon: review.boss.icon,
      value: review.boss.name,
      label: review.boss.defeated ? 'besiegt – stark!' : 'ist entwischt',
      highlight: review.boss.defeated,
    })
  }
  // Wie Quests und Perfekte Tage: die Zahl, darunter wofür („2 · Ruhetage“ statt „2 Tage · Ruhetage“).
  if (review.restDays > 0) stats.push(restStat(review.restDays))
  return stats
}
