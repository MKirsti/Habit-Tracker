import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import { addDays } from '../dates'
import { TEST_ATTACK_NAMES, makeBoss, makeBossRoster, makeBossVictory, makeHabit } from '../testing'
import type { AttributeId, DayKey } from '../types'
import {
  attacksOf,
  bossMaxHp,
  bossTheme,
  chooseBoss,
  chooseWeakness,
  heroSeedOf,
  plannedWeekAttacks,
  plannedWeekDamage,
  unrecordedVictories,
  weekDays,
  weekEndOf,
  weeklyBossState,
} from './boss'
import type { AttackSource, CombatStats, WeeklyBossInput } from './boss'

// 2026-11-02 ist ein Montag.
const MONDAY: DayKey = '2026-11-02'
const NO_REST: ReadonlySet<DayKey> = new Set()
const LEVEL_1: CombatStats = { attributeLevels: levels(), classBonus: {} }
const ROSTER = makeBossRoster()

function levels(overrides: Partial<Record<AttributeId, number>> = {}): Record<AttributeId, number> {
  const result = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) result[id] = overrides[id] ?? 1
  return result
}

function byAttribute(values: Partial<Record<AttributeId, number>>): Record<AttributeId, number> {
  const result = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) result[id] = values[id] ?? 0
  return result
}

function attack(day: DayKey, attribute: AttributeId, overrides: Partial<AttackSource> = {}): AttackSource {
  return { day, source: 'quest', sourceId: `${attribute}-quest`, attribute, difficulty: 'medium', ...overrides }
}

function input(overrides: Partial<WeeklyBossInput> = {}): WeeklyBossInput {
  return {
    weekStart: MONDAY,
    today: addDays(MONDAY, 2),
    heroSeed: '2026-01-01Aria',
    planned: [{ attribute: 'strength', difficulty: 'medium', count: 7 }],
    sources: [],
    stats: LEVEL_1,
    bosses: ROSTER,
    attackNames: TEST_ATTACK_NAMES,
    ...overrides,
  }
}

describe('Woche', () => {
  it('weekDays / weekEndOf', () => {
    expect(weekDays(MONDAY)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ])
    expect(weekDays('2026-11-05')[0]).toBe(MONDAY)
    expect(weekEndOf(MONDAY)).toBe('2026-11-08')
  })

  it('heroSeed = createdDay + Name, ohne Profil leer', () => {
    expect(heroSeedOf({ createdDay: '2026-03-01', name: 'Aria' })).toBe('2026-03-01Aria')
    expect(heroSeedOf(undefined)).toBe('')
  })
})

