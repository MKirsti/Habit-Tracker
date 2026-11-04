import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, formatDay } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import { makeLedgerEntry } from '../domain/testing'
import type { DayKey, RestPeriod } from '../domain/types'
import { QuestlogDB } from './db'
import {
  addRestPeriod,
  createHabit,
  deleteRestPeriod,
  firstEditableRestDay,
  loadGameData,
  MAX_REST_PERIOD_DAYS,
  saveProfile,
  settleHpDays,
  toggleCompletion,
  updateRestPeriod,
} from './repository'

const TODAY = '2026-11-04'
const YESTERDAY = '2026-11-03'
const day = (offset: number): DayKey => addDays(TODAY, offset)
const short = (value: DayKey) => formatDay(value, 'short')

const MSG = {
  tooEarly: 'Eine Rast kannst du höchstens ab gestern rückwirkend eintragen.',
  order: 'Eine Rast kann nicht enden, bevor sie beginnt.',
  tooLong: `Eine Rast dauert höchstens ${MAX_REST_PERIOD_DAYS} Tage am Stück.`,
  past: 'Vergangene Rasttage lassen sich nicht mehr ändern – nur die ab gestern.',
  over: 'Diese Rast ist schon vorbei – vergangene Rasttage bleiben erhalten.',
  notFound: 'Diese Rast gibt es nicht (mehr).',
}

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-rest-${++dbCounter}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

async function periods(): Promise<RestPeriod[]> {
  return (await loadGameData(database)).restPeriods ?? []
}

/** Eine Rast, die schon vor `TODAY` begonnen hat (direkt gespeichert – anlegen ließe sie sich heute nicht mehr). */
async function storePast(id: string, from: DayKey, until: DayKey): Promise<RestPeriod> {
  const period: RestPeriod = { id, from, until, createdAt: 1 }
  await database.restPeriods.add(period)
  return period
}

// ---------------------------------------------------------------------------

describe('firstEditableRestDay', () => {
  it('gestern – außer ein späterer Tag ist schon abgerechnet', () => {
    expect(firstEditableRestDay({}, TODAY)).toBe(YESTERDAY)
    expect(firstEditableRestDay({ hpLedger: [makeLedgerEntry(day(-2)), makeLedgerEntry(day(-9))] }, TODAY)).toBe(YESTERDAY)
    // Zurückgestellte Uhr: gestern ist schon abgerechnet → frühestens heute
    expect(firstEditableRestDay({ hpLedger: [makeLedgerEntry(YESTERDAY)] }, TODAY)).toBe(TODAY)
  })
})

