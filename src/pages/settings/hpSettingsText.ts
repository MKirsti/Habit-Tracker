/**
 * Texte zur Einstellung „Lebenspunkte“ (Phase 2b) – rein, alle Zahlen aus `BALANCING`. Ton: ruhig und ermutigend;
 * Lebenspunkte sind eine sanfte Tageswertung, keine Strafe pro Quest.
 */
import { BALANCING } from '../../domain/balancing'
import { maxHpForLevel } from '../../domain/hp'
import type { DayScore } from '../../domain/types'
import { formatNumber } from '../../ui/format'
import { DAY_SCORE_LABELS, hpDeltaLabel } from '../dashboard/hpText'

/** Eine Zeile der Tabelle „So wird ein Tag gewertet“. */
export interface DayScoreRow {
  score: DayScore
  /** Name der Wertung (wie auf der Tagesübersicht), z. B. „Gut geschafft“. */
  label: string
  /** Wann sie gilt, z. B. „mindestens die Hälfte deiner Tagesquests“. */
  when: string
  /** HP-Wirkung laut `BALANCING.hpByScore`. */
  delta: number
  /** „+2 HP“, „−1 HP“, „±0 HP“. */
  deltaLabel: string
}

/**
 * Wann eine Wertung gilt – in der Reihenfolge der Tabelle. Ein Name weicht hier von der Tagesübersicht ab, weil die
 * Tabelle Regeln beschreibt statt eines offenen Tages: „Nichts erledigt“ (dort „Noch nichts erledigt“ – man kann ja
 * noch nachtragen). „Pause“ ist die Durchhänger-Pause: Nach `slumpPauseAfterDays` Tagen mit HP-Verlust in Folge kostet
 * kein Tag mehr etwas – bis zum nächsten guten (oder perfekten) Tag.
 */
const SCORE_ORDER: { score: DayScore; when: string; label?: string }[] = [
  { score: 'perfect', when: 'alle Tagesquests erledigt' },
  { score: 'good', when: 'mindestens die Hälfte deiner Tagesquests' },
  { score: 'weak', when: 'weniger als die Hälfte, aber mindestens eine – oder immerhin eine Wochenquest' },
  { score: 'missed', label: 'Nichts erledigt', when: 'gar keine Quest erledigt, auch keine Wochenquest' },
  { score: 'rest', when: 'Ruhetag oder Urlaub – nichts ist Pflicht' },
  { score: 'none', when: 'keine Tagesquest fällig (etwa nur Wochenquests)' },
  {
    score: 'absent',
    // Geschützter Bindestrich: „HP-|Verlust“ bricht nicht um.
    when: `nach ${formatNumber(BALANCING.slumpPauseAfterDays)} Tagen mit HP\u2011Verlust in Folge – bis zu deinem nächsten guten Tag verlierst du keine Lebenspunkte`,
  },
]

/** Die Tageswertungen mit ihrer HP-Wirkung (genau die Zahlen aus `BALANCING.hpByScore`). */
export function dayScoreRows(): DayScoreRow[] {
  return SCORE_ORDER.map(({ score, when, label }) => {
    const delta = BALANCING.hpByScore[score]
    return { score, label: label ?? DAY_SCORE_LABELS[score], when, delta, deltaLabel: hpDeltaLabel(delta) }
  })
}

/**
 * Die wichtigsten Regeln in wenigen Sätzen – das Beruhigende zuerst (Obergrenze, Wochenquests, Pause, Gnadenfrist),
 * dann die Wege nach oben und zum Schutz, zum Schluss die Niederlage (mit ihrer Obergrenze in Gold).
 */
export function hpRuleNotes(): string[] {
  const { hpByScore, hpBase, hpPerLevel, slumpPauseAfterDays, defeatGoldLoss, defeatGoldLossMax, items } = BALANCING
  return [
    `Eine Wertung pro Tag: höchstens ${hpDeltaLabel(hpByScore.missed)}, egal wie viele Quests und Kampagnen du führst.`,
    `Wochenquests kosten nie Lebenspunkte – sie helfen sogar: Erledigst du an einem Tag statt deiner Tagesquests nur eine Wochenquest, zählt er als „${DAY_SCORE_LABELS.weak}“ (${hpDeltaLabel(hpByScore.weak)}) statt „Nichts erledigt“ (${hpDeltaLabel(hpByScore.missed)}).`,
    `Pause: Nach ${formatNumber(slumpPauseAfterDays)} Tagen mit Schaden in Folge ruht der Schaden – bis zu deinem nächsten guten Tag. Ein Durchhänger kostet so höchstens ${hpDeltaLabel(slumpPauseAfterDays * hpByScore.missed)}, und dein ❄️ Streak-Schutz bleibt in der Pause im Beutel.`,
    'Gnadenfrist: Gestern kannst du noch nachtragen – abgerechnet wird ein Tag erst danach.',
    `Heilung: Ein Perfekter Tag heilt ${hpDeltaLabel(hpByScore.perfect)}, ein Level-Aufstieg füllt deine Lebenspunkte ganz auf, ein 🧪 Heiltrank bringt ${hpDeltaLabel(items.healingPotion.heal)}.`,
    'Schutz: Krank oder unterwegs? Ein Ruhetag oder Urlaub (unten unter „Rast & Urlaub“) schont Lebenspunkte und Streaks – auch gestern lässt sich noch als Ruhetag eintragen. Ein ❄️ Streak-Schutz aus der Schatzkammer fängt schwache Tage auf.',
    `Max-HP: ${formatNumber(hpBase)} + ${formatNumber(hpPerLevel)} je Level (Level 1: ${formatNumber(maxHpForLevel(1))} HP).`,
    `Bei 0 HP verlierst du ${formatNumber(Math.round(defeatGoldLoss * 100))}\u00a0% deines Goldes, höchstens ${formatNumber(defeatGoldLossMax)}\u00a0Gold, und stehst mit vollen Lebenspunkten wieder auf – Level, XP und Streaks bleiben immer.`,
  ]
}

/** Hinweis zum Wechseln: jederzeit möglich, nie rückwirkend, nach dem Sanften Modus mit vollen HP. */
export const HP_SWITCH_NOTE =
  'Du kannst jederzeit wechseln. Rückwirkend zählt nichts: Abgerechnete Tage bleiben, wie sie sind – gewertet wird frühestens der Tag, den du noch nachtragen kannst. Nach einer Zeit im Sanften Modus startest du wieder mit vollen Lebenspunkten.'

/** Beschreibung unter dem Schalter – je nach Zustand. */
export function hpSwitchDescription(enabled: boolean): string {
  return enabled
    ? 'An: Jeder Tag bekommt eine sanfte Wertung. Aus: Sanfter Modus – ganz ohne Lebenspunkte.'
    : 'Sanfter Modus: keine Lebenspunkte, kein Schaden, keine Niederlage. XP, Gold und Streaks laufen ganz normal weiter.'
}