describe('plannedWeekAttacks – geplante Erledigungen', () => {
  const created = '2026-10-01'

  it('täglich 7, Wochentage deren Anzahl, Wochenquest times', () => {
    const habits = [
      makeHabit({ id: 'd', attribute: 'strength', createdDay: created }),
      makeHabit({ id: 'w', attribute: 'wisdom', createdDay: created, schedule: { type: 'weekdays', days: [1, 3, 5] } }),
      makeHabit({ id: 'x', attribute: 'charisma', createdDay: created, schedule: { type: 'weekly', times: 3 } }),
    ]
    expect(plannedWeekAttacks(habits, MONDAY, NO_REST).map((planned) => planned.count)).toEqual([7, 3, 3])
  })

  it('Ruhetage zählen nicht – auch nicht für Wochenquests, wenn nicht mehr genug Tage bleiben', () => {
    const habits = [
      makeHabit({ id: 'd', createdDay: created }),
      makeHabit({ id: 'x', createdDay: created, schedule: { type: 'weekly', times: 3 } }),
    ]
    const twoRestDays = new Set(['2026-11-04', '2026-11-05'])
    expect(plannedWeekAttacks(habits, MONDAY, twoRestDays).map((planned) => planned.count)).toEqual([5, 3])
    const vacation = new Set(weekDays(MONDAY))
    expect(plannedWeekAttacks(habits, MONDAY, vacation)).toEqual([])
    const fiveRestDays = new Set(weekDays(MONDAY).slice(0, 5))
    expect(plannedWeekAttacks(habits, MONDAY, fiveRestDays).map((planned) => planned.count)).toEqual([2, 2])
  })

  it('mitten in der Woche angelegt oder archiviert: nur die aktiven Tage', () => {
    const habits = [
      makeHabit({ id: 'new', createdDay: '2026-11-05' }),
      makeHabit({ id: 'archived', createdDay: created, archivedDay: '2026-11-04' }),
      makeHabit({ id: 'weeklyLate', createdDay: '2026-11-07', schedule: { type: 'weekly', times: 3 } }),
      makeHabit({ id: 'future', createdDay: '2026-11-09' }),
    ]
    expect(plannedWeekAttacks(habits, MONDAY, NO_REST).map((planned) => planned.count)).toEqual([4, 2, 2])
  })

  it('Rhythmus vom Montag zählt für Wochenquests; danach umgestellte Tage als Pflicht', () => {
    // Mo–Mi Wochenquest (3×), ab Donnerstag täglich → 3 Wochentermine + 4 Pflicht-Tage
    const switched = makeHabit({
      id: 's',
      createdDay: created,
      schedule: { type: 'daily' },
      scheduleHistory: [{ until: '2026-11-05', schedule: { type: 'weekly', times: 3 } }],
    })
    // Mo–Di täglich, ab Mittwoch Wochenquest: der Montag war keine Wochenquest → nur die 2 Pflicht-Tage
    const toWeekly = makeHabit({
      id: 't',
      createdDay: created,
      schedule: { type: 'weekly', times: 2 },
      scheduleHistory: [{ until: '2026-11-04', schedule: { type: 'daily' } }],
    })
    expect(plannedWeekAttacks([switched, toWeekly], MONDAY, NO_REST).map((planned) => planned.count)).toEqual([7, 2])
  })

  it('pausierte Tage zählen nicht', () => {
    const paused = makeHabit({ id: 'p', createdDay: created, pauses: [{ from: '2026-11-03', until: '2026-11-06' }] })
    expect(plannedWeekAttacks([paused], MONDAY, NO_REST)[0].count).toBe(4)
  })

  it('übernimmt aktuelles Attribut und Schwierigkeit', () => {
    const habit = makeHabit({ id: 'h', attribute: 'vitality', difficulty: 'hard', createdDay: created })
    expect(plannedWeekAttacks([habit], MONDAY, NO_REST)).toEqual([{ attribute: 'vitality', difficulty: 'hard', count: 7 }])
  })
})

describe('plannedWeekDamage & bossMaxHp', () => {
  it('Schaden einer Erledigung × Anzahl, mit Level und Klassen-Bonus, ohne Schwäche', () => {
    const stats: CombatStats = { attributeLevels: levels({ strength: 6 }), classBonus: { strength: 0.2 } }
    const { total, byAttribute: split } = plannedWeekDamage(
      [
        { attribute: 'strength', difficulty: 'medium', count: 7 }, // 36 × 7 = 252
        { attribute: 'wisdom', difficulty: 'easy', count: 3 }, // 10 × 3 = 30
      ],
      stats,
    )
    expect(total).toBe(282)
    expect(split.strength).toBe(252)
    expect(split.wisdom).toBe(30)
  })

  it('maxHp = max(60, round(0,7 × geplant)), ohne Plan 0', () => {
    expect(bossMaxHp(282)).toBe(197) // 197,4
    expect(bossMaxHp(140)).toBe(98)
    expect(bossMaxHp(80)).toBe(BALANCING.combat.bossMinHp) // 56 → 60
    expect(bossMaxHp(1)).toBe(60)
    expect(bossMaxHp(0)).toBe(0)
    expect(bossMaxHp(Number.NaN)).toBe(0)
  })
})

