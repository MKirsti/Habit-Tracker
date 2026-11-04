/**
 * Stabiler Hash für alles, was im Kampf „zufällig“ wirken soll, aber reproduzierbar sein muss (Phase 3a):
 * Boss-Wahl, Schwäche, Truhen-Funde und -Inhalte. Gleicher Text → gleicher Wert, auf jedem Gerät und in jeder
 * Version. Deshalb darf sich diese Funktion **nie** ändern – gespeicherte Truhen blieben zwar, wie sie sind, aber
 * offene (noch nicht gespeicherte) Funde und die Bosse der laufenden Woche würden neu ausgewürfelt.
 *
 * FNV-1a (32 bit) plus der Avalanche-Schritt von MurmurHash3 (`fmix32`): Reines FNV-1a mischt die **letzten**
 * Zeichen kaum in die oberen Bits – `quest:h1:2026-11-01` … `-09` lägen alle innerhalb von ~6 % des Bereichs, eine
 * Quest würfe dann an vielen Tagen in Folge eine Truhe ab oder wochenlang keine. Der Schlussschritt verteilt jede
 * Änderung auf alle Bits.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193
const TWO_POW_32 = 4_294_967_296

/** FNV-1a (32 bit) über die UTF-16-Codeeinheiten eines Strings, als vorzeichenlose Ganzzahl. */
export function fnv1a32(text: string): number {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

/** Avalanche-Schritt von MurmurHash3 (`fmix32`): jedes Eingabe-Bit beeinflusst jedes Ausgabe-Bit. */
export function fmix32(value: number): number {
  let h = value >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Stabiler 32-bit-Hash eines Strings: `fmix32(fnv1a32(text))`. */
export function stableHash(text: string): number {
  return fmix32(fnv1a32(text))
}

/** Hash eines Strings als Zahl in `[0, 1)` – die deterministische Entsprechung von `Math.random()`. */
export function hashUnit(text: string): number {
  return stableHash(text) / TWO_POW_32
}

/** Index in `[0, length)` aus einem Hash (für Auswahl aus einer Liste); `length ≤ 0` → −1. */
export function hashIndex(text: string, length: number): number {
  if (!(length > 0)) return -1
  return Math.min(length - 1, Math.floor(hashUnit(text) * length))
}

/**
 * Auswahl per „Rendezvous-Hashing“: Jeder Kandidat bekommt `hashUnit(key + ':' + id)`, der höchste gewinnt
 * (Gleichstand → der zuerst genannte). Vorteil gegenüber einem Index in die Liste: Kommt ein Kandidat hinzu oder
 * fällt einer weg, der nicht gewählt war, bleibt die Wahl gleich – z. B. ändert eine mitten in der Woche
 * angelegte Quest mit neuem Attribut die Schwäche des Bosses nur selten.
 */
export function rendezvousPick<T>(candidates: readonly T[], key: string, idOf: (candidate: T) => string): T | undefined {
  let best: T | undefined
  let bestScore = -1
  for (const candidate of candidates) {
    const score = hashUnit(`${key}:${idOf(candidate)}`)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}
