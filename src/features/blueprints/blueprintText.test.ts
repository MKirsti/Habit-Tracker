import { describe, expect, it } from 'vitest'
import { getBlueprint } from '../../data/blueprints'
import type { BlueprintQuest } from '../../data/blueprints'
import {
  activeSlotsText,
  choiceSummary,
  countLabel,
  criterionSummary,
  durationLabel,
  formatDeadline,
  freeSlotsText,
  measureText,
} from './blueprintText'

const quests = new Map<string, Pick<BlueprintQuest, 'title' | 'schedule' | 'measure'>>([
  ['reading', { title: 'Täglich lesen', schedule: { type: 'daily' }, measure: { target: 10, unit: 'Seiten' } }],
  ['training', { title: 'Krafttraining', schedule: { type: 'weekly', times: 2 } }],
  ['plan', { title: 'Planen', schedule: { type: 'weekdays', days: [1, 3, 5] } }],
])

describe('blueprintText', () => {
  it('countLabel: Singular nur bei genau 1, Zahl de-DE', () => {
    expect(countLabel(1, 'Quest', 'Quests')).toBe('1 Quest')
    expect(countLabel(1000, 'Tag', 'Tage')).toBe('1.000 Tage')
  })

  it('durationLabel: Jahre, gerundete Monate, Wochen, Tage', () => {
    expect(durationLabel(365)).toBe('1 Jahr')
    expect(durationLabel(366)).toBe('1 Jahr')
    expect(durationLabel(730)).toBe('2 Jahre')
    expect(durationLabel(180)).toBe('6 Monate')
    expect(durationLabel(210)).toBe('7 Monate')
    expect(durationLabel(60)).toBe('2 Monate')
    expect(durationLabel(21)).toBe('3 Wochen')
    expect(durationLabel(10)).toBe('10 Tage')
    expect(durationLabel(1)).toBe('1 Tag')
  })

  it('formatDeadline: kurzes Datum mit Jahr', () => {
    expect(formatDeadline('2027-11-03')).toBe('3. Nov. 2027')
    expect(formatDeadline('2027-05-31')).toBe('31. Mai 2027')
  })

  it('measureText: de-DE mit Einheit', () => {
    expect(measureText({ target: 1.5, unit: 'L' })).toBe('1,5 L')
    expect(measureText({ target: 6000, unit: 'Schritte' })).toBe('6.000 Schritte')
  })

  it('criterionSummary: alle Kapitel-Arten', () => {
    expect(criterionSummary({ type: 'manual' }, quests)).toBe('Meilenstein')
    expect(criterionSummary({ type: 'counter', target: 12, label: 'Bücher beendet' }, quests)).toBe('Zähler: 12 Bücher beendet')
    expect(criterionSummary({ type: 'habit', questKey: 'reading', metric: 'completions', target: 7 }, quests)).toBe(
      '7× Täglich lesen',
    )
    expect(criterionSummary({ type: 'habit', questKey: 'reading', metric: 'total', target: 1000 }, quests)).toBe(
      '1.000 Seiten gesamt',
    )
    expect(criterionSummary({ type: 'habit', questKey: 'training', metric: 'total', target: 50 }, quests)).toBe('50 gesamt')
    expect(criterionSummary({ type: 'habit', questKey: 'reading', metric: 'streak', target: 21 }, quests)).toBe('21 Tage Streak')
    expect(criterionSummary({ type: 'habit', questKey: 'reading', metric: 'streak', target: 1 }, quests)).toBe('1 Tag Streak')
    expect(criterionSummary({ type: 'habit', questKey: 'plan', metric: 'streak', target: 10 }, quests)).toBe('10 Tage Streak')
    expect(criterionSummary({ type: 'habit', questKey: 'training', metric: 'streak', target: 8 }, quests)).toBe(
      '8 Wochen Streak',
    )
    expect(criterionSummary({ type: 'habit', questKey: 'training', metric: 'streak', target: 1 }, quests)).toBe(
      '1 Woche Streak',
    )
  })

  it('Plätze: aktiv und frei', () => {
    expect(activeSlotsText(2, 3)).toBe('2 von 3 Kampagnen aktiv')
    expect(activeSlotsText(0, 3)).toBe('0 von 3 Kampagnen aktiv')
    expect(freeSlotsText(1)).toBe('1 Platz frei')
    expect(freeSlotsText(2)).toBe('2 Plätze frei')
    expect(freeSlotsText(0)).toBe('Kein Platz frei')
  })

  it('choiceSummary: Stufe und ggf. Klasse', () => {
    const body = getBlueprint('body')
    const scholar = getBlueprint('scholar')
    if (!body || !scholar) throw new Error('Vorlagen fehlen')
    expect(choiceSummary(scholar, { level: 'beginner' })).toBe('Einsteiger')
    expect(choiceSummary(body, { level: 'advanced', pathId: 'strength' })).toBe('Fortgeschritten · 🗡️ Krieger')
  })
})
