import { describe, expect, it } from 'vitest'
import { dayRange } from '../../domain/dates'
import { deriveGameState } from '../../domain/engine'
import { makeCompletion, makeGameData, makeMainQuest } from '../../domain/testing'
import type { Chapter, ChapterState, Habit } from '../../domain/types'
import {
  campaignDayText,
  chapterProgressText,
  criterionSummary,
  deadlineText,
  durationLabel,
  formatDate,
  isArchived,
  metricUnit,
  xpHint,
} from './campaignText'

const READING: Habit = {
  id: 'read',
  title: 'Täglich lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
  measure: { target: 10, unit: 'Seiten' },
  order: 0,
  createdDay: '2026-10-01',
}
const TALK: Habit = { ...READING, id: 'talk', title: 'Bücher-Gespräch', icon: '🗣️', schedule: { type: 'weekly', times: 1 } }
delete (TALK as Partial<Habit>).measure

function state(chapter: Chapter, current: number, target: number, done = current >= target): ChapterState {
  return { chapter, current, target, progress: Math.min(1, current / target), done }
}

describe('deadlineText', () => {
  it('beschreibt Restlaufzeit, Fälligkeit und Überfälligkeit', () => {
    expect(deadlineText(undefined)).toBeUndefined()
    expect(deadlineText(211)).toEqual({ text: 'noch 211 Tage', tone: 'normal' })
    expect(deadlineText(1)).toEqual({ text: 'noch 1 Tag', tone: 'soon' })
    expect(deadlineText(0)).toEqual({ text: 'heute fällig', tone: 'soon' })
    expect(deadlineText(-3)).toEqual({ text: 'seit 3 Tagen überfällig', tone: 'overdue' })
    expect(deadlineText(-1)?.text).toBe('seit 1 Tag überfällig')
    expect(deadlineText(1500)?.text).toBe('noch 1.500 Tage')
  })
})

describe('Datumsangaben', () => {
  it('zeigt die Jahreszahl nur außerhalb des aktuellen Jahres', () => {
    expect(formatDate('2026-11-03', '2026-12-01')).toBe('3. Nov.')
    expect(formatDate('2027-11-03', '2026-12-01')).toBe('3. Nov. 2027')
  })

  it('beschreibt den Kampagnentag', () => {
    expect(campaignDayText('2026-10-04', '2026-11-03')).toBe('Tag 31')
    expect(campaignDayText('2026-11-03', '2026-11-03')).toBe('beginnt heute')
    expect(campaignDayText('2026-11-04', '2026-11-03')).toBe('beginnt morgen')
    expect(campaignDayText('2026-11-10', '2026-11-03')).toBe('beginnt in 7 Tagen')
  })

  it('nennt volle Jahre, sonst Tage', () => {
    expect(durationLabel(365)).toBe('1 Jahr')
    expect(durationLabel(730)).toBe('2 Jahre')
    expect(durationLabel(90)).toBe('90 Tage')
  })
})

describe('xpHint', () => {
  it('liest die Werte aus dem Balancing', () => {
    expect(xpHint()).toBe('+100 XP pro Kapitel · +500 XP für die Kampagne')
  })
})

