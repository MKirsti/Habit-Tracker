import { describe, expect, it } from 'vitest'
import type { DayStat, HabitHeatmapCell, HeatmapCell, RadarAxis, WeekXp } from '../../../domain/statistics'
import type { Habit } from '../../../domain/types'
import {
  dayStatDetails,
  habitCellLabel,
  habitDayDetails,
  habitHeatmapSummary,
  heatCellLabel,
  heatmapSummary,
  radarSummary,
  rateDetail,
  rateLabel,
  shortDayLabel,
  weekRangeLabel,
  weekTickLabel,
  weeklySubtitle,
  weeklySummary,
  weeklyXpSummary,
  xpTimelineSummary,
} from './statsText'

const TODAY = '2026-11-04'

function stat(patch: Partial<DayStat>): DayStat {
  return {
    day: '2026-11-02',
    required: 3,
    requiredDone: 3,
    done: 3,
    questXp: 60,
    perfectBonusXp: 15,
    sideQuestXp: 0,
    chapterXp: 0,
    xp: 75,
    totalXp: 500,
    level: 3,
    perfect: true,
    rest: false,
    score: 'perfect',
    settled: true,
    open: false,
    frozen: false,
    ...patch,
  }
}

const READING: Habit = {
  id: 'read',
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
  measure: { target: 10, unit: 'Seiten' },
  order: 0,
  createdDay: '2026-10-01',
}

describe('Tage der Heatmap', () => {
  it('beschreibt perfekte, gute und schwache Tage mit Tagesquests und XP', () => {
    expect(dayStatDetails(stat({}), TODAY)).toBe('Perfekter Tag · 3 von 3 Tagesquests · +75 XP')
    expect(dayStatDetails(stat({ score: 'good', requiredDone: 2, perfect: false, xp: 40 }), TODAY)).toBe(
      'Gut geschafft · 2 von 3 Tagesquests · +40 XP',
    )
    expect(dayStatDetails(stat({ score: 'weak', requiredDone: 1, required: 1, xp: 0 }), TODAY)).toBe(
      'Ein Anfang · 1 von 1 Tagesquest',
    )
  })

  it('bleibt freundlich bei Tagen ohne Erledigung und nennt den Streak-Schutz', () => {
    expect(dayStatDetails(stat({ score: 'missed', requiredDone: 0, done: 0, xp: 0, frozen: true }), TODAY)).toBe(
      'Nichts erledigt · 0 von 3 Tagesquests · ❄️ vom Streak-Schutz aufgefangen',
    )
    expect(dayStatDetails(stat({ score: 'absent', required: 2, requiredDone: 0, done: 0, xp: 0 }), TODAY)).toBe('Längere Pause')
    expect(
      dayStatDetails(stat({ score: 'missed', requiredDone: 0, done: 0, xp: 0, defeat: { goldLost: 120 } }), TODAY),
    ).toBe('Nichts erledigt · 0 von 3 Tagesquests · Niederlage – und wieder aufgestanden')
  })

  it('zählt an Ruhetagen und Tagen ohne Pflicht die Erledigungen', () => {
    expect(dayStatDetails(stat({ score: 'rest', rest: true, required: 0, requiredDone: 0, done: 1, xp: 20 }), TODAY)).toBe(
      'Ruhetag · 1 Quest erledigt · +20 XP',
    )
    expect(dayStatDetails(stat({ score: 'none', required: 0, requiredDone: 0, done: 0, xp: 0 }), TODAY)).toBe(
      'Keine Tagesquests',
    )
  })

  it('heute läuft noch, gestern lässt sich nachtragen', () => {
    expect(
      dayStatDetails(stat({ day: TODAY, score: 'missed', requiredDone: 1, xp: 20, settled: false, open: true }), TODAY),
    ).toBe('Heute · 1 von 3 Tagesquests · +20 XP · läuft noch')
    expect(dayStatDetails(stat({ day: TODAY, settled: false, open: true }), TODAY)).toBe(
      'Perfekter Tag · 3 von 3 Tagesquests · +75 XP',
    )
    expect(
      dayStatDetails(stat({ day: '2026-11-03', score: 'weak', requiredDone: 1, xp: 20, settled: false, open: true }), TODAY),
    ).toBe('Ein Anfang · 1 von 3 Tagesquests · +20 XP · noch nachtragbar')
  })

  it('beschriftet Zellen mit Datum – auch die vor dem Abenteuer', () => {
    const tracked: HeatmapCell = { day: '2026-11-02', kind: 'tracked', level: 4, stat: stat({}) }
    expect(heatCellLabel(tracked, TODAY)).toBe('Montag, 2. November 2026 – Perfekter Tag · 3 von 3 Tagesquests · +75 XP')
    expect(heatCellLabel({ day: '2026-09-01', kind: 'outside', level: 0 }, TODAY)).toBe(
      'Dienstag, 1. September 2026 – vor Beginn deines Abenteuers',
    )
    expect(shortDayLabel('2026-11-02')).toBe('Mo, 2. Nov.')
    expect(shortDayLabel('2026-11-08')).toBe('So, 8. Nov.')
  })

  it('fasst die Heatmap zusammen – nur, was es gab', () => {
    const cells: HeatmapCell[][] = [
      [
        { day: '2026-11-02', kind: 'tracked', level: 4, stat: stat({}) },
        { day: '2026-11-03', kind: 'tracked', level: 4, stat: stat({ day: '2026-11-03' }) },
        { day: '2026-11-04', kind: 'tracked', level: 1, stat: stat({ day: TODAY, score: 'weak', frozen: true }) },
        { day: '2026-11-05', kind: 'future', level: 0 },
      ],
    ]
    expect(heatmapSummary(cells, 26)).toBe(
      'Letzte 26 Wochen: 2 perfekte Tage, 1 Tag mit ersten Schritten, 1 Tag vom Streak-Schutz aufgefangen.',
    )
    expect(heatmapSummary([[{ day: '2026-11-05', kind: 'future', level: 0 }]], 52)).toBe(
      'Letzte 52 Wochen: noch keine Erledigungen.',
    )
  })
})

