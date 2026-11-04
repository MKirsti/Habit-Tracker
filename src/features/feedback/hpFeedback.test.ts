import { describe, expect, it } from 'vitest'
import type { HpLedgerEntry, HpState, Purchase } from '../../domain/types'
import { appendedLedgerEntries, hpFeedbackEvents, settledDayName } from './hpFeedback'
import type { HpSnapshot } from './hpFeedback'
import { defeatSceneText, freezeToastText, potionToastText } from './feedbackText'

const TODAY = '2026-11-04'

function entry(day: string, extra: Partial<HpLedgerEntry> = {}): HpLedgerEntry {
  return { day, score: 'missed', frozen: false, hpDelta: -6, hpAfter: 40, maxHp: 55, penalties: true, ...extra }
}

function hp(current: number, extra: Partial<HpState> = {}): HpState {
  return { enabled: true, current, max: 55, ratio: current / 55, defeats: 0, ...extra }
}

function snapshot(
  ledger: HpLedgerEntry[] | undefined,
  current = 40,
  purchases: Purchase[] | undefined = undefined,
): HpSnapshot {
  return { ledger, purchases, state: { today: TODAY, hp: hp(current) } }
}

const potion = (id: string, day = TODAY): Purchase => ({
  id,
  kind: 'item',
  itemId: 'healingPotion',
  title: 'Heiltrank',
  icon: '🧪',
  price: 80,
  day,
  createdAt: 1,
})

describe('appendedLedgerEntries', () => {
  it('liefert nur angehängte Tage – nie ersetzte oder ältere (Backup)', () => {
    const before = [entry('2026-10-31'), entry('2026-11-01')]
    expect(appendedLedgerEntries(before, [...before, entry('2026-11-02')]).map((e) => e.day)).toEqual(['2026-11-02'])
    // Erste Abrechnung überhaupt.
    expect(appendedLedgerEntries(undefined, [entry('2026-11-02'), entry('2026-11-01')]).map((e) => e.day)).toEqual([
      '2026-11-01',
      '2026-11-02',
    ])
    // Ein älterer, bisher fehlender Tag (eingespieltes Backup) zählt nicht.
    expect(appendedLedgerEntries(before, [entry('2026-10-20'), ...before])).toEqual([])
    expect(appendedLedgerEntries(before, before)).toEqual([])
    expect(appendedLedgerEntries(before, undefined)).toEqual([])
  })
})

describe('hpFeedbackEvents', () => {
  it('bleibt beim üblichen Tagesschaden still – der steht im Helden-Kopf', () => {
    const before = [entry('2026-11-01')]
    expect(hpFeedbackEvents(snapshot(before, 46), snapshot([...before, entry('2026-11-02')], 40))).toEqual([])
  })

  it('meldet eine neu abgerechnete Niederlage mit verlorenem Gold und den HP danach', () => {
    const before = [entry('2026-11-01', { hpAfter: 4 })]
    const after = [...before, entry('2026-11-02', { hpDelta: -4, hpAfter: 55, defeat: { goldLost: 180 } })]
    expect(hpFeedbackEvents(snapshot(before, 4), snapshot(after, 55))).toEqual([
      { type: 'defeat', day: '2026-11-02', goldLost: 180, count: 1, hp: 55, max: 55 },
    ])
  })

  it('fasst mehrere Niederlagen eines Schritts zusammen (lange Abwesenheit)', () => {
    const after = [
      entry('2026-10-28', { defeat: { goldLost: 100 } }),
      entry('2026-10-29'),
      entry('2026-10-30', { defeat: { goldLost: 85 } }),
      entry('2026-10-31', { defeat: { goldLost: Number.NaN } }),
    ]
    const [event] = hpFeedbackEvents(snapshot([]), snapshot(after, 49))
    expect(event).toEqual({ type: 'defeat', day: '2026-10-31', goldLost: 185, count: 3, hp: 49, max: 55 })
  })

  it('meldet eingesetzte Streak-Schutz-Gegenstände (auch im Sanften Modus)', () => {
    const before = [entry('2026-10-31')]
    const after = [
      ...before,
      entry('2026-11-01', { frozen: true, hpDelta: 0 }),
      entry('2026-11-02', { frozen: true, hpDelta: 0, penalties: false }),
    ]
    expect(hpFeedbackEvents(snapshot(before), snapshot(after))).toEqual([
      { type: 'freeze-used', days: ['2026-11-01', '2026-11-02'] },
    ])
  })

  it('meldet heute getrunkene Heiltränke mit den tatsächlich geheilten HP', () => {
    const ledger = [entry('2026-11-02')]
    const events = hpFeedbackEvents(snapshot(ledger, 40, [potion('a', '2026-11-01')]), {
      ...snapshot(ledger, 55, [potion('a', '2026-11-01'), potion('b')]),
    })
    expect(events).toEqual([{ type: 'potion-healed', count: 1, healed: 15, hp: 55, max: 55 }])
    // Andere Käufe (Belohnungen, Streak-Schutz) und rückgängig gemachte Tränke melden nichts.
    const reward: Purchase = { ...potion('c'), kind: 'reward', itemId: undefined, rewardId: 'r' }
    const freeze: Purchase = { ...potion('d'), itemId: 'streakFreeze' }
    expect(hpFeedbackEvents(snapshot(ledger, 40, []), snapshot(ledger, 40, [reward, freeze]))).toEqual([])
    expect(hpFeedbackEvents(snapshot(ledger, 55, [potion('b')]), snapshot(ledger, 35, []))).toEqual([])
  })
})

