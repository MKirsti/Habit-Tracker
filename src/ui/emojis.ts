/**
 * Kuratierte Emoji-Auswahl für Quests, Kampagnen und Avatare.
 */

export interface EmojiCategory {
  id: string
  label: string
  /** Repräsentatives Emoji für den Kategorie-Reiter. */
  icon: string
  emojis: readonly string[]
}

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: 'learning',
    label: 'Lernen',
    icon: '📚',
    emojis: ['📖', '📚', '📜', '✍️', '📝', '🖋️', '🎓', '🧠', '💡', '🔬', '🔭', '🧮', '💻', '🌍', '🗣️', '🎹', '🎸', '🎨', '♟️', '🧩', '🗂️', '📓', '🏛️', '🦉'],
  },
  {
    id: 'sport',
    label: 'Sport',
    icon: '🏃',
    emojis: ['🏃', '🚶', '🚴', '🏊', '🏋️', '🤸', '🧗', '🥾', '⛹️', '🤾', '⚽', '🎾', '🏓', '🏸', '🥊', '🥋', '⛷️', '🏄', '🛹', '🧘', '💪', '🦵', '🏆', '⏱️'],
  },
  {
    id: 'health',
    label: 'Gesundheit',
    icon: '💧',
    emojis: ['💧', '🚰', '🥗', '🍎', '🥦', '🥕', '🍵', '🍳', '😴', '🛌', '💊', '🦷', '🧴', '🩺', '❤️', '🫀', '☀️', '🚭', '🍬', '🥤', '🍽️', '⚖️', '🌡️', '🧼'],
  },
  {
    id: 'mindfulness',
    label: 'Achtsamkeit',
    icon: '🧘',
    emojis: ['🧘', '🌿', '🍃', '🌸', '🪷', '🌙', '🌅', '🌊', '🕯️', '🙏', '📿', '☯️', '😌', '📵', '🛁', '🌳', '🎐', '✨', '🫁', '💭', '📔', '🌄', '🍂', '⭐'],
  },
  {
    id: 'household',
    label: 'Haushalt',
    icon: '🧹',
    emojis: ['🧹', '🧺', '🧽', '🍽️', '🛒', '🪴', '🗑️', '🛏️', '👕', '🧾', '💰', '💶', '📅', '⏰', '📧', '💼', '🔧', '🧰', '📦', '🐕', '🐈', '🚗', '🔑', '🏠'],
  },
  {
    id: 'social',
    label: 'Soziales',
    icon: '🤝',
    emojis: ['🤝', '💬', '📞', '👪', '🫂', '👋', '💌', '✉️', '🎁', '💐', '☕', '🍻', '🎉', '🎲', '🎭', '🎶', '📸', '😊', '🥰', '🙌', '👂', '🧑‍🤝‍🧑', '🌻', '🏡'],
  },
  {
    id: 'fantasy',
    label: 'Fantasy',
    icon: '⚔️',
    emojis: ['⚔️', '🗡️', '🛡️', '🏹', '🪄', '🔮', '🧪', '⚗️', '📜', '🗝️', '🗺️', '🧭', '🏰', '👑', '💎', '🪙', '🐉', '🦄', '🐺', '🦅', '🧙', '🧝', '🔥', '🌟', '🏔️', '🌋', '🌌', '🦁'],
  },
]

/**
 * Erstes Graphem (vom Menschen als ein Zeichen wahrgenommen) eines Textes – auch für
 * zusammengesetzte Emojis wie 🧑‍🤝‍🧑 oder Flaggen. Leerzeichen am Rand werden ignoriert.
 */
export function firstGrapheme(text: string): string {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('de', { granularity: 'grapheme' })
    for (const { segment } of segmenter.segment(trimmed)) return segment
  }
  return Array.from(trimmed)[0] ?? ''
}

/** Kategorie aus `categories` (Standard: die kuratierte Auswahl), die das Emoji enthält – oder undefined. */
export function findEmojiCategory(
  emoji: string,
  categories: readonly EmojiCategory[] = EMOJI_CATEGORIES,
): EmojiCategory | undefined {
  return categories.find((category) => category.emojis.includes(emoji))
}
