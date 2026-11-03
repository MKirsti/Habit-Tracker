import { describe, expect, it } from 'vitest'
import { evaluateChapter } from './chapters'
import type { ChapterContext } from './chapters'
import { completeRange, makeChapter, makeCompletion, makeHabit, makeMainQuest } from './testing'
import type { Completion, DayKey, Habit } from './types'

const reading = makeHabit({
  id: 'read',
  title: '10 Seiten lesen',
  createdDay: '2026-10-01',
  measure: { target: 10, unit: 'Seiten' },
})
const quest = makeMainQuest({ id: 'mq', startDay: '2026-11-01' })

function context(habits: Habit[], completions: Completion[], today: DayKey): ChapterContext {
  const completionsByHabit = new Map<string, Completion[]>()
  for (const c of completions) completionsByHabit.set(c.habitId, [...(completionsByHabit.get(c.habitId) ?? []), c])
  return { habitsById: new Map(habits.map((h) => [h.id, h])), completionsByHabit, today }
}

const emptyCtx = context([], [], '2026-11-20')

describe('evaluateChapter – manual', () => {
  it('ist 0/1, solange nicht abgehakt', () => {
    const chapter = makeChapter({ id: 'c', criterion: { type: 'manual' } })
    expect(evaluateChapter(chapter, quest, emptyCtx)).toEqual({
      chapter,
      current: 0,
      target: 1,
      progress: 0,
      done: false,
    })
  })

  it('übernimmt completedDay als doneDay, wenn abgehakt', () => {
    const chapter = makeChapter({
      id: 'c',
      criterion: { type: 'manual' },
      manualDone: true,
      completedDay: '2026-11-07',
    })
    expect(evaluateChapter(chapter, quest, emptyCtx)).toEqual({
      chapter,
      current: 1,
      target: 1,
      progress: 1,
      done: true,
      doneDay: '2026-11-07',
    })
  })

  it('liefert keinen doneDay für ein nicht (mehr) abgehaktes Kapitel', () => {
    const chapter = makeChapter({
      id: 'c',
      criterion: { type: 'manual' },
      manualDone: false,
      completedDay: '2026-11-07',
    })
    expect(evaluateChapter(chapter, quest, emptyCtx).doneDay).toBeUndefined()
  })
})

describe('evaluateChapter – counter', () => {
  it('zeigt den Zählerstand gegen das Ziel', () => {
    const chapter = makeChapter({
      id: 'c',
      criterion: { type: 'counter', target: 12, label: 'Bücher beendet' },
      counter: 3,
    })
    expect(evaluateChapter(chapter, quest, emptyCtx)).toMatchObject({
      current: 3,
      target: 12,
      progress: 0.25,
      done: false,
    })
  })

  it('startet ohne Zähler bei 0 und begrenzt negative Werte auf 0', () => {
    const criterion = { type: 'counter', target: 5, label: 'Bücher' } as const
    expect(evaluateChapter(makeChapter({ id: 'c', criterion }), quest, emptyCtx).current).toBe(0)
    expect(evaluateChapter(makeChapter({ id: 'c', criterion, counter: -2 }), quest, emptyCtx)).toMatchObject({
      current: 0,
      progress: 0,
    })
  })

  it('ist erledigt ab Erreichen des Ziels; progress bleibt ≤ 1', () => {
    const chapter = makeChapter({
      id: 'c',
      criterion: { type: 'counter', target: 12, label: 'Bücher beendet' },
      counter: 13,
      completedDay: '2026-11-15',
    })
    expect(evaluateChapter(chapter, quest, emptyCtx)).toMatchObject({
      current: 13,
      progress: 1,
      done: true,
      doneDay: '2026-11-15',
    })
  })
})

