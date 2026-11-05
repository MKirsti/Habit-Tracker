import { describe, expect, it } from 'vitest'
import { BALANCING, DEFAULT_SETTINGS } from './balancing'
import { heroSeedOf, unrecordedVictories } from './combat/boss'
import { ATTACK_NAMES } from './combat/classDefinitions'
import { chestRarity, chestRollKey, contentOnOpen, isQuestDrop, unrecordedChests } from './combat/chests'
import { addDays, dayRange } from './dates'
import { deriveGameState } from './engine'
import { canUndoItemPurchase, chestFreezeDays, scoreDays } from './hpRules'
import {
  completeRange,
  makeBossVictory,
  makeChapter,
  makeChest,
  makeCompletion,
  makeCosmeticUnlock,
  makeFrame,
  makeGameData,
  makeHabit,
  makeItemPurchase,
  makeLedgerEntry,
  makeMainQuest,
  makePurchase,
  makeRestPeriod,
  makeSideQuest,
  makeTitle,
  seededRandom,
} from './testing'
import type { Chest, Completion, DayKey, GameData, Habit, Schedule } from './types'

// Kalender-Referenz: 2026-10-26 und 2026-11-02 sind Montage.
const START: DayKey = '2026-10-26'
const WEEK: DayKey = '2026-11-02'
const PROFILE = { name: 'Aria', avatar: '🧝', createdDay: START }
const SEED = heroSeedOf(PROFILE)

/** Tägliche mittlere Stärke-Quest (20 XP). */
const workout = makeHabit({ id: 'workout', title: 'Training', attribute: 'strength', difficulty: 'medium', createdDay: START })
/** Tägliche leichte Weisheits-Quest (10 XP), ab dieser Woche. */
const meditate = makeHabit({ id: 'meditate', title: 'Meditieren', attribute: 'wisdom', difficulty: 'easy', createdDay: WEEK })

function hero(overrides: Partial<GameData> = {}): GameData {
  return makeGameData({ profile: { ...PROFILE }, ...overrides })
}

/**
 * Stärke-Level 3 am Ende von Sonntag 2026-11-01: Training 27.10.–01.11. (20 + 21 + 22 + 23 + 24 + 25 = 135 XP inkl.
 * Streak-Bonus; Level 3 ab 40 + 95 = 135). Ohne den Sonntag sind es 110 XP → Level 2.
 */
const warriorHistory = completeRange(workout, '2026-10-27', '2026-11-01')

/** Lokale Mittagszeit eines Tages (für `openedAt` – unabhängig von der Zeitzone derselbe Spieltag). */
function localNoon(day: DayKey): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, 12).getTime()
}

