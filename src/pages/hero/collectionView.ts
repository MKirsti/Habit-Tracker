/**
 * Anzeige der Sammlung (Held → Sammlung, `?tab=sammlung`): Bestiarium, Truhen und Titel & Rahmen. Reine Funktionen
 * über den Spielzustand (ohne React), damit einzeln testbar.
 *
 * - Bestiarium: alle Bosse aus `domain/combat/bosses.ts`, nach Thema (Reihenfolge `ATTRIBUTE_IDS`). Besiegt zählen
 *   gespeicherte Siege plus gerade errungene, die der Recorder noch speichert (dieselbe Menge wie die Engine für
 *   Titel & Rahmen). Ein Gegner, dem der Held gerade gegenübersteht, ist bekannt („Im Kampf“) – alle anderen bleiben
 *   bis zum ersten Sieg eine Silhouette.
 * - Truhen: ungeöffnete (neueste zuerst) und die Chronik der geöffneten mit Fundort und Inhalt.
 * - Titel & Rahmen: freigeschaltete zuerst, gesperrte mit Hinweis und – bei zählbaren Bedingungen – Fortschritt.
 */
import { ATTRIBUTES, ATTRIBUTE_IDS } from '../../domain/attributes'
import { unrecordedVictories, victoriesByWeek } from '../../domain/combat/boss'
import { BOSSES } from '../../domain/combat/bosses'
import { CHEST_RARITIES, isChestOpened } from '../../domain/combat/chests'
import { FRAMES, RARITY_LABELS, TITLES } from '../../domain/combat/cosmeticDefinitions'
import { cosmeticConditionProgress, titleNameFor } from '../../domain/combat/cosmetics'
import type { CosmeticFacts } from '../../domain/combat/cosmetics'
import { compareDays, isValidDayKey } from '../../domain/dates'
import type {
  AttributeId,
  BossDefinition,
  BossVictory,
  Chest,
  ChestContent,
  ChestRarity,
  CosmeticCondition,
  DayKey,
  FrameDefinition,
  GrammaticalForm,
  Habit,
  MainQuest,
  TitleDefinition,
  WeeklyBossState,
} from '../../domain/types'
import { CHEST_THEMES } from '../../features/combat/chestTheme'
import { formatNumber } from '../../ui/format'

export { RARITY_LABELS }

// ---------------------------------------------------------------------------
// Seltenheiten
// ---------------------------------------------------------------------------

/**
 * Farben der Seltenheiten (Truhen, Titel, Rahmen) – dieselben wie im Truhen-Dialog, in der Siegesszene und in der
 * Meldung „Truhe gefunden“ (`CHEST_THEMES`): Bronze, Silber, Blau-Violett, Gold. Eine Truhe sieht so überall gleich
 * aus. Nur für Ringe, Leuchten und Abzeichen; Schrift über `tintTextColor`/`Badge color`.
 */
export const RARITY_COLORS: Record<ChestRarity, string> = {
  common: CHEST_THEMES.common.color,
  uncommon: CHEST_THEMES.uncommon.color,
  rare: CHEST_THEMES.rare.color,
  legendary: CHEST_THEMES.legendary.color,
}

/** Rang einer Seltenheit (gewöhnlich 0 … legendär 3). */
export function rarityRank(rarity: ChestRarity): number {
  const index = CHEST_RARITIES.indexOf(rarity)
  return index < 0 ? 0 : index
}

// ---------------------------------------------------------------------------
// Bestiarium
// ---------------------------------------------------------------------------

/**
 * Alle Boss-Siege: gespeicherte (je Woche einer) plus abgeleitete, noch nicht gespeicherte der laufenden bzw.
 * vorigen Woche – dieselbe Menge, mit der die Engine Titel und Rahmen freischaltet.
 */
export function allVictories(
  stored: readonly BossVictory[] | undefined,
  bosses: { current?: WeeklyBossState; previous?: WeeklyBossState },
): BossVictory[] {
  return [...victoriesByWeek(stored).values(), ...unrecordedVictories([bosses.current, bosses.previous], stored)]
}

