/**
 * Sätze für den Wochenrückblick – „Bericht des Gildenmeisters“ (Phase 3b): reine Daten plus die Auswahl.
 *
 * `reviewLine(facts, seed)` liefert einen ermutigenden Satz zur Lage der Woche, auf Wunsch mit einem kurzen Nachsatz
 * zum Wochen-Boss (nur wenn `bossDefeated` gesetzt ist: besiegt bzw. entkommen). Die Lage (`reviewSituation`), in
 * dieser Reihenfolge:
 * 1. `rest` – mindestens 4 Ruhetage (Rast/Urlaub): Pause gehört zur Reise.
 * 2. `great` – mindestens 5 Perfekte Tage.
 * 3. `better` – mindestens 10 % mehr XP als in der Woche davor.
 * 4. `quiet` – höchstens 3 erledigte Quests (auch 0): immer aufbauend, nie beschämend. Jeder Satz kennt zwei Fälle:
 *    ohne alles (keine Quest, keine XP) ein sanfter Neuanfang; wer unterwegs war (1–3 Quests oder nur Nebenquests),
 *    bekommt Anerkennung für die kleinen Schritte – nie „lief anders als geplant“, denn wer nur Wochenquests hat (z. B.
 *    3× Sport), schafft so auch eine komplett erfüllte Woche (und besiegt dabei womöglich den Boss).
 * 5. `steady` – alles andere: eine beständige Woche (ohne Vergleich – auch eine Woche unter der Vorwoche ist gut).
 *
 * Boss-Nachsätze sind zeitlos formuliert (kein „nächste Woche“): Der Bericht erscheint erst in der neuen Woche und wird
 * später im Tagebuch nachgelesen – und nach einer Urlaubswoche gibt es womöglich gar keinen neuen Boss.
 *
 * Die Wahl ist deterministisch je `seed` (Held + Woche, siehe `weeklyReview.ts`) per Rendezvous-Hash über die
 * Position in der Liste: Neue Sätze nur **hinten anhängen**, dann behalten fast alle vergangenen Wochen ihren Satz.
 * Regeln für die Texte (geprüft in `reviewLines.test.ts`): Du-Form, warm und verspielt, nie beschämend oder drohend,
 * keine Sprachformen (keine „Held/Heldin“ & Co.). Hauptsatz höchstens 140 Zeichen, Boss-Nachsatz höchstens 100.
 */
import { rendezvousPick } from '../combat/hash'

/** Was der Satz über die Woche wissen muss (aus `weeklyReview.ts`). */
export interface ReviewFacts {
  xp: number
  /** Veränderung gegenüber der Vorwoche in Prozent; fehlt ohne faire Vergleichswoche. */
  xpChangePercent?: number
  perfectDays: number
  questsCompleted: number
  /** Wochen-Boss besiegt (true) bzw. entkommen (false); fehlt ohne bekannten Boss. */
  bossDefeated?: boolean
  restDays: number
}

export type ReviewSituation = 'great' | 'better' | 'steady' | 'rest' | 'quiet'

export const REVIEW_SITUATIONS: readonly ReviewSituation[] = ['great', 'better', 'steady', 'rest', 'quiet']

/** Schwellen der Lage (siehe Dateikopf). */
export const REVIEW_RULES = {
  /** Ab so vielen Ruhetagen ist es eine Rast-Woche. */
  restDays: 4,
  /** Ab so vielen Perfekten Tagen ist es eine großartige Woche. */
  greatPerfectDays: 5,
  /** Ab so viel Prozent mehr XP als in der Vorwoche geht es aufwärts. */
  betterPercent: 10,
  /** Bis zu so vielen erledigten Quests ist es eine ruhige Woche. */
  quietMaxQuests: 3,
} as const

/** Ein Satz: fester Text oder aus den (bereinigten) Fakten gebaut. */
export type ReviewLineTemplate = string | ((facts: ReviewFacts) => string)

function count(value: number, max = Number.POSITIVE_INFINITY): number {
  return Number.isFinite(value) && value > 0 ? Math.min(max, Math.floor(value)) : 0
}

/** Bereinigte Fakten: ganze Zahlen ≥ 0 (Tage höchstens 7), Prozent gerundet, Unsinn fällt weg. */
function normalize(facts: ReviewFacts): ReviewFacts {
  const normalized: ReviewFacts = {
    xp: count(facts.xp),
    perfectDays: count(facts.perfectDays, 7),
    questsCompleted: count(facts.questsCompleted),
    restDays: count(facts.restDays, 7),
  }
  const percent = facts.xpChangePercent
  if (typeof percent === 'number' && Number.isFinite(percent)) {
    const rounded = Math.round(percent)
    normalized.xpChangePercent = rounded === 0 ? 0 : rounded // kein „−0“
  }
  if (typeof facts.bossDefeated === 'boolean') normalized.bossDefeated = facts.bossDefeated
  return normalized
}

