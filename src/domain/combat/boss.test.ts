import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import { addDays } from '../dates'
import { TEST_ATTACK_NAMES, makeBoss, makeBossRoster, makeBossVictory, makeHabit } from '../testing'
import type { AttributeId, DayKey } from '../types'
import {
  SECOND_THEME_SHARE,
  attacksOf,
  bossMaxHp,
  bossTheme,
  chooseBoss,
  chooseWeakness,
  createBossResolver,
  heroSeedOf,
  isSecondThemeWeek,
  plannedWeekAttacks,
  plannedWeekDamage,
  secondBossTheme,
  unrecordedVictories,
  weekBoss,
  weekBossTheme,
  weekDays,
  weekEndOf,
  weeklyBossState,
  withCompanionHits,
} from './boss'
import type { AttackSource, BossWeekPlan, CombatStats, CompanionAttackInput, WeeklyBossInput } from './boss'

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

  it('maxHp = max(min(60, geplant), round(0,7 × geplant)), ohne Plan 0', () => {
    expect(bossMaxHp(282)).toBe(197) // 197,4
    expect(bossMaxHp(140)).toBe(98)
    expect(bossMaxHp(80)).toBe(BALANCING.combat.bossMinHp) // 56 → 60
    expect(bossMaxHp(60)).toBe(60) // 42 → 60 = genau der Plan
    expect(bossMaxHp(40)).toBe(40) // nie mehr als geplant
    expect(bossMaxHp(1)).toBe(1)
    expect(bossMaxHp(0)).toBe(0)
    expect(bossMaxHp(Number.NaN)).toBe(0)
  })

  it('Nachbesserung 3a: maxHp liegt nie über dem geplanten Schaden – und mit vollem Plan ist der Boss schaffbar', () => {
    for (let planned = 1; planned <= 2_000; planned++) {
      const maxHp = bossMaxHp(planned)
      expect(maxHp, `geplant ${planned}`).toBeLessThanOrEqual(planned)
      expect(maxHp, `geplant ${planned}`).toBeGreaterThanOrEqual(Math.min(BALANCING.combat.bossMinHp, planned))
      expect(maxHp, `geplant ${planned}`).toBe(Math.max(Math.min(60, planned), Math.round(0.7 * planned)))
    }
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
    const planned = [{ attribute: 'strength' as const, difficulty: 'easy' as const, count: 6 }] // 60 → 60 HP (Untergrenze)
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

  it('Nachbesserung 3a: ein kleiner Plan bekommt einen kleinen Boss – zwei leichte Erledigungen reichen', () => {
    const planned = [{ attribute: 'strength' as const, difficulty: 'easy' as const, count: 2 }] // 20 geplant → 20 HP
    const state = weeklyBossState(
      input({
        planned,
        sources: [attack(MONDAY, 'strength', { difficulty: 'easy' }), attack('2026-11-03', 'strength', { difficulty: 'easy' })],
      }),
    )
    expect(state?.maxHp).toBe(20)
    expect(state?.damage).toBe(30) // 2 × 15 gegen die Schwäche
    expect(state?.defeated).toBe(true)
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
      { weekStart: MONDAY, bossId: defeated?.boss.id, day: MONDAY, maxHp: 20 }, // 20 geplant → 20 HP
    ])
    expect(unrecordedVictories([defeated], [makeBossVictory(MONDAY)])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Nachbesserung 3a: Boss-Vielfalt
// ---------------------------------------------------------------------------

/** Plan mit diesen Schadenswerten je Attribut. */
function plan(values: Partial<Record<AttributeId, number>>, victory?: BossWeekPlan['victory']): BossWeekPlan {
  const split = byAttribute(values)
  const total = ATTRIBUTE_IDS.reduce((sum, id) => sum + split[id], 0)
  return victory === undefined ? { byAttribute: split, total } : { byAttribute: split, total, victory }
}

/** Die Montage ab `from` (n Wochen). */
function mondays(from: DayKey, n: number): DayKey[] {
  return Array.from({ length: n }, (_, i) => addDays(from, 7 * i))
}

describe('Nachbesserung 3a: Thema – etwa jede 4. Woche das zweitstärkste Attribut', () => {
  it('secondBossTheme: zweitgrößter geplanter Schaden > 0, Gleichstand → ATTRIBUTE_IDS', () => {
    expect(secondBossTheme(byAttribute({ strength: 100, wisdom: 50, charisma: 20 }))).toBe('wisdom')
    expect(secondBossTheme(byAttribute({ strength: 100, wisdom: 50, intellect: 50 }))).toBe('intellect')
    expect(secondBossTheme(byAttribute({ strength: 100 }))).toBeUndefined()
    expect(secondBossTheme(byAttribute({}))).toBeUndefined()
  })

  it('weekBossTheme: in Nebenthema-Wochen das zweitstärkste, sonst das stärkste; ohne zweites immer das stärkste', () => {
    const split = byAttribute({ strength: 100, wisdom: 50 })
    for (const week of mondays(MONDAY, 60)) {
      expect(weekBossTheme(split, 'Aria', week)).toBe(isSecondThemeWeek('Aria', week) ? 'wisdom' : 'strength')
      expect(weekBossTheme(byAttribute({ strength: 100 }), 'Aria', week)).toBe('strength')
    }
    expect(weekBossTheme(byAttribute({}), 'Aria', MONDAY)).toBeUndefined()
  })

  it('isSecondThemeWeek: deterministisch je Held und Woche (jeder Tag der Woche gleich), Anteil ≈ 25 %', () => {
    expect(isSecondThemeWeek('Aria', '2026-11-05')).toBe(isSecondThemeWeek('Aria', MONDAY))
    let second = 0
    let total = 0
    for (let seed = 0; seed < 40; seed++) {
      for (const week of mondays('2026-01-05', 52)) {
        total++
        if (isSecondThemeWeek(`2026-01-01Held${seed}`, week)) second++
      }
    }
    expect(SECOND_THEME_SHARE).toBe(0.25)
    expect(second / total).toBeGreaterThan(0.21)
    expect(second / total).toBeLessThan(0.29)
  })

  it('chooseBoss: der Boss der Vorwoche kommt nicht in Frage – außer er ist der einzige des Themas', () => {
    for (const week of mondays(MONDAY, 30)) {
      const free = chooseBoss('strength', 'Aria', week, ROSTER)
      const excluded = chooseBoss('strength', 'Aria', week, ROSTER, free.id)
      expect(excluded.id).not.toBe(free.id)
      expect(excluded.theme).toBe('strength')
      // Ein anderer ausgeschlossener Boss ändert die Wahl nicht.
      const other = ROSTER.find((boss) => boss.theme === 'strength' && boss.id !== free.id)?.id
      if (other !== undefined) expect(chooseBoss('strength', 'Aria', week, ROSTER, other).id).toBe(free.id)
    }
    const single = [makeBoss('only', 'wisdom')]
    expect(chooseBoss('wisdom', 'Aria', MONDAY, single, 'only').id).toBe('only')
  })

  it('weekBoss: gespeicherter Sieg gewinnt; ohne Plan und Sieg kein Boss', () => {
    expect(weekBoss(plan({}), 'Aria', MONDAY, undefined, ROSTER)).toBeUndefined()
    const stored = weekBoss(plan({ strength: 100 }, makeBossVictory(MONDAY, { bossId: 'charisma-2' })), 'Aria', MONDAY, 'charisma-2', ROSTER)
    expect(stored?.id).toBe('charisma-2')
  })
})

describe('Nachbesserung 3a: createBossResolver – nie derselbe Boss zwei Wochen in Folge', () => {
  const weeks = mondays('2026-01-05', 52)

  function resolverFor(planOf: (week: DayKey) => BossWeekPlan, heroSeed = '2026-01-05Aria') {
    let calls = 0
    const resolver = createBossResolver({
      heroSeed,
      fromWeek: weeks[0],
      bosses: ROSTER,
      planOf: (week) => {
        calls++
        return planOf(week)
      },
    })
    return { resolver, calls: () => calls }
  }

  it('52 Wochen nur ein Thema: kein Boss zweimal in Folge, alle drei kommen vor', () => {
    for (let seed = 0; seed < 20; seed++) {
      const { resolver } = resolverFor(() => plan({ strength: 300 }), `2026-01-05Held${seed}`)
      const ids = weeks.map((week) => resolver.bossOf(week)?.id)
      for (let i = 1; i < ids.length; i++) expect(ids[i], `Held ${seed}, Woche ${weeks[i]}`).not.toBe(ids[i - 1])
      expect(new Set(ids)).toEqual(new Set(['strength-1', 'strength-2', 'strength-3']))
    }
  })

  it('nach einer Woche ohne Boss (z. B. Urlaub) kommt nie der Boss von davor wieder', () => {
    for (let seed = 0; seed < 40; seed++) {
      // Jede 3. Woche ohne Plan (Urlaub), sonst nur Stärke.
      const isGap = (week: DayKey) => weeks.indexOf(week) % 3 === 1
      const { resolver } = resolverFor((week) => (isGap(week) ? plan({}) : plan({ strength: 300 })), `2026-01-05Held${seed}`)
      let lastBossId: string | undefined
      for (const week of weeks) {
        const boss = resolver.bossOf(week)
        if (isGap(week)) {
          expect(boss, `Held ${seed}, Urlaubswoche ${week}`).toBeUndefined()
          continue
        }
        expect(boss?.id, `Held ${seed}, Woche ${week}`).not.toBe(lastBossId)
        lastBossId = boss?.id
      }
    }
  })

  it('52 Wochen mit zwei Themen: kein Boss zweimal in Folge; etwa jede 4. Woche kommt das zweite Thema', () => {
    let second = 0
    let total = 0
    for (let seed = 0; seed < 30; seed++) {
      const { resolver } = resolverFor(() => plan({ intellect: 400, wisdom: 250, charisma: 40 }), `2026-01-05Held${seed}`)
      const bosses = weeks.map((week) => resolver.bossOf(week))
      for (let i = 1; i < bosses.length; i++) expect(bosses[i]?.id).not.toBe(bosses[i - 1]?.id)
      for (const boss of bosses) {
        total++
        if (boss?.theme === 'wisdom') second++
        expect(['intellect', 'wisdom']).toContain(boss?.theme) // nie das drittstärkste
      }
    }
    expect(second / total).toBeGreaterThan(0.2)
    expect(second / total).toBeLessThan(0.3)
  })

  it('ohne Vielfalts-Regel kämen Wiederholungen vor – die Kette verhindert genau die', () => {
    let repeatsWithout = 0
    const { resolver } = resolverFor(() => plan({ strength: 300 }))
    for (let i = 1; i < weeks.length; i++) {
      const free = chooseBoss('strength', '2026-01-05Aria', weeks[i], ROSTER)
      const previousFree = chooseBoss('strength', '2026-01-05Aria', weeks[i - 1], ROSTER)
      if (free.id === previousFree.id) repeatsWithout++
      expect(resolver.bossOf(weeks[i])?.id).not.toBe(resolver.bossOf(weeks[i - 1])?.id)
    }
    expect(repeatsWithout).toBeGreaterThan(5) // bei 3 Bossen je Thema ≈ ⅓ der Wochen
  })

  it('ein gespeicherter Sieg legt den Boss fest – auch für die Regel der Folgewoche', () => {
    const victoryWeek = weeks[10]
    const plans = (stored: string | undefined) => (week: DayKey) =>
      plan({ strength: 300 }, week === victoryWeek && stored !== undefined ? makeBossVictory(week, { bossId: stored }) : undefined)
    for (const stored of ['strength-1', 'strength-2', 'strength-3', 'wisdom-1']) {
      const { resolver } = resolverFor(plans(stored))
      expect(resolver.bossOf(victoryWeek)?.id).toBe(stored)
      expect(resolver.bossOf(weeks[11])?.id).not.toBe(stored)
    }
  })

  it('Wochen ohne Plan haben keinen Boss und unterbrechen die Kette; vor dem Abenteuerbeginn gibt es keinen', () => {
    const empty = new Set([weeks[5], weeks[6]])
    const { resolver } = resolverFor((week) => (empty.has(week) ? plan({}) : plan({ strength: 300 })))
    expect(resolver.bossOf(weeks[5])).toBeUndefined()
    expect(resolver.bossOf(weeks[7])?.id).toBe(chooseBoss('strength', '2026-01-05Aria', weeks[7], ROSTER).id)
    expect(resolver.bossOf(addDays(weeks[0], -7))).toBeUndefined()
  })

  it('rechnet nur so weit zurück wie nötig – wechselt das Thema, endet die Kette', () => {
    const { resolver, calls } = resolverFor((week) =>
      plan(weeks.indexOf(week) % 2 === 0 ? { strength: 300 } : { charisma: 300 }),
    )
    resolver.bossOf(weeks[51])
    expect(calls()).toBeLessThanOrEqual(2)
    // Ein Thema über alle Wochen: bis zum Abenteuerbeginn, jede Woche höchstens einmal geplant.
    const mono = resolverFor(() => plan({ strength: 300 }))
    mono.resolver.bossOf(weeks[51])
    mono.resolver.bossOf(weeks[50])
    expect(mono.calls()).toBe(52)
  })

  it('weeklyBossState: previousBossId wird nicht noch einmal gewählt', () => {
    const free = weeklyBossState(input())
    const excluded = weeklyBossState(input({ previousBossId: free?.boss.id }))
    expect(excluded?.boss.id).not.toBe(free?.boss.id)
    expect(excluded?.boss.theme).toBe('strength')
    // Die Schwäche bleibt eine andere als das Thema des Bosses.
    const mixed = weeklyBossState(
      input({ planned: [{ attribute: 'strength', difficulty: 'medium', count: 7 }, { attribute: 'wisdom', difficulty: 'easy', count: 3 }] }),
    )
    expect(mixed?.weakness).not.toBe(mixed?.boss.theme)
  })
})

// ---------------------------------------------------------------------------
// Phase 3b: Treffer des Gefährten
// ---------------------------------------------------------------------------

describe('Phase 3b: withCompanionHits – Bonus-Treffer an Perfekten Tagen', () => {
  const companion = (overrides: Partial<CompanionAttackInput> = {}): CompanionAttackInput => ({
    species: 'fox',
    name: 'Flink',
    perfectDays: new Set([MONDAY]),
    ...overrides,
  })

  it('10 % des Quest-Schadens des Tages, direkt nach den Angriffen des Tages; Nebenquests zählen nicht mit', () => {
    const attacks = attacksOf(
      [
        attack(MONDAY, 'strength', { difficulty: 'hard' }), // 40
        attack(MONDAY, 'wisdom', { sourceId: 'w', difficulty: 'medium' }), // 20 × 1,5 = 30 (Schwäche)
        attack(MONDAY, 'charisma', { source: 'sideQuest', sourceId: 's', difficulty: 'epic' }), // 80 – zählt nicht
        attack('2026-11-03', 'strength'),
      ],
      LEVEL_1,
      'wisdom',
      TEST_ATTACK_NAMES,
    )
    const result = withCompanionHits(attacks, companion())
    expect(result.map((hit) => [hit.day, hit.source, hit.sourceId, hit.damage])).toEqual([
      [MONDAY, 'quest', 'strength-quest', 40],
      [MONDAY, 'quest', 'w', 30],
      [MONDAY, 'sideQuest', 's', 80],
      [MONDAY, 'companion', 'fox', 7], // round(0,1 × 70)
      ['2026-11-03', 'quest', 'strength-quest', 20],
    ])
    expect(result[3]).toMatchObject({ attribute: 'strength', attackName: 'Flink', weakness: false })
  })

  it('rundet kaufmännisch, ein Treffer von 0 entfällt; ohne Gefährten oder Perfekte Tage unverändert', () => {
    const fortyFive = attacksOf([attack(MONDAY, 'strength', { difficulty: 'easy' }), attack(MONDAY, 'strength', { sourceId: 'b', difficulty: 'hard' })], { attributeLevels: levels(), classBonus: { strength: 0.125 } }, undefined)
    expect(fortyFive.reduce((sum, hit) => sum + hit.damage, 0)).toBe(56) // 11 + 45
    expect(withCompanionHits(fortyFive, companion()).at(-1)?.damage).toBe(6) // 5,6 → 6
    const small = attacksOf([attack(MONDAY, 'strength', { difficulty: 'easy' })], LEVEL_1, undefined) // 10 → 1
    expect(withCompanionHits(small, companion()).at(-1)?.damage).toBe(1)
    const tiny = [{ ...small[0], damage: 4 }]
    expect(withCompanionHits(tiny, companion())).toEqual(tiny) // 0,4 → 0: kein Treffer
    expect(withCompanionHits(small, undefined)).toEqual(small)
    expect(withCompanionHits(small, companion({ perfectDays: new Set() }))).toEqual(small)
  })

  it('erst ab dem Tag der Wahl; Attribut = das mit dem meisten Quest-Schaden des Tages', () => {
    const attacks = attacksOf(
      [attack(MONDAY, 'intellect'), attack('2026-11-03', 'vitality'), attack('2026-11-03', 'charisma', { sourceId: 'c', difficulty: 'hard' })],
      LEVEL_1,
      undefined,
    )
    const result = withCompanionHits(attacks, companion({ perfectDays: new Set([MONDAY, '2026-11-03']), fromDay: '2026-11-03' }))
    const hits = result.filter((hit) => hit.source === 'companion')
    expect(hits).toEqual([
      { day: '2026-11-03', source: 'companion', sourceId: 'fox', attribute: 'charisma', attackName: 'Flink', damage: 6, weakness: false },
    ])
  })

  it('weeklyBossState: die Treffer zählen zum Schaden (und können den Sieg bringen), nicht zu den geplanten HP', () => {
    const planned = [{ attribute: 'strength' as const, difficulty: 'medium' as const, count: 7 }] // 140 → 98 HP
    const sources = [MONDAY, '2026-11-03', '2026-11-04'].map((day) => attack(day, 'strength', { sourceId: `s-${day}` }))
    const today = '2026-11-04'
    const without = weeklyBossState(input({ planned, sources, today }))
    expect(without).toMatchObject({ maxHp: 98, damage: 90, defeated: false }) // 3 × 30 (Stärke = Schwäche)
    const withCompanion = weeklyBossState(
      input({ planned, sources, today, companion: companion({ perfectDays: new Set([MONDAY, '2026-11-03', '2026-11-04', '2026-11-05']) }) }),
    )
    expect(withCompanion).toMatchObject({ maxHp: 98, damage: 99, defeated: true, defeatedDay: '2026-11-04', hp: 0 })
    expect(withCompanion?.attacks.filter((hit) => hit.source === 'companion').map((hit) => [hit.day, hit.damage])).toEqual([
      [MONDAY, 3],
      ['2026-11-03', 3],
      ['2026-11-04', 3],
    ]) // der Perfekte Tag nach heute zählt (noch) nicht
  })
})
