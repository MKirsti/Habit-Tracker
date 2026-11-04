/**
 * Gemeinsame Texte rund um Klasse, Angriffe, Titel und Truhen (Phase 3a) – rein, ohne React.
 * Genutzt vom Truhen-Dialog, den Szenen in `features/feedback` und allen Seiten, die Klassen/Titel nennen.
 *
 * Sprachform: Klassen- und Titelnamen erscheinen immer in der Form des Helden (`CharacterProfile.form`, fehlt =
 * neutral). Wo ein Name gebeugt werden müsste („zur Erzmagierin“), steht er in einer Tabelle (`CLASS_DATIVES`) –
 * die neutralen Namen sind Bilder („Sternengeist“, „Arkane Seele“) mit eigenem Geschlecht. Fehlt ein Eintrag (oder
 * passt er nicht mehr zum Namen), weichen die Texte auf eine Wendung mit „als …“ aus, die keine Beugung braucht.
 */
import { ATTRIBUTES } from '../../domain/attributes'
import { RARITY_LABELS } from '../../domain/combat/cosmeticDefinitions'
import { ATTACK_NAMES } from '../../domain/combat/classDefinitions'
import { classNameFor } from '../../domain/combat/classes'
import { titleNameFor } from '../../domain/combat/cosmetics'
import type {
  AttackEvent,
  AttributeId,
  ChestRarity,
  GrammaticalForm,
  HeroClassDefinition,
  HeroClassId,
  TitleDefinition,
} from '../../domain/types'
import { formatNumber } from '../../ui/format'

// ---------------------------------------------------------------------------
// Klasse & Titel in der Sprachform
// ---------------------------------------------------------------------------

/** Name einer Klasse in der Sprachform (fehlt → neutral): „Magierin“ / „Magier“ / „Arkane Seele“. */
export function classNameIn(definition: Pick<HeroClassDefinition, 'names'>, form?: GrammaticalForm): string {
  return classNameFor(definition, form)
}

/** Klasse mit Symbol in der Sprachform: `{ icon: '🔮', name: 'Magierin' }`. */
export function classLabelIn(definition: Pick<HeroClassDefinition, 'names' | 'icon'>, form?: GrammaticalForm) {
  return { icon: definition.icon, name: classNameFor(definition, form) }
}

/** Titel in der Sprachform (fehlt → neutral): „die Unbeugsame“ / „der Unbeugsame“ / „unbeugsamen Herzens“. */
export function titleNameIn(title: Pick<TitleDefinition, 'names'>, form?: GrammaticalForm): string {
  return titleNameFor(title, form)
}

/** Held mit Titel, wie er hinter dem Namen steht: „Aria, die Zeitlose“. */
export function heroWithTitle(name: string, title: Pick<TitleDefinition, 'names'>, form?: GrammaticalForm): string {
  return `${name}, ${titleNameFor(title, form)}`
}

/**
 * Klassennamen im Dativ mit Artikel – für „Du bist zur Erzmagierin aufgestiegen!“. `name` ist der Name, zu dem der
 * Eintrag gehört: Ändert sich ein Name in den Definitionen, passt der Eintrag nicht mehr und der Text weicht aus
 * (geprüft in `combatText.test.ts`). Bewusst nur Hybride – aufsteigen kann man nur zu ihnen – und nur Namen, deren
 * Dativ natürlich klingt („zum Trommelherz“ fehlt deshalb).
 */
