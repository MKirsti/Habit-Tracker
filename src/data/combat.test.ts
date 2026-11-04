/**
 * Phase 3a – Daten: Profil (Sprachform, Titel, Rahmen), Einführung, `recordProgress` (Erfolge, Boss-Siege, Truhen)
 * und `openChest`.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BALANCING } from '../domain/balancing'
import { FRAMES, TITLES } from '../domain/combat/cosmeticDefinitions'
import { deriveGameState } from '../domain/engine'
import { makeBossVictory, makeChest, makeCosmeticUnlock, makeItemPurchase } from '../domain/testing'
import type { Chest, DayKey } from '../domain/types'
import { KV_KEYS, QuestlogDB } from './db'
import {
  loadGameData,
  markCombatIntroSeen,
  openChest,
  type ProgressRecord,
  recordAchievementUnlocks,
  recordProgress,
  resetAllData,
  saveProfile,
  updateProfile,
  updateSettings,
} from './repository'
import { startAdventure } from './seed'

const START = '2026-10-05' // Montag
const TODAY = '2026-10-21' // Mittwoch
/** Mittags am Spieltag TODAY (lokale Zeit, Tageswechsel 4 Uhr) – Zeitpunkt des Öffnens in den Tests. */
const NOW = new Date(2026, 9, 21, 12).getTime()
const FREEZE_MAX = BALANCING.items.streakFreeze.max
const FALLBACK_GOLD = BALANCING.chests.freezeFallbackGold

const TITLE = TITLES[0].id
const OTHER_TITLE = TITLES[1].id
const FRAME = FRAMES[0].id

