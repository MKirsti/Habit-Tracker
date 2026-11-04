/**
 * Review Phase 3a (Logik): gezielte Proben zu Abrechnung, Truhen, Bossen und Helden-Seed – jede ein Fehler, der
 * beim Review gefunden wurde (erst als fehlschlagender Test, dann behoben), plus Determinismus und Laufzeit.
 */
import { describe, expect, it } from 'vitest'
import { BALANCING, DEFAULT_SETTINGS } from './balancing'
import { heroSeedOf } from './combat/boss'
import { addDays } from './dates'
import { deriveGameState } from './engine'
import { settleDays } from './hp'
import { makeChest, makeCompletion, makeGameData, makeHabit, makeLedgerEntry } from './testing'
import type { Chest, DayKey, GameData } from './types'

/** Lokale Mittagszeit eines Tages (für `openedAt` – unabhängig von der Zeitzone derselbe Spieltag). */
function localNoon(day: DayKey): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, 12).getTime()
}

describe('Review 3a – Streak-Schutz aus Truhen in der Abrechnung', () => {
  const since: DayKey = '2026-11-02'
  const daily = makeHabit({ id: 'd', difficulty: 'easy', createdDay: since })
  const freezeChest = (openedDay: DayKey): Chest =>
    makeChest(`quest:x:${since}`, {
      foundDay: since,
      rarity: 'rare',
      content: { kind: 'item', itemId: 'streakFreeze' },
      openedAt: localNoon(openedDay),
    })

  /** 02.11. perfekt und abgerechnet, 03.11. verpasst; ein Streak-Schutz kam am 02.11. aus einer Truhe. */
  function data(): GameData {
    return makeGameData({
      profile: { name: 'Aria', avatar: '🧝', createdDay: since },
      settings: { ...DEFAULT_SETTINGS, penalties: { enabled: true, since } },
      habits: [daily],
      completions: [makeCompletion(daily, since)],
      hpLedger: [makeLedgerEntry(since, { score: 'perfect' })],
      chests: [freezeChest(since)],
    })
  }

  it('die Abrechnung fängt den Tag genau so auf, wie es die Vorschau für gestern angekündigt hat', () => {
    // Am 04.11.: Vorschau für gestern – der Truhen-Streak-Schutz rettet ihn.
    const preview = deriveGameState(data(), '2026-11-04').hp.yesterday
    expect(preview).toMatchObject({ day: '2026-11-03', score: 'missed', savedByFreeze: true, threatenedDelta: 0 })

    // Am 05.11. wird der 03.11. abgerechnet – mit demselben Ergebnis.
    const [entry] = settleDays(data(), '2026-11-05')
    expect(entry).toMatchObject({ day: '2026-11-03', score: 'missed', frozen: true, hpDelta: 0 })

    // Danach ist der Vorrat leer (verbraucht), nicht weiter 1.
    const settled = { ...data(), hpLedger: [...(data().hpLedger ?? []), entry] }
    expect(deriveGameState(settled, '2026-11-05').inventory.streakFreezes).toBe(0)
  })

  it('ein erst heute geöffneter Truhen-Streak-Schutz rettet den abgerechneten Vortag nicht', () => {
    const late = { ...data(), chests: [freezeChest('2026-11-05')] }
    const [entry] = settleDays(late, '2026-11-05')
    expect(entry).toMatchObject({ day: '2026-11-03', frozen: false, hpDelta: BALANCING.hpByScore.missed })
  })
})

describe('Review 3a – Boss-Truhen sind je Held verschieden', () => {
  /** Boss-Truhen zweier Helden für 52 Siege in Folge (gleiche Wochen, gleiche Siegtage). */
  function bossChestsOf(profile: { name: string; createdDay: DayKey }): Chest[] {
    const weeks = Array.from({ length: 52 }, (_, i) => addDays('2026-01-05', 7 * i))
    const today = addDays(weeks[weeks.length - 1], 6)
    return deriveGameState(
      makeGameData({
        profile: { ...profile, avatar: '🧝' },
        bossVictories: weeks.map((weekStart) => ({ weekStart, bossId: 'couch-golem', day: addDays(weekStart, 4), maxHp: 100 })),
      }),
      today,
    ).chests.filter((chest) => chest.source === 'boss')
  }

  it('zwei Helden (z. B. auf zwei Handys) bekommen in derselben Woche nicht stets dieselbe Beute', () => {
    const juna = bossChestsOf({ name: 'Juna', createdDay: '2026-01-01' })
    const kai = bossChestsOf({ name: 'Kai', createdDay: '2026-01-03' })
    expect(juna.map((chest) => chest.id)).toEqual(kai.map((chest) => chest.id))
    const same = juna.filter((chest, i) => JSON.stringify([chest.rarity, chest.content]) === JSON.stringify([kai[i].rarity, kai[i].content]))
    // Gleich wären sie nur zufällig (gemeinsame Seltenheit common und derselbe Goldbetrag) – nie in jeder Woche.
    expect(same.length).toBeLessThan(juna.length / 4)
  })

  it('für einen Helden bleibt es deterministisch: gleiche Daten → gleiche Beute', () => {
    const profile = { name: 'Juna', createdDay: '2026-01-01' as DayKey }
    expect(bossChestsOf(profile)).toEqual(bossChestsOf({ ...profile }))
  })
})