export const CLASS_DATIVES: Partial<Record<HeroClassId, Partial<Record<GrammaticalForm, { name: string; dative: string }>>>> = {
  battlemage: {
    female: { name: 'Kampfmagierin', dative: 'zur Kampfmagierin' },
    male: { name: 'Kampfmagier', dative: 'zum Kampfmagier' },
    neutral: { name: 'Arkane Klinge', dative: 'zur Arkanen Klinge' },
  },
  monk: {
    female: { name: 'Mönchin', dative: 'zur Mönchin' },
    male: { name: 'Mönch', dative: 'zum Mönch' },
    neutral: { name: 'Stille Faust', dative: 'zur Stillen Faust' },
  },
  bannerbearer: {
    female: { name: 'Bannerträgerin', dative: 'zur Bannerträgerin' },
    male: { name: 'Bannerträger', dative: 'zum Bannerträger' },
    neutral: { name: 'Leuchtfeuer', dative: 'zum Leuchtfeuer' },
  },
  berserker: {
    female: { name: 'Berserkerin', dative: 'zur Berserkerin' },
    male: { name: 'Berserker', dative: 'zum Berserker' },
    neutral: { name: 'Urgewalt', dative: 'zur Urgewalt' },
  },
  knight: {
    female: { name: 'Ritterin', dative: 'zur Ritterin' },
    male: { name: 'Ritter', dative: 'zum Ritter' },
    neutral: { name: 'Ehrenklinge', dative: 'zur Ehrenklinge' },
  },
  archmage: {
    female: { name: 'Erzmagierin', dative: 'zur Erzmagierin' },
    male: { name: 'Erzmagier', dative: 'zum Erzmagier' },
    neutral: { name: 'Sternengeist', dative: 'zum Sternengeist' },
  },
  illusionist: {
    female: { name: 'Illusionistin', dative: 'zur Illusionistin' },
    male: { name: 'Illusionist', dative: 'zum Illusionisten' },
    neutral: { name: 'Zauberhand', dative: 'zur Zauberhand' },
  },
  healer: {
    female: { name: 'Heilkundige', dative: 'zur Heilkundigen' },
    male: { name: 'Heilkundiger', dative: 'zum Heilkundigen' },
    neutral: { name: 'Heilende Hand', dative: 'zur Heilenden Hand' },
  },
  runesmith: {
    female: { name: 'Runenschmiedin', dative: 'zur Runenschmiedin' },
    male: { name: 'Runenschmied', dative: 'zum Runenschmied' },
    neutral: { name: 'Runengenie', dative: 'zum Runengenie' },
  },
  seer: {
    female: { name: 'Seherin', dative: 'zur Seherin' },
    male: { name: 'Seher', dative: 'zum Seher' },
    neutral: { name: 'Orakel', dative: 'zum Orakel' },
  },
  shaman: {
    female: { name: 'Schamanin', dative: 'zur Schamanin' },
    male: { name: 'Schamane', dative: 'zum Schamanen' },
  },
  templar: {
    female: { name: 'Templerin', dative: 'zur Templerin' },
    male: { name: 'Templer', dative: 'zum Templer' },
    neutral: { name: 'Tempelwacht', dative: 'zur Tempelwacht' },
  },
  troubadour: {
    female: { name: 'Troubadourin', dative: 'zur Troubadourin' },
    male: { name: 'Troubadour', dative: 'zum Troubadour' },
    neutral: { name: 'Frohnatur', dative: 'zur Frohnatur' },
  },
  warlord: {
    female: { name: 'Feldherrin', dative: 'zur Feldherrin' },
    male: { name: 'Feldherr', dative: 'zum Feldherrn' },
    neutral: { name: 'Leitstern', dative: 'zum Leitstern' },
  },
  sentinel: {
    female: { name: 'Grenzwächterin', dative: 'zur Grenzwächterin' },
    male: { name: 'Grenzwächter', dative: 'zum Grenzwächter' },
    neutral: { name: 'Grenzwacht', dative: 'zur Grenzwacht' },
  },
}

/**
 * „zur Erzmagierin“ – der Klassenname im Dativ mit Artikel, falls bekannt und noch passend zum aktuellen Namen;
 * sonst `undefined` (dann eine Wendung ohne Beugung wählen).
 */
export function classDativeIn(definition: Pick<HeroClassDefinition, 'id' | 'names'>, form?: GrammaticalForm): string | undefined {
  const entry = CLASS_DATIVES[definition.id]?.[form ?? 'neutral']
  return entry !== undefined && entry.name === classNameFor(definition, form) ? entry.dative : undefined
}

/** Wie sich die Klasse geändert hat: erwacht (vom Abenteurer), aufgestiegen (Grund- → Hybridklasse), gewandelt. */
export type ClassChangeKind = 'awakened' | 'ascended' | 'changed'

