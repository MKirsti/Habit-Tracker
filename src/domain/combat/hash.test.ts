import { describe, expect, it } from 'vitest'
import { fmix32, fnv1a32, hashIndex, hashUnit, rendezvousPick, stableHash } from './hash'

describe('fnv1a32', () => {
  it('liefert die bekannten FNV-1a-Prüfwerte (32 bit)', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
    expect(fnv1a32('foobar')).toBe(0xbf9cf968)
  })

  it('ist stabil und vorzeichenlos', () => {
    for (const text of ['boss:2026-11-02', 'quest:h1:2026-11-04', 'ÄÖÜß 🎁']) {
      const hash = fnv1a32(text)
      expect(hash).toBe(fnv1a32(text))
      expect(Number.isInteger(hash)).toBe(true)
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThan(2 ** 32)
    }
  })
})

describe('stableHash', () => {
  it('= fmix32(fnv1a32(text)), fest verdrahtet (darf sich nie ändern)', () => {
    expect(fmix32(0)).toBe(0)
    expect(stableHash('boss:2026-11-02')).toBe(fmix32(fnv1a32('boss:2026-11-02')))
    // Referenzwerte: Ändern sie sich, würfeln offene Funde und laufende Bosse neu.
    expect(stableHash('')).toBe(2_872_998_923)
    expect(stableHash('a')).toBe(444_641_715)
    expect(stableHash('boss:2026-11-02')).toBe(1_459_151_121)
    expect(stableHash('quest:h1:2026-11-04')).toBe(2_201_061_897)
  })

  it('aufeinanderfolgende Tage derselben Quest streuen über den ganzen Bereich (kein Klumpen am Ende des Strings)', () => {
    const values = Array.from({ length: 9 }, (_, i) => hashUnit(`2026-01-01Aria:h1:2026-11-0${i + 1}`))
    const spread = Math.max(...values) - Math.min(...values)
    expect(spread).toBeGreaterThan(0.5)
    // Reines FNV-1a läge hier eng beieinander – genau das verhindert der Schlussschritt.
    const raw = Array.from({ length: 9 }, (_, i) => fnv1a32(`2026-01-01Aria:h1:2026-11-0${i + 1}`) / 2 ** 32)
    expect(Math.max(...raw) - Math.min(...raw)).toBeLessThan(0.1)
  })
})

describe('hashUnit / hashIndex', () => {
  it('liegt in [0, 1) und ist ungefähr gleichverteilt', () => {
    const buckets = new Array(10).fill(0)
    const n = 20_000
    for (let i = 0; i < n; i++) {
      const value = hashUnit(`id-${i}`)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      buckets[Math.floor(value * 10)]++
    }
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n / 10 * 0.1)
  })

  it('hashIndex bleibt im Bereich; leere Liste → −1', () => {
    for (let i = 0; i < 200; i++) {
      const index = hashIndex(`x${i}`, 3)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(3)
    }
    expect(hashIndex('x', 0)).toBe(-1)
  })
})

describe('rendezvousPick', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f']

  it('ist deterministisch und unabhängig von der Reihenfolge der Kandidaten', () => {
    for (let i = 0; i < 50; i++) {
      const key = `key-${i}`
      const picked = rendezvousPick(ids, key, (id) => id)
      expect(rendezvousPick([...ids].reverse(), key, (id) => id)).toBe(picked)
    }
  })

  it('ein nicht gewählter Kandidat kann wegfallen, ohne die Wahl zu ändern', () => {
    for (let i = 0; i < 50; i++) {
      const key = `key-${i}`
      const picked = rendezvousPick(ids, key, (id) => id)
      const without = ids.filter((id) => id !== picked).slice(1)
      expect(rendezvousPick([picked as string, ...without], key, (id) => id)).toBe(picked)
    }
  })

  it('leere Liste → undefined', () => {
    expect(rendezvousPick([], 'k', (id: string) => id)).toBeUndefined()
  })
})
