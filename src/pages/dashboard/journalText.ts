/**
 * Texte der „Notiz zu heute“ auf der Tagesübersicht (Phase 3b, Tagebuch). Rein (ohne React).
 * Eine Notiz pro Tag: ein paar Worte (bis 280 Zeichen) und – wer mag – ein Stimmungs-Emoji.
 */

/** Stimmungen zur Auswahl (Emoji + vorgelesener Name). Gespeichert wird nur das Emoji. */
export const JOURNAL_MOODS: readonly { emoji: string; label: string }[] = [
  { emoji: '😄', label: 'Strahlend' },
  { emoji: '🙂', label: 'Gut' },
  { emoji: '😌', label: 'Entspannt' },
  { emoji: '😐', label: 'Geht so' },
  { emoji: '😔', label: 'Bedrückt' },
  { emoji: '😴', label: 'Müde' },
]

/** Vorgelesener Name einer Stimmung (unbekannte Emojis – z. B. aus dem Tagebuch – heißen schlicht „Stimmung“). */
export function moodLabel(emoji: string | undefined): string | undefined {
  if (emoji === undefined || emoji === '') return undefined
  return JOURNAL_MOODS.find((mood) => mood.emoji === emoji)?.label ?? 'Stimmung'
}

/** Platzhalter im Textfeld. */
export const NOTE_PLACEHOLDER = 'Was war heute besonders? Ein Gedanke, ein kleiner Sieg …'

/** Erste Zeile der zugeklappten, schon geschriebenen Notiz (gekürzt auf `max` Zeichen). */
export function notePreview(text: string, max = 80): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (line.length <= max) return line
  return `${line.slice(0, max - 1).trimEnd()}…`
}
