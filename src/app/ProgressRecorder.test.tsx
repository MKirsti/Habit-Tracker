// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as repository from '../data/repository'
import type { ProgressRecord } from '../data/repository'
import {
  createHabit,
  loadGameData,
  recordAchievementUnlocks,
  recordProgress,
  resetAllData,
  saveProfile,
  setCompletionValue,
  updateSettings,
} from '../data/repository'
import { deriveGameState } from '../domain/engine'
import { makeChest, makeGameData } from '../domain/testing'
import type { DayKey } from '../domain/types'
import { GameProvider } from './GameProvider'
import { pendingProgress } from './pendingProgress'
import { ProgressRecorder } from './ProgressRecorder'

// recordProgress beobachten (und gezielt scheitern lassen); sonst die echte Implementierung.
const control = vi.hoisted(() => ({ calls: [] as unknown[][], failNext: false }))
vi.mock('../data/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/repository')>()
  return {
    ...actual,
    recordProgress: async (...args: Parameters<typeof actual.recordProgress>) => {
      control.calls.push(args)
      if (control.failNext) {
        control.failNext = false
        throw new Error('Die Datenbank ist gerade nicht erreichbar.')
      }
      return actual.recordProgress(...args)
    },
  }
})

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03; die Woche beginnt am 2. November. */
const TODAY: DayKey = '2026-11-03'
const WEEK: DayKey = '2026-11-02'
const DELAY = 20

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  await resetAllData()
  control.calls = []
  control.failNext = false
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Eine tägliche Quest, heute erledigt → erster Perfekter Tag („Makellos“). */
async function reachFirstPerfectDay() {
  const habit = await createHabit(
    { title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'medium', schedule: { type: 'daily' } },
    TODAY,
  )
  await setCompletionValue(habit.id, TODAY, 1)
  return habit
}

/**
 * Wochen-Boss besiegen: eine leichte tägliche Quest ab heute (geplant 6 × 10 → Boss mit 60 LP, Schwäche Intelligenz),
 * heute erledigt (15 Schaden) plus eine epische Nebenquest (120 Schaden).
 */
async function defeatWeeklyBoss() {
  const habit = await createHabit(
    { title: 'Vokabeln', icon: '🗂️', attribute: 'intellect', difficulty: 'easy', schedule: { type: 'daily' } },
    TODAY,
  )
  await setCompletionValue(habit.id, TODAY, 1)
  const side = await repository.createSideQuest(
    { title: 'Prüfung', icon: '🎓', attribute: 'intellect', difficulty: 'epic' },
    TODAY,
  )
  await repository.completeSideQuest(side.id, TODAY)
}

function renderRecorder() {
  return render(
    <GameProvider>
      <ProgressRecorder delayMs={DELAY} />
    </GameProvider>,
  )
}

