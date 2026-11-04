/**
 * Review Phase 3a (Daten): Kampf, Truhen und Titel über die echte Datenbank – Umbenennen, Öffnen jeder Inhaltsart
 * (inkl. Ersatz-Gold bei vollem Vorrat), Abrechnung mit Truhen-Streak-Schutz, Upgrade von Version 4 mit echtem
 * Verlauf, Backup hin und zurück (auch alte Backups).
 */
import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { BALANCING } from '../domain/balancing'
import { heroSeedOf, unrecordedVictories } from '../domain/combat/boss'
import { chestWindowStart, unrecordedChests } from '../domain/combat/chests'
import { activeFrame, activeTitle } from '../domain/combat/cosmetics'
import { addDays, compareDays, dayRange } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import {
  makeBossVictory,
  makeChest,
  makeCompletion,
  makeHabit,
  makeItemPurchase,
  makeLedgerEntry,
  makeMainQuest,
  makeRestPeriod,
  makeSideQuest,
} from '../domain/testing'
import type { DayKey, GameData, GameState } from '../domain/types'
import { createBackup, parseBackup, restoreBackup } from './backup'
import { KV_KEYS, QuestlogDB } from './db'
import { loadGameData, openChest, recordProgress, saveProfile, settleHpDays, updateProfile } from './repository'

const opened: QuestlogDB[] = []
const names: string[] = []
let counter = 0

function freshDatabase(): QuestlogDB {
  const database = new QuestlogDB(`questlog-test-phase3a-review-${++counter}`)
  opened.push(database)
  return database
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((database) => database.delete()))
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)))
})

describe('Review 3a – Umbenennen würfelt nichts neu aus', () => {
  const START: DayKey = '2026-10-19'
  const TODAY: DayKey = '2026-11-04'

  async function heroWithWeek(database: QuestlogDB): Promise<void> {
    await saveProfile({ name: 'Juna', avatar: '🧝', createdDay: START }, database)
    const lesen = makeHabit({ id: 'lesen', title: 'Lesen', attribute: 'intellect', difficulty: 'hard', createdDay: START })
    const anrufen = makeHabit({
      id: 'anrufen',
      title: 'Freunde anrufen',
      attribute: 'charisma',
      createdDay: START,
      schedule: { type: 'weekly', times: 2 },
      order: 1,
    })
    await database.habits.bulkAdd([lesen, anrufen])
    await database.completions.bulkAdd(
      [lesen, anrufen].flatMap((habit) => ['2026-11-02', '2026-11-03', TODAY].map((day) => makeCompletion(habit, day))),
    )
  }

  it('„Held bearbeiten“ mit neuem Namen behält Boss, Schwäche und Truhen-Funde der Woche', async () => {
    const database = freshDatabase()
    await heroWithWeek(database)
    const before = deriveGameState(await loadGameData(database), TODAY)
    expect(before.bosses.current).toBeDefined()

    await saveProfile({ name: 'Juna Sturmwind', avatar: '🧝', createdDay: START, form: 'female' }, database)
    const data = await loadGameData(database)
    expect(data.profile).toStrictEqual({
      name: 'Juna Sturmwind',
      avatar: '🧝',
      createdDay: START,
      form: 'female',
      heroSeed: '2026-10-19Juna',
    })
    const after = deriveGameState(data, TODAY)
    expect(after.bosses).toStrictEqual(before.bosses)
    expect(after.chests).toStrictEqual(before.chests)

    // Ein zweites Umbenennen behält den ursprünglichen Seed; zurück zum alten Namen braucht ihn nicht mehr.
    await updateProfile({ name: 'Juna die Kühne' }, database)
    expect((await loadGameData(database)).profile?.heroSeed).toBe('2026-10-19Juna')
    await updateProfile({ name: 'Juna' }, database)
    const back = (await loadGameData(database)).profile
    expect(back).toStrictEqual({ name: 'Juna', avatar: '🧝', createdDay: START, form: 'female' })
    expect(heroSeedOf(back)).toBe('2026-10-19Juna')
  })

  it('ein neuer Held (anderer Anlegetag) übernimmt den Seed des alten nicht; der Seed lässt sich nicht von außen setzen', async () => {
    const database = freshDatabase()
    await saveProfile({ name: 'Juna', avatar: '🧝', createdDay: START }, database)
    await saveProfile({ name: 'Kai', avatar: '🧙', createdDay: TODAY }, database)
    expect((await loadGameData(database)).profile).toStrictEqual({ name: 'Kai', avatar: '🧙', createdDay: TODAY })

    await updateProfile({ heroSeed: 'geschummelt' }, database)
    expect((await loadGameData(database)).profile?.heroSeed).toBeUndefined()
  })
})

