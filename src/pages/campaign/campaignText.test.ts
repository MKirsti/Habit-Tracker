import { describe, expect, it } from 'vitest'
import type { Chapter, ChapterState, Habit } from '../../domain/types'
import {
  campaignDayText,
  chapterProgressText,
  criterionSummary,
  deadlineText,
  durationLabel,
  formatDate,
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