const formatNumber = (value: number): string => value.toLocaleString('de-DE')
const formatPercent = (value: number): string => `${formatNumber(value)} %`
/** „eine Quest“ / „3 Quests“ (am Satzanfang groß). */
function questCount(value: number, capitalized = false): string {
  if (value === 1) return capitalized ? 'Eine Quest' : 'eine Quest'
  return `${formatNumber(value)} Quests`
}

/** War der Held in der Woche unterwegs – erledigte Quests oder XP (z. B. nur Nebenquests)? */
function wasActive(facts: ReviewFacts): boolean {
  return facts.questsCompleted > 0 || facts.xp > 0
}

/** Sätze je Lage (je mindestens 4). Neue Sätze nur hinten anhängen (siehe Dateikopf). */
export const REVIEW_LINES: Record<ReviewSituation, readonly ReviewLineTemplate[]> = {
  great: [
    (f) => `${formatNumber(f.perfectDays)} Perfekte Tage in einer Woche – in der Gildenhalle wird schon von dir erzählt.`,
    'Was für eine Woche! Deine Quests hatten gegen dich nicht den Hauch einer Chance.',
    'Diese Woche warst du kaum zu bremsen. Die Barden der Gilde dichten schon an einem Lied über dich.',
    'Eine Woche wie aus einer alten Sage: Tag für Tag warst du zur Stelle. Nimm dir einen Moment, um stolz zu sein.',
    (f) => `${formatNumber(f.perfectDays)} von 7 Tagen perfekt. Das kommt ins Gildenbuch – mit Goldtinte.`,
    'Deine Woche glänzt heller als jede Truhe. Genau so sieht Dranbleiben aus.',
  ],
  better: [
    (f) => `${formatPercent(f.xpChangePercent ?? 0)} mehr XP als in der Woche davor – du bist im Aufwind!`,
    'Du hast dich selbst übertroffen: Diese Woche war stärker als die letzte. Weiter so, Schritt für Schritt.',
    'Es geht aufwärts! Woche für Woche ein bisschen mehr – so werden aus Abenteuern Legenden.',
    (f) => `Plus ${formatPercent(f.xpChangePercent ?? 0)} gegenüber der Vorwoche. Die Gilde sieht genau, wie du wächst.`,
    'Stärker als letzte Woche – und das ist der einzige Vergleich, der wirklich zählt.',
  ],
  steady: [
    'Eine solide Woche voller erledigter Quests. Beständigkeit ist die leiseste und stärkste Magie von allen.',
    (f) => `${questCount(f.questsCompleted, true)} erledigt – Woche für Woche baust du an etwas Großem.`,
    'Du bleibst auf deinem Weg, Woche für Woche. Genau so entstehen Gewohnheiten, die halten.',
    'Kein Feuerwerk nötig: Du bist drangeblieben, und das ist das Geheimnis jedes großen Abenteuers.',
    'Ruhig und beständig wie ein Fluss – und Flüsse formen mit der Zeit ganze Täler.',
  ],
  rest: [
    'Auch die größten Abenteuer brauchen Rastplätze. Schön, dass du dir die Pause gegönnt hast.',
    'Rast gehört zur Reise. Ruhetage brechen keine Serie, und die Gilde hält dir deinen Platz am Feuer warm.',
    'Ausgeruht kämpft es sich am besten. Mit frischer Kraft geht es jetzt weiter.',
    'Urlaub, Rast oder einfach mal Luft holen – alles richtig gemacht. Dein Abenteuer wartet geduldig auf dich.',
    (f) =>
      f.questsCompleted > 0
        ? `Rast eingelegt und trotzdem ${questCount(f.questsCompleted)} erledigt – Erholung und Abenteuer zugleich. Stark!`
        : 'Eine ganze Woche zum Kraftschöpfen. Die Gilde freut sich schon auf deine nächste Quest.',
  ],
  // Je Satz: wer unterwegs war (Quests oder Nebenquests), bekommt Anerkennung, sonst ein sanfter Neuanfang (Dateikopf).
  quiet: [
    (f) =>
      f.questsCompleted > 0
        ? `${questCount(f.questsCompleted, true)} erledigt – kleine Schritte sind auch Schritte, und jeder einzelne zählt.`
        : wasActive(f)
          ? 'Kleine Schritte sind auch Schritte – und jeder einzelne zählt.'
          : 'Manche Wochen laufen anders als geplant – das gehört zu jedem Abenteuer. Die neue Woche ist ein frisches Blatt.',
    (f) =>
      wasActive(f)
        ? 'Leise, aber unterwegs: Auch kleine Schritte tragen dich durch die größten Abenteuer.'
        : 'Ein stiller Abschnitt deiner Reise. Der Weg ist noch da und freut sich auf deinen nächsten Schritt.',
    (f) =>
      wasActive(f)
        ? 'Auch eine leise Woche gehört zur Geschichte. Du bist am Ball geblieben – in deinem eigenen Tempo.'
        : 'Auch eine leise Woche gehört zur Geschichte. Fang ganz klein an – eine einzige Quest ist schon ein Sieg.',
    (f) =>
      wasActive(f)
        ? 'Schritt für Schritt geht die Reise weiter, ganz ohne Eile. Die Gilde glaubt an dich.'
        : 'Selbst die längste Reise geht mit einem einzigen Schritt weiter. Die Gilde glaubt an dich.',
    (f) =>
      wasActive(f)
        ? 'Durchatmen und trotzdem dranbleiben – genau diese Mischung trägt durch lange Abenteuer.'
        : 'Durchatmen ist erlaubt. Wann immer du bereit bist, wartet dein Abenteuer genau dort, wo du es abgelegt hast.',
    (f) =>
      f.questsCompleted > 0
        ? `${questCount(f.questsCompleted, true)} in einer ruhigen Woche – jede einzelne ist ein Funke, der weiterglüht.`
        : wasActive(f)
          ? 'Jede kleine Tat dieser Woche ist ein Funke, der weiterglüht.'
          : 'Aus jeder Glut kann wieder ein Feuer werden. Ein kleiner Funke genügt – vielleicht schon heute?',
  ],
}

