/** DOM-ID des Bearbeiten-Buttons einer Quest-Zeile (Fokusziel nach dem Anlegen). */
export function questEditButtonId(habitId: string): string {
  return `quest-edit-${habitId}`
}

/** DOM-IDs der Knöpfe einer Nebenquest-Karte (Fokusziele nach Anlegen bzw. Abhaken). */
export function sideQuestEditButtonId(questId: string): string {
  return `side-quest-edit-${questId}`
}
export function sideQuestCheckButtonId(questId: string): string {
  return `side-quest-check-${questId}`
}