describe('Boss-Wahl & Schwäche', () => {
  it('Thema = Attribut mit dem größten geplanten Schaden, Gleichstand → ATTRIBUTE_IDS', () => {
    expect(bossTheme(byAttribute({ wisdom: 30, charisma: 40 }))).toBe('charisma')
    expect(bossTheme(byAttribute({ discipline: 40, intellect: 40 }))).toBe('intellect')
    expect(bossTheme(byAttribute({}))).toBeUndefined()
  })

  it('Boss aus dem Thema, deterministisch je Held und Woche', () => {
    const boss = chooseBoss('wisdom', 'seed', MONDAY, ROSTER)
    expect(boss.theme).toBe('wisdom')
    expect(chooseBoss('wisdom', 'seed', MONDAY, ROSTER)).toBe(boss)
    // Unabhängig von der Reihenfolge des Inhalts
    expect(chooseBoss('wisdom', 'seed', MONDAY, [...ROSTER].reverse()).id).toBe(boss.id)
  })

  it('über viele Wochen kommen alle drei Bosse eines Themas vor (ungefähr gleich oft)', () => {
    const counts = new Map<string, number>()
    let week = MONDAY
    for (let i = 0; i < 300; i++) {
      const id = chooseBoss('strength', '2026-01-01Aria', week, ROSTER).id
      counts.set(id, (counts.get(id) ?? 0) + 1)
      week = addDays(week, 7)
    }
    expect([...counts.keys()].sort()).toEqual(['strength-1', 'strength-2', 'strength-3'])
    for (const count of counts.values()) expect(count).toBeGreaterThan(60)
  })

  it('ohne Boss für das Thema gibt es einen Notfall-Boss', () => {
    const boss = chooseBoss('charisma', 'seed', MONDAY, [makeBoss('only', 'strength')])
    expect(boss.theme).toBe('charisma')
    expect(boss.name).not.toBe('')
  })

  it('Schwäche: nie das Thema, wenn es andere Attribute mit Plan gibt', () => {
    let week = MONDAY
    const seen = new Set<AttributeId>()
    for (let i = 0; i < 100; i++) {
      const weakness = chooseWeakness(byAttribute({ strength: 100, wisdom: 10, vitality: 5 }), 'strength', 'seed', week)
      expect(['wisdom', 'vitality']).toContain(weakness)
      seen.add(weakness)
      week = addDays(week, 7)
    }
    expect(seen.size).toBe(2)
  })

  it('Schwäche: nur Attribute mit Plan > 0; gibt es nur das Thema, ist es das Thema', () => {
    expect(chooseWeakness(byAttribute({ strength: 100 }), 'strength', 'seed', MONDAY)).toBe('strength')
  })

  it('eine neue Quest mit anderem Attribut ändert die Schwäche nur, wenn ihr Attribut die Wahl gewinnt', () => {
    let week = MONDAY
    for (let i = 0; i < 100; i++) {
      const before = chooseWeakness(byAttribute({ strength: 100, wisdom: 10, vitality: 5 }), 'strength', 's', week)
      const after = chooseWeakness(byAttribute({ strength: 100, wisdom: 10, vitality: 5, charisma: 1 }), 'strength', 's', week)
      expect([before, 'charisma']).toContain(after)
      week = addDays(week, 7)
    }
  })
})

describe('attacksOf', () => {
  it('chronologisch, Quests vor Nebenquests, mit Angriffsname und Schwäche', () => {
    const attacks = attacksOf(
      [
        attack('2026-11-03', 'wisdom', { source: 'sideQuest', sourceId: 'side' }),
        attack('2026-11-03', 'strength', { order: 5 }),
        attack('2026-11-02', 'wisdom'),
      ],
      LEVEL_1,
      'wisdom',
      TEST_ATTACK_NAMES,
    )
    expect(attacks.map((entry) => [entry.day, entry.source, entry.attribute, entry.damage, entry.weakness])).toEqual([
      ['2026-11-02', 'quest', 'wisdom', 30, true],
      ['2026-11-03', 'quest', 'strength', 20, false],
      ['2026-11-03', 'sideQuest', 'wisdom', 30, true],
    ])
    expect(attacks[0].attackName).toBe('Angriff wisdom')
  })

  it('unbekanntes Attribut oder kein Schaden → kein Angriff', () => {
    const attacks = attacksOf(
      [attack(MONDAY, 'luck' as AttributeId), attack(MONDAY, 'strength', { difficulty: 'mythic' as 'easy' })],
      LEVEL_1,
      undefined,
    )
    expect(attacks).toEqual([])
  })
})

