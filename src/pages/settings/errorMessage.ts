/** Lesbare (deutsche) Meldung aus einem gefangenen Fehler – Repository & Backup werfen deutsche `Error`s. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message
  return 'Bitte versuche es noch einmal.'
}