export interface BestiaryEntry {
  boss: BossDefinition
  /** Anzahl Siege über diesen Boss (je Woche einer). */
  defeats: number
  /** Tag des letzten Siegs. */
  lastDefeatedDay?: DayKey
  /** Steht dem Helden gerade gegenüber (laufende Woche bzw. Gnadenfrist der Vorwoche) und ist noch nicht besiegt. */
  facing: boolean
}

export interface BestiaryGroup {
  theme: AttributeId
  entries: BestiaryEntry[]
  /** Davon mindestens einmal besiegt. */
  defeated: number
}

/** Bekannt = schon besiegt oder gerade im Kampf. Unbekannte zeigt das Bestiarium als Silhouette. */
export function isKnownBoss(entry: Pick<BestiaryEntry, 'defeats' | 'facing'>): boolean {
  return entry.defeats > 0 || entry.facing
}

/** Bosse nach Thema (Reihenfolge `ATTRIBUTE_IDS`, innerhalb in Definitions-Reihenfolge) mit Siegen. */
export function bestiary(
  victories: readonly BossVictory[],
  facing: readonly (WeeklyBossState | undefined)[] = [],
  bosses: readonly BossDefinition[] = BOSSES,
): BestiaryGroup[] {
  const facingIds = new Set(
    facing.flatMap((state) => (state !== undefined && !state.defeated ? [state.boss.id] : [])),
  )
  const tally = new Map<string, { defeats: number; last?: DayKey }>()
  for (const victory of victories) {
    const entry = tally.get(victory.bossId) ?? { defeats: 0 }
    entry.defeats += 1
    if (isValidDayKey(victory.day) && (entry.last === undefined || compareDays(victory.day, entry.last) > 0)) {
      entry.last = victory.day
    }
    tally.set(victory.bossId, entry)
  }
  return ATTRIBUTE_IDS.flatMap((theme) => {
    const themed = bosses.filter((boss) => boss.theme === theme)
    if (themed.length === 0) return []
    const entries = themed.map((boss): BestiaryEntry => {
      const known = tally.get(boss.id)
      const entry: BestiaryEntry = { boss, defeats: known?.defeats ?? 0, facing: facingIds.has(boss.id) }
      if (known?.last !== undefined) entry.lastDefeatedDay = known.last
      return entry
    })
    return [{ theme, entries, defeated: entries.filter((entry) => entry.defeats > 0).length }]
  })
}

/** Zusammenfassung: verschiedene besiegte Bosse, alle Bosse, Siege insgesamt. */
export function bestiarySummary(groups: readonly BestiaryGroup[]): { defeated: number; total: number; victories: number } {
  let defeated = 0
  let total = 0
  let victories = 0
  for (const group of groups) {
    defeated += group.defeated
    total += group.entries.length
    for (const entry of group.entries) victories += entry.defeats
  }
  return { defeated, total, victories }
}

/** Wo ein unbekannter Boss des Themas lauert (Hinweis statt Name). */
export const BOSS_THEME_HINTS: Record<AttributeId, string> = {
  strength: 'Lauert dort, wo du dich bewegen willst.',
  intellect: 'Lauert zwischen Büchern und Lektionen.',
  wisdom: 'Lauert in unruhigen Nächten und hektischen Tagen.',
  charisma: 'Lauert dort, wo Begegnungen warten.',
  vitality: 'Lauert zwischen Teller und Wasserglas.',
  discipline: 'Lauert in Routinen und liegen gebliebenen Pflichten.',
}

/** Sächliche Attribut-Namen (Genitiv „des …s“) – alle anderen sind weiblich („der Stärke“). */
const NEUTER_ATTRIBUTES: Partial<Record<AttributeId, true>> = { charisma: true }

/** Das Thema im Genitiv mit Artikel: „der Stärke“, „des Charismas“. */
export function bossThemeOf(theme: AttributeId): string {
  const name = ATTRIBUTES[theme]?.name ?? theme
  return NEUTER_ATTRIBUTES[theme] ? `des ${name}s` : `der ${name}`
}

