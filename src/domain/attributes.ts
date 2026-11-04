import type { AttributeId } from './types'

export interface AttributeMeta {
  id: AttributeId
  name: string
  /** Drei-Buchstaben-Kürzel. */
  short: string
  icon: string
  /** Wofür das Attribut steht – Hilfe bei der Zuordnung von Quests. */
  description: string
  /**
   * Akzentfarbe (Hex), passt zum dunklen Theme. Auch die Hauptfarbe einer Kampagne, die dieses Attribut am
   * stärksten trainiert (`MainQuestState.dominantAttribute`, `src/features/campaignTheme`). Als Text auf allen
   * Flächen ≥ 4.5:1 (geprüft in src/ui/theme.test.ts); gespiegelt in `--color-attr-*` (src/index.css).
   */
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
    // Silber/Eisblau: deutlich heller und viel weniger gesättigt als Intelligenz-Blau.
    color: '#a9c6db',
  },
  charisma: {
    id: 'charisma',
    name: 'Charisma',
    short: 'CHA',
    icon: '🗣️',
    description: 'Freunde, Familie, Gespräche, Kreativität teilen',
    // Rosé: klar unterscheidbar vom App-Gold (XP, Belohnungen) und vom Stärke-Rot.
    color: '#ec8fb0',
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
    // Violett (Amethyst) – etwas heller als das frühere Weisheits-Violett, damit es auch auf getönten Chips lesbar bleibt.
    color: '#a28bd8',
  },
}

export const ATTRIBUTE_IDS: AttributeId[] = ['strength', 'intellect', 'wisdom', 'charisma', 'vitality', 'discipline']