describe('Phase 3a – Klasse der Woche', () => {
  it('ohne Held und ohne XP: Abenteurer, kein Boss, keine Truhen', () => {
    const state = deriveGameState(makeGameData(), '2026-11-04')
    expect(state.heroClass.definition.id).toBe('adventurer')
    expect(state.heroClass.weekStart).toBe(WEEK)
    expect(state.heroClass.classBonus).toEqual({})
    expect(Object.values(state.heroClass.attributeLevels).every((level) => level === 1)).toBe(true)
    expect(state.bosses).toEqual({})
    expect(state.chests).toEqual([])
    expect(state.inventory.unopenedChests).toBe(0)
    expect(state.gold.fromChests).toBe(0)
  })

  it('mitten in der Woche erreichtes Level 3 ändert die Klasse erst am nächsten Montag', () => {
    // 28.10.–05.11.: bis Sonntag 01.11. 110 XP (Level 2), Montag 02.11. +25 → 135 (Level 3)
    const data = hero({ habits: [workout], completions: completeRange(workout, '2026-10-28', '2026-11-08') })
    const thursday = deriveGameState(data, '2026-11-05')
    expect(thursday.attributes.strength.level).toBeGreaterThanOrEqual(3)
    expect(thursday.heroClass.attributeLevels.strength).toBe(2)
    expect(thursday.heroClass.definition.id).toBe('adventurer')
    expect(thursday.heroClass.previousId).toBeUndefined()

    const monday = deriveGameState(data, '2026-11-09')
    expect(monday.heroClass.definition.id).toBe('warrior')
    expect(monday.heroClass.definition.names.female).toBe('Kriegerin')
    expect(monday.heroClass.weekStart).toBe('2026-11-09')
    expect(monday.heroClass.classBonus).toEqual({ strength: 0.2 })
    expect(monday.heroClass.previousId).toBe('adventurer')

    // Eine Woche später: weiter Krieger, keine Wechsel-Szene mehr
    expect(deriveGameState(data, '2026-11-16').heroClass.previousId).toBeUndefined()
  })

  it('am Montag zählt der nachgetragene Sonntag noch für die Klasse der neuen Woche', () => {
    const withoutSunday = hero({ habits: [workout], completions: warriorHistory.slice(0, -1) })
    expect(deriveGameState(withoutSunday, WEEK).heroClass.definition.id).toBe('adventurer')
    const withSunday = hero({ habits: [workout], completions: warriorHistory })
    const state = deriveGameState(withSunday, WEEK)
    expect(state.heroClass.attributeLevels.strength).toBe(3)
    expect(state.heroClass.definition.id).toBe('warrior')
  })

  it('Nebenquests zählen für die Klassen-Level mit (an ihrem Erledigungstag)', () => {
    const side = makeSideQuest({ id: 's', attribute: 'intellect', difficulty: 'epic', doneDay: '2026-11-01' })
    const late = makeSideQuest({ id: 't', attribute: 'intellect', difficulty: 'epic', doneDay: '2026-11-03' })
    const state = deriveGameState(hero({ sideQuests: [side, late] }), '2026-11-04')
    // 80 XP am Sonntag → Level 2 (40 ≤ 80 < 135); der Dienstag zählt erst nächste Woche
    expect(state.heroClass.attributeLevels.intellect).toBe(2)
    expect(state.attributes.intellect.level).toBe(3)
  })
})

