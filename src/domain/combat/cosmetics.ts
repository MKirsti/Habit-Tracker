/**
 * Titel & Avatar-Rahmen (Phase 3a, ARCHITECTURE.md „Titel & Rahmen“) – rein.
 *
 * Freigeschaltet ist ein Titel bzw. Rahmen, wenn seine Bedingung (`CosmeticCondition`) erfüllt ist **oder** ein
 * `CosmeticUnlock` (aus einer geöffneten Truhe) vorliegt. Die Bedingungen stützen sich auf dauerhafte Fakten:
 * freigeschaltete Erfolge (gespeichert oder gerade erreicht – der Recorder speichert sie), Boss-Siege (gespeichert
 * oder gerade errungen), gemeisterte Kampagnen und das Level. `chest` wird nur über eine Truhe frei, `always` immer.
 * Definitionen: `cosmeticDefinitions.ts` (`TITLES`, `FRAMES`).
 */
import type {
  BossVictory,
  CharacterProfile,
  Chest,
  CosmeticCondition,
  CosmeticUnlock,
  FrameDefinition,
  GrammaticalForm,
  TitleDefinition,
} from '../types'
import { openedChestCosmetics } from './chests'
import { FRAMES, TITLES } from './cosmeticDefinitions'

/** Die Fakten, nach denen Bedingungen entschieden werden. */
export interface CosmeticFacts {
  /** IDs freigeschalteter Erfolge. */
  achievements: Iterable<string>
  /** Boss-Siege (gespeicherte plus gerade errungene, je Woche einer). */
  victories: readonly Pick<BossVictory, 'bossId'>[]
  /** Gemeisterte Kampagnen (auch archivierte). */
  campaignsMastered: number
  level: number
  /** Gespeicherte Freischaltungen aus Truhen. */
  unlocks: readonly CosmeticUnlock[] | undefined
  /** Truhen: Kosmetik aus geöffneten zählt ebenfalls als freigeschaltet. */
  chests?: readonly Chest[]
}

/** Vorbereitete Fakten (Mengen statt Listen) – einmal je Auswertung. */
interface PreparedFacts {
  achievements: ReadonlySet<string>
  victories: readonly Pick<BossVictory, 'bossId'>[]
  campaignsMastered: number
  level: number
}

function prepare(facts: CosmeticFacts): PreparedFacts {
  return {
    achievements: new Set(facts.achievements),
    victories: facts.victories,
    campaignsMastered: finiteOrZero(facts.campaignsMastered),
    level: finiteOrZero(facts.level),
  }
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/**
 * Fortschritt einer Bedingung als `{ current, target }` (für gesperrte Titel/Rahmen: „3 / 5 Bosse“) – `current` auf
 * `target` begrenzt. Für Ja/Nein-Bedingungen 0/1; `chest` ist nie über die Bedingung erfüllt (0/1).
 */
export function cosmeticConditionProgress(
  condition: CosmeticCondition,
  facts: CosmeticFacts | PreparedFacts,
): { current: number; target: number } {
  const prepared = 'unlocks' in facts ? prepare(facts) : facts
  const capped = (current: number, target: number) => ({ current: Math.min(Math.max(0, current), target), target })
  switch (condition.type) {
    case 'achievement':
      return capped(prepared.achievements.has(condition.achievementId) ? 1 : 0, 1)
    case 'bossVictories':
      return capped(prepared.victories.length, Math.max(1, condition.count))
    case 'bossDefeated':
      return capped(prepared.victories.some((victory) => victory.bossId === condition.bossId) ? 1 : 0, 1)
    case 'campaignsMastered':
      return capped(prepared.campaignsMastered, Math.max(1, condition.count))
    case 'level':
      return capped(prepared.level, Math.max(1, condition.level))
    case 'always':
      return { current: 1, target: 1 }
    case 'chest':
    default:
      return { current: 0, target: 1 }
  }
}

/** Ist die Bedingung erfüllt? (`chest` nie – das geht nur über eine Truhe.) */
export function isCosmeticConditionMet(condition: CosmeticCondition, facts: CosmeticFacts | PreparedFacts): boolean {
  if (condition.type === 'chest') return false
  const { current, target } = cosmeticConditionProgress(condition, facts)
  return current >= target
}

/**
 * `GameState.cosmetics`: freigeschaltete Titel und Rahmen (IDs in Definitionsreihenfolge) – Bedingung erfüllt,
 * `CosmeticUnlock` oder Kosmetik aus einer geöffneten Truhe. Unbekannte IDs werden ignoriert.
 */
export function unlockedCosmetics(
  facts: CosmeticFacts,
  titles: readonly TitleDefinition[] = TITLES,
  frames: readonly FrameDefinition[] = FRAMES,
): { titles: string[]; frames: string[] } {
  const prepared = prepare(facts)
  const granted = new Set<string>()
  for (const unlock of facts.unlocks ?? []) granted.add(`${unlock.kind}:${unlock.id}`)
  for (const cosmetic of openedChestCosmetics(facts.chests)) granted.add(`${cosmetic.kind}:${cosmetic.id}`)
  const unlocked = (kind: 'title' | 'frame', definition: { id: string; condition: CosmeticCondition }) =>
    granted.has(`${kind}:${definition.id}`) || isCosmeticConditionMet(definition.condition, prepared)
  return {
    titles: titles.filter((title) => unlocked('title', title)).map((title) => title.id),
    frames: frames.filter((frame) => unlocked('frame', frame)).map((frame) => frame.id),
  }
}

/** Der gewählte Titel des Helden – nur, wenn er (noch) freigeschaltet ist. */
export function activeTitle(
  profile: Pick<CharacterProfile, 'titleId'> | undefined,
  unlocked: { titles: readonly string[] },
  titles: readonly TitleDefinition[] = TITLES,
): TitleDefinition | undefined {
  const id = profile?.titleId
  if (id === undefined || !unlocked.titles.includes(id)) return undefined
  return titles.find((title) => title.id === id)
}

/** Der gewählte Rahmen des Helden – nur, wenn er (noch) freigeschaltet ist. */
export function activeFrame(
  profile: Pick<CharacterProfile, 'frameId'> | undefined,
  unlocked: { frames: readonly string[] },
  frames: readonly FrameDefinition[] = FRAMES,
): FrameDefinition | undefined {
  const id = profile?.frameId
  if (id === undefined || !unlocked.frames.includes(id)) return undefined
  return frames.find((frame) => frame.id === id)
}

/** Titel in der Sprachform des Helden (fehlt → neutral). */
export function titleNameFor(title: Pick<TitleDefinition, 'names'>, form?: GrammaticalForm): string {
  return title.names[form ?? 'neutral'] ?? title.names.neutral
}
