import { describe, expect, it } from 'vitest'
import { BALANCING } from '../../domain/balancing'
import { makeRestPeriod } from '../../domain/testing'
import { dayScoreRows, hpRuleNotes } from './hpSettingsText'
import {
  EMPTY_REST_FORM,
  restDraftFromValues,
  restDurationText,
  restPeriodGroups,
  restPeriodView,
  restPresets,
  restRangeText,
  restTitle,
  validateRestForm,
} from './restForm'
import type { RestFormContext, RestFormValues } from './restForm'

/** Dienstag, 3. November 2026. */
const TODAY = '2026-11-03'
const YESTERDAY = '2026-11-02'
const CONTEXT: RestFormContext = { today: TODAY, earliest: YESTERDAY, periods: [] }

function form(values: Partial<RestFormValues>): RestFormValues {
  return { ...EMPTY_REST_FORM, ...values }
}

describe('Rast planen: Prüfung', () => {
  it('verlangt den ersten Tag; „bis“ leer = ein einzelner Ruhetag', () => {
    expect(validateRestForm(form({}), CONTEXT)).toEqual({ from: 'Wähle den ersten Tag deiner Rast.' })
    expect(validateRestForm(form({ from: '2026-11-10' }), CONTEXT)).toEqual({})
    expect(restDraftFromValues(form({ from: '2026-11-10', note: '  ' }))).toEqual({ from: '2026-11-10', until: '2026-11-10' })
    expect(restDraftFromValues(form({ from: '2026-11-10', until: '2026-11-14', note: ' Italien ' }))).toEqual({
      from: '2026-11-10',
      until: '2026-11-14',
      note: 'Italien',
    })
  })

  it('meldet ungültige Tage, ein Ende vor dem Beginn und zu lange Rasten', () => {
    expect(validateRestForm(form({ from: '2026-02-30' }), CONTEXT).from).toBe('Bitte gib ein gültiges Datum ein.')
    expect(validateRestForm(form({ from: '2026-11-10', until: '2026-11-09' }), CONTEXT)).toEqual({
      until: 'Eine Rast kann nicht enden, bevor sie beginnt.',
    })
    // 60 Tage gehen, 61 nicht.
    expect(validateRestForm(form({ from: '2026-11-10', until: '2027-01-08' }), CONTEXT)).toEqual({})
    expect(validateRestForm(form({ from: '2026-11-10', until: '2027-01-09' }), CONTEXT)).toEqual({
      until: 'Eine Rast dauert höchstens 60 Tage am Stück.',
    })
  })

  it('erlaubt höchstens gestern rückwirkend (bzw. ab dem frühesten offenen Tag)', () => {
    expect(validateRestForm(form({ from: YESTERDAY }), CONTEXT)).toEqual({})
    expect(validateRestForm(form({ from: '2026-11-01', until: TODAY }), CONTEXT)).toEqual({
      from: 'Eine Rast kannst du höchstens ab gestern rückwirkend eintragen.',
    })
    expect(validateRestForm(form({ from: YESTERDAY }), { ...CONTEXT, earliest: TODAY }).from).toBe(
      'Eine Rast kannst du frühestens ab heute eintragen.',
    )
  })

  it('meldet Überschneidungen mit einer geplanten Rast – angrenzend ist in Ordnung', () => {
    const context = { ...CONTEXT, periods: [makeRestPeriod('r1', '2026-11-09', '2026-11-15')] }
    expect(validateRestForm(form({ from: '2026-11-14', until: '2026-11-20' }), context)).toEqual({
      from: 'An diesen Tagen rastest du schon (9. Nov. – 15. Nov.).',
    })
    expect(validateRestForm(form({ from: '2026-11-16', until: '2026-11-20' }), context)).toEqual({})
    expect(validateRestForm(form({ from: '2026-11-08' }), context)).toEqual({})
  })
})

describe('Rast planen: Vorschläge und Texte', () => {
  it('schlägt heute, morgen, das Wochenende und eine Woche ab morgen vor', () => {
    expect(restPresets(TODAY)).toEqual([
      { label: 'Heute', from: TODAY, until: TODAY },
      { label: 'Morgen', from: '2026-11-04', until: '2026-11-04' },
      { label: 'Wochenende', from: '2026-11-07', until: '2026-11-08' },
      { label: 'Eine Woche ab morgen', from: '2026-11-04', until: '2026-11-10' },
    ])
    // Mit erlaubtem Beginn gestern (Gnadenfrist) zuerst „Gestern“ – für den Krankheitstag; sonst nicht.
    expect(restPresets(TODAY, YESTERDAY)[0]).toEqual({ label: 'Gestern', from: YESTERDAY, until: YESTERDAY })
    expect(restPresets(TODAY, YESTERDAY)).toHaveLength(5)
    expect(restPresets(TODAY, TODAY).map((preset) => preset.label)).not.toContain('Gestern')
    // Samstag: dieses Wochenende; Sonntag: das nächste.
    expect(restPresets('2026-11-07')[2]).toMatchObject({ from: '2026-11-07', until: '2026-11-08' })
    expect(restPresets('2026-11-08')[2]).toMatchObject({ from: '2026-11-14', until: '2026-11-15' })
  })

  it('beschriftet Zeitraum, Dauer und Namen', () => {
    expect(restRangeText({ from: '2026-11-09', until: '2026-11-15' })).toBe('Mo., 9. Nov. – So., 15. Nov.')
    expect(restRangeText({ from: '2026-11-09', until: '2026-11-09' })).toBe('Mo., 9. Nov.')
    expect(restDurationText(1)).toBe('1 Tag')
    expect(restDurationText(7)).toBe('7 Tage')
    expect(restTitle({ from: TODAY, until: TODAY })).toBe('Ruhetag')
    expect(restTitle({ from: TODAY, until: '2026-11-05' })).toBe('Urlaub')
    expect(restTitle({ from: TODAY, until: '2026-11-05', note: 'Italien' })).toBe('Italien')
  })
})