describe('Phase 3a – Wochen-Boss in der Engine', () => {
  /** Krieger (Stärke 3) ab dem 02.11., dazu Meditieren ab dem 02.11. */
  function warriorWeek(days: DayKey[], extra: Partial<GameData> = {}): GameData {
    const completions = [...warriorHistory]
    for (const day of days) completions.push(makeCompletion(workout, day), makeCompletion(meditate, day))
    return hero({ habits: [workout, meditate], completions, ...extra })
  }

  it('geplanter Schaden, HP, Thema, Schwäche und Angriffe nach der Formel', () => {
    // Stärke Level 3 als Krieger: 20 × 1,2 × 1,2 = 28,8 → 29; Weisheit Level 1: 10.
    // Geplant: 7 × 29 + 7 × 10 = 273 → maxHp round(0,7 × 273) = 191.
    const state = deriveGameState(warriorWeek(['2026-11-02', '2026-11-03', '2026-11-04']), '2026-11-04')
    const boss = state.bosses.current
    expect(boss).toBeDefined()
    expect(boss?.boss.theme).toBe('strength')
    expect(boss?.weakness).toBe('wisdom')
    expect(boss?.maxHp).toBe(191)
    expect(boss?.weekStart).toBe(WEEK)
    expect(boss?.weekEnd).toBe('2026-11-08')
    expect(boss?.daysLeft).toBe(5)
    // Je Tag: Meditieren 10 × 1,5 = 15 (Schwäche), Training 29 → 3 × 44 = 132
    expect(boss?.attacks.map((attack) => [attack.day, attack.sourceId, attack.damage, attack.weakness])).toEqual([
      ['2026-11-02', 'meditate', 15, true],
      ['2026-11-02', 'workout', 29, false],
      ['2026-11-03', 'meditate', 15, true],
      ['2026-11-03', 'workout', 29, false],
      ['2026-11-04', 'meditate', 15, true],
      ['2026-11-04', 'workout', 29, false],
    ])
    expect(boss?.attacks[0].attackName).toBe(ATTACK_NAMES.wisdom)
    expect(boss?.attacks[1].attackName).toBe(ATTACK_NAMES.strength)
    expect(boss?.damage).toBe(132)
    expect(boss?.hp).toBe(59)
    expect(boss?.defeated).toBe(false)
    expect(state.bosses.previous).toBeUndefined()
  })

  it('Angriffe nutzen die Momentaufnahme der Erledigung, Teilfortschritt greift nicht an, Nebenquests schon', () => {
    const data = warriorWeek([])
    data.completions.push(
      makeCompletion(workout, '2026-11-02', { difficulty: 'hard' }), // 40 × 1,44 = 57,6 → 58
      makeCompletion(meditate, '2026-11-02', { value: 0 }), // offen
    )
    data.sideQuests = [makeSideQuest({ id: 'side', attribute: 'wisdom', difficulty: 'medium', doneDay: '2026-11-03' })]
    const boss = deriveGameState(data, '2026-11-03').bosses.current
    expect(boss?.attacks.map((attack) => [attack.source, attack.damage])).toEqual([
      ['quest', 58],
      ['sideQuest', 30], // 20 × 1,5 (Schwäche Weisheit)
    ])
  })

  it('besiegt am Tag, an dem der Schaden maxHp erreicht – mit Boss-Truhe am selben Tag', () => {
    // Mo–Do je 44 → 176; Freitag: Meditieren +15 → 191 = maxHp
    const state = deriveGameState(warriorWeek(dayRange(WEEK, '2026-11-06')), '2026-11-06')
    const boss = state.bosses.current
    expect(boss?.damage).toBe(220)
    expect(boss?.defeated).toBe(true)
    expect(boss?.defeatedDay).toBe('2026-11-06')
    expect(boss?.hp).toBe(0)
    const chest = state.chests.find((entry) => entry.id === `boss:${WEEK}`)
    expect(chest).toMatchObject({ source: 'boss', foundDay: '2026-11-06', rarity: chestRarity(chestRollKey(SEED, `boss:${WEEK}`)) })
    expect(chest?.openedAt).toBeUndefined()
    expect(unrecordedVictories([boss], undefined)).toEqual([
      { weekStart: WEEK, bossId: boss?.boss.id, day: '2026-11-06', maxHp: 191 },
    ])
  })

  it('ein gespeicherter Sieg bleibt, auch wenn Erledigungen zurückgenommen werden', () => {
    const victory = makeBossVictory(WEEK, { bossId: 'couch-golem', day: '2026-11-06', maxHp: 191 })
    const state = deriveGameState(warriorWeek(['2026-11-02'], { bossVictories: [victory] }), '2026-11-07')
    expect(state.bosses.current).toMatchObject({ defeated: true, defeatedDay: '2026-11-06', hp: 0, maxHp: 191 })
    expect(state.bosses.current?.boss.id).toBe('couch-golem')
    // Die Truhe zum Sieg gibt es auch ohne gespeicherte Truhe
    expect(state.chests.map((chest) => chest.id)).toContain(`boss:${WEEK}`)
  })

  it('später eingetragene Rast senkt die Boss-HP; Urlaub die ganze Woche → kein Boss', () => {
    const rest = makeRestPeriod('r', '2026-11-05', '2026-11-08')
    // Geplant: 3 × 29 + 3 × 10 = 117 → round(81,9) = 82
    expect(deriveGameState(warriorWeek([], { restPeriods: [rest] }), '2026-11-04').bosses.current?.maxHp).toBe(82)
    const vacation = makeRestPeriod('v', WEEK, '2026-11-08')
    expect(deriveGameState(warriorWeek([], { restPeriods: [vacation] }), '2026-11-04').bosses.current).toBeUndefined()
  })

  it('ohne geplante Quests kein Boss; kleine Pläne bekommen einen Boss, der nie über dem Plan liegt', () => {
    expect(deriveGameState(hero(), '2026-11-04').bosses.current).toBeUndefined()
    // 2 × leicht = 20 geplant → 20 HP (Nachbesserung 3a: höchstens der geplante Schaden)
    const weekly = makeHabit({ id: 'w', difficulty: 'easy', createdDay: START, schedule: { type: 'weekly', times: 2 } })
    expect(deriveGameState(hero({ habits: [weekly] }), '2026-11-04').bosses.current?.maxHp).toBe(20)
    // 7 × leicht = 70 geplant → round(49) liegt unter der Untergrenze → 60 HP
    const daily = makeHabit({ id: 'd', difficulty: 'easy', createdDay: START })
    expect(deriveGameState(hero({ habits: [daily] }), '2026-11-04').bosses.current?.maxHp).toBe(BALANCING.combat.bossMinHp)
  })

  it('Boss und Schwäche sind deterministisch je Held und Woche', () => {
    const data = warriorWeek(['2026-11-02'])
    const a = deriveGameState(data, '2026-11-03').bosses.current
    const b = deriveGameState(structuredClone(data), '2026-11-05').bosses.current
    expect(b?.boss.id).toBe(a?.boss.id)
    expect(b?.weakness).toBe(a?.weakness)
  })

  describe('Vorwoche in der Gnadenfrist', () => {
    // Mo–Do der Woche 02.11.: 176 Schaden bei 191 HP.
    const unfinished = () => warriorWeek(dayRange(WEEK, '2026-11-05'))

    it('am Montag: der Boss der Vorwoche steht noch (mit ihren Kampf-Werten), dienstags nicht mehr', () => {
      const monday = deriveGameState(unfinished(), '2026-11-09')
      expect(monday.bosses.previous).toMatchObject({ weekStart: WEEK, maxHp: 191, damage: 176, defeated: false, daysLeft: 0 })
      expect(monday.bosses.current?.weekStart).toBe('2026-11-09')
      expect(deriveGameState(unfinished(), '2026-11-10').bosses.previous).toBeUndefined()
    })

    it('Nachtragen des Sonntags besiegt ihn noch – bis der Sieg gespeichert ist, steht er als besiegt da', () => {
      const data = unfinished()
      data.completions.push(makeCompletion(workout, '2026-11-08'))
      const monday = deriveGameState(data, '2026-11-09')
      expect(monday.bosses.previous).toMatchObject({ defeated: true, defeatedDay: '2026-11-08', damage: 205 })
      expect(monday.chests.find((chest) => chest.id === `boss:${WEEK}`)?.foundDay).toBe('2026-11-08')
      const toRecord = unrecordedVictories([monday.bosses.current, monday.bosses.previous], data.bossVictories)
      expect(toRecord.map((victory) => victory.weekStart)).toEqual([WEEK])

      // Gespeichert → die Vorwoche verschwindet, die Truhe bleibt
      const recorded = deriveGameState({ ...data, bossVictories: toRecord }, '2026-11-09')
      expect(recorded.bosses.previous).toBeUndefined()
      expect(recorded.chests.map((chest) => chest.id)).toContain(`boss:${WEEK}`)
    })
  })
})

