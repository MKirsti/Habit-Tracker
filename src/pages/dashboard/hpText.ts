/**
 * Texte und kleine Berechnungen rund um die Lebenspunkte auf der Tagesübersicht (Phase 2b): Helden-Kopf,
 * Vorschau für gestern, Ruhetag, Einführung. Rein (ohne React), damit einzeln testbar.
 *
 * Ton: warm und ermutigend, nie beschämend – Lebenspunkte sind eine sanfte Tageswertung, keine Strafe pro Quest.
 */
import { BALANCING } from '../../domain/balancing'
import { compareDays, diffDays, formatDay } from '../../domain/dates'
import { scoreByProgress } from '../../domain/hp'
import type { DayKey, DayScore, HpLedgerEntry, HpState, RestPeriod } from '../../domain/types'
import { formatNumber } from '../../ui'

/** Unter diesem Anteil (25 %) erscheint im Helden-Kopf ein leiser Hinweis – keine Alarmfarben. */
export const LOW_HP_RATIO = 0.25

/** "42 / 55 HP" */
export function hpNumbers(current: number, max: number): string {
  return `${formatNumber(Math.max(0, Math.round(current)))} / ${formatNumber(Math.max(0, Math.round(max)))} HP`
}

/** Vorgelesener Stand: "42 von 55 Lebenspunkten". */
export function hpValueText(current: number, max: number): string {
  return `${formatNumber(Math.max(0, Math.round(current)))} von ${formatNumber(Math.max(0, Math.round(max)))} Lebenspunkten`
}

/**
 * HP-Änderung mit echtem Minuszeichen: +10 → "+10 HP", −3 → "−3 HP", 0 → "±0 HP". Zahl und „HP“ trennt ein
 * geschütztes Leerzeichen – sie brechen nie auseinander.
 */
export function hpDeltaLabel(delta: number): string {
  if (!Number.isFinite(delta) || delta === 0) return '±0\u00a0HP'
  return `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(Math.round(delta)))}\u00a0HP`
}

/** Vorgelesene HP-Änderung: "minus 3 Lebenspunkte", "plus 10 Lebenspunkte". */
export function hpDeltaSpoken(delta: number): string {
  const amount = formatNumber(Math.abs(Math.round(delta)))
  const unit = Math.abs(Math.round(delta)) === 1 ? 'Lebenspunkt' : 'Lebenspunkte'
  return `${delta < 0 ? 'minus' : 'plus'} ${amount} ${unit}`
}

/** Vorrat an Streak-Schutz im Helden-Kopf, ausgeschrieben: „2 Streak-Schutz im Beutel – fangen schwache Tage auf“. */
export function freezeStockTitle(count: number): string {
  const n = Math.max(0, Math.round(count))
  return `${formatNumber(n)} Streak-Schutz im Beutel – ${n === 1 ? 'fängt einen schwachen Tag' : 'fangen schwache Tage'} auf`
}

/** Niedrige HP (unter 25 %, aber Lebenspunkte aktiv). */
export function isLowHp(hp: Pick<HpState, 'enabled' | 'ratio'>): boolean {
  return hp.enabled && Number.isFinite(hp.ratio) && hp.ratio < LOW_HP_RATIO
}

/** Leiser Hinweis bei niedrigen HP – ermutigend, mit dem Weg nach oben. */
export function lowHpHint(): string {
  return `Etwas angeschlagen – ein Perfekter Tag heilt ${hpDeltaLabel(BALANCING.hpByScore.perfect)}.`
}

let weekdayFormatter: Intl.DateTimeFormat | undefined

/** Wochentag eines Spieltags: "Sonntag". */
export function weekdayName(day: DayKey): string {
  weekdayFormatter ??= new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'long' })
  return weekdayFormatter.format(new Date(`${day}T00:00:00Z`))
}

/** Ruhige Notiz zur letzten Abrechnung im Helden-Kopf („Sonntag: −3 HP“). */
export interface SettlementNote {
  day: DayKey
  /** Sichtbar, z. B. "Sonntag: −3 HP" oder "Sonntag: ❄️ aufgefangen". */
  text: string
  /** Vorgelesen, z. B. "Sonntag abgerechnet: minus 3 Lebenspunkte". */
  spoken: string
  /** Richtung der Änderung – nur für dezente Tönung (nie Alarm). */
  tone: 'down' | 'up' | 'neutral'
}

