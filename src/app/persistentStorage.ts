/**
 * Dauerhafter Speicher („persistent storage“).
 *
 * IndexedDB ist standardmäßig nur „best effort“: Wird der Platz knapp, darf der Browser die Daten
 * ohne Rückfrage löschen – und sie sind die einzige Kopie des Spielstands. Mit
 * `navigator.storage.persist()` bitten wir darum, sie davon auszunehmen. Chrome/Edge entscheiden
 * still (z. B. installierte App), Firefox fragt einmal nach, Safari entscheidet selbst.
 */

/** Letzte (evtl. noch laufende) Bitte – wird nie abgelehnt. */
let lastRequest: Promise<boolean | undefined> = Promise.resolve(undefined)

/** StorageManager, falls der Browser ihn kennt (fehlt in alten Browsern, unsicheren Kontexten und jsdom). */
function storageManager(): StorageManager | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage
}

/**
 * Ist der Speicher dieses Ursprungs dauerhaft geschützt?
 * `undefined`, wenn der Browser es nicht verrät. Wirft nie.
 */
export async function isStoragePersisted(): Promise<boolean | undefined> {
  // Läuft gerade eine Bitte (z. B. beim App-Start), zählt deren Ausgang.
  await lastRequest
  try {
    const storage = storageManager()
    if (typeof storage?.persisted !== 'function') return undefined
    return await storage.persisted()
  } catch {
    return undefined
  }
}

/**
 * Bittet einmalig um dauerhaften Speicher, falls er noch nicht geschützt ist.
 * Ergebnis: `true` = geschützt, `false` = abgelehnt, `undefined` = API fehlt oder Fehler. Wirft nie.
 *
 * Erst aufrufen, wenn ein Held existiert – vor dem Onboarding gibt es nichts zu schützen, und Firefox
 * würde sonst schon auf dem Willkommensbildschirm um Erlaubnis fragen.
 */
export function requestPersistentStorage(): Promise<boolean | undefined> {
  lastRequest = askForPersistence()
  return lastRequest
}

async function askForPersistence(): Promise<boolean | undefined> {
  try {
    const storage = storageManager()
    if (typeof storage?.persist !== 'function') return undefined
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return undefined
  }
}