describe('Texte', () => {
  it('benennt abgerechnete Tage mit Wochentag bzw. Datum', () => {
    expect(settledDayName('2026-11-02', TODAY)).toBe('Montag')
    expect(settledDayName('2026-10-20', TODAY)).toBe('20. Okt.')
  })

  it('Streak-Schutz: kurz und beruhigend', () => {
    expect(freezeToastText({ days: ['2026-11-02'] }, TODAY)).toEqual({
      title: 'Streak-Schutz eingesetzt',
      description: 'Er hat Montag aufgefangen – keine HP verloren, deine Serien bleiben bestehen.',
    })
    expect(freezeToastText({ days: ['2026-11-01', '2026-11-02'] }, TODAY)).toEqual({
      title: '2× Streak-Schutz eingesetzt',
      description: 'Sie haben Sonntag und Montag aufgefangen – keine HP verloren, deine Serien bleiben bestehen.',
    })
  })

  it('Heiltrank: geheilte HP und neuer Stand', () => {
    expect(potionToastText({ count: 1, healed: 20, hp: 42, max: 55 })).toEqual({
      title: 'Heiltrank getrunken · +20 HP',
      description: 'Lebenspunkte: 42 / 55 HP',
    })
    expect(potionToastText({ count: 2, healed: 13, hp: 55, max: 55 })).toEqual({
      title: '2 Heiltränke getrunken · +13 HP',
      description: 'Lebenspunkte wieder voll: 55 / 55 HP',
    })
  })

  it('Niederlage: würdevoll, mit verlorenem Gold und dem, was bleibt', () => {
    const text = defeatSceneText({ type: 'defeat', day: '2026-11-02', goldLost: 1234, count: 1, hp: 55, max: 55 }, TODAY)
    expect(text.title).toBe('Du bist gefallen\u00a0– und stehst wieder auf')
    // Das Gold ist der Lohn des Heilers – eine Geschichte statt einer Strafe.
    expect(text.body).toBe(
      'Deine Lebenspunkte sind am Montag auf 0 gesunken. Ein Heiler hat dich wieder auf die Beine gebracht – sein Lohn: 1.234 Gold. Level, XP und Serien bleiben dir.',
    )
    expect(text.hpLine).toBe('Du stehst mit vollen Lebenspunkten wieder auf.')
    // Mit vollen HP wäre „heilt +10 HP“ leer – ermutigt wird zum nächsten Schritt.
    expect(text.encouragement).toBe('Heute ist ein neuer Tag – schon eine erledigte Quest ist ein guter Neuanfang.')
    expect(text.gentleHint).toContain('Sanften Modus')
    // Nichts Beschämendes.
    expect(Object.values(text).join(' ')).not.toMatch(/versagt|schlecht|Strafe|leider|kostet/i)

    const twice = defeatSceneText({ type: 'defeat', day: '2026-10-20', goldLost: 0, count: 2, hp: 37, max: 55 }, TODAY)
    expect(twice.body).toBe(
      'Deine Lebenspunkte sind am 20. Okt. auf 0 gesunken – 2× in den letzten Tagen. Ein Heiler hat dich wieder auf die Beine gebracht – diesmal ganz ohne Lohn. Level, XP und Serien bleiben dir.',
    )
    expect(twice.hpLine).toBe('Seitdem hast du weitergekämpft – so stehst du heute da.')
    // Nicht mehr voll: Der Weg nach oben steht da.
    expect(twice.encouragement).toContain('+10 HP')
  })
})