describe('Phase 3a – Truhen, Gold und Vorrat', () => {
  const day: DayKey = '2026-11-04'

  /** Eine Quest, deren Erledigung an `on` eine Truhe fallen lässt. */
  function luckyHabit(on: DayKey, start = 0): Habit {
    for (let i = start; i < 10_000; i++) {
      if (isQuestDrop(SEED, `lucky${i}:${on}`)) {
        return makeHabit({ id: `lucky${i}`, title: `Glück ${i}`, createdDay: START })
      }
    }
    throw new Error('keine Quest mit Fund gefunden')
  }

  it('eine Erledigung mit Fund → Quest-Truhe im Zustand; Zurücknehmen → weg, wieder Abhaken → dieselbe', () => {
    const lucky = luckyHabit(day)
    const done = hero({ habits: [lucky], completions: [makeCompletion(lucky, day)] })
    const chests = deriveGameState(done, day).chests
    expect(chests).toEqual([
      expect.objectContaining({ id: `quest:${lucky.id}:${day}`, source: 'quest', foundDay: day }),
    ])
    expect(deriveGameState(hero({ habits: [lucky] }), day).chests).toEqual([])
    expect(deriveGameState(done, day).chests).toEqual(chests)
    expect(deriveGameState(done, day).inventory.unopenedChests).toBe(1)
  })

  it('gespeichert bleibt sie, auch wenn die Quest zurückgenommen wird; keine zweite am selben Tag', () => {
    const first = luckyHabit(day)
    const second = luckyHabit(day, Number(first.id.slice('lucky'.length)) + 1)
    const stored = deriveGameState(hero({ habits: [first], completions: [makeCompletion(first, day)] }), day).chests
    const later = deriveGameState(hero({ habits: [first, second], completions: [makeCompletion(second, day)], chests: stored }), day)
    expect(later.chests).toEqual(stored)
  })

  it('Kapitel-Truhe für ein heute abgeschlossenes Kapitel', () => {
    const campaign = makeMainQuest({
      id: 'q1',
      chapters: [makeChapter({ id: 'c1', criterion: { type: 'manual' }, manualDone: true, completedDay: day })],
    })
    const state = deriveGameState(hero({ mainQuests: [campaign] }), day)
    // Phase 3b: Mit dem letzten Kapitel ist die Kampagne gemeistert – dazu die Endgegner-Truhe.
    expect(state.chests.map((chest) => [chest.id, chest.source, chest.foundDay])).toEqual([
      ['campaign:q1', 'campaign', day],
      ['chapter:q1:c1', 'chapter', day],
    ])
  })

  it('Gold zählt ab dem Öffnen; ungeöffnete Truhen stehen im Vorrat', () => {
    const chests: Chest[] = [
      makeChest('quest:a:2026-11-01', { content: { kind: 'gold', amount: 40 }, openedAt: 1 }),
      makeChest('quest:b:2026-11-02', { content: { kind: 'gold', amount: 90 } }),
    ]
    // Eine Nebenquest (keine Quest-Truhe möglich): 20 XP → 10 Gold aus XP
    const side = makeSideQuest({ id: 's', difficulty: 'medium', doneDay: day })
    const state = deriveGameState(hero({ sideQuests: [side], chests, purchases: [makePurchase({ id: 'p', price: 30 })] }), day)
    expect(state.gold).toEqual({
      fromXp: 10,
      fromAchievements: state.gold.fromAchievements,
      fromChests: 40,
      earned: 10 + state.gold.fromAchievements + 40,
      spent: 30,
      lostToDefeats: 0,
      balance: 10 + state.gold.fromAchievements + 40 - 30,
    })
    expect(state.inventory.unopenedChests).toBe(1)
  })

  it('Streak-Schutz aus geöffneten Truhen kommt in den Vorrat – das beim Öffnen entschiedene Ersatz-Gold nicht', () => {
    const chests: Chest[] = [
      makeChest('quest:a:2026-11-01', { rarity: 'rare', content: { kind: 'item', itemId: 'streakFreeze' }, openedAt: localNoon('2026-11-01') }),
      makeChest('quest:b:2026-11-02', { rarity: 'rare', content: { kind: 'item', itemId: 'streakFreeze' } }), // ungeöffnet
      makeChest('quest:c:2026-11-03', {
        rarity: 'rare',
        content: { kind: 'gold', amount: BALANCING.chests.freezeFallbackGold },
        openedAt: localNoon('2026-11-03'),
      }),
    ]
    const state = deriveGameState(hero({ chests, purchases: [makeItemPurchase('f', 'streakFreeze', '2026-11-01')] }), day)
    expect(state.inventory).toEqual({ streakFreezes: 2, unopenedChests: 1 })
    expect(state.gold.fromChests).toBe(BALANCING.chests.freezeFallbackGold)
  })

  it('Titel & Rahmen: Bedingungen, Boss-Siege und Truhen-Freischaltungen', () => {
    const titles = [
      makeTitle('always', { type: 'always' }),
      makeTitle('slayer', { type: 'bossVictories', count: 1 }),
      makeTitle('chosen', { type: 'chest' }, { rarity: 'legendary' }),
    ]
    const frames = [makeFrame('ember', { type: 'chest' }, { rarity: 'rare' }), makeFrame('lvl', { type: 'level', level: 2 })]
    const combat = { titles, frames }
    expect(deriveGameState(hero(), day, { combat }).cosmetics).toEqual({ titles: ['always'], frames: [] })
    const state = deriveGameState(
      hero({
        bossVictories: [makeBossVictory('2026-10-26')],
        cosmeticUnlocks: [makeCosmeticUnlock('ember', 'frame')],
      }),
      day,
      { combat },
    )
    expect(state.cosmetics).toEqual({ titles: ['always', 'slayer'], frames: ['ember'] })
  })

  it('der echte Inhalt: „Furchtlos“ nach dem ersten Boss-Sieg, nie freigeschaltete Truhen-Kosmetik', () => {
    const state = deriveGameState(hero({ bossVictories: [makeBossVictory('2026-10-26')] }), day)
    expect(state.cosmetics.titles).toContain('fearless')
    expect(state.cosmetics.titles).not.toContain('chosen-one')
  })
})

