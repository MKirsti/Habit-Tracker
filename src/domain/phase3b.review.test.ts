/**
 * Review Phase 3b + Nachbesserungen 3a (Logik): von Hand gerechnete Szenarien über `deriveGameState` mit den echten
 * Inhalten (Bosse, Gefährten, Endgegner). Was hier steht, ist bewusst ausgerechnet – nicht aus dem Code abgeschrieben.
 *
 * Kalender: 2026-10-05, -12, -19, -26, 2026-11-02, -09 sind Montage.
 */
import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from './attributes'
import { BALANCING } from './balancing'
import { bossMaxHp, createBossResolver, isSecondThemeWeek, plannedWeekDamage, secondBossTheme, bossTheme } from './combat/boss'
import { BOSSES } from './combat/bosses'
import { chestContent, chestGoldAmount, contentOnOpen, LEGENDARY_FALLBACK_GOLD, RARE_FALLBACK_GOLD } from './combat/chests'
import { classTimeline, heroClassIdFor } from './combat/classes'
import type { AttributeXpEntry } from './combat/classes'
import { journalEvents } from './chronicle/journal'
import { weeklyReview } from './chronicle/weeklyReview'
import { addDays, dayRange } from './dates'
import { deriveGameState } from './engine'
import { xpToNextAttributeLevel } from './leveling'
import {
  completeRange,
  makeBossVictory,
  makeChapter,
  makeCompanionChoice,
  makeCompletion,
  makeGameData,
  makeHabit,
  makeMainQuest,
  makeRestPeriod,
  seededRandom,
} from './testing'
import type { AttributeId, DayKey, GameData, HeroClassId, Habit } from './types'

const PROFILE = { name: 'Aria', avatar: '🧝' }

function levels(overrides: Partial<Record<AttributeId, number>> = {}): Record<AttributeId, number> {
  const result = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) result[id] = overrides[id] ?? 1
  return result
}

/** Attribut-XP, die Level `level` genau erreichen (Level 1 = 0 XP). */
function xpForLevel(level: number): number {
  let xp = 0
  for (let l = 1; l < level; l++) xp += xpToNextAttributeLevel(l)
  return xp
}

// ---------------------------------------------------------------------------
// 1. Klassen-Trägheit
// ---------------------------------------------------------------------------

describe('Review – Klassen-Trägheit (Nachbesserung 3a)', () => {
  const MONDAY: DayKey = '2026-01-05'

  /** Attribut-XP so, dass am Sonntag von Woche i genau `weeks[i]` erreicht ist. */
  function entriesFor(weeks: Partial<Record<AttributeId, number>>[]): AttributeXpEntry[] {
    const reached = levels()
    const entries: AttributeXpEntry[] = []
    weeks.forEach((week, i) => {
      for (const id of ATTRIBUTE_IDS) {
        const target = week[id] ?? reached[id]
        const xp = xpForLevel(target) - xpForLevel(reached[id])
        if (xp > 0) entries.push({ day: addDays(MONDAY, 7 * i + 3), attribute: id, xp })
        reached[id] = Math.max(reached[id], target)
      }
    })
    return entries
  }

  /** Klassen der Wochen nach Woche 1 … n (Woche i + 1 hängt an den Leveln am Ende von Woche i). */
  function classesAfter(weeks: Partial<Record<AttributeId, number>>[]): HeroClassId[] {
    return classTimeline(entriesFor(weeks), addDays(MONDAY, 7 * weeks.length))
      .slice(1)
      .map((week) => week.id)
  }

  const changes = (ids: readonly HeroClassId[]) => ids.filter((id, i) => i > 0 && id !== ids[i - 1]).length

  it('10 Wochen Beinahe-Gleichstand (Abstand pendelt 1 ↔ 2): ein Wechsel statt neun', () => {
    // Von Hand: Woche 1 nur Stärke 3 → Kriegerin. Ab Woche 2 liegt Intelligenz 1 bzw. 2 dahinter.
    const weeks = [
      { strength: 3 },
      { strength: 4, intellect: 3 }, // Abstand 1 → Kampfmagierin (der Hybrid entsteht wie immer)
      { strength: 5 }, // Abstand 2 → normal Kriegerin, mit Trägheit bleibt der Hybrid
      { intellect: 4 }, // 1
      { strength: 6 }, // 2
      { intellect: 5 }, // 1
      { strength: 7 }, // 2
      { intellect: 6 }, // 1
      { strength: 8 }, // 2
      { intellect: 7 }, // 1
    ]
    const normal = weeks.map((_, i) => heroClassIdFor(classTimeline(entriesFor(weeks.slice(0, i + 1)), addDays(MONDAY, 7 * (i + 1))).at(-1)!.attributeLevels))
    expect(normal).toEqual([
      'warrior', 'battlemage', 'warrior', 'battlemage', 'warrior', 'battlemage', 'warrior', 'battlemage', 'warrior', 'battlemage',
    ])
    expect(changes(normal)).toBe(9)
    const withInertia = classesAfter(weeks)
    expect(withInertia).toEqual(['warrior', ...Array(9).fill('battlemage')])
    expect(changes(withInertia)).toBe(1)
  })

  it('ein echter Wechsel: Weisheit holt auf → Erzmagierin; zieht davon → Druidin; nie zurück-geflackert', () => {
    const ids = classesAfter([
      { intellect: 3 }, // Magierin
      { intellect: 4, wisdom: 3 }, // Weisheit bis auf 1 heran → der Hybrid entsteht: Erzmagierin
      { intellect: 5, wisdom: 3 }, // Abstand 2 → bleibt Erzmagierin
      { intellect: 5, wisdom: 6 }, // Weisheit vorn (1) → bleibt
      { wisdom: 7 }, // Abstand 2 → bleibt
      { wisdom: 8 }, // Abstand 3 → Druidin
      { intellect: 6 }, // Abstand 2 → Druidin bleibt (normal ebenfalls)
    ])
    expect(ids).toEqual(['mage', 'archmage', 'archmage', 'archmage', 'archmage', 'druid', 'druid'])
  })

  it('in der Engine: eine Magierin mit Intelligenz 4 und Weisheit 3 wird zur Erzmagierin (mit Wechsel-Szene)', () => {
    // Woche 05.10.: Studieren (episch, Intelligenz) Mo + Di = 160 XP → Intelligenz 3 (ab 135).
    // Woche 12.10. (Magierin): Studieren Mo + Di mit Wochen-Streak +5 % = 84 + 84 → 328 → Intelligenz 4 (ab 293);
    //   Meditieren (episch, Weisheit) Mo + Di = 160 → Weisheit 3.
    // Woche 19.10.: 4/3 – höchstens 1 auseinander, beide ≥ 3 → Erzmagierin, +10 % auf beide.
    const study = makeHabit({ id: 'study', attribute: 'intellect', difficulty: 'epic', createdDay: '2026-10-05', schedule: { type: 'weekly', times: 2 } })
    const meditate = makeHabit({ id: 'meditate', attribute: 'wisdom', difficulty: 'epic', createdDay: '2026-10-05', schedule: { type: 'weekly', times: 2 }, order: 1 })
    const data = makeGameData({
      profile: { ...PROFILE, createdDay: '2026-10-05' },
      habits: [study, meditate],
      completions: [
        makeCompletion(study, '2026-10-05'),
        makeCompletion(study, '2026-10-06'),
        makeCompletion(study, '2026-10-12'),
        makeCompletion(study, '2026-10-13'),
        makeCompletion(meditate, '2026-10-12'),
        makeCompletion(meditate, '2026-10-13'),
      ],
    })
    expect(deriveGameState(data, '2026-10-12').heroClass.definition.id).toBe('mage')
    const state = deriveGameState(data, '2026-10-19')
    expect(state.attributes.intellect).toMatchObject({ totalXp: 328, level: 4 })
    expect(state.attributes.wisdom).toMatchObject({ totalXp: 160, level: 3 })
    expect(state.heroClass.definition.id).toBe('archmage')
    expect(state.heroClass.previousId).toBe('mage')
    expect(state.heroClass.classBonus).toEqual({ intellect: 0.1, wisdom: 0.1 })
  })
})