describe('addRestPeriod', () => {
  it('legt eine Rast an (Notiz getrimmt), auch in der Zukunft und ab gestern', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(4242)
    const vacation = await addRestPeriod({ from: day(10), until: day(17), note: '  Urlaub in Italien ' }, TODAY, database)
    expect(vacation).toStrictEqual({ id: vacation.id, from: day(10), until: day(17), note: 'Urlaub in Italien', createdAt: 4242 })
    const sick = await addRestPeriod({ from: YESTERDAY, until: TODAY, note: '   ' }, TODAY, database)
    expect('note' in sick).toBe(false)
    expect(await periods()).toStrictEqual([sick, vacation])
  })

  it('„Heute Ruhetag“: heute ist danach Ruhetag – keine Pflicht, kein Schaden', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: day(-5) }, database)
    await createHabit({ title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'easy', schedule: { type: 'daily' } }, day(-5), database)
    await addRestPeriod({ from: TODAY, until: TODAY }, TODAY, database)
    const state = deriveGameState(await loadGameData(database), TODAY)
    expect(state.restToday).toBe(true)
    expect(state.todayState.requiredCount).toBe(0)
  })

  it('Rasttage werden als „rest“ abgerechnet – ohne HP-Wirkung', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: day(-10) }, database)
    const habit = await createHabit(
      { title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'easy', schedule: { type: 'daily' } },
      day(-10),
      database,
    )
    await settleHpDays(day(-10), database)
    await toggleCompletion(habit.id, day(-10), database)
    await addRestPeriod({ from: day(-9), until: day(-8) }, day(-9), database)
    const entries = await settleHpDays(TODAY, database)
    expect(entries.slice(0, 4).map((entry) => [entry.score, entry.hpDelta])).toEqual([
      ['perfect', 0],
      ['rest', 0],
      ['rest', 0],
      ['missed', -6],
    ])
  })

  it.each([
    ['vorgestern', { from: day(-2), until: TODAY }, MSG.tooEarly],
    ['Ende vor Beginn', { from: day(3), until: day(2) }, MSG.order],
    ['61 Tage', { from: TODAY, until: day(MAX_REST_PERIOD_DAYS) }, MSG.tooLong],
    ['ungültiger Beginn', { from: '2026-02-30', until: TODAY }, 'Ungültiges Startdatum'],
    ['ungültiges Ende', { from: TODAY, until: 'morgen' }, 'Ungültiges Enddatum'],
  ])('lehnt ab: %s', async (_label, draft, message) => {
    await expect(addRestPeriod(draft, TODAY, database)).rejects.toThrow(message)
    expect(await periods()).toStrictEqual([])
  })

  it('erlaubt genau 60 Tage', async () => {
    await expect(addRestPeriod({ from: TODAY, until: day(MAX_REST_PERIOD_DAYS - 1) }, TODAY, database)).resolves.toMatchObject({
      until: day(59),
    })
  })

  it('lehnt Überschneidungen ab, angrenzende Zeiträume sind erlaubt', async () => {
    await addRestPeriod({ from: day(5), until: day(7) }, TODAY, database)
    await addRestPeriod({ from: day(20), until: day(20) }, TODAY, database)
    const overlap = `An diesen Tagen rastest du schon (${short(day(5))} – ${short(day(7))}).`
    await expect(addRestPeriod({ from: day(7), until: day(9) }, TODAY, database)).rejects.toThrow(overlap)
    await expect(addRestPeriod({ from: day(1), until: day(30) }, TODAY, database)).rejects.toThrow(overlap)
    await expect(addRestPeriod({ from: day(20), until: day(21) }, TODAY, database)).rejects.toThrow(
      `An diesen Tagen rastest du schon (${short(day(20))}).`,
    )
    await addRestPeriod({ from: day(8), until: day(19) }, TODAY, database)
    await addRestPeriod({ from: day(1), until: day(4) }, TODAY, database)
    expect((await periods()).map((period) => [period.from, period.until])).toEqual([
      [day(1), day(4)],
      [day(5), day(7)],
      [day(8), day(19)],
      [day(20), day(20)],
    ])
  })

  it('gleichzeitiges Anlegen desselben Tages speichert ihn nur einmal', async () => {
    const results = await Promise.allSettled([
      addRestPeriod({ from: TODAY, until: TODAY }, TODAY, database),
      addRestPeriod({ from: TODAY, until: TODAY }, TODAY, database),
    ])
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(await periods()).toHaveLength(1)
  })

  it('schon abgerechnete Tage (zurückgestellte Uhr) bleiben unangetastet', async () => {
    await database.hpLedger.add(makeLedgerEntry(YESTERDAY))
    await expect(addRestPeriod({ from: YESTERDAY, until: TODAY }, TODAY, database)).rejects.toThrow(
      'Eine Rast kannst du frühestens ab heute eintragen.',
    )
    await database.hpLedger.add(makeLedgerEntry(TODAY))
    await expect(addRestPeriod({ from: TODAY, until: TODAY }, TODAY, database)).rejects.toThrow(
      'Eine Rast kannst du frühestens ab morgen eintragen.',
    )
    await expect(addRestPeriod({ from: day(1), until: day(1) }, TODAY, database)).resolves.toMatchObject({ from: day(1) })
  })

  it('prüft den Spieltag', async () => {
    await expect(addRestPeriod({ from: TODAY, until: TODAY }, '4.11.2026', database)).rejects.toThrow('Ungültiges Datum')
  })
})