describe('Phase 3a – Streak-Schutz aus Truhen in der Abrechnung', () => {
  const since: DayKey = '2026-11-02'
  const daily = makeHabit({ id: 'd', difficulty: 'easy', createdDay: since })

  function withLedger(chests: Chest[], extra: Partial<GameData> = {}): GameData {
    return makeGameData({
      profile: { ...PROFILE, createdDay: since },
      settings: { ...DEFAULT_SETTINGS, penalties: { enabled: true, since } },
      habits: [daily],
      // 02.11. erledigt und abgerechnet, 03.11. (gestern) verpasst
      completions: [makeCompletion(daily, since)],
      hpLedger: [makeLedgerEntry(since, { score: 'perfect' })],
      chests,
      ...extra,
    })
  }
  const freezeChest = (openedDay: DayKey, foundDay: DayKey = since) =>
    makeChest(`quest:x:${foundDay}`, { foundDay, rarity: 'rare', content: { kind: 'item', itemId: 'streakFreeze' }, openedAt: localNoon(openedDay) })

  it('ab dem Spieltag des Öffnens (nie vor dem Fund) – ein heute geöffneter rettet gestern nicht', () => {
    expect(chestFreezeDays([freezeChest('2026-11-03')])).toEqual(['2026-11-03'])
    expect(chestFreezeDays([freezeChest('2026-11-01', '2026-11-02')])).toEqual(['2026-11-02'])
    expect(chestFreezeDays([makeChest('a', { content: { kind: 'item', itemId: 'streakFreeze' } })])).toEqual([])

    const openedYesterday = deriveGameState(withLedger([freezeChest('2026-11-03')]), '2026-11-04')
    expect(openedYesterday.hp.yesterday).toMatchObject({ day: '2026-11-03', score: 'missed', savedByFreeze: true, threatenedDelta: 0 })
    const openedToday = deriveGameState(withLedger([freezeChest('2026-11-04')]), '2026-11-04')
    expect(openedToday.hp.yesterday).toMatchObject({ day: '2026-11-03', score: 'missed', savedByFreeze: false })
    expect(openedToday.inventory.streakFreezes).toBe(1)
  })

  it('der Tageswechsel zählt: um 2 Uhr geöffnet gehört noch zum Vortag', () => {
    const [year, month, date] = [2026, 11, 4]
    const early = new Date(year, month - 1, date, 2).getTime()
    expect(chestFreezeDays([makeChest('a', { foundDay: '2026-11-01', content: { kind: 'item', itemId: 'streakFreeze' }, openedAt: early })], 4)).toEqual([
      '2026-11-03',
    ])
  })

  it('scoreDays verbraucht Truhen-Gegenstände wie gekaufte (ältester zuerst)', () => {
    const scored = scoreDays({
      from: '2026-11-03',
      to: '2026-11-05',
      factsOf: () => ({ requiredCount: 1, requiredDone: 0, active: false }),
      restDays: new Set(),
      purchases: [makeItemPurchase('f', 'streakFreeze', '2026-11-05')],
      chestFreezeDays: ['2026-11-04'],
      ledger: [],
    })
    expect(scored.map((entry) => [entry.day, entry.frozen])).toEqual([
      ['2026-11-03', false],
      ['2026-11-04', true],
      ['2026-11-05', true],
    ])
  })

  it('Rückgängig eines gekauften Streak-Schutzes rechnet den Truhen-Vorrat mit', () => {
    const today: DayKey = '2026-11-06'
    const purchase = makeItemPurchase('f', 'streakFreeze', today)
    const usedOne = [makeLedgerEntry(since, { score: 'perfect' }), makeLedgerEntry('2026-11-03', { score: 'missed', frozen: true })]
    const base = withLedger([], { purchases: [purchase], hpLedger: usedOne })
    expect(canUndoItemPurchase(base, purchase, today)).toBe(false)
    const withChest = withLedger([freezeChest('2026-11-03')], { purchases: [purchase], hpLedger: usedOne })
    expect(canUndoItemPurchase(withChest, purchase, today)).toBe(true)
  })
})