/** Nachsätze zum Wochen-Boss (je mindestens 4) – ein Entkommen ist halb so wild und kostet nichts. */
export const BOSS_REVIEW_LINES: { readonly defeated: readonly string[]; readonly escaped: readonly string[] } = {
  defeated: [
    'Und der Wochen-Boss? Liegt besiegt im Staub.',
    'Ganz nebenbei hast du auch noch den Wochen-Boss bezwungen.',
    'Der Wochen-Boss wird noch lange von dir erzählen.',
    'Den Wochen-Boss hast du ebenfalls besiegt – seine Truhe ist wohlverdient.',
    'Auch der Wochen-Boss musste sich dir geschlagen geben.',
  ],
  escaped: [
    'Der Wochen-Boss ist diesmal entwischt – halb so wild, der nächste Kampf kommt bestimmt.',
    'Der Wochen-Boss hat sich davongeschlichen. Soll er – du ziehst weiter.',
    'Dem Wochen-Boss ist die Flucht geglückt. Vermutlich hat er gehört, dass du wiederkommst.',
    'Der Wochen-Boss hat das Weite gesucht. Neue Gegner gibt es genug – und mit ihnen neue Truhen.',
    'Der Wochen-Boss konnte entkommen – ein Kampf für ein andermal.',
  ],
}

/** Lage der Woche (siehe Dateikopf). */
export function reviewSituation(facts: ReviewFacts): ReviewSituation {
  const f = normalize(facts)
  if (f.restDays >= REVIEW_RULES.restDays) return 'rest'
  if (f.perfectDays >= REVIEW_RULES.greatPerfectDays) return 'great'
  if (f.xpChangePercent !== undefined && f.xpChangePercent >= REVIEW_RULES.betterPercent) return 'better'
  if (f.questsCompleted <= REVIEW_RULES.quietMaxQuests) return 'quiet'
  return 'steady'
}

/** Deterministische Wahl aus einer Liste (Rendezvous-Hash über die Position). */
function pick<T>(pool: readonly T[], key: string): T {
  const index = rendezvousPick(
    pool.map((_, position) => position),
    key,
    (position) => String(position),
  )
  return pool[index ?? 0]
}

function render(template: ReviewLineTemplate, facts: ReviewFacts): string {
  return typeof template === 'string' ? template : template(facts)
}

/**
 * Ermutigender Satz zur Woche, deterministisch je `seed`: Satz zur Lage, bei bekanntem Boss gefolgt vom Nachsatz
 * „besiegt“ bzw. „entkommen“.
 */
export function reviewLine(facts: ReviewFacts, seed: string): string {
  const f = normalize(facts)
  const situation = reviewSituation(f)
  const key = String(seed)
  const main = render(pick(REVIEW_LINES[situation], `${key}:review:${situation}`), f)
  if (f.bossDefeated === undefined) return main
  const boss = pick(f.bossDefeated ? BOSS_REVIEW_LINES.defeated : BOSS_REVIEW_LINES.escaped, `${key}:review:boss`)
  return `${main} ${boss}`
}
