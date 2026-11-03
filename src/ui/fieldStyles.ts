import type { ReactNode } from 'react'

/**
 * Gemeinsame Klassen aller Eingabefelder. Schriftgröße 16 px verhindert das automatische
 * Hineinzoomen von iOS Safari beim Fokussieren.
 */
export const INPUT_CLASS =
  'block w-full min-w-0 rounded-xl border border-border-strong bg-bg-deep/70 px-3.5 text-base text-parchment ' +
  'shadow-[inset_0_1px_2px_rgb(0_0_0/0.45)] transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-[#6b5638] focus:border-gold focus:ring-2 focus:ring-gold/25 focus:outline-none focus-visible:outline-none ' +
  'aria-invalid:border-danger/80 aria-invalid:focus:ring-danger/25 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Wie INPUT_CLASS, aber für einen Container, der ein randloses `<input>` plus Zusätze (z. B. Einheit)
 * enthält. Fokus- und Fehlerzustand kommen über `focus-within` bzw. `data-invalid`.
 */
export const INPUT_GROUP_CLASS =
  'flex w-full min-w-0 items-center rounded-xl border border-border-strong bg-bg-deep/70 text-parchment ' +
  'shadow-[inset_0_1px_2px_rgb(0_0_0/0.45)] transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-[#6b5638] focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/25 ' +
  'data-invalid:border-danger/80 data-invalid:focus-within:ring-danger/25 ' +
  'has-disabled:cursor-not-allowed has-disabled:opacity-50'

/** IDs der Hilfselemente eines Feldes. */
export function fieldIds(id: string) {
  return {
    labelId: `${id}-label`,
    hintId: `${id}-hint`,
    errorId: `${id}-error`,
  }
}

/**
 * Wert für aria-describedby – passend zu `Field`, das bei einem Fehler den Hinweis ausblendet:
 * Fehler-ID, sonst Hinweis-ID, sonst undefined.
 */
export function describedBy(id: string, hint: ReactNode, error: ReactNode): string | undefined {
  const { hintId, errorId } = fieldIds(id)
  if (hasContent(error)) return errorId
  if (hasContent(hint)) return hintId
  return undefined
}

/** true, wenn etwas Darstellbares übergeben wurde (nicht undefined/null/false/''). */
export function hasContent(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== ''
}