// ---------------------------------------------------------------------------
// 2. Boss-Folge über 52 Wochen, Nebenthema, maxHp ≤ geplant
// ---------------------------------------------------------------------------

describe('Review – Boss-Vielfalt und Lebenspunkte', () => {
  it('maxHp nie über dem geplanten Schaden – auch in winzigen Wochen; schaffbar mit dem Plan', () => {
    // Von Hand: geplant 10 → max(min(60, 10), 7) = 10; 85 → max(60, 59,5 → 60) = 60; 86 → 60,2 → 60; 100 → 70.
    expect([1, 10, 59, 60, 61, 85, 86, 87, 100, 1000].map(bossMaxHp)).toEqual([1, 10, 59, 60, 60, 60, 60, 61, 70, 700])
    for (let planned = 1; planned <= 3000; planned++) expect(bossMaxHp(planned)).toBeLessThanOrEqual(planned)

    // Eine leichte Wochenquest 1× (Level 1, keine Klasse): geplant 10 → 10 HP; die eine Erledigung (Schwäche = Thema,
    // das einzige Attribut: 10 × 1,5 = 15) besiegt ihn.
    const weekly = makeHabit({ id: 'w', attribute: 'charisma', difficulty: 'easy', createdDay: '2026-11-02', schedule: { type: 'weekly', times: 1 } })
    const data = makeGameData({ profile: { ...PROFILE, createdDay: '2026-11-02' }, habits: [weekly] })
    expect(deriveGameState(data, '2026-11-02').bosses.current).toMatchObject({ maxHp: 10, hp: 10, defeated: false })
    data.completions = [makeCompletion(weekly, '2026-11-04')]
    expect(deriveGameState(data, '2026-11-04').bosses.current).toMatchObject({ maxHp: 10, damage: 15, hp: 0, defeated: true, defeatedDay: '2026-11-04' })

    // Rast Di–So: nur der Montag ist geplant (leicht täglich, 10) → 10 HP statt 60.
    const daily = makeHabit({ id: 'd', attribute: 'vitality', difficulty: 'easy', createdDay: '2026-11-02' })
    const resting = makeGameData({
      profile: { ...PROFILE, createdDay: '2026-11-02' },
      habits: [daily],
      restPeriods: [makeRestPeriod('r', '2026-11-03', '2026-11-08')],
    })
    expect(deriveGameState(resting, '2026-11-02').bosses.current?.maxHp).toBe(10)
  })

  it('52 Wochen mit einem einzigen Thema: nie derselbe Boss zweimal in Folge; Sonntag = Montag (Vorwoche)', () => {
    // Nur Stärke geplant → jede Woche dasselbe Thema (kein Nebenthema möglich) – die härteste Probe für „nie zweimal“.
    const start: DayKey = '2025-11-03'
    const workout = makeHabit({ id: 'workout', attribute: 'strength', difficulty: 'medium', createdDay: start })
    const days = dayRange(start, addDays(start, 52 * 7 - 1)).filter((_, i) => i % 7 < 3) // Mo–Mi
    const data = makeGameData({
      profile: { ...PROFILE, createdDay: start },
      habits: [workout],
      completions: days.map((day) => makeCompletion(workout, day)),
    })
    const ids: string[] = []
    for (let week = 0; week < 52; week++) {
      const monday = addDays(start, 7 * week)
      const sunday = addDays(monday, 6)
      const onSunday = deriveGameState(data, sunday).bosses.current
      expect(onSunday?.boss.theme).toBe('strength')
      ids.push(onSunday!.boss.id)
      // Am Montag danach steht er (nichts gespeichert) als Vorwochen-Boss da – derselbe, mit demselben Ausgang.
      const nextMonday = deriveGameState(data, addDays(sunday, 1))
      expect(nextMonday.bosses.previous?.boss.id).toBe(onSunday!.boss.id)
      expect(nextMonday.bosses.previous?.defeated).toBe(onSunday!.defeated)
      expect(nextMonday.bosses.current?.boss.id).not.toBe(onSunday!.boss.id)
    }
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1])
    // Alle drei Stärke-Bosse kommen vor.
    expect(new Set(ids)).toEqual(new Set(BOSSES.filter((boss) => boss.theme === 'strength').map((boss) => boss.id)))
  })

  it('alte gespeicherte Siege mit Wiederholung bleiben – die Woche danach weicht trotzdem aus', () => {
    // Vor der Nachbesserung konnte derselbe Boss zweimal in Folge kommen; solche Siege sind gespeichert und bleiben.
    const start: DayKey = '2026-10-05'
    const workout = makeHabit({ id: 'workout', attribute: 'strength', difficulty: 'medium', createdDay: start })
    const strengthBosses = BOSSES.filter((boss) => boss.theme === 'strength').map((boss) => boss.id)
    const repeated = strengthBosses[0]
    const data = makeGameData({
      profile: { ...PROFILE, createdDay: start },
      habits: [workout],
      bossVictories: [
        makeBossVictory('2026-10-12', { bossId: repeated, day: '2026-10-14', maxHp: 98 }),
        makeBossVictory('2026-10-19', { bossId: repeated, day: '2026-10-21', maxHp: 98 }),
        makeBossVictory('2026-10-26', { bossId: 'gibt-es-nicht', day: '2026-10-28', maxHp: 98 }),
      ],
    })
    expect(deriveGameState(data, '2026-10-14').bosses.current?.boss.id).toBe(repeated)
    expect(deriveGameState(data, '2026-10-21').bosses.current?.boss.id).toBe(repeated)
    // Woche 26.10.: unbekannte Boss-ID → aus dem Plan abgeleitet, nie der Boss der Vorwoche.
    const unknownWeek = deriveGameState(data, '2026-10-28').bosses.current
    expect(unknownWeek?.defeated).toBe(true)
    expect(unknownWeek?.boss.id).not.toBe(repeated)
    // Woche 02.11.: weicht dem abgeleiteten Boss vom 26.10. aus.
    expect(deriveGameState(data, '2026-11-02').bosses.current?.boss.id).not.toBe(unknownWeek?.boss.id)
  })

  it('Nebenthema-Wochen: etwa jede 4. (20–30 %), dann kommt der Boss aus dem zweitstärksten Attribut', () => {
    const random = seededRandom(0x3b)
    let second = 0
    let total = 0
    for (let hero = 0; hero < 40; hero++) {
      const seed = `2026-0${1 + Math.floor(random() * 9)}-1${Math.floor(random() * 9)}Held${hero}`
      for (let week = 0; week < 52; week++) {
        total++
        if (isSecondThemeWeek(seed, addDays('2026-01-05', 7 * week))) second++
      }
    }
    expect(second / total).toBeGreaterThan(0.2)
    expect(second / total).toBeLessThan(0.3)

    // Zwei Attribute geplant (Stärke 140 > Weisheit 70): in einer Nebenthema-Woche ist der Boss ein Weisheits-Boss,
    // die Schwäche dann nicht Weisheit (sondern Stärke, das einzige andere geplante Attribut).
    const byAttribute = { strength: 140, intellect: 0, wisdom: 70, charisma: 0, vitality: 0, discipline: 0 }
    expect(bossTheme(byAttribute)).toBe('strength')
    expect(secondBossTheme(byAttribute)).toBe('wisdom')
    const start: DayKey = '2026-01-05'
    const workout = makeHabit({ id: 'workout', attribute: 'strength', difficulty: 'medium', createdDay: start })
    const meditate = makeHabit({ id: 'meditate', attribute: 'wisdom', difficulty: 'easy', createdDay: start, order: 1 })
    const data = makeGameData({ profile: { ...PROFILE, createdDay: start }, habits: [workout, meditate] })
    const seed = `${start}${PROFILE.name}`
    const weeks = Array.from({ length: 20 }, (_, i) => addDays(start, 7 * i))
    const secondWeek = weeks.find((week) => isSecondThemeWeek(seed, week))
    const normalWeek = weeks.find((week) => !isSecondThemeWeek(seed, week))
    expect(secondWeek).toBeDefined()
    const inSecond = deriveGameState(data, secondWeek!).bosses.current
    expect(inSecond?.boss.theme).toBe('wisdom')
    expect(inSecond?.weakness).toBe('strength')
    const inNormal = deriveGameState(data, normalWeek!).bosses.current
    expect(inNormal?.boss.theme).toBe('strength')
    expect(inNormal?.weakness).toBe('wisdom')
    // Planung ohne Klasse: 7 × 20 + 7 × 10 = 210 → 147 HP – in beiden Wochen gleich.
    expect(inSecond?.maxHp).toBe(147)
    expect(inNormal?.maxHp).toBe(147)
  })

  it('der Resolver rechnet dieselbe Kette wie die Engine – unabhängig davon, welche Woche zuerst gefragt wird', () => {
    const plan = { total: 100, byAttribute: { strength: 100, intellect: 0, wisdom: 0, charisma: 0, vitality: 0, discipline: 0 } }
    const make = () => createBossResolver({ heroSeed: 'Seed', fromWeek: '2026-01-05', planOf: () => plan })
    const forward = make()
    const ids = Array.from({ length: 30 }, (_, i) => forward.bossOf(addDays('2026-01-05', 7 * i))?.id)
    const backward = make()
    const reversed = Array.from({ length: 30 }, (_, i) => backward.bossOf(addDays('2026-01-05', 7 * (29 - i)))?.id).reverse()
    expect(reversed).toEqual(ids)
    expect(plannedWeekDamage([], { attributeLevels: levels(), classBonus: {} }).total).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 3. Truhen-Gold halbiert
// ---------------------------------------------------------------------------

describe('Review – Truhen-Gold halbiert (Nachbesserung 3a)', () => {
  it('common 10–25, uncommon 30–50, Ersatz-Gold: Streak-Schutz 50, rare 50, legendary 75', () => {
    expect(BALANCING.chests.gold).toEqual({ common: [10, 25], uncommon: [30, 50] })
    expect(BALANCING.chests.freezeFallbackGold).toBe(50)
    expect(RARE_FALLBACK_GOLD).toBe(50)
    expect(LEGENDARY_FALLBACK_GOLD).toBe(75)
    const amounts = { common: new Set<number>(), uncommon: new Set<number>() }
    for (let i = 0; i < 4000; i++) {
      amounts.common.add(chestGoldAmount(`seed:quest:${i}`, 'common'))
      amounts.uncommon.add(chestGoldAmount(`seed:quest:${i}`, 'uncommon'))
    }
    expect(Math.min(...amounts.common)).toBe(10)
    expect(Math.max(...amounts.common)).toBe(25)
    expect(Math.min(...amounts.uncommon)).toBe(30)
    expect(Math.max(...amounts.uncommon)).toBe(50)
    // Voller Beutel: ein Streak-Schutz wird beim Öffnen zu 50 Gold.
    expect(contentOnOpen({ kind: 'item', itemId: 'streakFreeze' }, BALANCING.items.streakFreeze.max)).toEqual({ kind: 'gold', amount: 50 })
    // Keine freie Kosmetik mehr: rare → 50, legendary → 75 (bzw. der Streak-Schutz bei rare).
    const none = { taken: new Set<string>(), titles: [], frames: [] }
    for (let i = 0; i < 50; i++) {
      const rare = chestContent(`seed:${i}`, 'rare', none)
      expect(rare.kind === 'item' || (rare.kind === 'gold' && rare.amount === 50)).toBe(true)
      expect(chestContent(`seed:${i}`, 'legendary', none)).toEqual({ kind: 'gold', amount: 75 })
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Gefährte: Stufen, Schlaf, Treffer an Perfekten Tagen
// ---------------------------------------------------------------------------

describe('Review – Gefährte in einer von Hand gerechneten Woche', () => {
  // Abenteuer ab Mo 26.10., keine XP davor: alle Attribute Level 1, Abenteurerin (kein Klassen-Bonus).
  // Training (Stärke, mittel, täglich) 20 · Meditieren (Weisheit, leicht, täglich) 10.
  // Geplant: 7 × 20 + 7 × 10 = 210 → 147 HP. Thema Stärke („lazy-hound“ laut Hash), Schwäche Weisheit (einzige andere):
  // Meditieren trifft mit 15.
  const START: DayKey = '2026-10-26'
  const workout = makeHabit({ id: 'workout', attribute: 'strength', difficulty: 'medium', createdDay: START })
  const meditate = makeHabit({ id: 'meditate', attribute: 'wisdom', difficulty: 'easy', createdDay: START, order: 1 })
  const fox = makeCompanionChoice('fox', { name: 'Flink', chosenDay: START })

  function week(companion = fox): GameData {
    return makeGameData({
      profile: { ...PROFILE, createdDay: START, companion },
      habits: [workout, meditate],
      completions: [
        // Mo perfekt, Di nur Training, Mi perfekt, Do perfekt
        makeCompletion(workout, '2026-10-26'),
        makeCompletion(meditate, '2026-10-26'),
        makeCompletion(workout, '2026-10-27'),
        makeCompletion(workout, '2026-10-28'),
        makeCompletion(meditate, '2026-10-28'),
        makeCompletion(workout, '2026-10-29'),
        makeCompletion(meditate, '2026-10-29'),
      ],
    })
  }

  it('Treffer je Perfektem Tag: round(10 % × 35) = 4 – nicht in den geplanten HP; Mo 39, Di 59, Mi 98, Do 137', () => {
    const boss = deriveGameState(week(), '2026-10-29').bosses.current!
    expect(boss.boss.id).toBe('lazy-hound')
    expect(boss.weakness).toBe('wisdom')
    expect(boss.maxHp).toBe(147)
    const companionHits = boss.attacks.filter((attack) => attack.source === 'companion')
    expect(companionHits.map((hit) => [hit.day, hit.damage, hit.attribute, hit.attackName, hit.sourceId, hit.weakness])).toEqual([
      ['2026-10-26', 4, 'strength', 'Flink', 'fox', false],
      ['2026-10-28', 4, 'strength', 'Flink', 'fox', false],
      ['2026-10-29', 4, 'strength', 'Flink', 'fox', false],
    ])
    // Der Treffer kommt direkt nach den Angriffen seines Tages.
    expect(boss.attacks.map((attack) => attack.source)).toEqual(['quest', 'quest', 'companion', 'quest', 'quest', 'quest', 'companion', 'quest', 'quest', 'companion'])
    expect(boss.damage).toBe(3 * 35 + 20 + 3 * 4) // 137
    expect(boss.hp).toBe(10)
    // Ohne Gefährten: gleicher Plan, 12 Schaden weniger.
    const without = deriveGameState({ ...week(), profile: { ...PROFILE, createdDay: START } }, '2026-10-29').bosses.current!
    expect(without.maxHp).toBe(147)
    expect(without.damage).toBe(125)
    // Freitag perfekt: 35 + 4 → 176 ≥ 147 – besiegt am Freitag.
    const friday = week()
    friday.completions.push(makeCompletion(workout, '2026-10-30'), makeCompletion(meditate, '2026-10-30'))
    expect(deriveGameState(friday, '2026-10-30').bosses.current).toMatchObject({ damage: 176, hp: 0, defeated: true, defeatedDay: '2026-10-30' })
  })

  it('erst ab dem Tag der Wahl; ein Art-Wechsel (gleicher Tag der Wahl) ändert am Schaden nichts', () => {
    const late = deriveGameState(week({ ...fox, chosenDay: '2026-10-28' }), '2026-10-29').bosses.current!
    expect(late.attacks.filter((attack) => attack.source === 'companion').map((hit) => hit.day)).toEqual(['2026-10-28', '2026-10-29'])
    const owl = deriveGameState(week({ ...fox, species: 'owl', name: 'Nox' }), '2026-10-29').bosses.current!
    expect(owl.damage).toBe(137)
    expect(owl.attacks.at(-1)).toMatchObject({ source: 'companion', sourceId: 'owl', attackName: 'Nox', damage: 4 })
  })

  it('Stufen genau an den Schwellen 14 / 60 / 180 aktiven Tagen; schläft ab dem 4. Tag ohne Quest', () => {
    const start: DayKey = '2026-01-05'
    const daily = makeHabit({ id: 'd', attribute: 'vitality', difficulty: 'easy', createdDay: start })
    const at = (activeDays: number, today = addDays(start, activeDays - 1)) =>
      deriveGameState(
        makeGameData({
          profile: { ...PROFILE, createdDay: start, companion: makeCompanionChoice('dragon', { chosenDay: start }) },
          habits: [daily],
          completions: completeRange(daily, start, addDays(start, activeDays - 1)),
        }),
        today,
      ).companion!
    expect([13, 14, 59, 60, 179, 180].map((days) => at(days).stage)).toEqual([0, 1, 1, 2, 2, 3])
    expect(at(13).daysToNextStage).toBe(1)
    expect(at(60).daysToNextStage).toBe(120)
    expect(at(180).daysToNextStage).toBeUndefined()
    // 20 aktive Tage, danach Ruhe: Tage 21, 22, 23 ohne Quest → am 24. Tag schläft er; die Stufe bleibt.
    expect(at(20, addDays(start, 22)).sleeping).toBe(false)
    expect(at(20, addDays(start, 23))).toMatchObject({ sleeping: true, stage: 1 })
  })
})

// ---------------------------------------------------------------------------
// 5. Endgegner je Kriterium, Endgegner-Truhe
// ---------------------------------------------------------------------------

describe('Review – Endgegner für jede Kapitel-Art', () => {
  // Lesen (messbar, 30 Minuten am Tag) ab Mo 02.11.: Mo 30, Di 35, Mi 30, Do 40 (alle erledigt), Fr 20 (Teil, heute).
  const START: DayKey = '2026-11-02'
  const TODAY: DayKey = '2026-11-06'
  const read = makeHabit({ id: 'read', attribute: 'intellect', difficulty: 'medium', createdDay: START, measure: { target: 30, unit: 'Minuten' } })
  const values: [DayKey, number][] = [['2026-11-02', 30], ['2026-11-03', 35], ['2026-11-04', 30], ['2026-11-05', 40], ['2026-11-06', 20]]
  const completions = values.map(([day, value]) => makeCompletion(read, day, { value, target: 30 }))
  const first = makeChapter({ id: 'c1', criterion: { type: 'manual' }, manualDone: true, completedDay: '2026-11-03' })
  const campaign = (id: string, last: ReturnType<typeof makeChapter>, chapters = [first, last]) =>
    makeMainQuest({ id, startDay: START, chapters })

  const quests = [
    campaign('manual', makeChapter({ id: 'end', criterion: { type: 'manual' } })),
    campaign('counter', makeChapter({ id: 'end', criterion: { type: 'counter', target: 5, label: 'Bücher' }, counter: 3 })),
    campaign('completions', makeChapter({ id: 'end', criterion: { type: 'habit', habitId: 'read', metric: 'completions', target: 10 } })),
    campaign('total', makeChapter({ id: 'end', criterion: { type: 'habit', habitId: 'read', metric: 'total', target: 300 } })),
    campaign('streak', makeChapter({ id: 'end', criterion: { type: 'habit', habitId: 'read', metric: 'streak', target: 7 } })),
    campaign('best', makeChapter({ id: 'end', criterion: { type: 'habit', habitId: 'read', metric: 'best', target: 45 } })),
    campaign('asleep', makeChapter({ id: 'end', criterion: { type: 'counter', target: 2, label: 'x' } }), [
      makeChapter({ id: 'c0', criterion: { type: 'manual' } }),
      makeChapter({ id: 'end', criterion: { type: 'counter', target: 2, label: 'x' } }),
    ]),
  ]
  const data = makeGameData({ profile: { ...PROFILE, createdDay: START }, habits: [read], completions, mainQuests: quests })

  it('HP = Ziel − Fortschritt: manuell 1/1, Zähler 2/5, Erledigungen 6/10, Summe 145/300, Serie 3/7, Bestwert 5/45', () => {
    const state = deriveGameState(data, TODAY)
    const byId = new Map(state.mainQuests.map((quest) => [quest.quest.id, quest.endBoss]))
    expect(byId.get('manual')).toMatchObject({ chapterId: 'end', awakened: true, maxHp: 1, hp: 1, defeated: false })
    expect(byId.get('counter')).toMatchObject({ awakened: true, maxHp: 5, hp: 2, defeated: false })
    // 4 erledigte Tage (Fr 20 von 30 ist nur Teilfortschritt).
    expect(byId.get('completions')).toMatchObject({ maxHp: 10, hp: 6, defeated: false })
    // Summe zählt auch Teilfortschritt: 30 + 35 + 30 + 40 + 20 = 155.
    expect(byId.get('total')).toMatchObject({ maxHp: 300, hp: 145, defeated: false })
    // Serie Mo–Do = 4 (heute noch offen bricht nichts).
    expect(byId.get('streak')).toMatchObject({ maxHp: 7, hp: 3, defeated: false })
    // Bestwert: höchster Tageswert 40.
    expect(byId.get('best')).toMatchObject({ maxHp: 45, hp: 5, defeated: false })
    // Das andere Kapitel ist offen → nur angekündigt.
    expect(byId.get('asleep')).toMatchObject({ awakened: false, maxHp: 2, hp: 2, defeated: false })
    // Eigene Kampagnen (ohne Vorlage) bekommen den allgemeinen Endgegner.
    expect(byId.get('manual')?.definition.id).toBe('end-custom')
  })

  it('besiegt: manuell abgehakt → 0 HP, Kampagne gemeistert, Endgegner-Truhe (mind. selten) am Abschlusstag', () => {
    const done = structuredClone(data)
    done.mainQuests[0].chapters[1] = { ...done.mainQuests[0].chapters[1], manualDone: true, completedDay: TODAY }
    const state = deriveGameState(done, TODAY)
    const manual = state.mainQuests[0]
    expect(manual.complete).toBe(true)
    expect(manual.endBoss).toMatchObject({ awakened: true, hp: 0, defeated: true })
    const chest = state.chests.find((entry) => entry.id === 'campaign:manual')
    expect(chest).toMatchObject({ source: 'campaign', foundDay: TODAY })
    expect(['rare', 'legendary']).toContain(chest?.rarity)
    // Determinismus: gleicher Fund und Inhalt, auch morgen und in anderer Reihenfolge der Listen.
    const shuffled = { ...done, mainQuests: [...done.mainQuests].reverse(), completions: [...done.completions].reverse() }
    expect(deriveGameState(shuffled, addDays(TODAY, 1)).chests.find((entry) => entry.id === 'campaign:manual')).toEqual(chest)
    // Zähler über das Ziel hinaus → 0 HP, nie negativ.
    done.mainQuests[1].chapters[1] = { ...done.mainQuests[1].chapters[1], counter: 9, completedDay: TODAY }
    expect(deriveGameState(done, TODAY).mainQuests[1].endBoss).toMatchObject({ hp: 0, defeated: true })
  })

  it('eine schon vor zwei Wochen gemeisterte Kampagne bringt keine rückwirkende Endgegner-Truhe', () => {
    const old = structuredClone(data)
    old.mainQuests[0].chapters = [
      { ...first, completedDay: '2026-11-03' },
      makeChapter({ id: 'end', criterion: { type: 'manual' }, manualDone: true, completedDay: '2026-11-04' }),
    ]
    expect(deriveGameState(old, '2026-11-04').chests.some((chest) => chest.id === 'campaign:manual')).toBe(true)
    // Am Dienstag der übernächsten Woche liegt der 04.11. vor dem Truhen-Fenster.
    expect(deriveGameState(old, '2026-11-17').chests.some((chest) => chest.id === 'campaign:manual')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 6. Wochenrückblick im Spielzustand
// ---------------------------------------------------------------------------

describe('Review – Wochenrückblick als GameState.weeklyReview', () => {
  // Abenteuer ab Mo 19.10.; Training (Stärke, mittel, täglich).
  // Woche 19.10.: jeden Tag erledigt. Streak-Bonus +5 % je Tag davor: 20, 21, 22, 23, 24, 25, 26 = 161;
  //   Perfekter Tag je 25 %: 5, 5, 6, 6, 6, 6, 7 = 41 → 202 XP.
  // Woche 26.10.: Mo–Do erledigt (Serie 7 → +35 %, +40 %, +45 %, +50 %): 27, 28, 29, 30 = 114; Perfekt: 7, 7, 7, 8 = 29
  //   → 143 XP, −29 % gegenüber 202. Bester Streak 11 (Do). Boss: Stärke 3 (161 XP) → Kriegerin, Training
  //   20 × 1,2 × 1,2 = 28,8 → 29, gegen die Schwäche (= Thema, einziges Attribut) 43; geplant 7 × 29 = 203 → 142 HP:
  //   43, 86, 129, 172 → am Donnerstag besiegt.
  const START: DayKey = '2026-10-19'
  const workout = makeHabit({ id: 'workout', attribute: 'strength', difficulty: 'medium', createdDay: START })
  const hero = (overrides: Partial<GameData> = {}): GameData =>
    makeGameData({
      profile: { ...PROFILE, createdDay: START },
      habits: [workout],
      completions: completeRange(workout, START, '2026-10-29'),
      ...overrides,
    })

  it('montags bis sonntags der neuen Woche: die Zahlen der Vorwoche, Vergleich, Boss', () => {
    const monday = deriveGameState(hero(), '2026-11-02')
    expect(monday.weeklyReview).toMatchObject({
      weekStart: '2026-10-26',
      weekEnd: '2026-11-01',
      xp: 143,
      xpChangePercent: -29,
      questsCompleted: 4,
      perfectDays: 4,
      bestStreak: 11,
      topAttribute: 'strength',
      restDays: 0,
      boss: { defeated: true },
    })
    expect(monday.weeklyReview?.boss?.name).toBe(monday.bosses.previous?.boss.name)
    expect(monday.weeklyReview?.line).toBeTruthy()
    // Derselbe Rückblick am Mittwoch und am Sonntag – auch ein (ungespeicherter) Sieg bleibt ein Sieg; und der
    // eigenständig gerechnete Rückblick (Tagebuch, `weeklyReview`) leitet den Boss genauso ab wie die Engine.
    for (const day of ['2026-11-04', '2026-11-08']) {
      const later = deriveGameState(hero(), day)
      expect(later.weeklyReview).toEqual(monday.weeklyReview)
      expect(weeklyReview(hero(), later, '2026-10-26')).toEqual(monday.weeklyReview)
    }
    // Gleich dem direkt gerechneten Rückblick.
    expect(monday.weeklyReview).toEqual(weeklyReview(hero(), monday, '2026-10-26'))
    // Ab dem nächsten Montag ist es der Rückblick der Woche 02.11.
    expect(deriveGameState(hero(), '2026-11-09').weeklyReview?.weekStart).toBe('2026-11-02')
  })

  it('der Gefährte zählt auch im nachgerechneten Boss: mit ihm besiegt, ohne ihn entkommen', () => {
    // Woche 26.10. wie im Gefährten-Szenario oben: Mo, Mi, Do perfekt, Di nur Training, Fr nur Meditieren (15).
    // Mit Fuchs: 137 + 15 = 152 ≥ 147 → besiegt am Freitag. Ohne: 125 + 15 = 140 → entkommen.
    const start: DayKey = '2026-10-26'
    const training = makeHabit({ id: 'workout', attribute: 'strength', difficulty: 'medium', createdDay: start })
    const meditation = makeHabit({ id: 'meditate', attribute: 'wisdom', difficulty: 'easy', createdDay: start, order: 1 })
    const days: [Habit, DayKey][] = [
      [training, '2026-10-26'], [meditation, '2026-10-26'], [training, '2026-10-27'], [training, '2026-10-28'],
      [meditation, '2026-10-28'], [training, '2026-10-29'], [meditation, '2026-10-29'], [meditation, '2026-10-30'],
    ]
    const make = (withFox: boolean) =>
      makeGameData({
        profile: { ...PROFILE, createdDay: start, ...(withFox ? { companion: makeCompanionChoice('fox', { chosenDay: start }) } : {}) },
        habits: [training, meditation],
        completions: days.map(([habit, day]) => makeCompletion(habit, day)),
      })
    expect(deriveGameState(make(true), '2026-11-01').bosses.current).toMatchObject({ damage: 152, defeated: true, defeatedDay: '2026-10-30' })
    expect(deriveGameState(make(false), '2026-11-01').bosses.current).toMatchObject({ damage: 140, defeated: false })
    for (const [withFox, defeated] of [[true, true], [false, false]] as const) {
      const wednesday = deriveGameState(make(withFox), '2026-11-04')
      expect(wednesday.bosses.previous).toBeUndefined()
      expect(wednesday.weeklyReview?.boss).toMatchObject({ name: 'Innerer Schweinehund', defeated })
      expect(weeklyReview(make(withFox), wednesday, start)).toEqual(wednesday.weeklyReview)
    }
  })

  it('weggeklickt (weeklyReviewSeen ≥ Vorwoche) oder Abenteuer erst in der Vorwoche begonnen → keiner', () => {
    expect(deriveGameState(hero({ settings: { dayStartHour: 4, effects: true, weeklyReviewSeen: '2026-10-26' } }), '2026-11-02').weeklyReview).toBeUndefined()
    expect(deriveGameState(hero({ settings: { dayStartHour: 4, effects: true, weeklyReviewSeen: '2026-10-19' } }), '2026-11-02').weeklyReview?.weekStart).toBe('2026-10-26')
    // Beginn am Montag der Vorwoche: Rückblick ja, aber ohne Vergleich (die Woche davor gehört nicht zum Abenteuer).
    const mondayStart = hero({ profile: { ...PROFILE, createdDay: '2026-10-26' } })
    const review = deriveGameState(mondayStart, '2026-11-02').weeklyReview
    expect(review?.weekStart).toBe('2026-10-26')
    expect(review?.xpChangePercent).toBeUndefined()
    // Beginn am Dienstag der Vorwoche: noch keine ganze Woche → kein Rückblick.
    expect(deriveGameState(hero({ profile: { ...PROFILE, createdDay: '2026-10-27' } }), '2026-11-02').weeklyReview).toBeUndefined()
    // Ohne Helden nichts.
    expect(deriveGameState(hero({ profile: undefined }), '2026-11-02').weeklyReview).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 7. Tagebuch: Vollständigkeit, Reihenfolge, keine Doppelten
// ---------------------------------------------------------------------------

describe('Review – Tagebuch einer kleinen Geschichte', () => {
  const START: DayKey = '2026-10-19'
  const workout = makeHabit({ id: 'workout', attribute: 'strength', difficulty: 'hard', createdDay: START })
  function story(): GameData {
    return makeGameData({
      profile: { ...PROFILE, createdDay: START, companion: makeCompanionChoice('owl', { name: 'Nox', chosenDay: '2026-10-20' }) },
      habits: [workout],
      completions: completeRange(workout, START, '2026-11-03'),
      mainQuests: [
        makeMainQuest({
          id: 'm',
          title: 'Stark werden',
          startDay: START,
          chapters: [
            makeChapter({ id: 'c1', title: 'Erste Schritte', criterion: { type: 'habit', habitId: 'workout', metric: 'completions', target: 3 } }),
            makeChapter({ id: 'c2', title: 'Der Gipfel', criterion: { type: 'habit', habitId: 'workout', metric: 'completions', target: 5 } }),
          ],
        }),
      ],
      bossVictories: [makeBossVictory('2026-10-19', { bossId: 'lazy-hound', day: '2026-10-21', maxHp: 196 })],
    })
  }

  it('jedes Ereignis einmal, neueste zuerst; am Abschlusstag: gemeistert → Endgegner → (kein doppeltes Kapitel)', () => {
    const data = story()
    const today: DayKey = '2026-11-03'
    const state = deriveGameState(data, today)
    const events = journalEvents(data, state, today)
    // Neueste zuerst.
    for (let i = 1; i < events.length; i++) expect(events[i].day <= events[i - 1].day).toBe(true)
    // Keine Doppelten (Art + Tag + Text).
    const keys = events.map((event) => `${event.kind}|${event.day}|${event.text}`)
    expect(new Set(keys).size).toBe(keys.length)
    // Do 23.10.: das 5. Training → Kapitel 2 (= Endgegner) und die Kampagne – Kapitel 1 am Mi 21.10.
    const onDay = (day: DayKey) => events.filter((event) => event.day === day).map((event) => event.kind)
    expect(onDay('2026-10-23').filter((kind) => ['chapter', 'endBossVictory', 'campaignComplete'].includes(kind))).toEqual([
      'campaignComplete',
      'endBossVictory',
    ])
    expect(events.filter((event) => event.kind === 'chapter').map((event) => event.day)).toEqual(['2026-10-21'])
    expect(events.filter((event) => event.kind === 'bossVictory').map((event) => event.day)).toEqual(['2026-10-21'])
    expect(events.at(-1)).toMatchObject({ kind: 'adventureStart', day: START })
    expect(events.find((event) => event.kind === 'companionChosen')).toMatchObject({ day: '2026-10-20', text: 'Nox schließt sich dir an' })
    // Wochenrückblicke: abgeschlossene Wochen ab Abenteuerbeginn (19.10., 26.10.) – am Sonntag.
    expect(events.filter((event) => event.kind === 'weeklyReview').map((event) => event.day)).toEqual(['2026-11-01', '2026-10-25'])
    // Zweimal gerechnet → gleich (deterministisch).
    expect(journalEvents(story(), deriveGameState(story(), today), today)).toEqual(events)
  })
})

// ---------------------------------------------------------------------------
// 8. Laufzeit: drei Jahre
// ---------------------------------------------------------------------------

describe('Review – Laufzeit über drei Jahre', () => {
  it('deriveGameState (mit fälligem Wochenrückblick und Gefährte) und das Tagebuch bleiben zügig', () => {
    const start: DayKey = '2023-11-06'
    const today: DayKey = '2026-11-04' // Mittwoch: der Rückblick muss den Boss der Vorwoche nachrechnen
    const habits: Habit[] = ATTRIBUTE_IDS.flatMap((attribute, i) => [
      makeHabit({ id: `${attribute}-a`, attribute, difficulty: 'medium', createdDay: start, order: 2 * i }),
      makeHabit({ id: `${attribute}-b`, attribute, difficulty: 'easy', createdDay: start, order: 2 * i + 1, schedule: { type: 'weekly', times: 3 } }),
    ])
    const random = seededRandom(42)
    const completions = habits.flatMap((habit) =>
      dayRange(start, today)
        .filter(() => random() < 0.7)
        .map((day) => makeCompletion(habit, day)),
    )
    const data = makeGameData({
      profile: { ...PROFILE, createdDay: start, companion: makeCompanionChoice('dragon', { chosenDay: start }) },
      habits,
      completions,
    })
    deriveGameState(data, today) // aufwärmen
    let started = performance.now()
    const state = deriveGameState(data, today)
    const derive = performance.now() - started
    expect(state.weeklyReview?.weekStart).toBe('2026-10-26')
    expect(state.companion?.stage).toBe(3)
    started = performance.now()
    const events = journalEvents(data, state, today)
    const journal = performance.now() - started
    expect(events.length).toBeGreaterThan(100)
    // Gemessen (Sandbox): deriveGameState ≈ 80 ms (davon Rückblick ≈ 25 ms), Tagebuch ≈ 100 ms – großzügige Grenzen.
    expect(derive).toBeLessThan(600)
    expect(journal).toBeLessThan(800)
  })
})