/** Wertungen, deren Name in der Notiz mitklingt – Erfolge werden benannt, Verluste bleiben eine leise Zahl. */
const NAMED_IN_NOTE: ReadonlySet<DayScore> = new Set(['perfect', 'good'])

/**
 * Die letzte (routinemäßige) Abrechnung als Notiz für den Helden-Kopf – statt eines Toasts. Nur mit Lebenspunkten,
 * nur für einen frisch abgerechneten Tag (höchstens drei Tage her) und nur, wenn er etwas bewirkt hat: eine
 * HP-Änderung, ein aufgefangener Tag (Streak-Schutz) oder eine Niederlage (dann „wieder bei voller Kraft“).
 * Bewusst ungleich gewichtet: Ein guter oder perfekter Tag wird beim Namen genannt („Montag: Perfekter Tag · +10 HP“),
 * ein schwächerer Tag bleibt eine ruhige Zahl („Montag: −3 HP“). Nach einer längeren Pause (`absent`) heißt die Notiz
 * den Helden willkommen.
 */
export function settlementNote(
  hp: Pick<HpState, 'enabled' | 'settledThrough'>,
  ledger: readonly HpLedgerEntry[] | undefined,
  today: DayKey,
): SettlementNote | undefined {
  if (!hp.enabled || hp.settledThrough === undefined) return undefined
  const entry = (ledger ?? []).find((candidate) => candidate.day === hp.settledThrough)
  if (entry === undefined || entry.penalties !== true) return undefined
  const age = diffDays(entry.day, today)
  if (!(age >= 1 && age <= BALANCING.backfillDays + 2)) return undefined
  const name = weekdayName(entry.day)
  if (entry.defeat !== undefined) {
    return {
      day: entry.day,
      text: `${name}: gefallen – wieder bei voller Kraft`,
      spoken: `${name}: Lebenspunkte auf null gefallen, jetzt wieder voll`,
      tone: 'neutral',
    }
  }
  if (entry.frozen) {
    return {
      day: entry.day,
      text: `${name}: ❄️ vom Streak-Schutz aufgefangen`,
      spoken: `${name}: vom Streak-Schutz aufgefangen, keine Lebenspunkte verloren`,
      tone: 'neutral',
    }
  }
  if (entry.score === 'absent') {
    return {
      day: entry.day,
      text: 'Willkommen zurück – schön, dass du da bist!',
      spoken: 'Willkommen zurück – schön, dass du da bist! Während deiner Pause ruhen die Lebenspunkte.',
      tone: 'up',
    }
  }
  const delta = Number.isFinite(entry.hpDelta) ? Math.round(entry.hpDelta) : 0
  if (delta === 0) return undefined
  const label = delta > 0 && NAMED_IN_NOTE.has(entry.score) ? DAY_SCORE_LABELS[entry.score] : undefined
  return {
    day: entry.day,
    text: `${name}: ${label !== undefined ? `${label} · ` : ''}${hpDeltaLabel(delta)}`,
    spoken: `${name} abgerechnet: ${label !== undefined ? `${label}, ` : ''}${hpDeltaSpoken(delta)}`,
    tone: delta < 0 ? 'down' : 'up',
  }
}

/** Vorschau für den noch offenen Vortag (Tagespanel). */
export interface YesterdayPreview {
  title: string
  text: string
  /** Wirkung, falls es so bleibt, z. B. "Bleibt es so: −3 HP" – fehlt, wenn ein Streak-Schutz greift. */
  effect?: string
  /** Ein Streak-Schutz würde den Tag auffangen. */
  savedByFreeze: boolean
}

/**
 * Vorschau für gestern – nur, wenn sie relevant ist: Der Tag würde Lebenspunkte kosten (`threatenedDelta < 0`) oder
 * ein Streak-Schutz müsste ihn auffangen. Freundlich formuliert – sie geht davon aus, dass du etwas geschafft und nur
 * nicht abgehakt hast –, mit dem Weg zum Nachtragen (und, auf der Tagesübersicht, zum Ruhetag für gestern).
 */
export function yesterdayPreview(yesterday: HpState['yesterday']): YesterdayPreview | undefined {
  if (yesterday === undefined) return undefined
  if (yesterday.savedByFreeze) {
    return {
      title: 'Gestern ist noch offen',
      // Geschützter Bindestrich: „HP-|Verlust“ bricht nicht um.
      text: 'Schon erledigt? Dann trag es nach – sonst fängt ❄️ ein Streak-Schutz den Tag auf, ganz ohne HP\u2011Verlust.',
      savedByFreeze: true,
    }
  }
  if (!(yesterday.threatenedDelta < 0)) return undefined
  return {
    title: 'Gestern ist noch offen',
    text: 'Schon erledigt, nur nicht abgehakt? Trag es noch nach.',
    effect: `Bleibt es so: ${hpDeltaLabel(yesterday.threatenedDelta)}`,
    savedByFreeze: false,
  }
}

