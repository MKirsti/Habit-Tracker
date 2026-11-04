// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as repository from '../data/repository'
import {
  createHabit,
  loadGameData,
  recordAchievementUnlocks,
  resetAllData,
  saveProfile,
  setCompletionValue,
  updateSettings,
} from '../data/repository'
import type { DayKey } from '../domain/types'
import { AchievementRecorder } from './AchievementRecorder'
import { GameProvider } from './GameProvider'

// recordAchievementUnlocks beobachten (und gezielt scheitern lassen); sonst die echte Implementierung.
const control = vi.hoisted(() => ({ calls: [] as unknown[][], failNext: false }))
vi.mock('../data/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/repository')>()
  return {
    ...actual,
    recordAchievementUnlocks: async (...args: Parameters<typeof actual.recordAchievementUnlocks>) => {
      control.calls.push(args)
      if (control.failNext) {
        control.failNext = false
        throw new Error('Die Datenbank ist gerade nicht erreichbar.')
      }
      return actual.recordAchievementUnlocks(...args)
    },
  }
})

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'
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

function renderRecorder() {
  return render(
    <GameProvider>
      <AchievementRecorder delayMs={DELAY} />
    </GameProvider>,
  )
}

/** Wartet etwas länger als die Bündelungs-Verzögerung – danach darf nichts mehr geschrieben werden. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, DELAY * 6))
}

function recordedIds(): string[] {
  return control.calls.flatMap((args) => (args[0] as { id: string }[]).map((unlock) => unlock.id))
}

describe('AchievementRecorder', () => {
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
    // Keine Doppelten in einem Schreibvorgang.
    expect(new Set(recordedIds()).size).toBe(recordedIds().length)

    // Andere Änderungen (ohne neuen Erfolg) lösen keinen weiteren Schreibvorgang aus.
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

    // Neuer Erfolg: erste Nebenquest.
    const side = await repository.createSideQuest(
      { title: 'Steuer', icon: '🧾', attribute: 'discipline', difficulty: 'hard' },
      TODAY,
    )
    await repository.completeSideQuest(side.id, TODAY)
    await waitFor(() => expect(control.calls).toHaveLength(2))
    expect(control.calls[1][0]).toEqual([{ id: 'side-quests-1', day: TODAY }])
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