describe('Heatmap einer Quest', () => {
  const cell = (patch: Partial<HabitHeatmapCell>): HabitHeatmapCell => ({
    day: '2026-11-02',
    state: 'done',
    value: 12,
    target: 10,
    level: 4,
    ...patch,
  })

  it('nennt Stand und Menge', () => {
    expect(habitDayDetails(cell({}), READING, TODAY)).toBe('erledigt · 12 / 10 Seiten')
    expect(habitDayDetails(cell({ state: 'partial', value: 2.5, level: 1 }), READING, TODAY)).toBe(
      'Teilfortschritt · 2,5 / 10 Seiten',
    )
    expect(habitDayDetails(cell({ state: 'missed', value: 0 }), READING, TODAY)).toBe('nicht erledigt')
    expect(habitDayDetails(cell({ state: 'open', day: TODAY, value: 0 }), READING, TODAY)).toBe('heute noch offen')
    expect(habitDayDetails(cell({ state: 'open', day: '2026-11-03', value: 0 }), READING, TODAY)).toBe('noch nachtragbar')
    expect(habitDayDetails(cell({ state: 'free', value: 0 }), READING, TODAY)).toBe('kein Plantag')
    expect(habitDayDetails(cell({ state: 'rest', value: 0 }), READING, TODAY)).toBe('Ruhetag')
    expect(habitDayDetails(cell({ state: 'inactive', value: 0 }), READING, TODAY)).toBe('Quest nicht aktiv')
    // Abhak-Quests ohne Menge.
    expect(habitDayDetails(cell({ value: 1, target: 1 }), { ...READING, measure: undefined }, TODAY)).toBe('erledigt')
    expect(habitCellLabel(cell({}), READING, TODAY)).toBe('Montag, 2. November 2026 – erledigt · 12 / 10 Seiten')
  })

  it('fasst sie zusammen', () => {
    const cells = [[cell({}), cell({ state: 'partial' }), cell({}), cell({ state: 'missed' })]]
    expect(habitHeatmapSummary(cells, READING, 26)).toBe('📖 Lesen, letzte 26 Wochen: 2-mal erledigt, 1 Tag mit Teilfortschritt.')
    expect(habitHeatmapSummary([[cell({ state: 'free' })]], READING, 26)).toBe('📖 Lesen, letzte 26 Wochen: noch nicht erledigt.')
  })
})

