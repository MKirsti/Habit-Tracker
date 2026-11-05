/**
 * Anzeige der Heldenklasse (Held → Übersicht, Klassen-Karte): warum diese Klasse, Klassen-Bonus, Angriffskraft je
 * Attribut, die Klasse ab nächster Woche und mögliche nächste Klassen. Rein (ohne React), damit einzeln testbar.
 *
 * Grundlage sind die Regeln aus `domain/combat/classes.ts` (`heroClassIdFor`, mit Trägheit `heroClassIdWithInertia`) –
 * hier wird nichts neu entschieden, nur erklärt und vorausgerechnet. Hält die Trägheit eine Klasse, die neu ermittelt
 * anders wäre, sagt „Warum“ genau das (statt einen Vorsprung zu behaupten, den es nicht gibt). Die Klasse der Woche hängt am Stand zu Wochenbeginn (`HeroClassState.attributeLevels`);
 * Vorschau und Wege rechnen mit dem **aktuellen** Stand (`GameState.attributes`), denn der zählt ab dem nächsten Montag.
 *
 * Texte in Du-Form und für alle Sprachformen gleich (Klassennamen kommen in der Form des Helden über
 * `classNameFor`) – ohne Artikel vor dem Klassennamen, damit „Erzmagierin“, „Erzmagier“ und „Sternengeist“ gleich
 * gut passen.
 */
import { ATTRIBUTES, ATTRIBUTE_IDS } from '../../domain/attributes'
import { BALANCING } from '../../domain/balancing'
import { ATTACK_NAMES } from '../../domain/combat/classDefinitions'
import {
  classDefinition,
  heroClassIdFor,
  heroClassIdWithInertia,
  normalizeLevels,
  topAttributes,
} from '../../domain/combat/classes'
import { xpToNextAttributeLevel } from '../../domain/leveling'
import type { AttributeId, HeroClassDefinition, HeroClassId, HeroClassState, LevelInfo } from '../../domain/types'
import { formatNumber } from '../../ui/format'

/** Höchstens so viele Level je Attribut sucht `nextClassPaths` nach einem Klassenwechsel. */
const MAX_PATH_STEPS = 12

/** Ein Attribut mit seinem Level (für „Warum diese Klasse?“). */
export interface AttributeLevelRef {
  id: AttributeId
  level: number
}

export interface ClassReason {
  /** Die zwei stärksten Attribute zu Wochenbeginn (absteigend, Gleichstand → Reihenfolge `ATTRIBUTE_IDS`). */
  top: [AttributeLevelRef, AttributeLevelRef]
  /** Ein Satz in Du-Form. */
  text: string
}

function attributeName(id: AttributeId): string {
  return ATTRIBUTES[id]?.name ?? id
}

function levelWord(count: number): string {
  return count === 1 ? 'ein Level' : `${formatNumber(count)} Level`
}

/** Schluss der Erklärung, wenn die Trägheit die Klasse hält. */
const INERTIA_TEXT = 'nah genug, dass deine Klasse bleibt. So springt sie nicht bei jedem Level hin und her.'

/** Warum der Held diese Woche diese Klasse hat – nach den Regeln aus `classes.ts`. */
export function classReason(heroClass: Pick<HeroClassState, 'definition' | 'attributeLevels'>): ClassReason {
  const levels = normalizeLevels(heroClass.attributeLevels)
  const [first, second] = topAttributes(levels)
  const top: ClassReason['top'] = [
    { id: first, level: levels[first] },
    { id: second, level: levels[second] },
  ]
  const { classMinLevel } = BALANCING.combat
  const attributes = heroClass.definition.attributes
  // Neu ermittelt wäre es eine andere Klasse – die der Vorwoche bleibt (Trägheit gegen Flackern).
  const keptByInertia = attributes.length > 0 && heroClassIdFor(levels) !== heroClass.definition.id

  if (attributes.length === 2) {
    const [a, b] = attributes
    const gap = Math.abs(levels[a] - levels[b])
    if (keptByInertia) {
      const apart = gap === 0 ? 'liegen gleichauf' : `liegen ${levelWord(gap)} auseinander`
      return { top, text: `${attributeName(a)} und ${attributeName(b)} ${apart} – ${INERTIA_TEXT}` }
    }
    const text =
      gap === 0
        ? `${attributeName(a)} und ${attributeName(b)} sind gleich stark – beide auf Level ${formatNumber(levels[a])}.`
        : `${attributeName(a)} und ${attributeName(b)} liegen nur ${levelWord(gap)} auseinander – zusammen ergeben sie diese Hybridklasse.`
    return { top, text }
  }

  if (attributes.length === 1) {
    const [main] = attributes
    if (keptByInertia && main !== first) {
      const behind = Math.max(0, levels[first] - levels[main])
      const position = behind === 0 ? 'liegt gleichauf mit' : `liegt nur ${levelWord(behind)} hinter`
      return { top, text: `${attributeName(main)} ${position} ${attributeName(first)} – ${INERTIA_TEXT}` }
    }
    const runnerUp = main === first ? top[1] : top[0]
    if (runnerUp.level < classMinLevel) {
      return { top, text: `${attributeName(main)} hat als einziges Attribut Level ${formatNumber(classMinLevel)} erreicht.` }
    }
    const lead = levels[main] - runnerUp.level
    return {
      top,
      text: `${attributeName(main)} führt mit ${levelWord(lead)} Vorsprung vor ${attributeName(runnerUp.id)} – für eine Hybridklasse dürften es höchstens ${levelWord(BALANCING.combat.hybridMaxLevelGap)} sein.`,
    }
  }

  // Abenteurer: noch kein Attribut auf Level 3.
  if (top[0].level <= 1) {
    return { top, text: `Noch hat kein Attribut Level ${formatNumber(classMinLevel)} erreicht – alle stehen am Anfang.` }
  }
  return {
    top,
    text: `Noch hat kein Attribut Level ${formatNumber(classMinLevel)} erreicht – am weitesten ist ${attributeName(first)} mit Level ${formatNumber(top[0].level)}.`,
  }
}

