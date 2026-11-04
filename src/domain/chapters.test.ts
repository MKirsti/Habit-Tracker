import { describe, expect, it } from 'vitest'
import { evaluateChapter } from './chapters'
import type { ChapterContext } from './chapters'
import { completeRange, makeChapter, makeCompletion, makeHabit, makeMainQuest } from './testing'
import type { ChapterMetric, Completion, DayKey, Habit } from './types'

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

  function habitChapter(metric: ChapterMetric, target: number) {
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

  it('streak: ein abgeschlossenes Kapitel bleibt nach Rhythmus-Änderung und Zurückholen abgeschlossen', () => {
    // 01.–07.11. nur Mo/Mi/Fr fällig (02., 04., 06. erledigt), ab Mo 09.11. täglich; 12.–15.11. archiviert,
    // am 16.11. zurückgeholt (Pause). Erledigt: 09.–11. und 16.–17. → Serie 3 + 3 + 2 = 8 Plantage.
    const edited = makeHabit({
      ...reading,
      schedule: { type: 'daily' },
      scheduleHistory: [{ until: '2026-11-09', schedule: { type: 'weekdays', days: [1, 3, 5] } }],
      pauses: [{ from: '2026-11-12', until: '2026-11-16' }],
    })
    const completions = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-16', '2026-11-17'].map(
      (day) => makeCompletion(edited, day),
    )
    const streakCtx = context([edited], completions, '2026-11-17')
    expect(evaluateChapter(habitChapter('streak', 8), quest, streakCtx)).toMatchObject({
      current: 8,
      done: true,
      doneDay: '2026-11-17',
    })
    // Gegenprobe ohne Verlauf und Pause: Di/Do/Sa/So und die archivierte Zeit wären verpasste Tage
    const naive = makeHabit({ ...reading, schedule: { type: 'daily' } })
    expect(evaluateChapter(habitChapter('streak', 8), quest, context([naive], completions, '2026-11-17'))).toMatchObject({
      current: 3,
      done: false,
    })
  })

  it('streak: Umstellung täglich → Wochenquest – ein erreichtes Ziel bleibt erreicht (Kapitel-XP bleiben)', () => {
    // 01.–21.11. täglich gelesen (21 Tage in Folge), ab Mo 23.11. nur noch 5× pro Woche.
    const switched = makeHabit({
      ...reading,
      schedule: { type: 'weekly', times: 5 },
      scheduleHistory: [{ until: '2026-11-23', schedule: { type: 'daily' } }],
    })
    const streakCtx = context([switched], completeRange(switched, '2026-11-01', '2026-11-21'), '2026-11-25')
    expect(evaluateChapter(habitChapter('streak', 21), quest, streakCtx)).toMatchObject({
      current: 21,
      target: 21,
      progress: 1,
      done: true,
      doneDay: '2026-11-21',
      // Der Wert stammt aus der Zeit als Tagesquest: 21 Tage, nicht 21 Wochen.
      unit: 'day',
    })
  })

  it('streak: Einheit des Werts – nach der Umstellung erreicht vs. vorher erreicht vs. unverändert', () => {
    // 25 Tage in Folge gelesen (01.–25.11.), heute (Do 26.11.) auf 3× pro Woche umgestellt.
    const switched = makeHabit({
      ...reading,
      schedule: { type: 'weekly', times: 3 },
      scheduleHistory: [{ until: '2026-11-26', schedule: { type: 'daily' } }],
    })
    const streakCtx = context([switched], completeRange(switched, '2026-11-01', '2026-11-25'), '2026-11-26')
    expect(evaluateChapter(habitChapter('streak', 21), quest, streakCtx)).toMatchObject({ current: 25, done: true, unit: 'day' })
    // Ein (noch) nicht erreichtes Ziel zählt in der aktuellen Einheit (Wochen).
    expect(evaluateChapter(habitChapter('streak', 30), quest, streakCtx)).toMatchObject({ done: false, unit: 'week' })
    // Ohne Umstellung: immer die Einheit des Rhythmus.
    const daily = context([reading], completeRange(reading, '2026-11-01', '2026-11-25'), '2026-11-26')
    expect(evaluateChapter(habitChapter('streak', 21), quest, daily)).toMatchObject({ current: 25, unit: 'day' })
    // Andere Kapitel-Arten haben keine Einheit.
    expect(evaluateChapter(habitChapter('completions', 21), quest, daily)).not.toHaveProperty('unit')
  })

  it('streak: Umstellung Wochenquest → täglich – erfüllte Wochen bleiben erreicht', () => {
    // 2× pro Woche, drei Wochen in Folge erfüllt (3. Woche am Mi 18.11.); ab Mo 23.11. täglich (23., 24. erledigt).
    const switched = makeHabit({
      ...reading,
      schedule: { type: 'daily' },
      scheduleHistory: [{ until: '2026-11-23', schedule: { type: 'weekly', times: 2 } }],
    })
    const days = ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11', '2026-11-16', '2026-11-18', '2026-11-23', '2026-11-24']
    const streakCtx = context([switched], days.map((day) => makeCompletion(switched, day)), '2026-11-25')
    expect(evaluateChapter(habitChapter('streak', 3), quest, streakCtx)).toMatchObject({
      current: 3,
      progress: 1,
      done: true,
      doneDay: '2026-11-18',
      unit: 'week',
    })
    // Noch nicht erreichte Ziele zeigen den Wert in der Einheit des aktuellen Rhythmus (hier: 2 Tage).
    expect(evaluateChapter(habitChapter('streak', 5), quest, streakCtx)).toMatchObject({
      current: 2,
      target: 5,
      done: false,
      unit: 'day',
    })
    // Ab 5 Tagen in Folge ist das Ziel in der neuen Einheit erreicht.
    const later = context(
      [switched],
      [...days, '2026-11-25', '2026-11-26', '2026-11-27'].map((day) => makeCompletion(switched, day)),
      '2026-11-28',
    )
    expect(evaluateChapter(habitChapter('streak', 5), quest, later)).toMatchObject({
      current: 5,
      done: true,
      doneDay: '2026-11-27',
    })
  })

  it('streak: Schontage (Ruhetag, Streak-Schutz) brechen die Serie nicht', () => {
    // 01.–03. gelesen, 04. Ruhetag (nicht gelesen), 05.–08. gelesen → mit Schontag 7 in Folge, ohne nur 4.
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']
    const base = context([reading], days.map((day) => makeCompletion(reading, day)), '2026-11-09')
    expect(evaluateChapter(habitChapter('streak', 7), quest, base)).toMatchObject({ current: 4, done: false })
    const withFree = { ...base, freeDays: new Set(['2026-11-04']) }
    expect(evaluateChapter(habitChapter('streak', 7), quest, withFree)).toMatchObject({
      current: 7,
      done: true,
      doneDay: '2026-11-08',
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

  it('best: höchster Tageswert im Zeitraum [startDay, today]; doneDay = erster Tag, der das Ziel erreicht', () => {
    // Im Zeitraum: 12, 10, 4 (Teilfortschritt), 10, 15 – vor dem Start und nach today zählen nicht.
    const reached = makeChapter({ id: 'b', criterion: { type: 'habit', habitId: reading.id, metric: 'best', target: 12 } })
    expect(evaluateChapter(reached, quest, ctx)).toEqual({
      chapter: reached,
      current: 15, // der Bestwert, nicht der erste Wert über dem Ziel
      target: 12,
      progress: 1,
      done: true,
      doneDay: '2026-11-01',
    })
    expect(evaluateChapter(habitChapter('best', 15), quest, ctx)).toMatchObject({ done: true, doneDay: '2026-11-05' })
    const open = makeChapter({ id: 'b', criterion: { type: 'habit', habitId: reading.id, metric: 'best', target: 20 } })
    const state = evaluateChapter(open, quest, ctx)
    expect(state).toEqual({ chapter: open, current: 15, target: 20, progress: 0.75, done: false })
    // Kein Streak-Kapitel – keine Einheit.
    expect(state).not.toHaveProperty('unit')
  })

  it('best: Werte vor dem Kampagnenstart und nach today zählen nicht', () => {
    const outside = [
      makeCompletion(reading, '2026-10-31', { value: 50 }),
      makeCompletion(reading, '2026-11-02', { value: 11 }),
      makeCompletion(reading, '2026-11-21', { value: 50 }),
    ]
    const chapter = makeChapter({ id: 'b', criterion: { type: 'habit', habitId: reading.id, metric: 'best', target: 30 } })
    expect(evaluateChapter(chapter, quest, context([reading], outside, '2026-11-20'))).toMatchObject({
      current: 11,
      done: false,
    })
  })

  it('best: auch ein Teilfortschritt ist ein Bestwert („35 von 40 Minuten am Stück“)', () => {
    const run = makeHabit({ id: 'run', createdDay: '2026-11-01', measure: { target: 40, unit: 'Minuten' } })
    const completions = [makeCompletion(run, '2026-11-02', { value: 25 }), makeCompletion(run, '2026-11-04', { value: 35 })]
    const chapter = makeChapter({ id: 'b', criterion: { type: 'habit', habitId: run.id, metric: 'best', target: 30 } })
    expect(evaluateChapter(chapter, quest, context([run], completions, '2026-11-20'))).toMatchObject({
      current: 35,
      done: true,
      progress: 1,
      doneDay: '2026-11-04',
    })
  })

  it('best: robust gegen Gleitkomma-Rauschen, unsortierte Eingabe und ungültige Werte', () => {
    const water = makeHabit({ id: 'water', createdDay: '2026-11-01', measure: { target: 0.1, unit: 'L' } })
    const completions = [
      makeCompletion(water, '2026-11-09', { value: 0.3 }),
      makeCompletion(water, '2026-11-03', { value: 0.1 + 0.2 }), // 0.30000000000000004
      makeCompletion(water, '2026-11-02', { value: Number.NaN }),
      makeCompletion(water, '2026-11-01', { value: 0.7 - 0.4 }), // 0.29999999999999993
    ]
    const chapter = makeChapter({ id: 'b', criterion: { type: 'habit', habitId: water.id, metric: 'best', target: 0.3 } })
    const state = evaluateChapter(chapter, quest, context([water], completions, '2026-11-20'))
    expect(state.current).toBeCloseTo(0.3, 10)
    expect(state).toMatchObject({ done: true, progress: 1, doneDay: '2026-11-01' })
  })

  it('best: ohne Werte 0, gelöschte Quest als kaputte Referenz', () => {
    const chapter = makeChapter({ id: 'b', criterion: { type: 'habit', habitId: reading.id, metric: 'best', target: 30 } })
    expect(evaluateChapter(chapter, quest, context([reading], [], '2026-11-20'))).toEqual({
      chapter,
      current: 0,
      target: 30,
      progress: 0,
      done: false,
    })
    expect(evaluateChapter(chapter, quest, context([], completions, '2026-11-20'))).toMatchObject({
      brokenReference: true,
      done: false,
    })
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