describe('evaluateChapter – habit', () => {
  // Vor dem Kampagnenstart (zählt nicht), Teilfortschritt am 03.11., Zukunft nach today (zählt nicht)
  const completions = [
    makeCompletion(reading, '2026-10-30'),
    makeCompletion(reading, '2026-10-31'),
    makeCompletion(reading, '2026-11-01', { value: 12 }),
    makeCompletion(reading, '2026-11-02'),
    makeCompletion(reading, '2026-11-03', { value: 4 }),
    makeCompletion(reading, '2026-11-04'),
    makeCompletion(reading, '2026-11-05', { value: 15 }),
    makeCompletion(reading, '2026-11-25'),
  ]
  const ctx = context([reading], completions, '2026-11-20')

  function habitChapter(metric: 'completions' | 'total' | 'streak', target: number) {
    return makeChapter({ id: `c-${metric}`, criterion: { type: 'habit', habitId: reading.id, metric, target } })
  }

  it('completions: zählt erledigte Tage im Zeitraum [startDay, today]', () => {
    const chapter = habitChapter('completions', 4)
    expect(evaluateChapter(chapter, quest, ctx)).toEqual({
      chapter,
      current: 4,
      target: 4,
      progress: 1,
      done: true,
      doneDay: '2026-11-05',
    })
    expect(evaluateChapter(habitChapter('completions', 3), quest, ctx).doneDay).toBe('2026-11-04')
    expect(evaluateChapter(habitChapter('completions', 30), quest, ctx)).toMatchObject({
      current: 4,
      progress: 4 / 30,
      done: false,
    })
  })

  it('total: summiert alle Werte inklusive Teilfortschritt', () => {
    // 12 + 10 + 4 + 10 + 15 = 51
    expect(evaluateChapter(habitChapter('total', 100), quest, ctx)).toMatchObject({
      current: 51,
      target: 100,
      progress: 0.51,
      done: false,
    })
    expect(evaluateChapter(habitChapter('total', 26), quest, ctx)).toMatchObject({
      done: true,
      doneDay: '2026-11-03', // 12 + 10 + 4 = 26
    })
  })

  it('streak: bester Streak seit Kampagnenstart (Teilfortschritt bricht die Serie)', () => {
    // 01., 02. erledigt · 03. nur Teilfortschritt · 04., 05. erledigt → bester Streak 2
    expect(evaluateChapter(habitChapter('streak', 7), quest, ctx)).toMatchObject({
      current: 2,
      target: 7,
      done: false,
    })
    expect(evaluateChapter(habitChapter('streak', 2), quest, ctx)).toMatchObject({
      current: 2,
      done: true,
      doneDay: '2026-11-02',
    })
  })

  it('streak: Serien vor dem Kampagnenstart zählen nicht', () => {
    const before = completeRange(reading, '2026-10-01', '2026-10-31')
    const after = completeRange(reading, '2026-11-01', '2026-11-03')
    const streakCtx = context([reading], [...before, ...after], '2026-11-03')
    expect(evaluateChapter(habitChapter('streak', 30), quest, streakCtx)).toMatchObject({
      current: 3,
      done: false,
    })
  })

  it('streak: ein offener heutiger Tag bricht die Serie nicht', () => {
    const streakCtx = context([reading], completeRange(reading, '2026-11-01', '2026-11-07'), '2026-11-08')
    expect(evaluateChapter(habitChapter('streak', 7), quest, streakCtx)).toMatchObject({
      current: 7,
      done: true,
      doneDay: '2026-11-07',
    })
  })

  it('total: Gleitkomma-Rauschen verhindert den Abschluss nicht (10 × 0,1 L = 1 L)', () => {
    const water = makeHabit({ id: 'water', createdDay: '2026-11-01', measure: { target: 0.1, unit: 'L' } })
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']
    const sips = [...days, '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']
    const waterCtx = context([water], sips.map((day) => makeCompletion(water, day)), '2026-11-20')
    const chapter = makeChapter({ id: 'w', criterion: { type: 'habit', habitId: water.id, metric: 'total', target: 1 } })
    const state = evaluateChapter(chapter, quest, waterCtx)
    expect(state.current).toBeCloseTo(1, 10)
    // Abschluss, voller Balken und Abschlusstag müssen zusammenpassen
    expect(state).toMatchObject({ done: true, progress: 1, doneDay: '2026-11-10' })
  })

  it('counter: ein abgeschlossenes Kapitel hat immer progress 1 und done', () => {
    const chapter = makeChapter({
      id: 'c',
      criterion: { type: 'counter', target: 0.8, label: 'Liter' },
      counter: 0.7 + 0.1, // 0.7999999999999999
    })
    expect(evaluateChapter(chapter, quest, emptyCtx)).toMatchObject({ done: true, progress: 1 })
  })

  it('ermittelt doneDay auch bei unsortierter Eingabe korrekt', () => {
    const shuffled = [...completions].reverse()
    const shuffledCtx = context([reading], shuffled, '2026-11-20')
    expect(evaluateChapter(habitChapter('completions', 3), quest, shuffledCtx).doneDay).toBe('2026-11-04')
    expect(evaluateChapter(habitChapter('total', 26), quest, shuffledCtx).doneDay).toBe('2026-11-03')
  })

  it('ohne Completions ist das Kapitel bei 0', () => {
    const chapter = habitChapter('completions', 5)
    expect(evaluateChapter(chapter, quest, context([reading], [], '2026-11-20'))).toEqual({
      chapter,
      current: 0,
      target: 5,
      progress: 0,
      done: false,
    })
  })

  it('markiert gelöschte Quests als kaputte Referenz', () => {
    const chapter = makeChapter({
      id: 'c',
      criterion: { type: 'habit', habitId: 'gibt-es-nicht', metric: 'completions', target: 10 },
    })
    expect(evaluateChapter(chapter, quest, ctx)).toEqual({
      chapter,
      current: 0,
      target: 10,
      progress: 0,
      done: false,
      brokenReference: true,
    })
  })

  it('kaputte Referenz auch dann, wenn noch Completions der gelöschten Quest existieren', () => {
    const chapter = makeChapter({
      id: 'c',
      criterion: { type: 'habit', habitId: reading.id, metric: 'completions', target: 1 },
    })
    const orphanCtx = context([], completions, '2026-11-20')
    expect(evaluateChapter(chapter, quest, orphanCtx)).toMatchObject({ brokenReference: true, done: false })
  })
})
