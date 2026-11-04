import { describe, expect, it } from 'vitest'
import { makeAchievement, makeAchievementStats } from '../testing'
import type { AchievementDefinition, AchievementStats } from '../types'
import { achievementGold, COMEBACK_GAP_DAYS, countComebacks, evaluateAchievements } from './evaluate'

const TODAY = '2026-11-04'

const streak7 = makeAchievement('streak-7', (s) => s.bestDayStreak, 7, { goldReward: 25 })
const quests100 = makeAchievement('quests-100', (s) => s.questsCompleted, 100, { goldReward: 75, tier: 'silver' })
const campaigns3 = makeAchievement('active-campaigns-3', (s) => s.activeCampaigns, 3, { goldReward: 200, tier: 'gold' })
const definitions = [streak7, quests100, campaigns3]

function evaluate(stats: Partial<AchievementStats>, unlocks: { id: string; day: string }[] = []) {
  return evaluateAchievements(definitions, makeAchievementStats(stats), unlocks, TODAY)
}

describe('evaluateAchievements', () => {
  it('liefert alle Erfolge in Definitions-Reihenfolge mit Fortschritt', () => {
    const states = evaluate({ bestDayStreak: 3, questsCompleted: 150 })
    expect(states.map((s) => s.definition)).toEqual(definitions)
    expect(states[0]).toEqual({ definition: streak7, unlocked: false, current: 3, target: 7, progress: 3 / 7 })
    // Erreicht → freigeschaltet, heute (noch nicht gespeichert); progress höchstens 1
    expect(states[1]).toEqual({ definition: quests100, unlocked: true, unlockedDay: TODAY, current: 150, target: 100, progress: 1 })
    expect(states[2]).toMatchObject({ unlocked: false, current: 0, progress: 0 })
    expect(states[0]).not.toHaveProperty('unlockedDay')
  })

  it('genau das Ziel schaltet frei', () => {
    expect(evaluate({ bestDayStreak: 7 })[0]).toMatchObject({ unlocked: true, unlockedDay: TODAY, progress: 1 })
    expect(evaluate({ bestDayStreak: 6 })[0]).toMatchObject({ unlocked: false })
  })

  it('einmal freigeschaltet bleibt freigeschaltet, auch wenn der Wert später sinkt (gespeicherter Tag bleibt)', () => {
    // Drei Kampagnen gleichzeitig – inzwischen nur noch eine aktiv
    const [, , achievement] = evaluate({ activeCampaigns: 1 }, [{ id: 'active-campaigns-3', day: '2026-10-01' }])
    expect(achievement).toMatchObject({ unlocked: true, unlockedDay: '2026-10-01', current: 1, target: 3 })
    expect(achievement.progress).toBeCloseTo(1 / 3, 10)
  })

  it('ein gespeicherter Tag gewinnt auch, wenn das Ziel heute erreicht ist', () => {
    expect(evaluate({ bestDayStreak: 9 }, [{ id: 'streak-7', day: '2026-09-15' }])[0].unlockedDay).toBe('2026-09-15')
  })

  it('doppelte Einträge derselben ID: der früheste Tag zählt; unbekannte IDs werden ignoriert', () => {
    const states = evaluate({}, [
      { id: 'streak-7', day: '2026-10-05' },
      { id: 'gibt-es-nicht', day: '2026-01-01' },
      { id: 'streak-7', day: '2026-10-02' },
    ])
    expect(states.map((s) => [s.definition.id, s.unlocked, s.unlockedDay])).toEqual([
      ['streak-7', true, '2026-10-02'],
      ['quests-100', false, undefined],
      ['active-campaigns-3', false, undefined],
    ])
  })

  it('kaputte Werte (NaN, ∞) schalten nichts frei und vergiften die Anzeige nicht', () => {
    const broken: AchievementDefinition[] = [
      makeAchievement('nan', () => Number.NaN, 5),
      makeAchievement('nan-target', () => 3, Number.NaN),
      makeAchievement('zero-target', () => 0, 0),
    ]
    const states = evaluateAchievements(broken, makeAchievementStats(), [], TODAY)
    expect(states.map((s) => [s.unlocked, s.current, s.progress])).toEqual([
      [false, 0, 0],
      [false, 3, 0],
      [true, 0, 1],
    ])
  })

  it('ohne Definitionen: leere Liste', () => {
    expect(evaluateAchievements([], makeAchievementStats(), [{ id: 'streak-7', day: TODAY }], TODAY)).toEqual([])
  })
})

describe('achievementGold', () => {
  it('summiert die Gold-Belohnung aller freigeschalteten Erfolge', () => {
    expect(achievementGold(evaluate({}))).toBe(0)
    expect(achievementGold(evaluate({ bestDayStreak: 7, questsCompleted: 100 }))).toBe(25 + 75)
    expect(achievementGold(evaluate({ bestDayStreak: 7 }, [{ id: 'active-campaigns-3', day: '2026-10-01' }]))).toBe(25 + 200)
  })

  it('ungültige oder negative Belohnungen zählen 0', () => {
    const odd = [
      makeAchievement('neg', () => 1, 1, { goldReward: -50 }),
      makeAchievement('nan', () => 1, 1, { goldReward: Number.NaN }),
      makeAchievement('ok', () => 1, 1, { goldReward: 10 }),
    ]
    expect(achievementGold(evaluateAchievements(odd, makeAchievementStats(), [], TODAY))).toBe(10)
  })
})

describe('countComebacks', () => {
  it('zählt Rückkehren nach mindestens 7 Tagen ohne erledigte Quest', () => {
    expect(COMEBACK_GAP_DAYS).toBe(7)
    // 1. → 9.: 2.–8. = 7 Tage Pause → Rückkehr. 9. → 16.: nur 6 Tage Pause → keine.
    expect(countComebacks(['2026-11-01', '2026-11-09'])).toBe(1)
    expect(countComebacks(['2026-11-01', '2026-11-08'])).toBe(0)
    expect(countComebacks(['2026-11-01', '2026-11-09', '2026-11-16', '2026-12-01'])).toBe(2)
  })

  it('beginnt mit dem ersten aktiven Tag: die Zeit davor ist keine Pause', () => {
    expect(countComebacks([])).toBe(0)
    expect(countComebacks(['2026-11-20'])).toBe(0)
  })

  it('unabhängig von Reihenfolge und Doppelten; ungültige Tage zählen nicht', () => {
    expect(countComebacks(['2026-12-01', '2026-11-01', '2026-11-01', 'kaputt', '2026-11-20'])).toBe(2)
  })
})
