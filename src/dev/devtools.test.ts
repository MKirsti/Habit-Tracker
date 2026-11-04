import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, dayRange, toDayKey } from '../domain/dates'
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