describe('Wochen, Verlauf, Radar, Quote', () => {
  const week = (weekStart: string, xp: number, current = false): WeekXp => ({
    weekStart,
    xp,
    questXp: xp,
    perfectBonusXp: 0,
    sideQuestXp: 0,
    chapterXp: 0,
    current,
  })

  it('beschriftet Wochen', () => {
    expect(weekRangeLabel('2026-10-26')).toBe('26. Okt. – 1. Nov.')
    expect(weekTickLabel('2026-10-05')).toBe('5.10.')
  })

  it('rechnet den Schnitt nur über abgeschlossene Wochen und findet den Rekord', () => {
    const weeks = [week('2026-10-19', 300), week('2026-10-26', 500), week('2026-11-02', 900, true)]
    expect(weeklySummary(weeks)).toEqual({ total: 1700, average: 400, best: weeks[2] })
    expect(weeklyXpSummary(weeks)).toBe(
      'Letzte 3 Wochen: 1.700 XP, im Schnitt 400 XP pro Woche. Stärkste Woche 2. Nov. – 8. Nov. mit 900 XP.',
    )
    expect(weeklyXpSummary([week('2026-11-02', 0, true)])).toBe(
      'Letzte 1 Wochen: noch keine XP – deine erste Quest füllt die erste Säule.',
    )
  })

  it('zählt für den Schnitt nur Wochen ab dem Abenteuerbeginn (leere Wochen davor drücken ihn nicht)', () => {
    const weeks = [week('2026-10-12', 0), week('2026-10-19', 0), week('2026-10-26', 300), week('2026-11-02', 100, true)]
    // Abenteuer seit Mittwoch, 28. Oktober: abgeschlossen ist nur die Woche ab dem 26. Oktober.
    expect(weeklySummary(weeks, '2026-10-28')).toEqual({ total: 400, average: 300, best: weeks[2] })
    expect(weeklyXpSummary(weeks, '2026-10-28')).toBe(
      'Letzte 4 Wochen: 400 XP, im Schnitt 300 XP pro Woche. Stärkste Woche 26. Okt. – 1. Nov. mit 300 XP.',
    )
    expect(weeklySubtitle(weeks, '2026-10-28')).toBe('Im Schnitt 300 XP pro Woche · Rekord 300 XP')
  })

  it('nennt einem frischen Helden keinen Schnitt von 0 XP, solange keine Woche abgeschlossen ist', () => {
    const weeks = [week('2026-10-26', 0), week('2026-11-02', 40, true)]
    expect(weeklySummary(weeks, '2026-11-04')).toEqual({ total: 40, best: weeks[1] })
    expect(weeklyXpSummary(weeks, '2026-11-04')).toBe(
      'Letzte 2 Wochen: 40 XP. Stärkste Woche 2. Nov. – 8. Nov. mit 40 XP.',
    )
    expect(weeklySubtitle(weeks, '2026-11-04')).toBe(
      'Diese Woche bisher 40 XP – den Schnitt gibt es nach deiner ersten ganzen Woche.',
    )
    expect(weeklySubtitle([week('2026-11-02', 0, true)], '2026-11-04')).toBe('Deine erste Quest füllt die erste Säule.')
  })

  it('erzählt den XP-Verlauf', () => {
    expect(
      xpTimelineSummary({
        points: [
          { day: '2026-10-01', totalXp: 0, level: 1 },
          { day: '2026-11-04', totalXp: 1240, level: 5 },
        ],
        levelUps: [
          { day: '2026-10-05', from: 1, level: 2 },
          { day: '2026-11-01', from: 4, level: 5 },
        ],
      }),
    ).toBe(
      'Gesamt-XP von 0 am 1. Okt. auf 1.240 am 4. Nov., jetzt Level 5. 2 Level-Aufstiege, zuletzt auf Level 5 am 1. Nov.',
    )
    expect(xpTimelineSummary({ points: [], levelUps: [] })).toBe('Noch kein Verlauf.')
  })

  it('nennt im Radar alle Attribute und das stärkste', () => {
    const axis = (id: RadarAxis['id'], level: number, value: number, totalXp = 100): RadarAxis => ({
      id,
      level,
      totalXp,
      progress: 0,
      value,
    })
    const axes = [axis('strength', 1, 0.2), axis('intellect', 4, 0.8), axis('wisdom', 2, 0.4, 0)]
    expect(radarSummary(axes)).toBe('Stärke Level 1, Intelligenz Level 4, Weisheit Level 2. Am stärksten: Intelligenz.')
    expect(radarSummary([axis('strength', 1, 0.2, 0)])).toBe('Stärke Level 1.')
  })

  it('formuliert die Erfüllungsquote', () => {
    expect(rateLabel(0.856)).toBe('86 %')
    expect(rateLabel(undefined)).toBe('–')
    expect(rateDetail(26, 30, 'day')).toBe('26 von 30 Tagen')
    expect(rateDetail(1, 1, 'day')).toBe('1 von 1 Tag')
    expect(rateDetail(3, 4, 'week')).toBe('3 von 4 Wochen')
    expect(rateDetail(0, 0, 'day')).toBe('noch nichts fällig')
    expect(rateDetail(0, 0, 'week')).toBe('noch keine Woche abgeschlossen')
  })
})
