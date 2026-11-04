/**
 * Gemeinsame Regeln für das Heldenprofil (Onboarding und Heldenseite).
 */
import { RANKS } from '../../domain/balancing'
import { GRAMMATICAL_FORMS } from '../../domain/combat/classDefinitions'
import type { GrammaticalForm } from '../../domain/types'
import { EMOJI_CATEGORIES } from '../../ui'
import type { EmojiCategory } from '../../ui'

/** Maximale Länge des Heldennamens (Zeichen). */
export const HERO_NAME_MAX = 30

/** Avatar, der beim Onboarding vorausgewählt ist. */
export const DEFAULT_HERO_AVATAR = '🧙'

/** Die Schnellauswahl an Helden-Avataren (mit vorlesbarem Namen). */
export const HERO_AVATARS: readonly { emoji: string; name: string }[] = [
  { emoji: '🧙', name: 'Magier' },
  { emoji: '🧝', name: 'Elfe' },
  { emoji: '🧛', name: 'Vampir' },
  { emoji: '🥷', name: 'Ninja' },
  { emoji: '🦸', name: 'Superheld' },
  { emoji: '🧑‍🚀', name: 'Astronaut' },
  { emoji: '🧚', name: 'Fee' },
  { emoji: '🧞', name: 'Dschinn' },
  { emoji: '🦊', name: 'Fuchs' },
  { emoji: '🐉', name: 'Drache' },
  { emoji: '🦉', name: 'Eule' },
  { emoji: '🐺', name: 'Wolf' },
]

/** true, wenn der Avatar aus der Schnellauswahl stammt. */
export function isQuickAvatar(avatar: string): boolean {
  return HERO_AVATARS.some((option) => option.emoji === avatar)
}

/** Kategorien der erweiterten Avatar-Auswahl (EmojiPicker). */
export const AVATAR_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: 'heroes',
    label: 'Helden',
    icon: '🦸',
    emojis: [
      '🧙', '🧙‍♀️', '🧙‍♂️', '🧝', '🧝‍♀️', '🧝‍♂️', '🧛', '🧛‍♀️', '🥷', '🦸', '🦸‍♀️', '🦸‍♂️',
      '🦹', '🧑‍🚀', '🧚', '🧚‍♂️', '🧞', '🧜', '🧜‍♂️', '🤴', '👸', '🫅', '💂', '🕵️',
      '🧑‍🎓', '🧑‍🔬', '🧑‍🎨', '🧑‍🌾', '🧑‍🍳', '🧑‍💻', '🧔', '👩',
    ],
  },
  {
    id: 'animals',
    label: 'Tiere',
    icon: '🦊',
    emojis: [
      '🦊', '🐺', '🦉', '🐉', '🐲', '🦁', '🐯', '🐻', '🐼', '🐨', '🦅', '🦄',
      '🐈', '🐕', '🐢', '🦝', '🦡', '🐗', '🦌', '🐸', '🐙', '🦈', '🐬', '🦋',
    ],
  },
  ...EMOJI_CATEGORIES.filter((category) => category.id === 'fantasy'),
]

/** Sprachform des Helden für Klassen- und Titelnamen – fehlt sie (oder ist sie unbekannt), gilt neutral. */
export function formOrDefault(form: GrammaticalForm | undefined): GrammaticalForm {
  return form !== undefined && GRAMMATICAL_FORMS.includes(form) ? form : 'neutral'
}

/**
 * Überschrift des Onboarding-Schritts „Held“ in der gewählten Sprachform: „Erschaffe deine Heldin“ / „Erschaffe deinen
 * Helden“ / neutral „Erschaffe deinen Charakter“ (wie der „Charakterbogen“ der Heldenseite).
 */
export function heroStepHeading(form: GrammaticalForm | undefined): { eyebrow: string; title: string } {
  switch (formOrDefault(form)) {
    case 'female':
      return { eyebrow: 'Deine Heldin', title: 'Erschaffe deine Heldin' }
    case 'male':
      return { eyebrow: 'Dein Held', title: 'Erschaffe deinen Helden' }
    case 'neutral':
      return { eyebrow: 'Dein Charakter', title: 'Erschaffe deinen Charakter' }
  }
}

/**
 * Prüft den Heldennamen. Liefert eine deutsche Fehlermeldung oder `undefined`, wenn alles passt. Die Meldung passt zu
 * jeder Sprachform (sie steht direkt neben deren Auswahl).
 */
export function validateHeroName(name: string): string | undefined {
  const trimmed = name.trim()
  if (trimmed === '') return 'Bitte gib einen Namen ein.'
  if (trimmed.length > HERO_NAME_MAX) return `Der Name darf höchstens ${HERO_NAME_MAX} Zeichen lang sein.`
  return undefined
}

/** Der nächste Rang oberhalb von `level` – oder `undefined`, wenn der höchste Rang erreicht ist. */
export function nextRank(level: number): { minLevel: number; title: string } | undefined {
  return RANKS.find((rank) => rank.minLevel > level)
}

/**
 * Ganzzahlige Prozent-Anteile, die zusammen genau 100 ergeben (Methode der größten Reste) – einzeln
 * gerundet käme z. B. 80 + 11 + 10 = 101 % heraus. Ohne positive Werte: alles 0.
 */
export function roundShares(values: readonly number[]): number[] {
  const positive = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0))
  const total = positive.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return positive.map(() => 0)
  const exact = positive.map((value) => (value / total) * 100)
  const shares = exact.map(Math.floor)
  let missing = 100 - shares.reduce((sum, share) => sum + share, 0)
  // Die fehlenden Prozentpunkte gehen an die größten Nachkommareste (bei Gleichstand: zuerst genannte).
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of byRemainder) {
    if (missing <= 0) break
    shares[index] += 1
    missing -= 1
  }
  return shares
}

export type RankStatus = 'reached' | 'current' | 'locked'

/** Alle Ränge mit ihrem Status zum gegebenen Level (aufsteigend). */
export function rankLadder(level: number): { minLevel: number; title: string; status: RankStatus }[] {
  const sorted = [...RANKS].sort((a, b) => a.minLevel - b.minLevel)
  // Aktuell ist der höchste erreichte Rang (unterhalb des ersten Rangs: der erste).
  let currentIndex = 0
  sorted.forEach((rank, index) => {
    if (rank.minLevel <= level) currentIndex = index
  })
  return sorted.map((rank, index) => ({
    ...rank,
    status: index === currentIndex ? 'current' : index < currentIndex ? 'reached' : 'locked',
  }))
}