describe('Phase 3a – Simulation mit Recorder (Zufallsverläufe)', () => {
  it('gespeicherte Truhen ändern sich nie, höchstens eine Quest-Truhe pro Tag, Siege bleiben, Gold stimmt', () => {
    const habits = (['strength', 'intellect', 'wisdom', 'vitality'] as const).map((attribute, i) =>
      makeHabit({ id: `q${i}`, title: `Quest ${i}`, order: i, attribute, difficulty: i % 2 === 0 ? 'medium' : 'easy', createdDay: START }),
    )
    let totalChests = 0
    let totalVictories = 0
    let totalOpened = 0
    for (let seed = 1; seed <= 6; seed++) {
      const random = seededRandom(seed)
      let data = hero({ habits })
      const recorded = new Map<string, Chest>()
      for (const today of dayRange(START, addDays(START, 41))) {
        // Erledigen (auch gestern nachtragen) und gelegentlich zurücknehmen
        const completions = data.completions.filter((completion) => !(completion.day === today && random() < 0.2))
        for (const habit of habits) {
          if (random() < 0.75 && !completions.some((c) => c.habitId === habit.id && c.day === today)) {
            completions.push(makeCompletion(habit, today, { updatedAt: Math.floor(random() * 1000) }))
          }
        }
        data = { ...data, completions }
        let state = deriveGameState(data, today)

        // Recorder: neue Truhen und Siege speichern
        const newChests = unrecordedChests(state.chests, data.chests)
        const newVictories = unrecordedVictories([state.bosses.current, state.bosses.previous], data.bossVictories)
        for (const chest of newChests) recorded.set(chest.id, structuredClone(chest))
        data = {
          ...data,
          chests: [...(data.chests ?? []), ...newChests],
          bossVictories: [...(data.bossVictories ?? []), ...newVictories],
        }
        // Gelegentlich eine Truhe öffnen (wie das Repository: Inhalt beim Öffnen, Ersatz-Gold bei vollem Vorrat)
        const closed = (data.chests ?? []).find((chest) => chest.openedAt === undefined)
        if (closed !== undefined && random() < 0.5) {
          const content = contentOnOpen(closed.content, state.inventory.streakFreezes)
          data = {
            ...data,
            chests: (data.chests ?? []).map((chest) => (chest.id === closed.id ? { ...chest, content, openedAt: localNoon(today) } : chest)),
          }
          recorded.set(closed.id, { ...closed, content, openedAt: localNoon(today) })
        }
        state = deriveGameState(data, today)

        const label = `Seed ${seed}, ${today}`
        // Gespeichert = unverändert
        for (const [id, chest] of recorded) expect(state.chests.find((entry) => entry.id === id), `${label}: ${id}`).toEqual(chest)
        expect(new Set(state.chests.map((chest) => chest.id)).size, label).toBe(state.chests.length)
        // Höchstens eine Quest-Truhe pro Tag
        const questChestsByDay = new Map<DayKey, number>()
        for (const chest of state.chests.filter((entry) => entry.source === 'quest')) {
          questChestsByDay.set(chest.foundDay, (questChestsByDay.get(chest.foundDay) ?? 0) + 1)
        }
        for (const count of questChestsByDay.values()) expect(count, label).toBeLessThanOrEqual(BALANCING.chests.maxQuestChestsPerDay)
        // Jede Kosmetik höchstens einmal
        const cosmetics = state.chests.flatMap((chest) => (chest.content.kind === 'cosmetic' ? [`${chest.content.cosmeticKind}:${chest.content.cosmeticId}`] : []))
        expect(new Set(cosmetics).size, label).toBe(cosmetics.length)
        // Gespeicherte Siege bleiben Siege
        for (const victory of data.bossVictories ?? []) {
          const boss = [state.bosses.current, state.bosses.previous].find((entry) => entry?.weekStart === victory.weekStart)
          if (boss !== undefined) expect(boss.defeated, label).toBe(true)
          expect(state.chests.some((chest) => chest.id === `boss:${victory.weekStart}`), label).toBe(true)
        }
        // Gold aus Truhen = Gold der geöffneten
        const opened = state.chests.filter((chest) => chest.openedAt !== undefined)
        expect(state.gold.fromChests, label).toBe(
          opened.reduce((sum, chest) => sum + (chest.content.kind === 'gold' ? chest.content.amount : 0), 0),
        )
        expect(state.inventory.unopenedChests, label).toBe(state.chests.length - opened.length)
        expect(state.inventory.streakFreezes, label).toBeLessThanOrEqual(BALANCING.items.streakFreeze.max)
      }
      totalChests += data.chests?.length ?? 0
      totalVictories += data.bossVictories?.length ?? 0
      totalOpened += (data.chests ?? []).filter((chest) => chest.openedAt !== undefined).length
    }
    // Die Simulation prüft nicht ins Leere: Es gab Funde, Siege und geöffnete Truhen.
    expect(totalChests).toBeGreaterThan(10)
    expect(totalVictories).toBeGreaterThan(5)
    expect(totalOpened).toBeGreaterThan(5)
  })
})

