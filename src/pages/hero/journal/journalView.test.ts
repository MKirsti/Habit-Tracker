import { describe, expect, it } from 'vitest'
import type { JournalEvent, JournalNote } from '../../../domain/types'
import {
  journalDayLabel,
  journalDaySubLabel,
  journalDays,
  journalMonthLabel,
  journalTone,
  moreEventsText,
  noteCount,
  noteCountText,
  noteDayError,
  noteDialogTitle,
  olderDaysText,
  previewEvents,
  reviewWeekStartOf,
  startsNewMonth,
} from './journalView'

const TODAY = '2026-11-05'

function event(day: string, kind: JournalEvent['kind'], text: string): JournalEvent {
  return { day, kind, icon: '⭐', text }
}

function note(day: string, text: string, mood?: string): JournalNote {
  return { day, text, updatedAt: 1, ...(mood !== undefined ? { mood } : {}) }
}

describe('journalDays', () => {
  const events = [
    event('2026-11-03', 'levelUp', 'Level 3 erreicht'),
    event('2026-11-03', 'chapter', 'Kapitel „Erste Seiten“ abgeschlossen'),
    event('2026-11-01', 'weeklyReview', 'Wochenrückblick: 320 XP'),
    event('2026-10-26', 'adventureStart', 'Dein Abenteuer beginnt'),
  ]
  const notes = [note('2026-11-04', 'Müde, aber stolz.', '😴'), note('2026-11-01', 'Guter Sonntag'), note('2026-11-09', 'Zukunft')]

  it('gruppiert nach Tagen (neueste zuerst), heute immer oben, Reihenfolge der Ereignisse bleibt', () => {
    const days = journalDays(events, notes, TODAY, 'all')
    expect(days.map((day) => day.day)).toEqual(['2026-11-05', '2026-11-04', '2026-11-03', '2026-11-01', '2026-10-26'])
    expect(days[0]).toEqual({ day: TODAY, events: [] })
    expect(days[1].note?.mood).toBe('😴')
    expect(days[2].events.map((entry) => entry.kind)).toEqual(['levelUp', 'chapter'])
    expect(days[3].events).toHaveLength(1)
    expect(days[3].note?.text).toBe('Guter Sonntag')
  })

  it('„Nur Notizen“: nur Tage mit Notiz, ohne Ereignisse; Notizen nach heute zählen nie', () => {
    const days = journalDays(events, notes, TODAY, 'notes')
    expect(days.map((day) => [day.day, day.events.length, day.note?.text])).toEqual([
      ['2026-11-04', 0, 'Müde, aber stolz.'],
      ['2026-11-01', 0, 'Guter Sonntag'],
    ])
    expect(journalDays(events, undefined, TODAY, 'notes')).toEqual([])
    expect(noteCount(notes, TODAY)).toBe(2)
    expect(noteCountText(1)).toBe('1 Notiz')
    expect(noteCountText(12)).toBe('12 Notizen')
    expect(olderDaysText(1)).toBe('Noch 1 älterer Tag')
    expect(olderDaysText(1234)).toBe('Noch 1.234 ältere Tage')
  })
})

describe('Beschriftungen', () => {
  it('nennt heute und gestern beim Namen, sonst das ganze Datum', () => {
    expect(journalDayLabel(TODAY, TODAY)).toBe('Heute')
    expect(journalDayLabel('2026-11-04', TODAY)).toBe('Gestern')
    expect(journalDayLabel('2026-11-03', TODAY)).toBe('Dienstag, 3. November 2026')
    expect(journalDaySubLabel(TODAY, TODAY)).toBe('5. Nov.')
    expect(journalDaySubLabel('2026-11-03', TODAY)).toBeUndefined()
    expect(journalMonthLabel('2026-10-26')).toBe('Oktober 2026')
    expect(startsNewMonth('2026-10-31', '2026-11-01')).toBe(true)
    expect(startsNewMonth('2026-11-01', '2026-11-03')).toBe(false)
    expect(startsNewMonth('2026-11-01', undefined)).toBe(true)
    expect(noteDialogTitle(TODAY, TODAY)).toBe('Notiz zu heute')
    expect(noteDialogTitle('2026-11-04', TODAY)).toBe('Notiz zu gestern')
    expect(noteDialogTitle('2026-10-30', TODAY)).toBe('Notiz zum 30. Okt.')
    expect(noteDialogTitle('', TODAY)).toBe('Notiz')
  })

  it('ordnet Ereignissen einen Ton zu und findet den Montag eines Rückblicks', () => {
    expect(journalTone('levelUp')).toBe('gold')
    expect(journalTone('bossVictory')).toBe('boss')
    expect(journalTone('endBossVictory')).toBe('boss')
    expect(journalTone('companionStage')).toBe('companion')
    expect(journalTone('weeklyReview')).toBe('review')
    expect(journalTone('defeat')).toBe('calm')
    expect(reviewWeekStartOf({ day: '2026-11-01' })).toBe('2026-10-26')
  })
})

describe('noteDayError', () => {
  it('erlaubt heute und frühere Tage ab dem Abenteuerbeginn – freundlich formuliert', () => {
    expect(noteDayError({ day: TODAY, today: TODAY, createdDay: '2026-10-01' })).toBeUndefined()
    expect(noteDayError({ day: '2026-10-01', today: TODAY, createdDay: '2026-10-01' })).toBeUndefined()
    expect(noteDayError({ day: '2026-11-06', today: TODAY })).toBe(
      'Die Zukunft ist noch ungeschrieben – wähle heute oder einen früheren Tag.',
    )
    expect(noteDayError({ day: '2026-09-30', today: TODAY, createdDay: '2026-10-01' })).toBe(
      'Dein Abenteuer begann am 1. Okt. – davor gibt es noch kein Tagebuch.',
    )
    expect(noteDayError({ day: '', today: TODAY })).toBe('Wähle einen Tag.')
  })
})

describe('previewEvents', () => {
  it('klappt Tage mit vielen Ereignissen zu – ein einzelner Rest bleibt sichtbar', () => {
    const many = Array.from({ length: 13 }, (_, i) => i)
    expect(previewEvents(many, false)).toEqual({ shown: [0, 1, 2, 3, 4], hidden: 8 })
    expect(previewEvents(many, true)).toEqual({ shown: many, hidden: 0 })
    expect(previewEvents([1, 2, 3, 4, 5, 6], false)).toEqual({ shown: [1, 2, 3, 4, 5, 6], hidden: 0 })
    expect(moreEventsText(1)).toBe('1 weiterer Eintrag')
    expect(moreEventsText(8)).toBe('8 weitere Einträge')
  })
})