/** Mittags (lokal) am Spieltag `day` – mit Tageswechsel um 4 Uhr eindeutig dieser Spieltag. */
function noon(day: DayKey): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, 12)
}

/** Was der `ProgressRecorder` jetzt speichern würde – über die echte Datenbank gespeichert. */
async function recordPending(database: QuestlogDB, today: DayKey): Promise<GameState> {
  const data = await loadGameData(database)
  const state = deriveGameState(data, today)
  const stored = new Set((data.achievementUnlocks ?? []).map((unlock) => unlock.id))
  await recordProgress(
    {
      achievementUnlocks: state.achievements
        .filter((achievement) => achievement.unlocked && !stored.has(achievement.definition.id))
        .map((achievement) => ({ id: achievement.definition.id, day: achievement.unlockedDay ?? today })),
      bossVictories: unrecordedVictories([state.bosses.current, state.bosses.previous], data.bossVictories),
      chests: unrecordedChests(state.chests, data.chests),
    },
    database,
  )
  return state
}

/** Der Teil des Spielstands, um den es in Phase 3a geht (plus Level/Gold zur Kontrolle). */
function combatView(state: GameState) {
  return {
    heroClass: state.heroClass,
    bosses: state.bosses,
    chests: state.chests,
    cosmetics: state.cosmetics,
    gold: state.gold,
    inventory: state.inventory,
    level: state.level,
  }
}