describe('Review 3a – Helden-Seed', () => {
  it('heroSeed = Anlegetag + Name (Grundlage aller Kampf-Hashes); ein festgehaltener Seed geht vor', () => {
    expect(heroSeedOf({ createdDay: '2026-10-19', name: 'Juna' })).toBe('2026-10-19Juna')
    expect(heroSeedOf(undefined)).toBe('')
    // Nach einer Umbenennung hält das Repository den bisherigen Seed fest (`CharacterProfile.heroSeed`).
    expect(heroSeedOf({ createdDay: '2026-10-19', name: 'Juna Sturmwind', heroSeed: '2026-10-19Juna' })).toBe('2026-10-19Juna')
    // Ein leerer oder kaputter gespeicherter Wert zählt nicht.
    expect(heroSeedOf({ createdDay: '2026-10-19', name: 'Juna', heroSeed: '' })).toBe('2026-10-19Juna')
  })

  it('Umbenennen mit festgehaltenem Seed ändert weder Boss, Schwäche noch Truhen der laufenden Woche', () => {
    const habits = [
      makeHabit({ id: 'lesen', attribute: 'intellect', difficulty: 'hard', createdDay: '2026-10-19' }),
      makeHabit({ id: 'anrufen', attribute: 'charisma', createdDay: '2026-10-19', schedule: { type: 'weekly', times: 2 }, order: 1 }),
    ]
    const completions = habits.flatMap((habit) => ['2026-11-02', '2026-11-03', '2026-11-04'].map((day) => makeCompletion(habit, day)))
    const base = makeGameData({ profile: { name: 'Juna', avatar: '🧝', createdDay: '2026-10-19' }, habits, completions })
    const renamed = { ...base, profile: { name: 'Juna Sturmwind', avatar: '🧝', createdDay: '2026-10-19', heroSeed: '2026-10-19Juna' } }
    const before = deriveGameState(base, '2026-11-04')
    const after = deriveGameState(renamed, '2026-11-04')
    expect(after.bosses).toEqual(before.bosses)
    expect(after.chests).toEqual(before.chests)
  })
})

describe('Review 3a – Laufzeit mit drei Jahren Truhen, Siegen und Abrechnung', () => {
  it('deriveGameState und eine Abrechnung über drei Jahre bleiben zügig', () => {
    const start: DayKey = '2024-01-01'
    const today: DayKey = '2026-12-30'
    const attributes = ['strength', 'intellect', 'wisdom', 'charisma', 'vitality', 'discipline'] as const
    const habits = Array.from({ length: 12 }, (_, i) =>
      makeHabit({ id: `h${i}`, order: i, attribute: attributes[i % 6], difficulty: i % 2 ? 'medium' : 'easy', createdDay: start }),
    )
    const days: DayKey[] = []
    for (let day = start; day < today; day = addDays(day, 1)) days.push(day)
    const completions = habits.flatMap((habit, i) => days.filter((_, n) => n % 30 !== 15 && (n + i) % 5 !== 0).map((day) => makeCompletion(habit, day)))
    const weeks = days.filter((_, n) => n % 7 === 0)
    // Je Tag eine gespeicherte Quest-Truhe (die meisten geöffnet, jede 20. ein Streak-Schutz), dazu jede Woche ein Sieg.
    const chests: Chest[] = [
      ...days.map((day, n) =>
        makeChest(`quest:h${n % 12}:${day}`, {
          foundDay: day,
          content: n % 20 === 0 ? { kind: 'item', itemId: 'streakFreeze' } : { kind: 'gold', amount: 20 + (n % 30) },
          ...(n % 3 !== 0 ? { openedAt: localNoon(day) } : {}),
        }),
      ),
      ...weeks.slice(0, -1).map((week) => makeChest(`boss:${week}`, { foundDay: addDays(week, 4), openedAt: localNoon(addDays(week, 4)) })),
    ]
    const data = makeGameData({
      profile: { name: 'Aria', avatar: '🧝', createdDay: start },
      settings: { ...DEFAULT_SETTINGS, penalties: { enabled: true, since: start } },
      habits,
      completions,
      chests,
      bossVictories: weeks.slice(0, -1).map((weekStart) => ({ weekStart, bossId: 'couch-golem', day: addDays(weekStart, 4), maxHp: 300 })),
    })

    deriveGameState(data, today) // Aufwärmen
    let started = performance.now()
    const state = deriveGameState(data, today)
    const deriveMs = performance.now() - started
    expect(state.chests.length).toBeGreaterThanOrEqual(chests.length)
    expect(state.gold.fromChests).toBeGreaterThan(0)

    started = performance.now()
    const ledger = settleDays(data, today)
    const settleMs = performance.now() - started
    expect(ledger.length).toBe(days.length - 1) // bis vorgestern
    expect(ledger.some((entry) => entry.frozen)).toBe(true) // Truhen-Streak-Schutz wirkt in der Abrechnung

    // Großzügige Grenzen gegen quadratische Ausreißer (gemessen: je ≈ 50–60 ms).
    expect(deriveMs).toBeLessThan(1500)
    expect(settleMs).toBeLessThan(5000)
  })
})
