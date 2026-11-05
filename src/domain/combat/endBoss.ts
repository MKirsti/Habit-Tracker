/**
 * Kampagnen-Endgegner (Phase 3b, ARCHITECTURE.md „Kampagnen-Endgegner“) – rein.
 *
 * - Das **letzte Kapitel** (in gespeicherter Reihenfolge) jeder Kampagne ist ihr Endgegner (`MainQuestState.endBoss`);
 *   ohne Kapitel gibt es keinen.
 * - `awakened`, sobald alle **anderen** Kapitel abgeschlossen sind (bei nur einem Kapitel sofort); davor ist er nur
 *   angekündigt. `maxHp` = Ziel des Kapitels, `hp = max(0, Ziel − Fortschritt)` (manuell: 1 bzw. 0), `defeated` =
 *   Kapitel abgeschlossen (dann `hp` 0).
 * - Welcher Endgegner: je Vorlage und Pfad (`END_BOSSES` mit den Schlüsseln `scholar`, `body:strength`,
 *   `body:endurance`, `body:sports`, `alchemist`, `monk`, `earlyRiser`, `fortress`, `fellowship`, `polyglot`), für eigene
 *   Kampagnen (und unbekannte Vorlagen) der allgemeine `custom`.
 * - Endgegner-Truhe je gemeisterter Kampagne: `combat/chests.ts` (`campaign:<questId>`).
 *
 * Inhalte (Namen, Icons, Texte): `endBosses.ts`.
 */
import type { ChapterState, EndBossDefinition, EndBossState, MainQuest } from '../types'
import { END_BOSSES } from './endBosses'

/** Schlüssel des allgemeinen Endgegners für eigene Kampagnen. */
export const CUSTOM_END_BOSS_KEY = 'custom'

/**
 * Schlüssel-Kandidaten einer Kampagne, der passendste zuerst: `<vorlage>:<pfad>` (nur mit Pfad), `<vorlage>`,
 * zuletzt `custom`.
 */
export function endBossKeys(quest: Pick<MainQuest, 'blueprint'>): string[] {
  const keys: string[] = []
  const blueprint = quest.blueprint
  if (blueprint !== undefined && typeof blueprint.id === 'string' && blueprint.id !== '') {
    if (typeof blueprint.pathId === 'string' && blueprint.pathId !== '') keys.push(`${blueprint.id}:${blueprint.pathId}`)
    keys.push(blueprint.id)
  }
  keys.push(CUSTOM_END_BOSS_KEY)
  return keys
}

/** Notfall-Endgegner, falls der Inhalt keinen passenden (auch keinen allgemeinen) kennt. */
function fallbackEndBoss(): EndBossDefinition {
  return {
    id: 'end-custom-shadow',
    name: 'Hüter des letzten Kapitels',
    icon: '🐉',
    description: 'Am Ende deines Weges wartet ein letzter Wächter. Er prüft, ob du wirklich bis hierher gegangen bist.',
    defeatLine: 'Der Hüter neigt sein Haupt – dein Weg ist vollendet.',
  }
}

/** Endgegner-Definition einer Kampagne (Vorlage + Pfad → Vorlage → `custom` → Notfall-Endgegner). */
export function endBossDefinition(
  quest: Pick<MainQuest, 'blueprint'>,
  endBosses: Readonly<Record<string, EndBossDefinition>> = END_BOSSES,
): EndBossDefinition {
  for (const key of endBossKeys(quest)) {
    if (Object.hasOwn(endBosses, key)) return endBosses[key]
  }
  return fallbackEndBoss()
}

/** Endgegner nach ID (für Tagebuch und Szenen); unbekannt → `undefined`. */
export function endBossById(
  id: string,
  endBosses: Readonly<Record<string, EndBossDefinition>> = END_BOSSES,
): EndBossDefinition | undefined {
  return Object.values(endBosses).find((definition) => definition.id === id)
}

/** Gültige Zahl ≥ 0 (Unsinn → 0). */
function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * `MainQuestState.endBoss`: das letzte Kapitel als Endgegner – `undefined` ohne Kapitel.
 * @param chapters Ausgewertete Kapitel der Kampagne in Kapitel-Reihenfolge (`MainQuestState.chapters`).
 */
export function endBossState(
  quest: Pick<MainQuest, 'blueprint'>,
  chapters: readonly ChapterState[],
  endBosses: Readonly<Record<string, EndBossDefinition>> = END_BOSSES,
): EndBossState | undefined {
  const last = chapters.at(-1)
  if (last === undefined) return undefined
  const defeated = last.done
  // Ziel als Lebenspunkte: mindestens 1 (ein Kapitel ohne gültiges Ziel hätte sonst einen Boss ohne Leben).
  const maxHp = Math.max(1, nonNegative(last.target))
  const remaining = maxHp - nonNegative(last.current)
  // Gleitkomma-Rauschen (z. B. 30 − 29,7) nicht als winzigen Rest stehen lassen.
  const hp = defeated || remaining < 1e-9 ? 0 : Math.min(maxHp, remaining)
  return {
    definition: endBossDefinition(quest, endBosses),
    chapterId: last.chapter.id,
    awakened: chapters.slice(0, -1).every((chapter) => chapter.done),
    maxHp,
    hp,
    defeated,
  }
}