describe('weeklyBossState', () => {
  it('ohne geplanten Schaden kein Boss', () => {
    expect(weeklyBossState(input({ planned: [] }))).toBeUndefined()
  })

  it('Grundwerte: Boss des Themas, Woche, maxHp, HP, Resttage', () => {
    // 7 × 20 = 140 geplant → 98 HP
    const state = weeklyBossState(input())
    expect(state).toBeDefined()
    expect(state?.boss.theme).toBe('strength')
    expect(state?.weekStart).toBe(MONDAY)
    expect(state?.weekEnd).toBe('2026-11-08')
    expect(state?.maxHp).toBe(98)
    expect(state?.damage).toBe(0)
    expect(state?.hp).toBe(98)
    expect(state?.defeated).toBe(false)
    expect(state?.defeatedDay).toBeUndefined()
    expect(state?.daysLeft).toBe(5) // Mittwoch bis Sonntag
    // Nur Stärke geplant → die Schwäche ist das Thema selbst
    expect(state?.weakness).toBe('strength')
  })

  it('daysLeft: Montag 7, Sonntag 1, danach 0', () => {
    expect(weeklyBossState(input({ today: MONDAY }))?.daysLeft).toBe(7)
    expect(weeklyBossState(input({ today: '2026-11-08' }))?.daysLeft).toBe(1)
    expect(weeklyBossState(input({ today: '2026-11-09' }))?.daysLeft).toBe(0)
  })

  it('zählt nur Angriffe der Woche bis heute', () => {
    const state = weeklyBossState(
      input({
        sources: [
          attack('2026-11-01', 'strength'), // Vorwoche
          attack('2026-11-02', 'strength'),
          attack('2026-11-04', 'strength'),
          attack('2026-11-05', 'strength'), // nach heute
          attack('2026-11-09', 'strength'), // nächste Woche
        ],
      }),
    )
    expect(state?.attacks.map((entry) => entry.day)).toEqual(['2026-11-02', '2026-11-04'])
    // Schwäche = Stärke (nur Stärke geplant) → 30 je Treffer
    expect(state?.damage).toBe(60)
    expect(state?.hp).toBe(38)
  })

  it('besiegt am Tag, an dem die Summe maxHp erreicht; damage bleibt ungedeckelt', () => {
    const planned = [
      { attribute: 'strength' as const, difficulty: 'medium' as const, count: 7 },
      { attribute: 'wisdom' as const, difficulty: 'medium' as const, count: 1 },
    ]
    // 8 × 20 = 160 → 112 HP. Schwäche: Weisheit (einziges anderes Attribut).
    const state = weeklyBossState(
      input({
        planned,
        today: '2026-11-07',
        sources: [
          attack('2026-11-02', 'strength'), // 20
          attack('2026-11-03', 'strength'), // 40
          attack('2026-11-04', 'wisdom'), // 30 → 70
          attack('2026-11-05', 'strength'), // 90
          attack('2026-11-06', 'strength'), // 110
          attack('2026-11-07', 'strength'), // 130 ≥ 112
          attack('2026-11-07', 'strength', { sourceId: 'other' }), // 150
        ],
      }),
    )
    expect(state?.maxHp).toBe(112)
    expect(state?.weakness).toBe('wisdom')
    expect(state?.damage).toBe(150)
    expect(state?.hp).toBe(0)
    expect(state?.defeated).toBe(true)
    expect(state?.defeatedDay).toBe('2026-11-07')
  })

  it('genau maxHp Schaden reicht; einer weniger nicht', () => {
    const planned = [{ attribute: 'strength' as const, difficulty: 'easy' as const, count: 2 }] // 20 → 60 HP (Untergrenze)
    // Schwäche = Stärke (einziges Attribut): mittel 30, leicht 15
    const exact = weeklyBossState(
      input({ planned, sources: [attack(MONDAY, 'strength'), attack('2026-11-03', 'strength')] }),
    )
    expect(exact?.maxHp).toBe(60)
    expect(exact?.damage).toBe(60)
    expect(exact?.defeated).toBe(true)
    expect(exact?.defeatedDay).toBe('2026-11-03')

    const short = weeklyBossState(
      input({
        planned,
        sources: [attack(MONDAY, 'strength'), attack('2026-11-03', 'strength', { difficulty: 'easy' })],
      }),
    )
    expect(short?.damage).toBe(45)
    expect(short?.defeated).toBe(false)
    expect(short?.hp).toBe(15)
  })

  it('gespeicherter Sieg bleibt: auch wenn der Schaden später sinkt oder der Plan wächst', () => {
    const victory = makeBossVictory(MONDAY, { bossId: 'wisdom-2', day: '2026-11-03', maxHp: 80 })
    const state = weeklyBossState(
      input({
        planned: [{ attribute: 'strength', difficulty: 'hard', count: 14 }], // viel mehr geplant als beim Sieg
        sources: [], // Erledigungen zurückgenommen
        victory,
      }),
    )
    expect(state?.defeated).toBe(true)
    expect(state?.defeatedDay).toBe('2026-11-03')
    expect(state?.boss.id).toBe('wisdom-2')
    expect(state?.maxHp).toBe(80)
    expect(state?.hp).toBe(0)
    expect(state?.damage).toBe(0)
  })

  it('gespeicherter Sieg ohne Plan (z. B. danach Urlaub eingetragen) zeigt den Boss weiter als besiegt', () => {
    const state = weeklyBossState(input({ planned: [], victory: makeBossVictory(MONDAY, { bossId: 'strength-3' }) }))
    expect(state?.defeated).toBe(true)
    expect(state?.boss.id).toBe('strength-3')
  })

  it('ein Sieg einer anderen Woche zählt nicht', () => {
    const state = weeklyBossState(input({ victory: makeBossVictory('2026-10-26') }))
    expect(state?.defeated).toBe(false)
  })

  it('deterministisch: gleiche Eingaben → gleicher Boss und gleiche Schwäche', () => {
    const planned = [
      { attribute: 'intellect' as const, difficulty: 'medium' as const, count: 7 },
      { attribute: 'vitality' as const, difficulty: 'easy' as const, count: 7 },
      { attribute: 'discipline' as const, difficulty: 'easy' as const, count: 3 },
    ]
    const a = weeklyBossState(input({ planned }))
    const b = weeklyBossState(input({ planned: [...planned].reverse() }))
    expect(a?.boss.id).toBe(b?.boss.id)
    expect(a?.weakness).toBe(b?.weakness)
    expect(a?.boss.theme).toBe('intellect')
    expect(a?.weakness).not.toBe('intellect')
  })
})

describe('unrecordedVictories', () => {
  it('liefert abgeleitete, noch nicht gespeicherte Siege (je Woche einer)', () => {
    const defeated = weeklyBossState(
      input({
        planned: [{ attribute: 'strength', difficulty: 'easy', count: 2 }],
        sources: [attack(MONDAY, 'strength', { difficulty: 'epic' })],
      }),
    )
    const open = weeklyBossState(input({ weekStart: '2026-10-26', today: '2026-11-02' }))
    expect(unrecordedVictories([defeated, open, undefined], undefined)).toEqual([
      { weekStart: MONDAY, bossId: defeated?.boss.id, day: MONDAY, maxHp: 60 },
    ])
    expect(unrecordedVictories([defeated], [makeBossVictory(MONDAY)])).toEqual([])
  })
})
