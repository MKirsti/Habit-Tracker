/** DOM-ID des Bearbeiten-Buttons einer Quest-Zeile (Fokusziel nach dem Anlegen). */
export function questEditButtonId(habitId: string): string {
  return `quest-edit-${habitId}`
}