describe('Review 3a – Truhen öffnen: jede Inhaltsart über die echte Datenbank', () => {
  const START: DayKey = '2026-10-05'
  const TODAY: DayKey = '2026-10-21'
  const content = {
    gold: { kind: 'gold', amount: 30 },
    freeze: { kind: 'item', itemId: 'streakFreeze' },
    title: { kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: 'chosen-one' },
    frame: { kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'dragon-scale' },
  } as const

  it('Gold, Streak-Schutz (mit Platz und bei vollem Vorrat), Titel und Rahmen – Gold und Vorrat stimmen danach', async () => {
    const database = freshDatabase()
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: START, form: 'female' }, database)
    // 4 gekaufte Streak-Schutz im Beutel (ohne Gold-Prüfung direkt gespeichert)
    await database.purchases.bulkAdd([0, 1, 2, 3].map((i) => makeItemPurchase(`f${i}`, 'streakFreeze', START, { createdAt: i })))
    await recordProgress(
      {
        chests: [
          makeChest('chapter:q:gold', { foundDay: TODAY, content: content.gold }),
          makeChest('chapter:q:freeze-1', { foundDay: TODAY, rarity: 'rare', content: content.freeze }),
          makeChest('chapter:q:freeze-2', { foundDay: TODAY, rarity: 'rare', content: content.freeze }),
          makeChest('chapter:q:title', { foundDay: TODAY, rarity: 'legendary', content: content.title }),
          makeChest('chapter:q:frame', { foundDay: TODAY, rarity: 'rare', content: content.frame }),
        ],
      },
      database,
    )
    const state = async () => deriveGameState(await loadGameData(database), TODAY)
    const before = await state()
    expect(before.inventory).toEqual({ streakFreezes: 4, unopenedChests: 5 })
    expect(before.cosmetics.titles).not.toContain('chosen-one')
    const now = noon(TODAY).getTime()

    expect(await openChest('chapter:q:gold', TODAY, database, now)).toStrictEqual(content.gold)
    expect((await state()).gold).toMatchObject({ fromChests: 30, balance: before.gold.balance + 30 })

    expect(await openChest('chapter:q:freeze-1', TODAY, database, now)).toStrictEqual(content.freeze)
    expect((await state()).inventory).toEqual({ streakFreezes: 5, unopenedChests: 3 })

    // Vorrat voll: Ersatz-Gold – so gespeichert, der Vorrat bleibt bei 5.
    const fallback = { kind: 'gold', amount: BALANCING.chests.freezeFallbackGold }
    expect(await openChest('chapter:q:freeze-2', TODAY, database, now)).toStrictEqual(fallback)
    expect((await database.chests.get('chapter:q:freeze-2'))?.content).toStrictEqual(fallback)
    let after = await state()
    expect(after.inventory).toEqual({ streakFreezes: 5, unopenedChests: 2 })
    expect(after.gold).toMatchObject({ fromChests: 30 + fallback.amount, balance: before.gold.balance + 30 + fallback.amount })

    expect(await openChest('chapter:q:title', TODAY, database, now)).toStrictEqual(content.title)
    expect(await openChest('chapter:q:frame', TODAY, database, now)).toStrictEqual(content.frame)
    expect((await loadGameData(database)).cosmeticUnlocks).toStrictEqual([
      { id: 'chosen-one', kind: 'title', day: TODAY, source: 'chest' },
      { id: 'dragon-scale', kind: 'frame', day: TODAY, source: 'chest' },
    ])
    after = await state()
    expect(after.cosmetics.titles).toContain('chosen-one')
    expect(after.cosmetics.frames).toContain('dragon-scale')
    expect(after.inventory.unopenedChests).toBe(0)

    // Anlegen und anzeigen.
    await updateProfile({ titleId: 'chosen-one', frameId: 'dragon-scale' }, database)
    const data = await loadGameData(database)
    expect(activeTitle(data.profile, after.cosmetics)?.names.female).toBe('die Auserwählte')
    expect(activeFrame(data.profile, after.cosmetics)?.id).toBe('dragon-scale')

    // Gold insgesamt: XP + Erfolge + geöffnete Truhen − Ausgaben (die gekauften Streak-Schutz sind direkt gespeichert).
    expect(after.gold.earned).toBe(after.gold.fromXp + after.gold.fromAchievements + after.gold.fromChests)
    expect(after.gold.balance).toBe(after.gold.earned - after.gold.spent - after.gold.lostToDefeats)

    // Ein zweites Öffnen gibt es nicht.
    await expect(openChest('chapter:q:title', TODAY, database, now)).rejects.toThrow('Diese Truhe hast du schon geöffnet.')
  })

  it('Streak-Schutz aus einer Truhe fängt in der Abrechnung (settleHpDays) den verpassten Tag auf', async () => {
    const database = freshDatabase()
    const since: DayKey = '2026-11-02'
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: since }, database)
    await database.habits.add(makeHabit({ id: 'd', difficulty: 'easy', createdDay: since }))
    await database.completions.add(makeCompletion(makeHabit({ id: 'd', difficulty: 'easy' }), since))
    await database.kv.put({ key: KV_KEYS.settings, value: { penalties: { enabled: true, since } } })
    await database.hpLedger.add(makeLedgerEntry(since, { score: 'perfect' }))
    await recordProgress({ chests: [makeChest(`chapter:q:c`, { foundDay: since, rarity: 'rare', content: content.freeze })] }, database)
    await openChest('chapter:q:c', since, database, noon(since).getTime())

    // 03.11. verpasst; am 05.11. abgerechnet – aufgefangen wie angekündigt.
    expect(deriveGameState(await loadGameData(database), '2026-11-04').hp.yesterday?.savedByFreeze).toBe(true)
    const [entry] = await settleHpDays('2026-11-05', database)
    expect(entry).toMatchObject({ day: '2026-11-03', score: 'missed', frozen: true, hpDelta: 0 })
    expect(deriveGameState(await loadGameData(database), '2026-11-05').inventory.streakFreezes).toBe(0)
  })
})