/** „Bosse der Stärke“ / „Bosse des Charismas“ */
export function bossThemeTitle(theme: AttributeId): string {
  return `Bosse ${bossThemeOf(theme)}`
}

/** „1-mal besiegt“ / „3-mal besiegt“ (vorgelesen; sichtbar steht „×3“). */
export function defeatsText(defeats: number): string {
  return `${formatNumber(defeats)}-mal besiegt`
}

// ---------------------------------------------------------------------------
// Truhen
// ---------------------------------------------------------------------------

/** Ungeöffnete Truhen: neueste zuerst, am selben Tag die seltenere zuerst. */
export function unopenedChests(chests: readonly Chest[]): Chest[] {
  return chests
    .filter((chest) => !isChestOpened(chest))
    .sort(
      (a, b) =>
        compareDays(b.foundDay, a.foundDay) || rarityRank(b.rarity) - rarityRank(a.rarity) || a.id.localeCompare(b.id),
    )
}

/** Geöffnete Truhen für die Chronik: zuletzt geöffnete zuerst. */
export function openedChests(chests: readonly Chest[]): Chest[] {
  return chests
    .filter((chest) => isChestOpened(chest))
    .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0) || a.id.localeCompare(b.id))
}

export interface ChestSourceContext {
  habits: readonly Pick<Habit, 'id' | 'title' | 'icon'>[]
  mainQuests: readonly Pick<MainQuest, 'id' | 'title' | 'icon' | 'chapters'>[]
  victories: readonly BossVictory[]
  bosses?: readonly BossDefinition[]
}

export interface ChestSourceInfo {
  kind: Chest['source']
  /** „Boss-Truhe“, „Quest-Truhe“, „Kapitel-Truhe“. */
  label: string
  /** Wofür, z. B. „🛋️ Sofagolem besiegt“, „📖 Lesen“, „Kapitel „Erste Seiten““. */
  detail: string
}

const SOURCE_LABELS: Record<Chest['source'], string> = {
  boss: 'Boss-Truhe',
  quest: 'Quest-Truhe',
  chapter: 'Kapitel-Truhe',
}

/** Fundort einer Truhe in Worten – aus ihrer deterministischen ID (`boss:…`, `quest:…`, `chapter:…`). */
export function chestSource(chest: Pick<Chest, 'id' | 'source'>, context: ChestSourceContext): ChestSourceInfo {
  const kind: Chest['source'] = chest.source in SOURCE_LABELS ? chest.source : 'quest'
  const label = SOURCE_LABELS[kind]
  const rest = chest.id.startsWith(`${kind}:`) ? chest.id.slice(kind.length + 1) : chest.id

  if (kind === 'boss') {
    const victory = context.victories.find((entry) => entry.weekStart === rest)
    const boss = victory && (context.bosses ?? BOSSES).find((entry) => entry.id === victory.bossId)
    return { kind, label, detail: boss ? `${boss.icon} ${boss.name} besiegt` : 'Wochen-Boss besiegt' }
  }
  if (kind === 'chapter') {
    for (const quest of context.mainQuests) {
      if (!rest.startsWith(`${quest.id}:`)) continue
      const chapter = quest.chapters.find((entry) => rest === `${quest.id}:${entry.id}`)
      if (chapter) return { kind, label, detail: `${quest.icon} Kapitel „${chapter.title}“` }
    }
    return { kind, label, detail: 'Ein abgeschlossenes Kapitel' }
  }
  // Quest-Truhe: `quest:<habitId>:<day>`.
  const habit = context.habits.find((entry) => rest.startsWith(`${entry.id}:`))
  return { kind, label, detail: habit ? `${habit.icon} ${habit.title}` : 'Eine erledigte Quest' }
}

export interface ChestContentInfo {
  icon: string
  /** „45 Gold“, „Streak-Schutz“, „Titel „die Auserwählte““, „Rahmen „Sternenstaub““. */
  label: string
}