export function classChangeKind(
  from: Pick<HeroClassDefinition, 'attributes'>,
  to: Pick<HeroClassDefinition, 'attributes'>,
): ClassChangeKind {
  if (from.attributes.length === 0) return 'awakened'
  if (to.attributes.length > from.attributes.length && from.attributes.every((attribute) => to.attributes.includes(attribute))) {
    return 'ascended'
  }
  return 'changed'
}

// ---------------------------------------------------------------------------
// Angriffe & Klassen-Bonus
// ---------------------------------------------------------------------------

/** Angriffsname einer Attribut-Art: „Arkaner Blitz“ (unbekannt → Attributname bzw. „Angriff“). */
export function attackNameOf(attribute: AttributeId): string {
  return ATTACK_NAMES[attribute] ?? ATTRIBUTES[attribute]?.name ?? 'Angriff'
}

/** Schaden mit echtem Minuszeichen: „−36“ (gerundet, nie negativ). */
export function damageText(damage: number): string {
  return `−${formatNumber(Math.max(0, Math.round(Number.isFinite(damage) ? damage : 0)))}`
}

export interface AttackLabel {
  /** Symbol des Attributs, z. B. 🧠. */
  icon: string
  /** „Arkaner Blitz“. */
  name: string
  /** „−36“. */
  damage: string
  /** Sichtbar: „🧠 Arkaner Blitz −36“ (bei Schwäche mit „· Schwachstelle!“). */
  text: string
  /** Vorgelesen: „Arkaner Blitz, 36 Schaden, Schwachstelle“. */
  spoken: string
  weakness: boolean
}

/** Ein Angriff in Worten – für Treffer-Anzeigen und Listen. */
export function formatAttack(attack: Pick<AttackEvent, 'attribute' | 'damage' | 'weakness'> & { attackName?: string }): AttackLabel {
  const icon = ATTRIBUTES[attack.attribute]?.icon ?? '⚔️'
  const name = attack.attackName ?? attackNameOf(attack.attribute)
  const damage = damageText(attack.damage)
  const amount = formatNumber(Math.max(0, Math.round(Number.isFinite(attack.damage) ? attack.damage : 0)))
  return {
    icon,
    name,
    damage,
    text: `${icon} ${name} ${damage}${attack.weakness ? ' · Schwachstelle!' : ''}`,
    spoken: `${name}, ${amount} Schaden${attack.weakness ? ', Schwachstelle' : ''}`,
    weakness: attack.weakness,
  }
}

/** „+10 %“ mit geschütztem Leerzeichen. */
function percentText(value: number): string {
  return `+${Math.round(value * 100).toLocaleString('de-DE')}\u00a0%`
}

/**
 * Klassen-Bonus in Worten, je Attribut der Angriff: `['+10 % Arkaner Blitz', '+10 % Mondlicht']`
 * (Reihenfolge der Attribute der Klasse; ohne Bonus leer).
 */
export function classBonusLines(
  definition: Pick<HeroClassDefinition, 'attributes'>,
  classBonus: Partial<Record<AttributeId, number>>,
): string[] {
  const lines: string[] = []
  for (const attribute of definition.attributes) {
    const bonus = classBonus[attribute]
    if (bonus === undefined || !Number.isFinite(bonus) || bonus <= 0) continue
    lines.push(`${percentText(bonus)} ${attackNameOf(attribute)}`)
  }
  return lines
}

// ---------------------------------------------------------------------------
// Truhen
// ---------------------------------------------------------------------------

/** „Seltene Truhe“ – die Seltenheit als Adjektiv vor dem Nomen (unbekannt → „Gewöhnliche“). */
export function chestName(rarity: ChestRarity | undefined, noun = 'Truhe'): string {
  const label = (rarity !== undefined && RARITY_LABELS[rarity]) || RARITY_LABELS.common
  return `${label}e ${noun}`
}

/** „Truhe gefunden!“ / „2 Truhen gefunden!“ */
export function chestsFoundTitle(count: number): string {
  const n = Math.max(1, Math.round(count))
  return n === 1 ? 'Truhe gefunden!' : `${formatNumber(n)} Truhen gefunden!`
}