/**
 * Text der Rückfrage „Gestern als Ruhetag eintragen?“ (aus der Vorschau für gestern): für den Krankheitstag, die Reise,
 * die Pause, die man gestern gebraucht hat. Würde sonst ein Streak-Schutz greifen, bleibt er im Beutel.
 */
export function yesterdayRestConfirmText(savedByFreeze: boolean): string {
  const base =
    'Krank, unterwegs oder einfach eine Pause gebraucht? Dann zählt gestern als Ruhetag: Nichts war Pflicht, deine ' +
    'Serien bleiben bestehen und deine Lebenspunkte unberührt. Was du gestern erledigt hast, bringt weiter XP.'
  return savedByFreeze ? `${base} Dein ❄️ Streak-Schutz bleibt im Beutel.` : base
}

/** Zwischenziel auf dem Weg zum Perfekten Tag (nur mit Lebenspunkten): ab der Hälfte ist es ein guter Tag. */
export interface GoodDayMilestone {
  /** Die Hälfte ist geschafft – der Tag ist schon gut. */
  reached: boolean
  /** Sichtbar, z. B. "Ab 4 von 7: guter Tag · +2 HP" bzw. "Guter Tag geschafft · +2 HP". */
  text: string
}

/**
 * Zwischenziel „guter Tag“ für die Tagesbilanz: Wer nur die Hälfte schafft, verliert keine Lebenspunkte, sondern
 * gewinnt welche – das soll auf einen Blick zu sehen sein. Nach denselben Regeln wie die Abrechnung
 * (`scoreByProgress`). `undefined` ohne Zwischenstufe (eine einzige Tagesquest) und sobald der Tag perfekt ist.
 */
export function goodDayMilestone(requiredCount: number, requiredDone: number): GoodDayMilestone | undefined {
  if (!(requiredCount >= 2) || scoreByProgress(requiredCount, requiredDone) === 'perfect') return undefined
  const gain = hpDeltaLabel(BALANCING.hpByScore.good)
  if (scoreByProgress(requiredCount, requiredDone) === 'good') return { reached: true, text: `Guter Tag geschafft · ${gain}` }
  let needed = Math.max(0, Math.floor(requiredDone))
  while (needed < requiredCount && scoreByProgress(requiredCount, needed) !== 'good') needed++
  if (needed >= requiredCount) return undefined
  return {
    reached: false,
    text: `Ab ${formatNumber(needed)} von ${formatNumber(requiredCount)}: guter Tag · ${gain}`,
  }
}

/** Kurzname einer Tageswertung (für den Nachtrag-Hinweis). */
export const DAY_SCORE_LABELS: Record<DayScore, string> = {
  perfect: 'Perfekter Tag',
  good: 'Gut geschafft',
  weak: 'Ein Anfang',
  missed: 'Noch nichts erledigt',
  rest: 'Ruhetag',
  none: 'Keine Tagesquests',
  absent: 'Pause',
}

/**
 * Stand beim Nachtragen für gestern (im Hinweis „Du trägst für gestern nach“): "Stand jetzt: −3 HP",
 * "Stand jetzt: +2 HP" – oder der Streak-Schutz. `undefined` ohne HP-Wirkung (keine Tagesquests, Ruhetag …).
 */
export function backfillStanding(yesterday: HpState['yesterday']): string | undefined {
  if (yesterday === undefined) return undefined
  if (yesterday.savedByFreeze) return 'Stand jetzt: ❄️ ein Streak-Schutz fängt den Tag auf'
  if (yesterday.threatenedDelta === 0) return undefined
  return `Stand jetzt: ${hpDeltaLabel(yesterday.threatenedDelta)} · ${DAY_SCORE_LABELS[yesterday.score]}`
}

// ---------------------------------------------------------------------------
// Rast
// ---------------------------------------------------------------------------

/** Ruhetag (ein Tag) oder Urlaub (mehrere Tage). */
export function restKindLabel(period: Pick<RestPeriod, 'from' | 'until'>): 'Ruhetag' | 'Urlaub' {
  return period.from === period.until ? 'Ruhetag' : 'Urlaub'
}