const MSG = {
  noHero: 'Es gibt noch keinen Helden – beginne zuerst dein Abenteuer.',
  form: 'Diese Sprachform gibt es nicht.',
  title: 'Diesen Titel gibt es nicht.',
  frame: 'Diesen Rahmen gibt es nicht.',
  victory: 'Ungültiger Boss-Sieg.',
  chest: 'Ungültige Truhe.',
  achievement: 'Ungültiger Erfolg.',
  chestNotFound: 'Diese Truhe gibt es nicht (mehr).',
  chestOpened: 'Diese Truhe hast du schon geöffnet.',
}

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-combat-${++dbCounter}`)
  await database.open()
})

afterEach(async () => {
  await database.delete()
})

async function hero(): Promise<void> {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: START }, database)
}

async function stateOn(today: DayKey = TODAY) {
  return deriveGameState(await loadGameData(database), today)
}

/** Legt `count` gekaufte Streak-Schutz-Gegenstände in den Vorrat (direkt, ohne Gold). */
async function stockFreezes(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await database.purchases.add(makeItemPurchase(`frost-${i}`, 'streakFreeze', START, { createdAt: i + 1 }))
  }
}

function freezeChest(id: string): Chest {
  return makeChest(id, { foundDay: TODAY, rarity: 'rare', content: { kind: 'item', itemId: 'streakFreeze' } })
}

// ---------------------------------------------------------------------------

describe('Titel & Rahmen', () => {
  it('Titel- und Rahmen-IDs überschneiden sich nicht (cosmeticUnlocks speichert sie unter ihrer ID)', () => {
    const titles = new Set(TITLES.map((title) => title.id))
    expect(FRAMES.filter((frame) => titles.has(frame.id)).map((frame) => frame.id)).toEqual([])
  })
})

describe('Profil – Sprachform, Titel, Rahmen (Phase 3a)', () => {
  it('saveProfile speichert Sprachform, Titel und Rahmen', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧝', createdDay: START, form: 'female', titleId: TITLE, frameId: FRAME }, database)
    expect((await loadGameData(database)).profile).toStrictEqual({
      name: 'Aria',
      avatar: '🧝',
      createdDay: START,
      form: 'female',
      titleId: TITLE,
      frameId: FRAME,
    })
  })

  it('saveProfile ohne diese Felder behält die gespeicherten (Held bearbeiten: Name und Avatar)', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧝', createdDay: START, form: 'male', titleId: TITLE, frameId: FRAME }, database)
    await saveProfile({ name: '  Arion ', avatar: '🧙', createdDay: START }, database)
    expect((await loadGameData(database)).profile).toStrictEqual({
      name: 'Arion',
      avatar: '🧙',
      createdDay: START,
      form: 'male',
      titleId: TITLE,
      frameId: FRAME,
      // Umbenannt: Der bisherige Helden-Seed bleibt (Boss und Truhen der Woche würfeln nicht neu aus).
      heroSeed: `${START}Aria`,
    })
  })

  it('explizit undefined (bzw. leerer Titel/Rahmen) entfernt das Feld', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧝', createdDay: START, form: 'female', titleId: TITLE, frameId: FRAME }, database)
    await saveProfile({ name: 'Aria', avatar: '🧝', createdDay: START, form: undefined, titleId: '', frameId: undefined }, database)
    expect((await loadGameData(database)).profile).toStrictEqual({ name: 'Aria', avatar: '🧝', createdDay: START })
  })

  it('lehnt unbekannte Sprachform, Titel und Rahmen ab – nichts ändert sich', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧝', createdDay: START, form: 'neutral' }, database)
    const before = (await loadGameData(database)).profile
    const base = { name: 'Neu', avatar: '🧝', createdDay: START }
    await expect(saveProfile({ ...base, form: 'divers' as never }, database)).rejects.toThrow(MSG.form)
    await expect(saveProfile({ ...base, titleId: 'gibt-es-nicht' }, database)).rejects.toThrow(MSG.title)
    await expect(saveProfile({ ...base, frameId: 'gibt-es-nicht' }, database)).rejects.toThrow(MSG.frame)
    // Ein Titel ist kein Rahmen (und umgekehrt).
    await expect(saveProfile({ ...base, frameId: TITLE }, database)).rejects.toThrow(MSG.frame)
    await expect(saveProfile({ ...base, titleId: FRAME }, database)).rejects.toThrow(MSG.title)
    expect((await loadGameData(database)).profile).toStrictEqual(before)
  })

  it('gespeicherte, inzwischen unbekannte IDs (etwa aus einem Backup) blockieren das Speichern anderer Felder nicht', async () => {
    await database.kv.put({
      key: KV_KEYS.profile,
      value: { name: 'Aria', avatar: '🧝', createdDay: START, form: 'kaputt', titleId: 'alter-titel', frameId: '' },
    })
    await saveProfile({ name: 'Aria die Zweite', avatar: '🧝', createdDay: START }, database)
    expect((await loadGameData(database)).profile).toStrictEqual({
      name: 'Aria die Zweite',
      avatar: '🧝',
      createdDay: START,
      titleId: 'alter-titel',
      heroSeed: `${START}Aria`,
    })
  })

  it('updateProfile ändert nur die Felder im Patch', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧝', createdDay: START, form: 'female', frameId: FRAME }, database)
    await updateProfile({ titleId: TITLE }, database)
    expect((await loadGameData(database)).profile).toStrictEqual({
      name: 'Aria',
      avatar: '🧝',
      createdDay: START,
      form: 'female',
      titleId: TITLE,
      frameId: FRAME,
    })
    await updateProfile({ titleId: OTHER_TITLE, frameId: undefined, name: ' Aria ' }, database)
    expect((await loadGameData(database)).profile).toStrictEqual({
      name: 'Aria',
      avatar: '🧝',
      createdDay: START,
      form: 'female',
      titleId: OTHER_TITLE,
    })
    await expect(updateProfile({ titleId: 'gibt-es-nicht' }, database)).rejects.toThrow(MSG.title)
    await expect(updateProfile({ name: '  ' }, database)).rejects.toThrow('Bitte gib deinem Helden einen Namen.')
    await expect(updateProfile({ form: 'x' as never }, database)).rejects.toThrow(MSG.form)
  })

  it('updateProfile ohne Helden → Fehler, nichts wird angelegt', async () => {
    await expect(updateProfile({ titleId: TITLE }, database)).rejects.toThrow(MSG.noHero)
    expect((await loadGameData(database)).profile).toBeUndefined()
  })

  it('startAdventure übernimmt die Sprachform aus dem Onboarding', async () => {
    await startAdventure({ name: 'Mira', avatar: '🧝', createdDay: TODAY, form: 'female' }, null, TODAY, database)
    expect((await loadGameData(database)).profile).toStrictEqual({ name: 'Mira', avatar: '🧝', createdDay: TODAY, form: 'female' })
  })
})

describe('Einstellungen – Einführung „Neu: Klassen, Bosse & Beute“', () => {
  it('markCombatIntroSeen und updateSettings setzen combatIntroSeen', async () => {
    expect((await loadGameData(database)).settings.combatIntroSeen).toBeUndefined()
    await markCombatIntroSeen(database)
    expect((await loadGameData(database)).settings).toStrictEqual({ dayStartHour: 4, effects: true, combatIntroSeen: true })
    await updateSettings({ combatIntroSeen: false, effects: false }, database)
    expect((await loadGameData(database)).settings).toStrictEqual({ dayStartHour: 4, effects: false, combatIntroSeen: false })
  })

  it('ein ungültig gespeicherter Wert wird ignoriert', async () => {
    await database.kv.put({ key: KV_KEYS.settings, value: { combatIntroSeen: 'ja', hpIntroSeen: true } })
    expect((await loadGameData(database)).settings).toStrictEqual({ dayStartHour: 4, effects: true, hpIntroSeen: true })
  })
})

// ---------------------------------------------------------------------------

describe('recordProgress', () => {
  it('speichert Erfolge, Boss-Siege und Truhen; loadGameData liefert sie sortiert', async () => {
    await recordProgress(
      {
        achievementUnlocks: [{ id: 'streak-7', day: '2026-10-12' }],
        bossVictories: [makeBossVictory('2026-10-19', { day: '2026-10-20' }), makeBossVictory('2026-10-12', { day: '2026-10-16' })],
        chests: [
          makeChest('quest:h1:2026-10-20', { foundDay: '2026-10-20' }),
          makeChest('boss:2026-10-12', { foundDay: '2026-10-16', rarity: 'uncommon', content: { kind: 'gold', amount: 80 } }),
          makeChest('chapter:q:c', { foundDay: '2026-10-20', rarity: 'legendary', content: { kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: TITLE } }),
        ],
      },
      database,
    )
    const data = await loadGameData(database)
    expect(data.achievementUnlocks).toStrictEqual([{ id: 'streak-7', day: '2026-10-12' }])
    expect(data.bossVictories?.map((victory) => victory.weekStart)).toEqual(['2026-10-12', '2026-10-19'])
    expect(data.chests?.map((chest) => chest.id)).toEqual(['boss:2026-10-12', 'chapter:q:c', 'quest:h1:2026-10-20'])
    expect(data.cosmeticUnlocks).toBeUndefined()
  })

  it('ist idempotent und überschreibt nie Vorhandenes (Tag, Boss, Inhalt, Öffnungszustand)', async () => {
    await hero()
    const progress = {
      achievementUnlocks: [{ id: 'streak-7', day: '2026-10-12' }],
      bossVictories: [makeBossVictory('2026-10-12', { day: '2026-10-16', bossId: 'strength-1', maxHp: 90 })],
      chests: [makeChest('boss:2026-10-12', { foundDay: '2026-10-16' })],
    }
    await recordProgress(progress, database)
    await recordProgress(progress, database)
    await openChest('boss:2026-10-12', TODAY, database, NOW)
    const before = await loadGameData(database)

    await recordProgress(
      {
        achievementUnlocks: [{ id: 'streak-7', day: '2026-10-05' }],
        bossVictories: [makeBossVictory('2026-10-12', { day: '2026-10-13', bossId: 'other', maxHp: 999 })],
        chests: [makeChest('boss:2026-10-12', { foundDay: '2026-10-13', rarity: 'legendary', content: { kind: 'gold', amount: 150 } })],
      },
      database,
    )
    expect(await loadGameData(database)).toStrictEqual(before)
    expect(before.chests?.[0]).toStrictEqual({ ...progress.chests[0], openedAt: NOW })
  })

  it('doppelte Einträge in einem Aufruf: Erfolg und Sieg mit dem frühesten Tag, Truhe die erste', async () => {
    await recordProgress(
      {
        achievementUnlocks: [
          { id: 'a', day: '2026-10-14' },
          { id: 'a', day: '2026-10-12' },
        ],
        bossVictories: [makeBossVictory('2026-10-12', { day: '2026-10-15', bossId: 'late' }), makeBossVictory('2026-10-12', { day: '2026-10-13', bossId: 'early' })],
        chests: [makeChest('chapter:q:c', { content: { kind: 'gold', amount: 30 } }), makeChest('chapter:q:c', { content: { kind: 'gold', amount: 40 } })],
      },
      database,
    )
    const data = await loadGameData(database)
    expect(data.achievementUnlocks).toStrictEqual([{ id: 'a', day: '2026-10-12' }])
    expect(data.bossVictories).toStrictEqual([makeBossVictory('2026-10-12', { day: '2026-10-13', bossId: 'early' })])
    expect(data.chests).toStrictEqual([makeChest('chapter:q:c', { content: { kind: 'gold', amount: 30 } })])
  })

  it('neue Truhen sind immer ungeöffnet; unbekannte Felder fallen weg', async () => {
    await recordProgress(
      {
        bossVictories: [{ ...makeBossVictory('2026-10-12'), extra: 1 } as never],
        chests: [{ ...makeChest('quest:x', { openedAt: 123 }), content: { kind: 'gold', amount: 25, extra: true }, foo: 'bar' } as never],
      },
      database,
    )
    const data = await loadGameData(database)
    expect(data.bossVictories).toStrictEqual([makeBossVictory('2026-10-12')])
    expect(data.chests).toStrictEqual([makeChest('quest:x', { content: { kind: 'gold', amount: 25 } })])
  })

  it('höchstens eine Quest-Truhe pro Fundtag – gespeicherte eingerechnet; andere Fundorte sind frei', async () => {
    const day = '2026-10-20'
    await recordProgress({ chests: [makeChest('quest:a', { foundDay: day })] }, database)
    await recordProgress(
      {
        chests: [
          makeChest('quest:b', { foundDay: day }), // derselbe Tag – zu viel
          makeChest('quest:c', { foundDay: '2026-10-21' }),
          makeChest('quest:d', { foundDay: '2026-10-21' }), // zweite am selben Tag im selben Aufruf – zu viel
          makeChest('chapter:q:c', { foundDay: day }),
          makeChest('boss:2026-10-19', { foundDay: day }),
        ],
      },
      database,
    )
    expect((await loadGameData(database)).chests?.map((chest) => chest.id)).toEqual([
      'boss:2026-10-19',
      'chapter:q:c',
      'quest:a',
      'quest:c',
    ])
    expect(BALANCING.chests.maxQuestChestsPerDay).toBe(1)
  })

  it.each([
    ['Sieg nicht am Montag', { bossVictories: [makeBossVictory('2026-10-13')] }, MSG.victory],
    ['Sieg ohne Boss', { bossVictories: [makeBossVictory('2026-10-12', { bossId: '' })] }, MSG.victory],
    ['Sieg mit ungültigem Tag', { bossVictories: [makeBossVictory('2026-10-12', { day: '2026-13-01' })] }, MSG.victory],
    ['Sieg ohne Lebenspunkte', { bossVictories: [makeBossVictory('2026-10-12', { maxHp: 0 })] }, MSG.victory],
    ['Truhe ohne ID', { chests: [makeChest('', {})] }, MSG.chest],
    ['Truhe mit unbekannter Seltenheit', { chests: [makeChest('quest:x', { rarity: 'epic' as never })] }, MSG.chest],
    ['Truhe mit unbekanntem Fundort', { chests: [makeChest('quest:x', { source: 'shop' as never })] }, MSG.chest],
    ['Truhe mit ungültigem Fundtag', { chests: [makeChest('quest:x', { foundDay: 'gestern' })] }, MSG.chest],
    ['Truhe ohne Gold', { chests: [makeChest('quest:x', { content: { kind: 'gold', amount: 0 } })] }, MSG.chest],
    ['Truhe mit krummem Gold', { chests: [makeChest('quest:x', { content: { kind: 'gold', amount: 1.5 } })] }, MSG.chest],
    ['Truhe mit fremdem Gegenstand', { chests: [makeChest('quest:x', { content: { kind: 'item', itemId: 'healingPotion' as never } })] }, MSG.chest],
    [
      'Truhe mit Kosmetik ohne ID',
      { chests: [makeChest('quest:x', { content: { kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: '' } })] },
      MSG.chest,
    ],
    ['Truhe ohne Inhalt', { chests: [makeChest('quest:x', { content: undefined as never })] }, MSG.chest],
    ['Erfolg ohne ID', { achievementUnlocks: [{ id: '', day: TODAY }] }, MSG.achievement],
  ] satisfies [string, ProgressRecord, string][])('lehnt ab: %s – und speichert dann gar nichts', async (_label, broken: ProgressRecord, message) => {
    const valid = {
      achievementUnlocks: [{ id: 'quests-1', day: TODAY }],
      bossVictories: [makeBossVictory('2026-10-19')],
      chests: [makeChest('chapter:q:c')],
    }
    const progress = {
      achievementUnlocks: [...valid.achievementUnlocks, ...(broken.achievementUnlocks ?? [])],
      bossVictories: [...valid.bossVictories, ...(broken.bossVictories ?? [])],
      chests: [...valid.chests, ...(broken.chests ?? [])],
    }
    await expect(recordProgress(progress, database)).rejects.toThrow(message)
    const data = await loadGameData(database)
    expect([data.achievementUnlocks, data.bossVictories, data.chests]).toEqual([undefined, undefined, undefined])
  })

  it('leere Eingaben ändern nichts', async () => {
    await recordProgress({}, database)
    await recordProgress({ achievementUnlocks: [], bossVictories: [], chests: [] }, database)
    await recordAchievementUnlocks([], database)
    const data = await loadGameData(database)
    expect([data.achievementUnlocks, data.bossVictories, data.chests]).toEqual([undefined, undefined, undefined])
  })

  it('recordAchievementUnlocks bleibt als Wrapper nutzbar (gleiche Regeln)', async () => {
    await recordAchievementUnlocks([{ id: 'quests-1', day: '2026-10-12' }], database)
    await recordAchievementUnlocks([{ id: 'quests-1', day: '2026-10-05' }], database)
    expect((await loadGameData(database)).achievementUnlocks).toStrictEqual([{ id: 'quests-1', day: '2026-10-12' }])
    await expect(recordAchievementUnlocks([{ id: 'x', day: 'morgen' }], database)).rejects.toThrow('Ungültiges Datum eines Erfolgs')
  })

  it('gleichzeitige Meldungen (zwei Tabs) speichern alles genau einmal', async () => {
    const progress = {
      bossVictories: [makeBossVictory('2026-10-19', { day: TODAY })],
      chests: [makeChest('boss:2026-10-19', { foundDay: TODAY }), makeChest('quest:h:2026-10-21', { foundDay: TODAY })],
    }
    await Promise.all([recordProgress(progress, database), recordProgress(progress, database), recordProgress(progress, database)])
    const data = await loadGameData(database)
    expect(data.bossVictories).toHaveLength(1)
    expect(data.chests).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------

describe('openChest', () => {
  beforeEach(hero)

  it('Gold: setzt nur openedAt – das Gold zählt erst ab dem Öffnen', async () => {
    const chest = makeChest('quest:h:2026-10-20', { foundDay: '2026-10-20', content: { kind: 'gold', amount: 42 } })
    await recordProgress({ chests: [chest] }, database)
    const before = await stateOn()
    expect(before.gold.fromChests).toBe(0)
    expect(before.inventory.unopenedChests).toBe(1)

    expect(await openChest(chest.id, TODAY, database, NOW)).toStrictEqual({ kind: 'gold', amount: 42 })
    expect(await database.chests.get(chest.id)).toStrictEqual({ ...chest, openedAt: NOW })
    const after = await stateOn()
    expect(after.gold.fromChests).toBe(42)
    expect(after.gold.balance).toBe(before.gold.balance + 42)
    expect(after.inventory.unopenedChests).toBe(0)
    expect(await database.cosmeticUnlocks.count()).toBe(0)
  })

  it('schon geöffnet oder unbekannt → Fehler, nichts ändert sich', async () => {
    await recordProgress({ chests: [makeChest('chapter:q:c')] }, database)
    await openChest('chapter:q:c', TODAY, database, NOW)
    await expect(openChest('chapter:q:c', TODAY, database, NOW + 1)).rejects.toThrow(MSG.chestOpened)
    expect((await database.chests.get('chapter:q:c'))?.openedAt).toBe(NOW)
    await expect(openChest('quest:gibt-es-nicht', TODAY, database, NOW)).rejects.toThrow(MSG.chestNotFound)
    await expect(openChest('', TODAY, database, NOW)).rejects.toThrow(MSG.chestNotFound)
    await expect(openChest('chapter:q:c', 'heute', database, NOW)).rejects.toThrow('Ungültiges Datum')
  })

  it('gleichzeitiges Öffnen derselben Truhe gelingt genau einmal', async () => {
    await recordProgress({ chests: [makeChest('chapter:q:c', { content: { kind: 'gold', amount: 50 } })] }, database)
    const results = await Promise.allSettled([openChest('chapter:q:c', TODAY, database, NOW), openChest('chapter:q:c', TODAY, database, NOW)])
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((await stateOn()).gold.fromChests).toBe(50)
  })

  it('Streak-Schutz: kommt in den Vorrat, solange Platz ist', async () => {
    await stockFreezes(FREEZE_MAX - 1)
    await recordProgress({ chests: [freezeChest('quest:frost')] }, database)
    expect(await openChest('quest:frost', TODAY, database, NOW)).toStrictEqual({ kind: 'item', itemId: 'streakFreeze' })
    expect((await database.chests.get('quest:frost'))?.content).toStrictEqual({ kind: 'item', itemId: 'streakFreeze' })
    const state = await stateOn()
    expect(state.inventory.streakFreezes).toBe(FREEZE_MAX)
    expect(state.gold.fromChests).toBe(0)
  })

  it('Streak-Schutz bei vollem Vorrat: stattdessen Ersatz-Gold – so gespeichert', async () => {
    await stockFreezes(FREEZE_MAX)
    await recordProgress({ chests: [freezeChest('quest:frost')] }, database)
    expect(await openChest('quest:frost', TODAY, database, NOW)).toStrictEqual({ kind: 'gold', amount: FALLBACK_GOLD })
    expect(await database.chests.get('quest:frost')).toStrictEqual({
      ...freezeChest('quest:frost'),
      content: { kind: 'gold', amount: FALLBACK_GOLD },
      openedAt: NOW,
    })
    const state = await stateOn()
    expect(state.inventory.streakFreezes).toBe(FREEZE_MAX)
    expect(state.gold.fromChests).toBe(FALLBACK_GOLD)
  })

  it('zwei Streak-Schutz-Truhen auf einmal bei einem freien Platz: eine füllt den Vorrat, die andere wird Gold', async () => {
    await stockFreezes(FREEZE_MAX - 1)
    await recordProgress({ chests: [freezeChest('quest:a'), freezeChest('chapter:q:b')] }, database)
    const contents = await Promise.all([
      openChest('quest:a', TODAY, database, NOW),
      openChest('chapter:q:b', TODAY, database, NOW),
    ])
    expect(contents).toContainEqual({ kind: 'item', itemId: 'streakFreeze' })
    expect(contents).toContainEqual({ kind: 'gold', amount: FALLBACK_GOLD })
    const state = await stateOn()
    expect(state.inventory.streakFreezes).toBe(FREEZE_MAX)
    expect(state.gold.fromChests).toBe(FALLBACK_GOLD)
  })

  it('Titel/Rahmen: zusätzlich ein CosmeticUnlock – ein vorhandener bleibt unverändert', async () => {
    await recordProgress(
      {
        chests: [
          makeChest('chapter:q:a', { rarity: 'legendary', content: { kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: TITLE } }),
          makeChest('chapter:q:b', { rarity: 'rare', content: { kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: FRAME } }),
        ],
      },
      database,
    )
    await database.cosmeticUnlocks.add(makeCosmeticUnlock(FRAME, 'frame', '2026-10-01'))
    expect(await openChest('chapter:q:a', TODAY, database, NOW)).toStrictEqual({
      kind: 'cosmetic',
      cosmeticKind: 'title',
      cosmeticId: TITLE,
    })
    await openChest('chapter:q:b', TODAY, database, NOW)
    const data = await loadGameData(database)
    expect(data.cosmeticUnlocks).toStrictEqual([
      makeCosmeticUnlock(FRAME, 'frame', '2026-10-01'),
      { id: TITLE, kind: 'title', day: TODAY, source: 'chest' },
    ])
    const { cosmetics } = deriveGameState(data, TODAY)
    expect(cosmetics.titles).toContain(TITLE)
    expect(cosmetics.frames).toContain(FRAME)
  })

  it('eine gerade gefundene, noch nicht gespeicherte Truhe lässt sich öffnen – sie wird dabei gespeichert', async () => {
    // Ein gespeicherter Sieg ohne gespeicherte Truhe: Die Engine zeigt die Boss-Truhe, der Recorder kam noch nicht dazu.
    await recordProgress({ bossVictories: [makeBossVictory('2026-10-19', { day: '2026-10-20' })] }, database)
    const found = (await stateOn()).chests.find((chest) => chest.id === 'boss:2026-10-19')
    expect(found).toBeDefined()
    expect(await database.chests.count()).toBe(0)

    const content = await openChest('boss:2026-10-19', TODAY, database, NOW)
    expect(content).toStrictEqual(found?.content)
    expect(await database.chests.get('boss:2026-10-19')).toStrictEqual({ ...found, openedAt: NOW })
    await expect(openChest('boss:2026-10-19', TODAY, database, NOW)).rejects.toThrow(MSG.chestOpened)
  })
})

describe('resetAllData – Phase 3a', () => {
  it('leert Boss-Siege, Truhen und Freischaltungen', async () => {
    await hero()
    await recordProgress({ bossVictories: [makeBossVictory('2026-10-19')], chests: [makeChest('chapter:q:c')] }, database)
    await database.cosmeticUnlocks.add(makeCosmeticUnlock(TITLE))
    await markCombatIntroSeen(database)
    await resetAllData(database)
    for (const table of [database.bossVictories, database.chests, database.cosmeticUnlocks, database.kv]) {
      expect(await table.count()).toBe(0)
    }
  })
})
