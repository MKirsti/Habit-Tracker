/**
 * Quests, die in mehreren Vorlagen vorkommen. Vorlagen verwenden diese Bausteine (statt eigene Varianten mit
 * leicht anderem Titel), damit beim Installieren einer zweiten Kampagne keine doppelte Quest entsteht:
 * Gleicher Titel ⇒ die vorhandene Quest wird mitbenutzt.
 *
 * Wichtig: Titel hier nie ändern, ohne alle Vorlagen zu prüfen – sonst greift das Zusammenführen nicht mehr.
 */
import type { BlueprintLevel, BlueprintQuest } from './types'

/** 💧 Wasser trinken – Vitalität, täglich, in Litern. */
export function waterQuest(level: BlueprintLevel, key = 'water'): BlueprintQuest {
  return {
    key,
    icon: '💧',
    title: 'Wasser trinken',
    description: 'Über den Tag verteilt trinken – ein Glas gleich nach dem Aufstehen hilft.',
    attribute: 'vitality',
    difficulty: 'easy',
    schedule: { type: 'daily' },
    measure: { target: level === 'beginner' ? 1.5 : 2.5, unit: 'L' },
  }
}

/** 🤸 Dehnen & Mobilität – Vitalität, täglich. */
export function stretchingQuest(level: BlueprintLevel, key = 'stretching'): BlueprintQuest {
  return {
    key,
    icon: '🤸',
    title: 'Dehnen & Mobilität',
    description: 'Ein paar Minuten dehnen und mobilisieren – Hüfte, Rücken, Schultern.',
    attribute: 'vitality',
    difficulty: 'easy',
    schedule: { type: 'daily' },
    measure: { target: level === 'beginner' ? 5 : 10, unit: 'Minuten' },
  }
}

/** 🌙 Rechtzeitig ins Bett – Weisheit, täglich. */
export function bedtimeQuest(level: BlueprintLevel, key = 'bedtime'): BlueprintQuest {
  return {
    key,
    icon: '🌙',
    title: 'Rechtzeitig ins Bett',
    description:
      level === 'beginner'
        ? 'Spätestens um 23:30 Uhr im Bett – dein Körper dankt es dir morgen.'
        : 'Spätestens um 22:30 Uhr im Bett – genug Schlaf ist dein stärkster Trank.',
    attribute: 'wisdom',
    difficulty: 'medium',
    schedule: { type: 'daily' },
  }
}

/**
 * 🕯️ Kerzenlicht statt Bildschirm – Weisheit, täglich. Stammt aus "Der Weg des Gelehrten"; der Titel muss
 * exakt so bleiben, damit Gelehrter und Mönch sich die Quest teilen.
 */
export function candlelightQuest(key = 'candlelight'): BlueprintQuest {
  return {
    key,
    icon: '🕯️',
    title: 'Kerzenlicht statt Bildschirm',
    description: '30 Minuten vor dem Schlafen kein Handy – lieber ein Buch.',
    attribute: 'wisdom',
    difficulty: 'medium',
    schedule: { type: 'daily' },
  }
}
