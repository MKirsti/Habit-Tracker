import { describe, expect, it } from 'vitest'
import { CLASS_DEFINITIONS } from '../../domain/combat/classDefinitions'
import { deriveGameState } from '../../domain/engine'
import { makeBoss, makeChest, makeGameData } from '../../domain/testing'
import type { Chest, GameState, HeroClassState, WeeklyBossState } from '../../domain/types'
import { celebrationMemoryOf, enqueueCelebrations, reconcileCelebrations, rememberCelebration, withoutCelebrated } from './celebrations'
import type { ClassSceneStore } from './combatFeedback'
import { classChangeOf, classSceneSeen, combatFeedbackEvents, combatFeedbackStillHolds } from './combatFeedback'
import { bossVictorySceneText, chestFoundToastText, classChangeSceneText } from './combatSceneText'
import { feedbackStillHolds } from './feedbackEvents'

const TODAY = '2026-11-04'
const WEEK = '2026-11-02'
const LAST_WEEK = '2026-10-26'

const base = deriveGameState(makeGameData({ profile: { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' } }), TODAY)

function boss(weekStart: string, overrides: Partial<WeeklyBossState> = {}): WeeklyBossState {
  return {
    boss: makeBoss('couch-golem', 'strength', { name: 'Sofagolem', icon: '🛋️', defeatLine: 'Der Sofagolem zerfällt.' }),
    weekStart,
    weekEnd: weekStart,
    weakness: 'vitality',
    maxHp: 120,
    damage: 80,
    hp: 40,
    defeated: false,
    daysLeft: 5,
    attacks: [],
    ...overrides,
  }
}

function state(overrides: { current?: WeeklyBossState; previous?: WeeklyBossState; chests?: Chest[]; heroClass?: HeroClassState } = {}): GameState {
  const bosses: GameState['bosses'] = {}
  if (overrides.current) bosses.current = overrides.current
  if (overrides.previous) bosses.previous = overrides.previous
  return { ...base, bosses, chests: overrides.chests ?? [], heroClass: overrides.heroClass ?? base.heroClass }
}

describe('combatFeedbackEvents – Boss besiegt', () => {
  it('meldet den Sieg, wenn der Boss der Woche vorher noch stand – mit seiner Truhe', () => {
    const before = state({ current: boss(WEEK) })
    const after = state({
      current: boss(WEEK, { damage: 130, hp: 0, defeated: true, defeatedDay: TODAY }),
      chests: [makeChest(`boss:${WEEK}`, { rarity: 'rare' })],
    })
    expect(combatFeedbackEvents(before, after, 3)).toEqual([
      {
        type: 'boss-defeated',
        weekStart: WEEK,
        bossId: 'couch-golem',
        name: 'Sofagolem',
        icon: '🛋️',
        defeatLine: 'Der Sofagolem zerfällt.',
        maxHp: 120,
        chestId: `boss:${WEEK}`,
        lastWeek: false,
      },
    ])
  })

  it('meldet auch den Vorwochen-Boss, der durch Nachtragen fällt', () => {
    const before = state({ current: boss(WEEK), previous: boss(LAST_WEEK) })
    const after = state({ current: boss(WEEK), previous: boss(LAST_WEEK, { hp: 0, defeated: true }) })
    const events = combatFeedbackEvents(before, after, 3)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'boss-defeated', weekStart: LAST_WEEK, lastWeek: true })
    expect(events[0]).not.toHaveProperty('chestId')
  })

  it('bleibt still ohne Vorgänger (erstes Laden, neue Woche) und bei einem schon besiegten Boss', () => {
    const defeated = boss(WEEK, { hp: 0, defeated: true })
    expect(combatFeedbackEvents(state(), state({ current: defeated }), 3)).toEqual([])
    expect(combatFeedbackEvents(state({ current: boss(LAST_WEEK) }), state({ current: defeated }), 3)).toEqual([])
    expect(combatFeedbackEvents(state({ current: defeated }), state({ current: defeated }), 3)).toEqual([])
  })

  it('gilt weiter, solange der Boss besiegt ist – auch wenn der gespeicherte Vorwochen-Boss verschwindet', () => {
    const [event] = combatFeedbackEvents(
      state({ current: boss(WEEK) }),
      state({ current: boss(WEEK, { hp: 0, defeated: true }) }),
      3,
    )
    expect(combatFeedbackStillHolds(event, state({ current: boss(WEEK, { hp: 0, defeated: true }) }))).toBe(true)
    // Haken sofort wieder entfernt (noch nicht gespeichert): Der Boss steht wieder.
    expect(feedbackStillHolds(event, state({ current: boss(WEEK) }))).toBe(false)
    const [lastWeek] = combatFeedbackEvents(
      state({ previous: boss(LAST_WEEK) }),
      state({ previous: boss(LAST_WEEK, { defeated: true }) }),
      3,
    )
    expect(feedbackStillHolds(lastWeek, state())).toBe(true)
  })

  it('feiert denselben Sieg nur einmal (Haken weg und wieder dran)', () => {
    const before = state({ current: boss(WEEK) })
    const after = state({ current: boss(WEEK, { hp: 0, defeated: true }) })
    const events = combatFeedbackEvents(before, after, 3)
    const memory = celebrationMemoryOf(before)
    const queue = enqueueCelebrations([], withoutCelebrated(events, memory), () => 1)
    expect(queue.map((entry) => entry.kind)).toEqual(['boss'])
    const remembered = rememberCelebration(memory, queue[0])
    expect(withoutCelebrated(events, remembered)).toEqual([])
    // Beim Start schon besiegt: gilt als gefeiert.
    expect(withoutCelebrated(events, celebrationMemoryOf(after))).toEqual([])
    // Rückgängig gemacht, bevor die Szene gesehen wurde: Sie verschwindet.
    expect(reconcileCelebrations(queue, before)).toEqual([])
  })
})

describe('combatFeedbackEvents – Truhe gefunden', () => {
  it('meldet neue Quest- und Kapitel-Truhen, nicht die Boss-Truhe und keine schon geöffneten', () => {
    const quest = makeChest('quest:h1:2026-11-04', { rarity: 'uncommon' })
    const chapter = makeChest('chapter:mq:c1', { rarity: 'rare' })
    const after = state({
      chests: [quest, chapter, makeChest(`boss:${WEEK}`), makeChest('quest:h2:2026-11-03', { openedAt: 1 })],
    })
    expect(combatFeedbackEvents(state(), after, 3)).toEqual([
      {
        type: 'chest-found',
        chests: [
          { id: quest.id, source: 'quest', rarity: 'uncommon' },
          { id: chapter.id, source: 'chapter', rarity: 'rare' },
        ],
      },
    ])
  })

  it('bleibt bei vielen Truhen auf einmal still (Massenänderung) und meldet bekannte nicht noch einmal', () => {
    const many = ['a', 'b', 'c', 'd'].map((id) => makeChest(`chapter:mq:${id}`))
    expect(combatFeedbackEvents(state(), state({ chests: many }), 3)).toEqual([])
    expect(combatFeedbackEvents(state({ chests: many }), state({ chests: many }), 3)).toEqual([])
  })

  it('gilt nur, solange die Truhen da sind (Quest wieder abgehakt, bevor sie gespeichert war)', () => {
    const chest = makeChest('quest:h1:2026-11-04')
    const [event] = combatFeedbackEvents(state(), state({ chests: [chest] }), 3)
    expect(feedbackStillHolds(event, state({ chests: [chest] }))).toBe(true)
    expect(feedbackStillHolds(event, state())).toBe(false)
  })
})

describe('classChangeOf', () => {
  const mage = {
    ...base.heroClass,
    definition: CLASS_DEFINITIONS.archmage,
    weekStart: WEEK,
    classBonus: { intellect: 0.1, wisdom: 0.1 },
    previousId: 'mage' as const,
  }

  it('meldet den Wechsel der laufenden Woche mit alter und neuer Klasse', () => {
    expect(classChangeOf({ heroClass: mage })).toEqual({
      type: 'class-changed',
      weekStart: WEEK,
      from: CLASS_DEFINITIONS.mage,
      to: CLASS_DEFINITIONS.archmage,
      classBonus: { intellect: 0.1, wisdom: 0.1 },
    })
  })

  it('meldet nichts ohne Wechsel und nichts beim Zurückfallen zum Abenteurer', () => {
    const { previousId: _unused, ...unchanged } = mage
    expect(classChangeOf({ heroClass: unchanged })).toBeUndefined()
    expect(classChangeOf({ heroClass: { ...mage, definition: CLASS_DEFINITIONS.adventurer } })).toBeUndefined()
  })

  it('gilt nur für die Woche und Klasse, für die er gemeldet wurde', () => {
    const event = classChangeOf({ heroClass: mage })
    expect(event).toBeDefined()
    if (!event) return
    expect(feedbackStillHolds(event, state({ heroClass: mage }))).toBe(true)
    expect(feedbackStillHolds(event, state({ heroClass: { ...mage, definition: CLASS_DEFINITIONS.mage } }))).toBe(false)
    expect(feedbackStillHolds(event, state({ heroClass: { ...mage, weekStart: '2026-11-09' } }))).toBe(false)
  })

  it('merkt sich je Held die zuletzt gezeigte Woche', () => {
    const map = new Map<string, string>()
    const store: ClassSceneStore = { get: (hero) => map.get(hero), set: (hero, week) => void map.set(hero, week) }
    expect(classSceneSeen(store, 'aria', WEEK)).toBe(false)
    store.set('aria', WEEK)
    expect(classSceneSeen(store, 'aria', WEEK)).toBe(true)
    expect(classSceneSeen(store, 'aria', LAST_WEEK)).toBe(true)
    expect(classSceneSeen(store, 'aria', '2026-11-09')).toBe(false)
    expect(classSceneSeen(store, 'bran', WEEK)).toBe(false)
  })
})

describe('Texte', () => {
  it('feiert den Boss mit seinem Siegessatz', () => {
    expect(bossVictorySceneText({ name: 'Sofagolem', defeatLine: 'Zerfallen!', maxHp: 1200, lastWeek: false })).toEqual({
      eyebrow: 'Boss besiegt',
      title: 'Sofagolem ist besiegt!',
      line: 'Zerfallen!',
      hpBadge: '1.200 HP bezwungen',
    })
    const late = bossVictorySceneText({ name: 'Sofagolem', defeatLine: 'Zerfallen!', maxHp: 90, lastWeek: true })
    expect(late.eyebrow).toBe('Boss der Vorwoche besiegt')
    expect(late.note).toBe('Nachgetragen zählt – der Sieg gehört dir.')
  })

  it('Klassenaufstieg in der Sprachform: „Du bist zur Erzmagierin aufgestiegen!“', () => {
    const event = { from: CLASS_DEFINITIONS.mage, to: CLASS_DEFINITIONS.archmage, classBonus: { intellect: 0.1, wisdom: 0.1 } }
    const female = classChangeSceneText(event, 'female')
    expect(female).toMatchObject({
      kind: 'ascended',
      eyebrow: 'Klassenaufstieg',
      title: 'Du bist zur Erzmagierin aufgestiegen!',
      from: { icon: '🔮', name: 'Magierin' },
      to: { icon: '🌌', name: 'Erzmagierin' },
      changeSpoken: 'Bisher Magierin, jetzt Erzmagierin.',
      bonus: ['+10\u00a0% Arkaner Blitz', '+10\u00a0% Mondlicht'],
    })
    expect(female.line).toBeUndefined()
    expect(classChangeSceneText(event, 'male').title).toBe('Du bist zum Erzmagier aufgestiegen!')
    expect(classChangeSceneText(event).title).toBe('Du bist zum Sternengeist aufgestiegen!')
  })

  it('erwachte und gewandelte Klassen kommen ohne Beugung aus', () => {
    const awakened = classChangeSceneText({ from: CLASS_DEFINITIONS.adventurer, to: CLASS_DEFINITIONS.mage, classBonus: { intellect: 0.2 } })
    expect(awakened).toMatchObject({
      kind: 'awakened',
      title: 'Deine Klasse ist erwacht!',
      line: 'Ab dieser Woche kämpfst du als Arkane Seele.',
      from: { name: 'Wanderseele' },
    })
    const changed = classChangeSceneText({ from: CLASS_DEFINITIONS.archmage, to: CLASS_DEFINITIONS.warrior, classBonus: { strength: 0.2 } }, 'female')
    expect(changed).toMatchObject({ kind: 'changed', title: 'Dein Weg hat sich gewandelt', line: 'Ab dieser Woche kämpfst du als Kriegerin.' })
    // Ohne passenden Dativ: neutraler Titel plus „als …“.
    const shaman = classChangeSceneText({ from: CLASS_DEFINITIONS.druid, to: CLASS_DEFINITIONS.shaman, classBonus: {} })
    expect(shaman).toMatchObject({ title: 'Du bist aufgestiegen!', line: 'Ab dieser Woche kämpfst du als Trommelherz.' })
  })

  it('„Truhe gefunden“ nennt Seltenheit und Fundort', () => {
    expect(chestFoundToastText([{ rarity: 'rare', sourceLine: '📖 Lesen' }])).toEqual({
      title: 'Truhe gefunden!',
      description: 'Seltene Truhe · 📖 Lesen – öffne sie in deiner Sammlung.',
    })
    expect(
      chestFoundToastText([
        { rarity: 'common', sourceLine: 'a' },
        { rarity: 'rare', sourceLine: 'b' },
      ]),
    ).toEqual({ title: '2 Truhen gefunden!', description: 'Öffne sie in deiner Sammlung.' })
  })
})