/** Wartet etwas länger als die Bündelungs-Verzögerung – danach darf nichts mehr geschrieben werden. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, DELAY * 6))
}

function records(): ProgressRecord[] {
  return control.calls.map((args) => args[0] as ProgressRecord)
}
function recordedIds(): string[] {
  return records().flatMap((record) => (record.achievementUnlocks ?? []).map((unlock) => unlock.id))
}

describe('ProgressRecorder – Erfolge', () => {
  it('speichert neu erreichte Erfolge genau einmal mit dem heutigen Tag', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    await reachFirstPerfectDay()
    renderRecorder()

    await waitFor(async () => {
      const unlocks = (await loadGameData()).achievementUnlocks ?? []
      expect(unlocks).toContainEqual({ id: 'perfect-days-1', day: TODAY })
    })
    await settle()
    expect(control.calls).toHaveLength(1)
    expect(recordedIds()).toContain('perfect-days-1')
    // Keine Doppelten in einem Schreibvorgang, keine leeren Listen.
    expect(new Set(recordedIds()).size).toBe(recordedIds().length)
    expect(records()[0].bossVictories).toBeUndefined()

    // Andere Änderungen (ohne neuen Fortschritt) lösen keinen weiteren Schreibvorgang aus.
    await updateSettings({ effects: false })
    await settle()
    expect(control.calls).toHaveLength(1)
  })

  it('überschreibt keinen gespeicherten Erfolg und schreibt nichts, wenn alles gespeichert ist', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
    await reachFirstPerfectDay()
    await recordAchievementUnlocks([{ id: 'perfect-days-1', day: '2026-10-05' }])
    control.calls = []
    renderRecorder()

    await settle()
    expect(recordedIds()).not.toContain('perfect-days-1')
    const unlocks = (await loadGameData()).achievementUnlocks ?? []
    expect(unlocks).toContainEqual({ id: 'perfect-days-1', day: '2026-10-05' })
  })

  it('bündelt mehrere neue Erfolge und speichert später erreichte nachträglich', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    renderRecorder()
    await settle()
    expect(control.calls).toHaveLength(0)

    await reachFirstPerfectDay()
    await waitFor(() => expect(recordedIds()).toContain('perfect-days-1'))
    await settle()
    expect(control.calls).toHaveLength(1)

    // Neuer Erfolg: erste Nebenquest (eine leichte – sie besiegt den Wochen-Boss nicht).
    const side = await repository.createSideQuest(
      { title: 'Steuer', icon: '🧾', attribute: 'discipline', difficulty: 'easy' },
      TODAY,
    )
    await repository.completeSideQuest(side.id, TODAY)
    await waitFor(() => expect(control.calls).toHaveLength(2))
    expect(records()[1].achievementUnlocks).toEqual([{ id: 'side-quests-1', day: TODAY }])
    await settle()
    expect(control.calls).toHaveLength(2)
  })

  it('versucht einen gescheiterten Schreibvorgang nicht in einer Schleife erneut', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    await reachFirstPerfectDay()
    control.failNext = true
    renderRecorder()

    await waitFor(() => expect(control.calls).toHaveLength(1))
    await settle()
    await updateSettings({ effects: false })
    await settle()
    expect(control.calls).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
    expect((await loadGameData()).achievementUnlocks).toBeUndefined()
  })

  it('schreibt ohne Helden nichts (Onboarding, nach dem Zurücksetzen)', async () => {
    await reachFirstPerfectDay()
    renderRecorder()
    await settle()
    expect(control.calls).toHaveLength(0)
  })
})

describe('ProgressRecorder – Boss-Siege und Truhen', () => {
  it('speichert einen neuen Boss-Sieg samt Boss-Truhe in einem Schreibvorgang – und danach nichts mehr', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    await defeatWeeklyBoss()
    const before = deriveGameState(await loadGameData(), TODAY)
    expect(before.bosses.current?.defeated).toBe(true)
    renderRecorder()

    await waitFor(async () => expect((await loadGameData()).bossVictories).toHaveLength(1))
    const data = await loadGameData()
    expect(data.bossVictories?.[0]).toEqual({
      weekStart: WEEK,
      bossId: before.bosses.current?.boss.id,
      day: TODAY,
      maxHp: before.bosses.current?.maxHp,
    })
    // Die Boss-Truhe ist mit ihrem beim Fund festgelegten Inhalt gespeichert – ungeöffnet.
    const bossChest = before.chests.find((chest) => chest.id === `boss:${WEEK}`)
    expect(bossChest).toBeDefined()
    expect(data.chests).toContainEqual(expect.objectContaining({ id: `boss:${WEEK}`, content: bossChest?.content }))
    expect(data.chests?.every((chest) => chest.openedAt === undefined)).toBe(true)

    await settle()
    expect(control.calls).toHaveLength(1)
    expect(records()[0].bossVictories).toHaveLength(1)
    expect(records()[0].chests?.map((chest) => chest.id)).toContain(`boss:${WEEK}`)

    // Gespeichert bleibt gespeichert: Wird die Nebenquest wieder geöffnet, bleibt der Sieg – ohne neuen Schreibvorgang.
    const side = data.sideQuests?.[0]
    if (side) await repository.reopenSideQuest(side.id)
    await settle()
    expect(control.calls).toHaveLength(1)
    const after = deriveGameState(await loadGameData(), TODAY)
    expect(after.bosses.current?.defeated).toBe(true)
    expect(after.chests.map((chest) => chest.id)).toContain(`boss:${WEEK}`)
  })

  it('schreibt einen vorhandenen Sieg und eine vorhandene Truhe nicht erneut', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    await defeatWeeklyBoss()
    const state = deriveGameState(await loadGameData(), TODAY)
    await recordProgress({
      achievementUnlocks: state.achievements
        .filter((achievement) => achievement.unlocked)
        .map((achievement) => ({ id: achievement.definition.id, day: TODAY })),
      bossVictories: [
        { weekStart: WEEK, bossId: state.bosses.current?.boss.id ?? '', day: TODAY, maxHp: state.bosses.current?.maxHp ?? 1 },
      ],
      chests: state.chests,
    })
    control.calls = []
    renderRecorder()

    await settle()
    expect(control.calls).toHaveLength(0)
  })
})

describe('pendingProgress', () => {
  it('meldet ungespeicherte Erfolge, Siege und Truhen – gespeicherte nicht', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    await defeatWeeklyBoss()
    const data = await loadGameData()
    const state = deriveGameState(data, TODAY)

    const pending = pendingProgress(data, state, TODAY)
    expect(pending.bossVictories.map((victory) => victory.weekStart)).toEqual([WEEK])
    expect(pending.chests.map((chest) => chest.id)).toContain(`boss:${WEEK}`)
    expect(pending.achievementUnlocks.length).toBeGreaterThan(0)

    const stored = makeChest(`boss:${WEEK}`)
    const withStored = { ...data, chests: [stored] }
    expect(pendingProgress(withStored, state, TODAY).chests.map((chest) => chest.id)).not.toContain(`boss:${WEEK}`)
  })

  it('ohne Held: nichts', () => {
    const data = makeGameData()
    const state = deriveGameState(data, TODAY)
    expect(pendingProgress(data, { ...state, chests: [makeChest('quest:x')] }, TODAY)).toEqual({
      achievementUnlocks: [],
      bossVictories: [],
      chests: [],
    })
  })
})