/** Inhalt einer (geöffneten) Truhe in Worten – Titel in der Sprachform des Helden. */
export function chestContentInfo(
  content: ChestContent | undefined,
  form?: GrammaticalForm,
  titles: readonly TitleDefinition[] = TITLES,
  frames: readonly FrameDefinition[] = FRAMES,
): ChestContentInfo {
  if (content?.kind === 'gold') return { icon: '🪙', label: `${formatNumber(Math.max(0, content.amount))} Gold` }
  if (content?.kind === 'item') return { icon: '❄️', label: 'Streak-Schutz' }
  if (content?.kind === 'cosmetic') {
    if (content.cosmeticKind === 'title') {
      const title = titles.find((entry) => entry.id === content.cosmeticId)
      return { icon: '🎖️', label: title ? `Titel „${titleNameFor(title, form)}“` : 'Ein Titel' }
    }
    const frame = frames.find((entry) => entry.id === content.cosmeticId)
    return { icon: '🖼️', label: frame ? `Rahmen „${frame.name}“` : 'Ein Rahmen' }
  }
  return { icon: '🎁', label: 'Unbekannter Inhalt' }
}

/** DOM-ID des Öffnen-Knopfs einer Truhe (Fokusziel nach dem Öffnen der vorigen). */
export function chestOpenButtonId(chestId: string): string {
  return `chest-open-${chestId.replace(/[^A-Za-z0-9_-]/g, '_')}`
}

/** „1 ungeöffnete Truhe“ / „3 ungeöffnete Truhen“ */
export function unopenedCountText(count: number): string {
  return `${formatNumber(count)} ${count === 1 ? 'ungeöffnete Truhe' : 'ungeöffnete Truhen'}`
}

// ---------------------------------------------------------------------------
// Titel & Rahmen
// ---------------------------------------------------------------------------

export interface CosmeticOption<T extends { id: string; condition: CosmeticCondition }> {
  definition: T
  unlocked: boolean
  /** Fortschritt für zählbare Bedingungen (Boss-Siege, Kampagnen, Level), nur bei gesperrten. */
  progress?: { current: number; target: number; text: string }
}

/** Die Fakten, nach denen gesperrte Titel/Rahmen ihren Fortschritt zeigen (wie in der Engine). */
export type ProgressFacts = Pick<CosmeticFacts, 'achievements' | 'victories' | 'campaignsMastered' | 'level'>

function progressText(condition: CosmeticCondition, current: number, target: number): string | undefined {
  switch (condition.type) {
    case 'bossVictories':
      return `${formatNumber(current)} / ${formatNumber(target)} Boss-Siege`
    case 'campaignsMastered':
      return `${formatNumber(current)} / ${formatNumber(target)} ${target === 1 ? 'Kampagne' : 'Kampagnen'}`
    case 'level':
      return `Level ${formatNumber(current)} / ${formatNumber(target)}`
    default:
      return undefined
  }
}

/** Titel bzw. Rahmen als Auswahl: freigeschaltete zuerst, sonst Definitions-Reihenfolge. */
export function cosmeticOptions<T extends { id: string; condition: CosmeticCondition }>(
  definitions: readonly T[],
  unlockedIds: readonly string[],
  facts: ProgressFacts,
): CosmeticOption<T>[] {
  const unlocked = new Set(unlockedIds)
  const options = definitions.map((definition): CosmeticOption<T> => {
    if (unlocked.has(definition.id)) return { definition, unlocked: true }
    const option: CosmeticOption<T> = { definition, unlocked: false }
    const { current, target } = cosmeticConditionProgress(definition.condition, { ...facts, unlocks: undefined })
    const text = progressText(definition.condition, current, target)
    if (text !== undefined) option.progress = { current, target, text }
    return option
  })
  return [...options.filter((option) => option.unlocked), ...options.filter((option) => !option.unlocked)]
}

/** „4 / 23“ */
export function unlockedCountText(unlocked: number, total: number): string {
  return `${formatNumber(unlocked)} / ${formatNumber(total)}`
}
