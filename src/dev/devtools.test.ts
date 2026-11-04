import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, dayRange, startOfWeek, toDayKey } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import { loadGameData, resetAllData } from '../data/repository'
import { devtools } from './devtools'

afterEach(async () => {
  await resetAllData()
})

async function today() {
  const data = await loadGameData()
  return toDayKey(new Date(), data.settings.dayStartHour)
}

describe('devtools.seedDemo – Phase 2b', () => {
  it('rechnet die Lebenspunkte ab Abenteuerbeginn bis vorgestern ab', async () => {
    await devtools.seedDemo(30)
    const day = await today()
    const start = addDays(day, -30)
    const data = await loadGameData()
    expect(data.settings.penalties).toStrictEqual({ enabled: true, since: start })
    expect(data.hpLedger?.map((entry) => entry.day)).toEqual(dayRange(start, addDays(day, -2)))
    const state = deriveGameState(data, day)
    expect(state.hp).toMatchObject({ enabled: true, settledThrough: addDays(day, -2) })
    expect(state.hp.yesterday?.day).toBe(addDays(day, -1))
    // Idempotent: ein weiteres Abrechnen (wie beim App-Start) findet nichts Neues.
    expect(await devtools.settle()).toStrictEqual([])
  })

  it('missedDays: die letzten abgerechneten Tage sind verpasst – die HP sind angeschlagen', async () => {
    await devtools.seedDemo(30, { missedDays: 3 })
    const day = await today()
    const data = await loadGameData()
    const last = data.hpLedger?.slice(-3) ?? []
    expect(last.map((entry) => [entry.day, entry.score])).toEqual(
      [-4, -3, -2].map((offset) => [addDays(day, offset), 'missed']),
    )
    const { hp } = deriveGameState(data, day)
    expect(hp.current).toBeLessThan(hp.max)
  })

  it('penalties: false startet im Sanften Modus', async () => {
    await devtools.seedDemo(10, { penalties: false })
    const data = await loadGameData()
    expect(data.settings.penalties?.enabled).toBe(false)
    expect(data.hpLedger?.every((entry) => entry.penalties === false && entry.hpDelta === 0)).toBe(true)
    expect(deriveGameState(data, await today()).hp.enabled).toBe(false)
  })
})

describe('devtools – Phase 3a (Bosse & Truhen)', () => {
  it('seedDemo: Boss der Vorwoche besiegt, Boss-Truhe gespeichert, mindestens zwei ungeöffnete Truhen', async () => {
    await devtools.seedDemo(30)
    const day = await today()
    const lastWeek = addDays(startOfWeek(day), -7)
    const data = await loadGameData()
    expect(data.bossVictories?.map((victory) => victory.weekStart)).toContain(lastWeek)
    const victory = data.bossVictories?.find((entry) => entry.weekStart === lastWeek)
    expect(victory?.maxHp).toBeGreaterThan(0)
    expect(victory && victory.day >= lastWeek && victory.day <= addDays(lastWeek, 6)).toBe(true)
    expect(data.chests?.some((chest) => chest.id === `boss:${lastWeek}`)).toBe(true)
    const state = deriveGameState(data, day)
    expect(state.inventory.unopenedChests).toBeGreaterThanOrEqual(2)
    // Alles, was die Engine gerade zeigt, ist gespeichert – der Recorder der App findet nichts Neues.
    expect(state.chests.map((chest) => chest.id).sort()).toEqual((data.chests ?? []).map((chest) => chest.id).sort())
    // Deterministisch: dieselbe Demo ergibt denselben Boss.
    await devtools.seedDemo(30)
    expect((await loadGameData()).bossVictories?.find((entry) => entry.weekStart === lastWeek)?.bossId).toBe(victory?.bossId)
  })

  it('seedDemo mit combat: false lässt Bosse und Truhen weg', async () => {
    await devtools.seedDemo(10, { combat: false })
    const data = await loadGameData()
    expect(data.bossVictories).toBeUndefined()
    expect(data.chests).toBeUndefined()
  })

  it('grantChest legt ungeöffnete Truhen an (Seltenheit oder Inhalt wählbar), openChest öffnet sie', async () => {
    await devtools.seedDemo(10, { combat: false })
    const legendary = await devtools.grantChest({ rarity: 'legendary' })
    expect(legendary).toMatchObject({ source: 'chapter', rarity: 'legendary', foundDay: await today() })
    expect(legendary.id).toMatch(/^chapter:dev-/)
    expect(legendary.openedAt).toBeUndefined()

    const gold = await devtools.grantChest({ content: { kind: 'gold', amount: 33 }, source: 'boss' })
    expect(gold).toMatchObject({ source: 'boss', rarity: 'common', content: { kind: 'gold', amount: 33 } })
    const before = deriveGameState(await loadGameData(), await today()).gold.fromChests
    expect(await devtools.openChest(gold.id)).toStrictEqual({ kind: 'gold', amount: 33 })
    expect(deriveGameState(await loadGameData(), await today()).gold.fromChests).toBe(before + 33)

    // Eine zweite Quest-Truhe am selben Tag gibt es nicht.
    await devtools.grantChest({ source: 'quest' })
    await expect(devtools.grantChest({ source: 'quest' })).rejects.toThrow('schon eine Quest-Truhe')
  })

  it('defeatBoss ist idempotent und liefert ohne Helden nichts', async () => {
    expect(await devtools.defeatBoss()).toBeUndefined()
    await devtools.seedDemo(30, { combat: false })
    const first = await devtools.defeatBoss()
    expect(first).toBeDefined()
    expect(await devtools.defeatBoss()).toStrictEqual(first)
    expect((await loadGameData()).bossVictories).toHaveLength(1)
  })
})