/** Klassen-Bonus in Prozent je Attribut (Reihenfolge der Klassen-Attribute). */
export function classBonusEntries(
  heroClass: Pick<HeroClassState, 'definition' | 'classBonus'>,
): { attribute: AttributeId; percent: number }[] {
  return heroClass.definition.attributes.flatMap((attribute) => {
    const bonus = heroClass.classBonus[attribute]
    return bonus !== undefined && Number.isFinite(bonus) && bonus > 0
      ? [{ attribute, percent: Math.round(bonus * 100) }]
      : []
  })
}

/** „+20 % Schaden mit Intelligenz“ / „+10 % Schaden mit Intelligenz und Weisheit“ / Abenteurer: noch keiner. */
export function classBonusText(heroClass: Pick<HeroClassState, 'definition' | 'classBonus'>): string {
  const entries = classBonusEntries(heroClass)
  if (entries.length === 0) {
    // Die erste Klasse kann eine Grund- oder gleich eine Hybridklasse sein – beide Boni nennen, nicht nur +20 %.
    const base = formatNumber(Math.round(BALANCING.combat.classBonus * 100))
    const hybrid = formatNumber(Math.round(BALANCING.combat.hybridClassBonus * 100))
    return `Noch kein Klassenbonus – mit deiner ersten Klasse triffst du härter: +${base} % mit einer Grundklasse, je +${hybrid} % mit einer Hybridklasse.`
  }
  const percent = entries[0].percent
  const same = entries.every((entry) => entry.percent === percent)
  if (same) {
    const names = entries.map((entry) => attributeName(entry.attribute))
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`
    return `+${formatNumber(percent)} % Schaden mit ${list}`
  }
  return entries.map((entry) => `+${formatNumber(entry.percent)} % mit ${attributeName(entry.attribute)}`).join(', ')
}

export interface AttackPower {
  attribute: AttributeId
  /** Angriffsname, z. B. „Arkaner Blitz“. */
  attackName: string
  /** Attribut-Level der Woche. */
  level: number
  /** Faktor auf die Quest-XP: (1 + 10 % je Level über 1) × (1 + Klassen-Bonus) – ohne Schwäche. */
  multiplier: number
  /** Trägt den Klassen-Bonus. */
  boosted: boolean
}

/** Angriffskraft dieser Woche je Attribut (Reihenfolge `ATTRIBUTE_IDS`) – dieselbe Formel wie `attackDamage`. */
export function attackPowers(heroClass: Pick<HeroClassState, 'attributeLevels' | 'classBonus'>): AttackPower[] {
  const levels = normalizeLevels(heroClass.attributeLevels)
  return ATTRIBUTE_IDS.map((attribute) => {
    const level = levels[attribute]
    const raw = heroClass.classBonus[attribute]
    const bonus = raw !== undefined && Number.isFinite(raw) && raw > 0 ? raw : 0
    const multiplier = (1 + BALANCING.combat.attributeBonusPerLevel * (level - 1)) * (1 + bonus)
    return {
      attribute,
      attackName: ATTACK_NAMES[attribute] ?? attributeName(attribute),
      level,
      multiplier: Math.round(multiplier * 100) / 100,
      boosted: bonus > 0,
    }
  })
}

/** „×1,65“ (de-DE, höchstens zwei Nachkommastellen). */
export function formatMultiplier(multiplier: number): string {
  return `×${multiplier.toLocaleString('de-DE', { maximumFractionDigits: 2 })}`
}

/** Aktueller Stand eines Attributs (wie `GameState.attributes[id]`). */
export type AttributeProgress = Pick<LevelInfo, 'level' | 'xpIntoLevel' | 'xpForNextLevel'>

function levelsOf(attributes: Readonly<Record<AttributeId, AttributeProgress>>): Record<AttributeId, number> {
  const levels: Partial<Record<AttributeId, number>> = {}
  for (const id of ATTRIBUTE_IDS) levels[id] = attributes[id]?.level
  return normalizeLevels(levels)
}

/**
 * Die Klasse, die der aktuelle Stand ab dem nächsten Montag ergäbe – nur, wenn sie sich von der laufenden Woche
 * unterscheidet. (Bis Sonntagabend kann sich der Stand noch ändern; Klassen wechseln nur zu Wochenbeginn.) Mit
 * Trägheit wie die Engine: Passt die Klasse dieser Woche noch annähernd, bleibt sie.
 */
export function upcomingClass(
  heroClass: Pick<HeroClassState, 'definition'>,
  attributes: Readonly<Record<AttributeId, AttributeProgress>>,
  definitions?: Readonly<Partial<Record<HeroClassId, HeroClassDefinition>>>,
): HeroClassDefinition | undefined {
  const next = heroClassIdWithInertia(levelsOf(attributes), heroClass.definition.id)
  return next === heroClass.definition.id ? undefined : classDefinition(next, definitions)
}

export interface ClassPath {
  attribute: AttributeId
  /** Auf dieses Level bringen … */
  targetLevel: number
  /** … für diese Klasse. */
  definition: HeroClassDefinition
  /** XP, die dem Attribut bis dahin noch fehlen. */
  xpNeeded: number
}

/** XP, die einem Attribut vom aktuellen Stand bis `targetLevel` fehlen. */
function xpUntil(progress: AttributeProgress, targetLevel: number): number {
  let xp = Math.max(0, progress.xpForNextLevel - progress.xpIntoLevel)
  for (let level = progress.level + 1; level < targetLevel; level++) xp += xpToNextAttributeLevel(level)
  return xp
}

/**
 * Mögliche nächste Klassen: Für jedes Attribut das kleinste höhere Level, mit dem sich die Klasse (ausgehend vom
 * aktuellen Stand, also der Klasse ab nächstem Montag) ändern würde – je Zielklasse der kürzeste Weg, sortiert nach
 * den fehlenden XP (dann Reihenfolge `ATTRIBUTE_IDS`). Beispiel: Intelligenz 6, Weisheit 3 → „Weisheit auf Level 5
 * für Erzmagierin“.
 */
export function nextClassPaths(
  attributes: Readonly<Record<AttributeId, AttributeProgress>>,
  limit = 2,
  definitions?: Readonly<Partial<Record<HeroClassId, HeroClassDefinition>>>,
  /** Klasse dieser Woche: Mit ihr gilt die Trägheit (wie in der Engine) – ohne sie die normale Ermittlung. */
  classId?: HeroClassId,
): ClassPath[] {
  const levels = levelsOf(attributes)
  const classFor = (candidate: Readonly<Record<AttributeId, number>>, previous: HeroClassId | undefined) =>
    previous !== undefined ? heroClassIdWithInertia(candidate, previous) : heroClassIdFor(candidate)
  // Die Klasse ab Montag – von ihr aus hält die Trägheit in den Wochen danach.
  const current = classFor(levels, classId)
  const byClass = new Map<HeroClassId, ClassPath & { order: number }>()
  ATTRIBUTE_IDS.forEach((attribute, order) => {
    const progress: AttributeProgress = attributes[attribute] ?? { level: 1, xpIntoLevel: 0, xpForNextLevel: xpToNextAttributeLevel(1) }
    const start = levels[attribute]
    for (let targetLevel = start + 1; targetLevel <= start + MAX_PATH_STEPS; targetLevel++) {
      const id = classFor({ ...levels, [attribute]: targetLevel }, classId !== undefined ? current : undefined)
      if (id === current) continue
      const xpNeeded = xpUntil({ ...progress, level: start }, targetLevel)
      const known = byClass.get(id)
      if (known === undefined || xpNeeded < known.xpNeeded) {
        byClass.set(id, { attribute, targetLevel, definition: classDefinition(id, definitions), xpNeeded, order })
      }
      break
    }
  })
  return [...byClass.values()]
    .sort((a, b) => a.xpNeeded - b.xpNeeded || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map((path) => ({
      attribute: path.attribute,
      targetLevel: path.targetLevel,
      definition: path.definition,
      xpNeeded: path.xpNeeded,
    }))
}

/** „Bring Weisheit auf Level 5 für Erzmagierin“ (Klassenname in der Form des Helden). */
export function classPathText(path: Pick<ClassPath, 'attribute' | 'targetLevel'>, className: string): string {
  return `Bring ${attributeName(path.attribute)} auf Level ${formatNumber(path.targetLevel)} für ${className}`
}

/** „noch 312 XP“ */
export function xpNeededText(xp: number): string {
  return `noch ${formatNumber(Math.max(0, Math.round(xp)))} XP`
}

/** Hinweis zum Wechsel: Klassen gelten eine Woche lang. */
export const CLASS_WEEK_NOTE =
  'Klassen wechseln nur zu Wochenbeginn: Maßgeblich ist dein Stand am Sonntagabend – so bleibt deine Klasse die ganze Woche über dieselbe.'
