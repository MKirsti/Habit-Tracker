/**
 * Kampagnen-Vorlagen ("Blueprints"): fertige Kampagnen mit Quests und Kapiteln, die der Held mit einem Tipp
 * starten kann. Eine Vorlage ist reine Daten + eine reine `build`-Funktion – gespeichert wird erst beim
 * Installieren (siehe `src/data/seed.ts` → `installBlueprint`).
 *
 * Stufen: Jede Vorlage gibt es als **Einsteiger** und **Fortgeschritten** – andere Startwerte (Häufigkeit,
 * Zielwerte) und passende Kapitel-Ziele.
 *
 * Pfade ("Klassenwahl"): Eine Vorlage kann mehrere Pfade anbieten, von denen der Held genau einen wählen muss
 * (z. B. Kraftsport / Ausdauer / Spielsport). Jeder Pfad liefert eigene Quests und Kapitel.
 */
import type { AttributeId, BlueprintLevel, Difficulty, Measure, Schedule } from '../../domain/types'

export type { BlueprintLevel } from '../../domain/types'

export const BLUEPRINT_LEVELS: BlueprintLevel[] = ['beginner', 'advanced']

export const BLUEPRINT_LEVEL_LABELS: Record<BlueprintLevel, string> = {
  beginner: 'Einsteiger',
  advanced: 'Fortgeschritten',
}

export interface BlueprintOptions {
  level: BlueprintLevel
  /** Pflicht bei Vorlagen mit `paths`, sonst weglassen. */
  pathId?: string
}

/** Eine Quest der Vorlage. `key` ist nur innerhalb der Vorlage eindeutig und verknüpft Kapitel mit Quests. */
export interface BlueprintQuest {
  key: string
  /** Emoji. */
  icon: string
  /** Max. 60 Zeichen. Gleicher Titel in mehreren Vorlagen = dieselbe Quest (wird beim Installieren geteilt). */
  title: string
  /** Max. 200 Zeichen, Du-Form, konkret. */
  description: string
  attribute: AttributeId
  difficulty: Difficulty
  schedule: Schedule
  measure?: Measure
}

export type BlueprintCriterion =
  | { type: 'manual' }
  | { type: 'counter'; target: number; label: string }
  /** Verweist per `questKey` auf eine Quest derselben Vorlage (bzw. desselben Pfads). */
  | { type: 'habit'; questKey: string; metric: 'completions' | 'total' | 'streak'; target: number }

export interface BlueprintChapter {
  /** Max. 60 Zeichen. */
  title: string
  /** Max. 200 Zeichen. */
  description: string
  criterion: BlueprintCriterion
}

/** Ergebnis von `build`: der konkrete Inhalt für eine Stufe (und ggf. einen Pfad). */
export interface BlueprintContent {
  /** Titel der installierten Kampagne (z. B. pfadabhängig "Der Pfad des Kriegers"). Max. 60 Zeichen. */
  title: string
  /** Emoji der installierten Kampagne. */
  icon: string
  /** Max. 300 Zeichen. */
  description: string
  /** Vorgeschlagenes "Warum" (der Held kann es später ändern). Max. 300 Zeichen. */
  why: string
  /** Vorgeschlagene Belohnung. Max. 120 Zeichen. */
  reward: string
  /** 3–6 Quests. */
  quests: BlueprintQuest[]
  /** 4–7 Kapitel, in der Reihenfolge, in der sie voraussichtlich erreicht werden. */
  chapters: BlueprintChapter[]
}

/** Ein wählbarer Pfad (Klasse) einer Vorlage. */
export interface BlueprintPath {
  /** Stabil, z. B. 'strength'. */
  id: string
  icon: string
  /** Klassenname, z. B. "Krieger". */
  className: string
  /** Was das konkret ist, z. B. "Kraftsport". */
  label: string
  /** 1–2 Sätze. */
  description: string
  primaryAttribute: AttributeId
  secondaryAttributes: AttributeId[]
}

export interface CampaignBlueprint {
  /** Stabil (wird in `MainQuest.blueprint.id` gespeichert), z. B. 'scholar'. */
  id: string
  icon: string
  /** Titel in der Bibliothek, max. 60 Zeichen. */
  title: string
  /** Ein knapper Satz für die Karte in der Bibliothek, max. 90 Zeichen. */
  tagline: string
  /** 1–3 Sätze für die Detailansicht. */
  description: string
  /** Hauptsächlich trainiertes Attribut (bei Vorlagen mit Pfaden: das typische). */
  primaryAttribute: AttributeId
  secondaryAttributes: AttributeId[]
  /** Laufzeit in Tagen (Deadline = Start + durationDays). */
  durationDays: number
  /** Kurzer Hinweis pro Stufe, z. B. "Du fängst gerade an – 10 Seiten am Tag." */
  levelHints: Record<BlueprintLevel, string>
  /** Wenn gesetzt, muss genau ein Pfad gewählt werden ("Klassenwahl"). */
  paths?: BlueprintPath[]
  /** Reine Funktion: liefert den Inhalt für Stufe (und Pfad). Wirft bei unbekanntem/fehlendem Pfad. */
  build(options: BlueprintOptions): BlueprintContent
}