describe('Rast: Liste und mögliche Aktionen', () => {
  it('kommende und heute beginnende lassen sich löschen, laufende ab heute beenden, vergangene nur ansehen', () => {
    expect(restPeriodView(makeRestPeriod('a', '2026-11-04'), TODAY, YESTERDAY)).toMatchObject({
      phase: 'upcoming',
      status: 'Morgen',
      removal: { kind: 'delete' },
    })
    expect(restPeriodView(makeRestPeriod('b', '2026-11-09', '2026-11-15'), TODAY, YESTERDAY)).toMatchObject({
      status: 'In 6 Tagen',
    })
    expect(restPeriodView(makeRestPeriod('c', TODAY), TODAY, YESTERDAY)).toMatchObject({
      phase: 'current',
      status: 'Heute',
      removal: { kind: 'delete' },
    })
    expect(restPeriodView(makeRestPeriod('d', '2026-10-30', '2026-11-06'), TODAY, YESTERDAY)).toMatchObject({
      phase: 'current',
      status: 'Läuft gerade',
      removal: { kind: 'end', until: YESTERDAY },
    })
    // Der Ruhetag gestern liegt noch in der Gnadenfrist: löschbar.
    expect(restPeriodView(makeRestPeriod('e', YESTERDAY), TODAY, YESTERDAY)).toMatchObject({
      phase: 'past',
      status: 'Gestern',
      removal: { kind: 'delete' },
    })
    // Begann vor der Gnadenfrist und ist vorbei: fest.
    const fixed = restPeriodView(makeRestPeriod('f', '2026-10-28', YESTERDAY), TODAY, YESTERDAY)
    expect(fixed).toMatchObject({ phase: 'past', status: 'Gestern' })
    expect(fixed.removal).toBeUndefined()
  })

  it('teilt in „geplant & laufend“ (chronologisch) und „vergangen“ (neueste zuerst)', () => {
    const periods = [
      makeRestPeriod('next', '2026-11-20', '2026-11-27'),
      makeRestPeriod('old', '2026-09-01', '2026-09-03'),
      makeRestPeriod('now', '2026-11-03', '2026-11-05'),
      makeRestPeriod('older', '2026-08-01'),
      makeRestPeriod('yesterday', YESTERDAY),
    ]
    const { active, past } = restPeriodGroups(periods, TODAY, YESTERDAY)
    expect(active.map((view) => view.period.id)).toEqual(['yesterday', 'now', 'next'])
    expect(past.map((view) => view.period.id)).toEqual(['old', 'older'])
  })
})

describe('Lebenspunkte: Erklärung der Tageswertung', () => {
  it('nutzt genau die Zahlen aus BALANCING', () => {
    const rows = dayScoreRows()
    expect(rows.map((row) => row.score)).toEqual(['perfect', 'good', 'weak', 'missed', 'rest', 'none', 'absent'])
    for (const row of rows) expect(row.delta).toBe(BALANCING.hpByScore[row.score])
    expect(rows.map((row) => row.deltaLabel.replaceAll('\u00a0', ' '))).toEqual(['+10 HP', '+2 HP', '−1 HP', '−6 HP', '±0 HP', '±0 HP', '±0 HP'])
    // absentAfterDays = 3 → ab dem 4. Tag in Folge ohne Quest ist Pause.
    expect(rows.find((row) => row.score === 'absent')?.when).toContain('ab dem 4. Tag')
    // Eine Wochenquest allein macht den Tag zu „Ein Anfang“; „Nichts erledigt“ heißt wirklich gar nichts.
    expect(rows.find((row) => row.score === 'weak')?.when).toContain('oder immerhin eine Wochenquest')
    expect(rows.find((row) => row.score === 'missed')?.when).toBe('gar keine Quest erledigt, auch keine Wochenquest')
    // Regeln statt eines offenen Tages: ohne „Noch“, ohne „Schaden“.
    expect(rows.find((row) => row.score === 'missed')?.label).toBe('Nichts erledigt')
    expect(rows.map((row) => row.when).join(' ')).not.toMatch(/Schaden/)
    const notes = hpRuleNotes().join(' ').replaceAll('\u00a0', ' ')
    expect(notes).toContain('höchstens −6 HP')
    expect(notes).toContain(
      'Wochenquests kosten nie Lebenspunkte – sie helfen sogar: Erledigst du an einem Tag statt deiner Tagesquests nur eine Wochenquest, zählt er als „Ein Anfang“ (−1 HP) statt „Nichts erledigt“ (−6 HP).',
    )
    expect(notes).toContain('45 + 5 je Level (Level 1: 50 HP)')
    expect(notes).toContain('15 % deines Goldes, höchstens 100 Gold,')
  })
})
