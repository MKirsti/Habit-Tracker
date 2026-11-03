/**
 * Erzeugt eindeutige IDs für Quests, Kampagnen und Kapitel.
 *
 * Bevorzugt `crypto.randomUUID()`. Diese Funktion gibt es nur in "sicheren Kontexten"
 * (HTTPS oder localhost) – wird die App z. B. im Heimnetz per http://192.168… geöffnet,
 * fehlt sie. Dann wird eine RFC-4122-v4-UUID aus `crypto.getRandomValues()` gebaut
 * (auch ohne sicheren Kontext verfügbar) und als letzter Ausweg aus `Math.random()`.
 */
export function newId(): string {
  const cryptoApi: Crypto | undefined = globalThis.crypto

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }

  // Version 4 (zufällig) und Variante 10xx gemäß RFC 4122 setzen.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