describe('Review 3a – Upgrade von Version 4 mit echtem Verlauf', () => {
  const START: DayKey = '2026-08-03' // Montag
  const TODAY: DayKey = '2026-11-04' // Mittwoch, gut drei Monate später

  /** Stand nach Phase 2b: drei Quests, Kampagne mit früh und gestern abgeschlossenem Kapitel, Schatzkammer, HP. */
  function phase2bData(): GameData {
    const lesen = makeHabit({ id: 'lesen', title: 'Lesen', attribute: 'intellect', difficulty: 'medium', createdDay: START, mainQuestId: 'mq' })
    const laufen = makeHabit({
      id: 'laufen',
      title: 'Laufen',
      attribute: 'vitality',
      difficulty: 'hard',
      createdDay: START,
      schedule: { type: 'weekly', times: 3 },
      order: 1,
    })
    const atmen = makeHabit({
      id: 'atmen',
      title: 'Atmen',
      attribute: 'wisdom',
      difficulty: 'easy',
      createdDay: START,
      schedule: { type: 'weekdays', days: [1, 3, 5] },
      order: 2,
    })
    const completions = []
    for (const [n, day] of dayRange(START, TODAY).entries()) {
      if (day === TODAY) break
      if (n % 6 !== 4) completions.push(makeCompletion(lesen, day, { updatedAt: n }))
      if (n % 2 === 0) completions.push(makeCompletion(laufen, day, { updatedAt: n }))
      completions.push(makeCompletion(atmen, day, { updatedAt: n }))
    }
    const campaign = makeMainQuest({
      id: 'mq',
      startDay: START,
      chapters: [
        { id: 'c1', title: 'Zehn Tage', criterion: { type: 'habit', habitId: 'lesen', metric: 'completions', target: 10 } },
        { id: 'c2', title: 'Meilenstein', criterion: { type: 'manual' }, manualDone: true, completedDay: addDays(TODAY, -1) },
      ],
    })
    const ledger = dayRange('2026-10-20', addDays(TODAY, -2)).map((day, i) =>
      makeLedgerEntry(day, { score: i === 3 ? 'missed' : 'good', frozen: i === 3, hpAfter: 60, maxHp: 80 }),
    )
    return {
      profile: { name: 'Mika', avatar: '🐺', createdDay: START },
      settings: { dayStartHour: 4, effects: true, penalties: { enabled: true, since: '2026-10-20' }, hpIntroSeen: true },
      habits: [lesen, laufen, atmen],
      completions,
      mainQuests: [campaign],
      rewards: [{ id: 'r', title: 'Pizza', icon: '🍕', price: 300, repeatable: true, order: 0, createdAt: 1 }],
      purchases: [
        { id: 'p', kind: 'reward', rewardId: 'r', title: 'Pizza', icon: '🍕', price: 300, day: '2026-09-01', createdAt: 2 },
        makeItemPurchase('f1', 'streakFreeze', '2026-10-15', { createdAt: 3 }),
        makeItemPurchase('f2', 'streakFreeze', '2026-10-16', { createdAt: 4 }),
      ],
      sideQuests: [makeSideQuest({ id: 's', attribute: 'charisma', doneDay: addDays(TODAY, -1), createdDay: START })],
      achievementUnlocks: [{ id: 'quests-10', day: '2026-08-12' }],
      hpLedger: ledger,
      restPeriods: [makeRestPeriod('urlaub', '2026-09-14', '2026-09-20')],
    }
  }

  async function legacyDatabase(name: string, data: GameData): Promise<void> {
    const v4 = new Dexie(name)
    v4.version(4).stores({
      habits: '&id, order, mainQuestId',
      completions: '&id, habitId, day',
      mainQuests: '&id',
      kv: '&key',
      rewards: '&id, order',
      purchases: '&id, day',
      sideQuests: '&id, order',
      achievementUnlocks: '&id',
      hpLedger: '&day',
      restPeriods: '&id, from',
    })
    await v4.table('habits').bulkAdd(data.habits)
    await v4.table('completions').bulkAdd(data.completions)
    await v4.table('mainQuests').bulkAdd(data.mainQuests)
    await v4.table('rewards').bulkAdd(data.rewards ?? [])
    await v4.table('purchases').bulkAdd(data.purchases ?? [])
    await v4.table('sideQuests').bulkAdd(data.sideQuests ?? [])
    await v4.table('achievementUnlocks').bulkAdd(data.achievementUnlocks ?? [])
    await v4.table('hpLedger').bulkAdd(data.hpLedger ?? [])
    await v4.table('restPeriods').bulkAdd(data.restPeriods ?? [])
    await v4.table('kv').bulkAdd([
      { key: KV_KEYS.profile, value: data.profile },
      { key: KV_KEYS.settings, value: data.settings },
    ])
    v4.close()
  }

  it('Phase-2b-Stand bleibt; Klasse und Boss sofort, Truhen nur im Fenster; Speichern und Neuladen ändern nichts', async () => {
    const name = 'questlog-test-phase3a-review-upgrade'
    names.push(name)
    const v4Data = phase2bData()
    await legacyDatabase(name, v4Data)
    // Was die Engine vor dem Update (ohne Phase-3a-Daten) zeigte.
    const before = deriveGameState(v4Data, TODAY)

    const upgraded = new QuestlogDB(name)
    await upgraded.open()
    try {
      const loaded = await loadGameData(upgraded)
      const after = deriveGameState(loaded, TODAY)
      for (const key of ['level', 'attributes', 'totals', 'achievements', 'mainQuests', 'todayState', 'hp'] as const) {
        expect(after[key], key).toStrictEqual(before[key])
      }
      expect(after.gold).toStrictEqual(before.gold)
      expect(after.gold.fromChests).toBe(0)
      expect(after.inventory.streakFreezes).toBe(1) // 2 gekauft, 1 verbraucht

      // Klasse aus dem Stand vom Sonntag: Intelligenz klar vorn.
      expect(after.heroClass.definition.id).not.toBe('adventurer')
      expect(after.heroClass.weekStart).toBe('2026-11-02')
      expect(after.bosses.current?.weekStart).toBe('2026-11-02')
      // Kein Berg rückwirkender Truhen: nur Funde ab dem Fenster (Montag dieser Woche); das alte Kapitel bringt keine.
      const windowStart = chestWindowStart(TODAY)
      for (const chest of after.chests) {
        expect(compareDays(chest.foundDay, windowStart), chest.id).toBeGreaterThanOrEqual(0)
      }
      expect(after.chests.map((chest) => chest.id)).toContain('chapter:mq:c2')
      expect(after.chests.map((chest) => chest.id)).not.toContain('chapter:mq:c1')
      expect(after.chests.filter((chest) => chest.source === 'quest').length).toBeLessThanOrEqual(2)

      // Recorder speichert – danach (und nach dem Neuladen) ist alles gleich.
      await recordPending(upgraded, TODAY)
      const recorded = deriveGameState(await loadGameData(upgraded), TODAY)
      expect(combatView(recorded)).toStrictEqual(combatView(after))
      expect((await loadGameData(upgraded)).chests).toStrictEqual(after.chests)

      // Am nächsten Tag: gespeicherte Truhen unverändert, das Fenster ist nicht gewandert (gleiche Woche).
      const tomorrow = deriveGameState(await loadGameData(upgraded), addDays(TODAY, 1))
      for (const chest of after.chests) expect(tomorrow.chests).toContainEqual(chest)
    } finally {
      upgraded.close()
    }
  })

  it('ein altes Backup (Phase 2b) wiederhergestellt ergibt denselben Stand wie das Upgrade', async () => {
    const v4Data = phase2bData()
    const parsed = parseBackup(JSON.stringify({ app: 'questlog', schemaVersion: 1, exportedAt: noon(TODAY).toISOString(), data: v4Data }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const database = freshDatabase()
    await restoreBackup(parsed.backup, database, noon(TODAY))
    const restored = await loadGameData(database)
    for (const key of ['bossVictories', 'chests', 'cosmeticUnlocks'] as const) expect(key in restored).toBe(false)
    expect(combatView(deriveGameState(restored, TODAY))).toStrictEqual(combatView(deriveGameState(v4Data, TODAY)))
  })
})

describe('Review 3a – Backup hin und zurück', () => {
  const START: DayKey = '2026-10-19'
  const TODAY: DayKey = '2026-11-04'

  it('mit Boss-Siegen, offenen und geöffneten Truhen, Freischaltungen und festgehaltenem Helden-Seed: alles bleibt', async () => {
    const source = freshDatabase()
    await saveProfile({ name: 'Juna', avatar: '🧝', createdDay: START, form: 'neutral' }, source)
    await saveProfile({ name: 'Juna Sturmwind', avatar: '🧝', createdDay: START }, source) // umbenannt
    const lesen = makeHabit({ id: 'lesen', attribute: 'intellect', difficulty: 'hard', createdDay: START })
    await source.habits.add(lesen)
    await source.completions.bulkAdd(dayRange(START, TODAY).map((day) => makeCompletion(lesen, day)))
    await recordPending(source, TODAY)
    await recordProgress(
      {
        bossVictories: [makeBossVictory('2026-10-19', { bossId: 'bookworm-golem', day: '2026-10-23', maxHp: 200 })],
        chests: [
          makeChest('chapter:q:a', { foundDay: '2026-11-02', rarity: 'legendary', content: { kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'stardust' } }),
          makeChest('chapter:q:b', { foundDay: '2026-11-03', rarity: 'uncommon', content: { kind: 'gold', amount: 77 } }),
        ],
      },
      source,
    )
    await openChest('chapter:q:a', TODAY, source, noon(TODAY).getTime())
    await updateProfile({ frameId: 'stardust' }, source)
    const original = await loadGameData(source)
    expect(original.profile?.heroSeed).toBe('2026-10-19Juna')
    expect(original.bossVictories?.length).toBeGreaterThanOrEqual(1)

    const file = JSON.parse(JSON.stringify(await createBackup(noon(TODAY), source)))
    const parsed = parseBackup(file)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const target = freshDatabase()
    await restoreBackup(parsed.backup, target, noon(TODAY))
    const restored = await loadGameData(target)
    expect(restored).toStrictEqual(original)
    expect(combatView(deriveGameState(restored, TODAY))).toStrictEqual(combatView(deriveGameState(original, TODAY)))
  })

  it('ein leerer Helden-Seed im Backup wird abgelehnt', () => {
    const data: GameData = {
      profile: { name: 'Juna', avatar: '🧝', createdDay: START, heroSeed: '' },
      settings: { dayStartHour: 4, effects: true },
      habits: [],
      completions: [],
      mainQuests: [],
    }
    const parsed = parseBackup({ app: 'questlog', schemaVersion: 1, exportedAt: noon(TODAY).toISOString(), data })
    expect(parsed.ok).toBe(false)
  })
})