describe('updateRestPeriod', () => {
  it('verschiebt eine geplante Rast und ändert ihre Notiz', async () => {
    const planned = await addRestPeriod({ from: day(10), until: day(12), note: 'Urlaub' }, TODAY, database)
    await updateRestPeriod(planned.id, { from: day(11), until: day(15) }, TODAY, database)
    expect(await periods()).toStrictEqual([{ ...planned, from: day(11), until: day(15) }])
    await updateRestPeriod(planned.id, { note: undefined }, TODAY, database)
    expect(await periods()).toStrictEqual([{ id: planned.id, from: day(11), until: day(15), createdAt: planned.createdAt }])
  })

  it('eine laufende Rast lässt sich verlängern und verkürzen – ihr vergangener Teil nicht', async () => {
    const running = await storePast('urlaub', day(-5), day(3))
    await updateRestPeriod(running.id, { until: day(10) }, TODAY, database)
    await updateRestPeriod(running.id, { until: YESTERDAY }, TODAY, database)
    await updateRestPeriod(running.id, { until: day(-2) }, TODAY, database) // endet vorgestern: vergangener Teil gleich
    expect(await periods()).toStrictEqual([{ ...running, until: day(-2) }])

    await expect(updateRestPeriod(running.id, { until: day(-3) }, TODAY, database)).rejects.toThrow(MSG.past)
    await expect(updateRestPeriod(running.id, { from: day(-4) }, TODAY, database)).rejects.toThrow(MSG.past)
    await expect(updateRestPeriod(running.id, { from: day(-6) }, TODAY, database)).rejects.toThrow(MSG.past)
    expect(await periods()).toStrictEqual([{ ...running, until: day(-2) }])
  })

  it('eine vorbei gegangene Rast: nur die Notiz ist änderbar; anschließend verlängern geht nicht rückwirkend', async () => {
    const past = await storePast('krank', day(-9), day(-7))
    await updateRestPeriod(past.id, { note: ' Grippe ' }, TODAY, database)
    expect(await periods()).toStrictEqual([{ ...past, note: 'Grippe' }])
    await expect(updateRestPeriod(past.id, { until: TODAY }, TODAY, database)).rejects.toThrow(MSG.past)
  })

  it('eine geplante Rast lässt sich nicht weiter als bis gestern zurückverlegen', async () => {
    const planned = await addRestPeriod({ from: day(2), until: day(3) }, TODAY, database)
    await expect(updateRestPeriod(planned.id, { from: day(-2) }, TODAY, database)).rejects.toThrow(MSG.tooEarly)
    await updateRestPeriod(planned.id, { from: YESTERDAY }, TODAY, database)
    expect((await periods())[0]).toMatchObject({ from: YESTERDAY, until: day(3) })
  })

  it('gleiche Prüfungen wie beim Anlegen; die Rast selbst zählt nicht als Überschneidung', async () => {
    const first = await addRestPeriod({ from: day(5), until: day(7) }, TODAY, database)
    await addRestPeriod({ from: day(10), until: day(12) }, TODAY, database)
    await updateRestPeriod(first.id, { from: day(4), until: day(9) }, TODAY, database)
    await expect(updateRestPeriod(first.id, { until: day(10) }, TODAY, database)).rejects.toThrow(
      `An diesen Tagen rastest du schon (${short(day(10))} – ${short(day(12))}).`,
    )
    await expect(updateRestPeriod(first.id, { until: day(3) }, TODAY, database)).rejects.toThrow(MSG.order)
    await expect(updateRestPeriod(first.id, { until: day(80) }, TODAY, database)).rejects.toThrow(MSG.tooLong)
    await expect(updateRestPeriod('weg', { note: 'x' }, TODAY, database)).rejects.toThrow(MSG.notFound)
    expect((await periods())[0]).toMatchObject({ from: day(4), until: day(9) })
  })
})

describe('deleteRestPeriod', () => {
  it('löscht eine geplante (oder gestern begonnene) Rast', async () => {
    const planned = await addRestPeriod({ from: day(3), until: day(4) }, TODAY, database)
    const sick = await addRestPeriod({ from: YESTERDAY, until: YESTERDAY }, TODAY, database)
    expect(await deleteRestPeriod(planned.id, TODAY, database)).toBe('deleted')
    expect(await deleteRestPeriod(sick.id, TODAY, database)).toBe('deleted')
    expect(await periods()).toStrictEqual([])
    expect(await deleteRestPeriod('weg', TODAY, database)).toBe('deleted')
  })

  it('eine laufende Rast endet vorzeitig: vergangene Tage bleiben Rasttage', async () => {
    const running = await storePast('urlaub', day(-6), day(6))
    expect(await deleteRestPeriod(running.id, TODAY, database)).toBe('shortened')
    expect(await periods()).toStrictEqual([{ ...running, until: day(-2) }])
  })

  it('eine vorbei gegangene Rast bleibt', async () => {
    const past = await storePast('krank', day(-9), day(-2))
    await expect(deleteRestPeriod(past.id, TODAY, database)).rejects.toThrow(MSG.over)
    expect(await periods()).toStrictEqual([past])
  })

  it('nach der Abrechnung (zurückgestellte Uhr) bleiben abgerechnete Tage', async () => {
    const sick = await addRestPeriod({ from: YESTERDAY, until: day(2) }, TODAY, database)
    await database.hpLedger.add(makeLedgerEntry(YESTERDAY, { score: 'rest' }))
    expect(await deleteRestPeriod(sick.id, TODAY, database)).toBe('shortened')
    expect(await periods()).toStrictEqual([{ ...sick, until: YESTERDAY }])
  })
})
