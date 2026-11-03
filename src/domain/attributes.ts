import type { AttributeId } from './types'

export interface AttributeMeta {
  id: AttributeId
  name: string
  /** Drei-Buchstaben-Kürzel. */
  short: string
  icon: string
  /** Wofür das Attribut steht – Hilfe bei der Zuordnung von Quests. */
  description: string
  /** Akzentfarbe (Hex), passt zum dunklen Theme. */
  color: string
}

export const ATTRIBUTES: Record<AttributeId, AttributeMeta> = {
  strength: {
    id: 'strength',
    name: 'Stärke',
    short: 'STR',
    icon: '💪',
    description: 'Sport, Bewegung, körperliche Herausforderungen',
    color: '#e0654a',
  },
  intellect: {
    id: 'intellect',
    name: 'Intelligenz',
    short: 'INT',
    icon: '🧠',
    description: 'Lesen, Lernen, Sprachen, Wissen',
    color: '#5b9bd5',
  },
  wisdom: {
    id: 'wisdom',
    name: 'Weisheit',
    short: 'WEI',
    icon: '🧘',
    description: 'Achtsamkeit, Reflexion, Schlaf, Ruhe',
    color: '#9b7fd1',
  },
  charisma: {
    id: 'charisma',
    name: 'Charisma',
    short: 'CHA',
    icon: '🗣️',
    description: 'Freunde, Familie, Gespräche, Kreativität teilen',
    color: '#e3a33b',
  },
  vitality: {
    id: 'vitality',
    name: 'Vitalität',
    short: 'VIT',
    icon: '❤️',
    description: 'Ernährung, Wasser, Gesundheit, Selbstfürsorge',
    color: '#5dbb7a',
  },
  discipline: {
    id: 'discipline',
    name: 'Disziplin',
    short: 'DIS',
    icon: '🛡️',
    description: 'Haushalt, Arbeit, Finanzen, Routinen',
    color: '#8fa3b8',
  },
}

export const ATTRIBUTE_IDS: AttributeId[] = ['strength', 'intellect', 'wisdom', 'charisma', 'vitality', 'discipline']