/** Kopfzeile des Ruhetag-Banners: "Ruhetag", "Urlaub · bis Freitag, 6. Nov." bzw. für gestern "Gestern war Ruhetag". */
export function restBannerTitle(period: Pick<RestPeriod, 'from' | 'until'>, day: DayKey, today: DayKey): string {
  const kind = restKindLabel(period)
  if (day !== today) return kind === 'Ruhetag' ? 'Gestern war Ruhetag' : 'Gestern war Urlaub'
  if (kind === 'Ruhetag') return 'Heute ist Ruhetag'
  const last = compareDays(period.until, today) === 0
  return last ? 'Urlaub · letzter Tag' : `Urlaub · bis ${weekdayName(period.until)}, ${formatDay(period.until, 'short')}`
}

/**
 * Erklärung im Ruhetag-Banner – mit einem warmen Wunsch vorweg („Erhol dich gut!“ bzw. im Urlaub „Genieß die Zeit!“);
 * Quests bleiben erledigbar.
 */
export function restBannerText(day: DayKey, today: DayKey, period?: Pick<RestPeriod, 'from' | 'until'>): string {
  if (day !== today) return 'Nichts war Pflicht – nachgetragene Quests bringen trotzdem XP.'
  const wish = period !== undefined && restKindLabel(period) === 'Urlaub' ? 'Genieß die Zeit!' : 'Erhol dich gut!'
  return `${wish} Nichts ist heute Pflicht – deine Serien und Lebenspunkte ruhen mit. Lust auf eine Quest? XP gibt es trotzdem.`
}

/**
 * Text der Rückfrage „Heute Ruhetag einlegen?“. Mit schon erledigten Tagesquests (`hasProgress`) der Hinweis, dass es
 * an einem Ruhetag keinen Perfekten Tag gibt.
 */
export function restConfirmText(hasProgress: boolean): string {
  const base =
    'Deine Quests ruhen heute: Nichts ist Pflicht, deine Serien bleiben bestehen und deine Lebenspunkte unberührt. ' +
    'Du kannst trotzdem Quests erledigen – XP zählen wie immer.'
  return hasProgress ? `${base} Einen Perfekten Tag gibt es an einem Ruhetag allerdings nicht.` : base
}

/** Kann der Ruhetag von heute direkt wieder aufgehoben werden? Nur ein eintägiger Ruhetag genau heute. */
export function canUndoRestToday(period: Pick<RestPeriod, 'from' | 'until'> | undefined, today: DayKey): boolean {
  return period !== undefined && period.from === today && period.until === today
}

// ---------------------------------------------------------------------------
// Einführung „Neu: Lebenspunkte“
// ---------------------------------------------------------------------------

/**
 * Die Punkte der Einführungskarte – kurz (die Karte steht auf dem Handy über den Quests), Zahlen aus `BALANCING`.
 * Das Gute zuerst: Heilung vor dem Höchstverlust, die Pause vor der Niederlage.
 */
export function hpIntroPoints(): { title: string; text: string }[] {
  const { hpByScore, absentAfterDays, defeatGoldLoss } = BALANCING
  // Geschütztes Leerzeichen: „15 %“ bricht nie auseinander.
  const percent = `${formatNumber(Math.round(defeatGoldLoss * 100))}\u00a0%`
  return [
    {
      title: 'Eine Wertung pro Tag',
      text:
        `egal wie viele Quests: Ein Perfekter Tag heilt ${hpDeltaLabel(hpByScore.perfect)}, die Hälfte bringt ` +
        `${hpDeltaLabel(hpByScore.good)}, sonst höchstens ${hpDeltaLabel(hpByScore.missed)}.`,
    },
    { title: 'Wochenquests', text: 'kosten nie Lebenspunkte.' },
    { title: 'Gnadenfrist', text: 'Gestern kannst du noch nachtragen.' },
    {
      title: 'Pause',
      text: `Krank oder unterwegs? Ein Ruhetag schont Lebenspunkte und Serien – ab dem ${formatNumber(absentAfterDays + 1)}. Tag ohne Quest ruhen sie ohnehin.`,
    },
    {
      title: 'Bei 0 HP',
      text: `stehst du mit vollen Lebenspunkten wieder auf. ${percent} deines Goldes sind dann weg – Level, XP und Serien bleiben.`,
    },
  ]
}