describe('chapterProgressText', () => {
  it('Erledigungen: "5 / 7 Tage"', () => {
    const chapter: Chapter = { id: 'c', title: 'Funke', criterion: { type: 'habit', habitId: 'read', metric: 'completions', target: 7 } }
    const text = chapterProgressText(state(chapter, 5, 7), READING)
    expect(text).toMatchObject({ prefix: '', value: '5 / 7', suffix: 'Tage', spoken: 'Erledigt: 5 von 7 Tagen' })
  })

  it('Gesamtmenge mit Einheit der Quest und Tausenderpunkt', () => {
    const chapter: Chapter = { id: 'c', title: 'Seiten', criterion: { type: 'habit', habitId: 'read', metric: 'total', target: 1000 } }
    expect(chapterProgressText(state(chapter, 430, 1000), READING)).toMatchObject({ value: '430 / 1.000', suffix: 'Seiten' })
    // Ohne Messgröße: "gesamt"
    expect(chapterProgressText(state(chapter, 3, 1000), TALK)?.suffix).toBe('gesamt')
  })

  it('Streak in Tagen bzw. Wochen', () => {
    const chapter: Chapter = { id: 'c', title: 'Serie', criterion: { type: 'habit', habitId: 'read', metric: 'streak', target: 21 } }
    expect(chapterProgressText(state(chapter, 12, 21), READING)).toMatchObject({
      prefix: 'Bester Streak',
      value: '12 / 21',
      suffix: 'Tage',
      spoken: 'Bester Streak: 12 von 21 Tagen',
    })
    expect(chapterProgressText(state(chapter, 2, 21), TALK)?.suffix).toBe('Wochen')
  })

  it('Streak nach einer Umstellung: Einheit des erreichten Werts (state.unit), nicht des aktuellen Rhythmus', () => {
    const chapter: Chapter = { id: 'c', title: 'Serie', criterion: { type: 'habit', habitId: 'talk', metric: 'streak', target: 21 } }
    // 25 Tage in Folge als Tagesquest, inzwischen Wochenquest → "21 / 21 Tage", nicht "21 / 21 Wochen".
    expect(chapterProgressText({ ...state(chapter, 25, 21), unit: 'day' }, TALK)).toMatchObject({
      value: '21 / 21',
      suffix: 'Tage',
      spoken: 'Bester Streak: 21 von 21 Tagen',
    })
    // Umgekehrt: als Wochenquest erreicht, inzwischen täglich.
    const weeks: Chapter = { ...chapter, criterion: { ...chapter.criterion, target: 3 } as Chapter['criterion'] }
    expect(chapterProgressText({ ...state(weeks, 3, 3), unit: 'week' }, READING)).toMatchObject({
      suffix: 'Wochen',
      spoken: 'Bester Streak: 3 von 3 Wochen',
    })
    // Die Kurzbeschreibung des Ziels folgt weiter dem aktuellen Rhythmus (sie beschreibt die Regel).
    expect(criterionSummary(chapter.criterion, new Map([[TALK.id, TALK]]))).toBe('🗣️ Bücher-Gespräch · Streak 21 Wochen')
  })

  it('Streak nach Umstellung täglich → Wochenquest, durchgerechnet über die Engine', () => {
    const habit: Habit = {
      ...READING,
      schedule: { type: 'weekly', times: 3 },
      scheduleHistory: [{ until: '2026-11-26', schedule: { type: 'daily' } }],
    }
    const chapter: Chapter = { id: 'c', title: '21 Tage', criterion: { type: 'habit', habitId: habit.id, metric: 'streak', target: 21 } }
    const data = makeGameData({
      habits: [habit],
      completions: dayRange('2026-11-01', '2026-11-25').map((day) => makeCompletion(habit, day)),
      mainQuests: [makeMainQuest({ id: 'k', startDay: '2026-11-01', chapters: [chapter] })],
    })
    const chapterState = deriveGameState(data, '2026-11-26').mainQuests[0].chapters[0]
    expect(chapterState).toMatchObject({ done: true, unit: 'day' })
    expect(chapterProgressText(chapterState, habit)).toMatchObject({ value: '21 / 21', suffix: 'Tage' })
  })

  it('zeigt bei abgeschlossenen Quest-Zielen das erreichte Ziel, bei Zählern den echten Stand', () => {
    const habitChapter: Chapter = { id: 'c', title: 'Funke', criterion: { type: 'habit', habitId: 'read', metric: 'completions', target: 7 } }
    expect(chapterProgressText(state(habitChapter, 19, 7), READING)?.value).toBe('7 / 7')
    const counter: Chapter = { id: 'k', title: 'Bücher', criterion: { type: 'counter', target: 12, label: 'Bücher beendet' }, counter: 13 }
    expect(chapterProgressText(state(counter, 13, 12), undefined)).toMatchObject({
      value: '13 / 12',
      suffix: 'Bücher beendet',
      spoken: 'Bücher beendet: 13 von 12',
    })
  })

  it('liefert für Abhak-Kapitel keinen Zahlenwert', () => {
    const chapter: Chapter = { id: 'm', title: 'Buch', criterion: { type: 'manual' } }
    expect(chapterProgressText(state(chapter, 0, 1), undefined)).toBeUndefined()
  })
})

describe('metricUnit & criterionSummary', () => {
  it('passt Einheiten an die Zahl an', () => {
    expect(metricUnit('completions', READING, 1)).toBe('Tag')
    expect(metricUnit('streak', TALK, 1)).toBe('Woche')
    expect(metricUnit('streak', TALK, 2, 'day')).toBe('Tage')
    expect(metricUnit('streak', READING, 2, 'week')).toBe('Wochen')
  })

  it('isArchived: archiviert ab archivedDay (ein künftiger zählt noch nicht)', () => {
    expect(isArchived(READING, '2026-11-03')).toBe(false)
    expect(isArchived({ ...READING, archivedDay: '2026-11-03' }, '2026-11-03')).toBe(true)
    expect(isArchived({ ...READING, archivedDay: '2026-11-04' }, '2026-11-03')).toBe(false)
  })

  it('fasst Kapitelziele für Listen zusammen', () => {
    const habits = new Map([[READING.id, READING]])
    expect(criterionSummary({ type: 'manual' }, habits)).toBe('Von Hand abhaken')
    expect(criterionSummary({ type: 'counter', target: 12, label: 'Bücher beendet' }, habits)).toBe('Zähler · 12 Bücher beendet')
    expect(criterionSummary({ type: 'habit', habitId: 'read', metric: 'total', target: 1000 }, habits)).toBe(
      '📖 Täglich lesen · 1.000 Seiten',
    )
    expect(criterionSummary({ type: 'habit', habitId: 'read', metric: 'streak', target: 21 }, habits)).toBe(
      '📖 Täglich lesen · Streak 21 Tage',
    )
    expect(criterionSummary({ type: 'habit', habitId: 'weg', metric: 'completions', target: 5 }, habits)).toBe(
      'Gelöschte Quest · 5 Tage',
    )
  })
})
