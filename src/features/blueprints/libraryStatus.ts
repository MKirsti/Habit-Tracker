/**
 * Zustand der Kampagnen-Bibliothek aus den Spieldaten: Welche Vorlagen laufen gerade, welche wurden schon
 * gemeistert, wie viele Plätze sind frei – und welche Quests einer Vorlage würden mit vorhandenen Quests
 * geteilt? Rein (ohne React), damit es einzeln testbar ist.
 */
import type { AdventureChoice } from '../../data/seed'
import type { BlueprintOptions, CampaignBlueprint } from '../../data/blueprints'
import { BALANCING } from '../../domain/balancing'
import { activeCampaigns, campaignSlotsLeft } from '../../domain/campaigns'
import { evaluateMainQuests } from '../../domain/engine'
import { isArchivedOn } from '../../domain/schedule'
import type { BlueprintRef, DayKey, GameData, Habit } from '../../domain/types'

export interface LibraryStatus {
  /** Aktive Kampagnen (nicht archiviert, nicht abgeschlossen). */
  activeCount: number
  /** Höchstzahl aktiver Kampagnen (`BALANCING.maxActiveCampaigns`). */
  maxActive: number
  /** Noch freie Plätze (`campaignSlotsLeft`). */
  slotsLeft: number
  /** Vorlage-ID → Herkunft der aktiven Kampagne dieser Vorlage („Läuft bereits“). */
  running: ReadonlyMap<string, BlueprintRef>
  /** Vorlagen, aus denen schon eine Kampagne komplett abgeschlossen wurde („Gemeistert“). */
  mastered: ReadonlySet<string>
}

/** Zustand aller Vorlagen zum Spieltag `today` – dieselbe Auswertung wie Limit und Installieren. */
export function libraryStatus(data: GameData, today: DayKey): LibraryStatus {
  const running = new Map<string, BlueprintRef>()
  for (const campaign of activeCampaigns(data, today)) {
    const ref = campaign.quest.blueprint
    if (ref !== undefined && !running.has(ref.id)) running.set(ref.id, ref)
  }
  const mastered = new Set<string>()
  for (const campaign of evaluateMainQuests(data, today)) {
    const id = campaign.quest.blueprint?.id
    if (id !== undefined && campaign.complete) mastered.add(id)
  }
  const maxActive = BALANCING.maxActiveCampaigns
  const slotsLeft = campaignSlotsLeft(data, today)
  return { activeCount: maxActive - slotsLeft, maxActive, slotsLeft, running, mastered }
}

/**
 * Die vorhandene Quest, die beim Installieren statt einer neuen Quest mit diesem Titel mitbenutzt würde:
 * gleicher (getrimmter) Titel, am Tag `today` nicht archiviert. Wie beim Installieren gewinnt bei mehreren
 * Kandidaten eine, die keiner aktiven Kampagne zugeordnet ist, sonst die erste in der Liste.
 */
export function findSharedHabit(
  habits: readonly Habit[],
  title: string,
  today: DayKey,
  activeCampaignIds: ReadonlySet<string> = new Set(),
): Habit | undefined {
  const key = title.trim()
  const candidates = habits
    .filter((habit) => habit.title.trim() === key && !isArchivedOn(habit, today))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'de') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const isAssigned = (habit: Habit) => habit.mainQuestId !== undefined && activeCampaignIds.has(habit.mainQuestId)
  return candidates.find((habit) => !isAssigned(habit)) ?? candidates[0]
}

/** Optionen für `build`/`installBlueprint`: `pathId` nur bei Vorlagen mit Pfaden. */
export function blueprintOptions(blueprint: CampaignBlueprint, level: BlueprintOptions['level'], pathId?: string): BlueprintOptions {
  return blueprint.paths !== undefined && blueprint.paths.length > 0 && pathId !== undefined ? { level, pathId } : { level }
}

/** Die Auswahl für `onConfirm`. */
export function adventureChoice(blueprint: CampaignBlueprint, options: BlueprintOptions): AdventureChoice {
  return { blueprintId: blueprint.id, options: blueprintOptions(blueprint, options.level, options.pathId) }
}

/** Braucht die Vorlage eine Klassenwahl (Pfade)? */
export function hasPaths(blueprint: CampaignBlueprint): boolean {
  return blueprint.paths !== undefined && blueprint.paths.length > 0
}