describe('Phase 3a – Laufzeit', () => {
  it('drei Jahre mit zwölf Quests, Truhen und Siegen bleiben zügig', () => {
    const habits: Habit[] = Array.from({ length: 12 }, (_, i) =>
      makeHabit({
        id: `h${i}`,
        order: i,
        attribute: (['strength', 'intellect', 'wisdom', 'charisma', 'vitality', 'discipline'] as const)[i % 6],
        createdDay: '2024-01-01',
        difficulty: i % 2 === 0 ? 'easy' : 'medium',
        schedule:
          i % 3 === 0
            ? ({ type: 'weekly', times: 3 } as Schedule)
            : i % 3 === 1
              ? ({ type: 'weekdays', days: [1, 3, 5] } as Schedule)
              : ({ type: 'daily' } as Schedule),
      }),
    )
    const days = dayRange('2024-01-01', '2026-12-31')
    const completions: Completion[] = []
    for (const habit of habits) for (const day of days) completions.push(makeCompletion(habit, day))
    const weeks = days.filter((_, i) => i % 7 === 0)
    const data = hero({
      profile: { ...PROFILE, createdDay: '2024-01-01' },
      habits,
      completions,
      sideQuests: days.filter((_, i) => i % 3 === 0).map((day, i) => makeSideQuest({ id: `s${i}`, order: i, doneDay: day })),
      bossVictories: weeks.slice(0, -2).map((week) => makeBossVictory(week)),
      chests: weeks.slice(0, -2).map((week, i) => makeChest(`boss:${week}`, { foundDay: week, ...(i % 2 === 0 ? { openedAt: i } : {}) })),
      restPeriods: [makeRestPeriod('r', '2025-07-01', '2025-07-14')],
    })
    const today = '2026-12-31'
    deriveGameState(data, today) // Aufwärmen (JIT)
    const started = performance.now()
    const state = deriveGameState(data, today)
    const elapsed = performance.now() - started
    expect(state.heroClass.definition.id).not.toBe('adventurer')
    expect(state.bosses.current?.attacks.length).toBeGreaterThan(0)
    expect(state.chests.length).toBeGreaterThanOrEqual(weeks.length - 2)
    expect(state.gold.fromChests).toBeGreaterThan(0)
    // Großzügige Grenze gegen quadratische Ausreißer (gemessen: deutlich unter 300 ms)
    expect(elapsed).toBeLessThan(1500)
  })
})
