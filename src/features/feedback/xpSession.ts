/**
 * Zusammenfassen schneller XP-Gewinne: Folgt ein Gewinn innerhalb von `XP_MERGE_WINDOW_MS` auf den
 * vorigen, ersetzt ein gemeinsamer Toast („+40 XP · Lesen und Meditieren“) den alten. Rein, damit testbar.
 */
import { questKey } from './feedbackEvents'
import type { XpGainedEvent, XpQuest } from './feedbackEvents'

/** XP-Gewinne, die so dicht (ms) aufeinander folgen, landen in einem gemeinsamen Toast. */
export const XP_MERGE_WINDOW_MS = 1200

export interface XpSession {
  amount: number
  /** Gold dieser XP (Summe der Gewinne). */
  gold: number
  bonusXp: number
  quests: XpQuest[]
  /** Alle Gewinne der Sitzung waren nachgetragen (nicht von heute). */
  backfill: boolean
  /** Zeitpunkt (ms, monoton) des letzten Gewinns. */
  at: number
}

/** Ist die Sitzung zum Zeitpunkt `now` noch offen für weitere Gewinne? */
export function isXpSessionOpen(session: XpSession | null, now: number): session is XpSession {
  return session !== null && now - session.at <= XP_MERGE_WINDOW_MS
}

/**
 * Nächste Sitzung nach einem XP-Gewinn. `merged` = der vorige Toast ist zu ersetzen.
 * Doppelte Quests (z. B. ab- und wieder angehakt) erscheinen nur einmal.
 */
export function nextXpSession(
  previous: XpSession | null,
  event: XpGainedEvent,
  now: number,
): { session: XpSession; merged: boolean } {
  if (!isXpSessionOpen(previous, now)) {
    return {
      session: {
        amount: event.amount,
        gold: event.gold,
        bonusXp: event.bonusXp,
        quests: event.quests,
        backfill: event.backfill,
        at: now,
      },
      merged: false,
    }
  }
  const seen = new Set(previous.quests.map(questKey))
  return {
    session: {
      amount: previous.amount + event.amount,
      gold: previous.gold + event.gold,
      bonusXp: previous.bonusXp + event.bonusXp,
      quests: [...previous.quests, ...event.quests.filter((quest) => !seen.has(questKey(quest)))],
      backfill: previous.backfill && event.backfill,
      at: now,
    },
    merged: true,
  }
}
