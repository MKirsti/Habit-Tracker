// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../data/db'
import {
  addRestPeriod,
  createHabit,
  loadGameData,
  resetAllData,
  saveProfile,
  setCompletionValue,
  settleHpDays,
} from '../../data/repository'
import { BALANCING } from '../../domain/balancing'
import { makeRestPeriod } from '../../domain/testing'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { SettingsPage } from '../SettingsPage'

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'
const YESTERDAY: DayKey = '2026-11-02'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  await resetAllData()
})
afterEach(cleanup)

async function setup({ settle = false }: { settle?: boolean } = {}) {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
  const habit = await createHabit(
    { title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'medium', schedule: { type: 'daily' } },
    '2026-10-01',
  )
  await setCompletionValue(habit.id, TODAY, 1)
  // Wie `HpSettler` beim Start: setzt den Beginn der Lebenspunkte (`since`) auf heute.
  if (settle) await settleHpDays(TODAY)
  const user = userEvent.setup()
  const view = renderWithGame(<SettingsPage />, { route: '/einstellungen' })
  await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })
  return { user, view }
}

/** Text mit normalen statt geschützten Leerzeichen (HP-Angaben bleiben zusammen). */
function plain(element: HTMLElement): string {
  return (element.textContent ?? '').replaceAll(' ', ' ')
}

function hpSection(): HTMLElement {
  return screen.getByRole('region', { name: 'Lebenspunkte' })
}

function restSection(): HTMLElement {
  return screen.getByRole('region', { name: 'Rast & Urlaub' })
}

function restList(): HTMLElement {
  return screen.getByRole('region', { name: /^Geplant & laufend/ })
}

function setDate(label: RegExp, value: string) {
  fireEvent.change(within(restSection()).getByLabelText(label), { target: { value } })
}

describe('Einstellungen: Lebenspunkte', () => {
  it('schaltet die Lebenspunkte aus (Sanfter Modus) und wieder an – der Beginn bleibt', async () => {
    const { user } = await setup({ settle: true })
    const section = hpSection()
    const toggle = within(section).getByRole('switch', { name: 'Lebenspunkte' })
    expect(toggle).toBeChecked()
    expect(within(section).getByRole('progressbar', { name: 'Stand jetzt' })).toBeInTheDocument()

    await user.click(toggle)
    await waitFor(async () => expect((await loadGameData()).settings.penalties).toEqual({ enabled: false, since: TODAY }))
    expect(toggle).not.toBeChecked()
    expect(section).toHaveTextContent('Sanfter Modus aktiv – ohne Lebenspunkte, ohne Schaden.')
    expect(toggle).toHaveAccessibleDescription(/^Sanfter Modus: keine Lebenspunkte, kein Schaden, keine Niederlage/)

    await user.click(toggle)
    await waitFor(async () => expect((await loadGameData()).settings.penalties).toEqual({ enabled: true, since: TODAY }))
    expect(toggle).toBeChecked()
  })

  it('erklärt die Tageswertung mit genau den Zahlen aus BALANCING', async () => {
    await setup()
    const section = hpSection()
    const table = within(section).getByRole('table', { name: 'Tageswertung und ihre Wirkung auf die Lebenspunkte' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map(plain)).toEqual([
      'Perfekter Tagalle Tagesquests erledigt+10 HP',
      'Gut geschafftmindestens die Hälfte deiner Tagesquests+2 HP',
      'Ein Anfangweniger als die Hälfte, aber mindestens eine−3 HP',
      'Nichts erledigtkeine Tagesquest erledigt−6 HP',
      'RuhetagRuhetag oder Urlaub – nichts ist Pflicht±0 HP',
      'Keine Tagesquestskeine Tagesquest fällig (etwa nur Wochenquests)±0 HP',
      'Längere Pauseab dem 8. Tag in Folge ohne erledigte Quest – dann ruhen deine Lebenspunkte±0 HP',
    ])
    expect(BALANCING.hpByScore).toMatchObject({ perfect: 10, good: 2, weak: -3, missed: -6 })
    const text = plain(section)
    expect(text).toContain('höchstens −6 HP, egal wie viele Quests und Kampagnen du führst.')
    expect(text).toContain('Wochenquests kosten nie Lebenspunkte.')
    expect(text).toContain('Gestern kannst du noch nachtragen')
    expect(text).toContain('Bei 0 HP verlierst du 15 % deines Goldes')
    expect(text).toContain('Du kannst jederzeit wechseln. Rückwirkend zählt nichts')
    expect(text).toContain('Nach einer Zeit im Sanften Modus startest du wieder mit vollen Lebenspunkten.')
    // Die Wege nach oben und zum Schutz stehen vor der Niederlage.
    expect(text).toContain('Heilung: Ein Perfekter Tag heilt +10 HP')
    expect(text).toContain('Schutz: Krank oder unterwegs? Ein Ruhetag oder Urlaub')
    expect(text.indexOf('Schutz: Krank')).toBeLessThan(text.indexOf('Bei 0 HP'))
  })
})

describe('Einstellungen: direkt zu „Rast & Urlaub“', () => {
  it('springt mit ?bereich=rast zum Abschnitt (aus „Urlaub planen“ auf der Tagesübersicht)', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
    renderWithGame(<SettingsPage />, { route: '/einstellungen?bereich=rast' })
    await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })
    await waitFor(() => expect(restSection()).toHaveFocus())
  })

  it('bietet „Gestern“ als Schnellwahl an – für den Krankheitstag', async () => {
    const { user } = await setup()
    const section = restSection()
    await user.click(within(section).getByRole('button', { name: 'Gestern' }))
    await user.click(within(section).getByRole('button', { name: 'Rast eintragen' }))
    expect(await screen.findByText('Ruhetag eingetragen')).toBeInTheDocument()
    expect((await loadGameData()).restPeriods).toMatchObject([{ from: YESTERDAY, until: YESTERDAY }])
  })
})

describe('Einstellungen: Rast & Urlaub', () => {
  it('plant einen Urlaub mit Notiz – Vorschau, Toast, Liste, leeres Formular', async () => {
    const { user } = await setup()
    const section = restSection()
    expect(restList()).toHaveTextContent('Noch keine Rast geplant.')

    setDate(/^Von/, '2026-11-09')
    setDate(/^Bis/, '2026-11-15')
    await user.type(within(section).getByRole('textbox', { name: /^Notiz/ }), 'Urlaub in Italien')
    expect(section).toHaveTextContent('Urlaub · 7 Tage · Mo., 9. Nov. – So., 15. Nov.')
    await user.click(within(section).getByRole('button', { name: 'Rast eintragen' }))

    await waitFor(async () =>
      expect((await loadGameData()).restPeriods).toEqual([
        expect.objectContaining({ from: '2026-11-09', until: '2026-11-15', note: 'Urlaub in Italien' }),
      ]),
    )
    expect(await screen.findByText('Urlaub eingetragen')).toBeInTheDocument()
    // Die Liste folgt den Live-Daten – unter Last ggf. erst nach dem Toast.
    const row = await within(restList()).findByRole('listitem')
    expect(row).toHaveTextContent('Urlaub in Italien')
    expect(row).toHaveTextContent('In 6 Tagen')
    expect(row).toHaveTextContent('Mo., 9. Nov. – So., 15. Nov. · 7 Tage')
    expect(within(section).getByLabelText(/^Von/)).toHaveValue('')
    expect(within(section).getByRole('textbox', { name: /^Notiz/ })).toHaveValue('')
  })

  it('behält den Fokus nach „Rast eintragen“ auf dem Knopf (nicht auf <body>)', async () => {
    const { user } = await setup()
    const section = restSection()
    await user.click(within(section).getByRole('button', { name: 'Morgen' }))
    const submit = within(section).getByRole('button', { name: 'Rast eintragen' })
    submit.focus()
    fireEvent.click(submit)
    // Während des Speicherns ist der Knopf gesperrt – Chrome setzt den Fokus dabei auf <body> (jsdom nicht: nachstellen).
    expect(submit).toBeDisabled()
    const sink = document.createElement('button')
    document.body.append(sink)
    sink.focus()
    sink.remove()
    expect(document.activeElement).toBe(document.body)
    expect(await screen.findByText('Ruhetag eingetragen')).toBeInTheDocument()
    await waitFor(() => expect(submit).toHaveFocus())
  })

  it('trägt per Vorschlag „Morgen“ einen einzelnen Ruhetag ein', async () => {
    const { user } = await setup()
    const section = restSection()
    await user.click(within(section).getByRole('button', { name: 'Morgen' }))
    expect(within(section).getByRole('button', { name: 'Morgen' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(section).getByLabelText(/^Bis/)).toHaveValue('')
    await user.click(within(section).getByRole('button', { name: 'Rast eintragen' }))
    await waitFor(async () =>
      expect((await loadGameData()).restPeriods).toEqual([expect.objectContaining({ from: '2026-11-04', until: '2026-11-04' })]),
    )
    expect(await screen.findByText('Ruhetag eingetragen')).toBeInTheDocument()
    expect(await within(restList()).findByRole('listitem')).toHaveTextContent(/Ruhetag\s*Morgen/)
  })

  it('prüft das Formular mit deutschen Meldungen am Feld – ungültig wird nichts gespeichert', async () => {
    await addRestPeriod({ from: '2026-11-09', until: '2026-11-15' }, TODAY)
    const { user } = await setup()
    const section = restSection()
    const submit = within(section).getByRole('button', { name: 'Rast eintragen' })
    const from = within(section).getByLabelText(/^Von/)
    const until = within(section).getByLabelText(/^Bis/)

    await user.click(submit)
    expect(from).toHaveAccessibleDescription('Wähle den ersten Tag deiner Rast.')
    expect(from).toHaveFocus()

    setDate(/^Von/, '2026-11-01')
    expect(from).toHaveAccessibleDescription('Eine Rast kannst du höchstens ab gestern rückwirkend eintragen.')

    setDate(/^Von/, '2026-11-20')
    setDate(/^Bis/, '2026-11-18')
    expect(until).toHaveAccessibleDescription(/Eine Rast kann nicht enden, bevor sie beginnt\./)

    setDate(/^Bis/, '2027-01-30')
    expect(until).toHaveAccessibleDescription(/Eine Rast dauert höchstens 60 Tage am Stück\./)

    setDate(/^Von/, '2026-11-14')
    setDate(/^Bis/, '2026-11-16')
    expect(from).toHaveAccessibleDescription('An diesen Tagen rastest du schon (9. Nov. – 15. Nov.).')
    await user.click(submit)
    expect((await loadGameData()).restPeriods).toHaveLength(1)

    // Angrenzend ist in Ordnung.
    setDate(/^Von/, '2026-11-16')
    await user.click(submit)
    await waitFor(async () => expect((await loadGameData()).restPeriods).toHaveLength(2))
  })

  it('löscht eine geplante Rast nach Rückfrage', async () => {
    await addRestPeriod({ from: '2026-11-09', until: '2026-11-15', note: 'Italien' }, TODAY)
    const { user } = await setup()
    await user.click(within(restList()).getByRole('button', { name: 'Italien (Mo., 9. Nov. – So., 15. Nov.) löschen' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Urlaub löschen?' })
    expect(dialog).toHaveTextContent('„Italien“ (Mo., 9. Nov. – So., 15. Nov.) wird gelöscht.')
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }))
    await waitFor(async () => expect((await loadGameData()).restPeriods).toBeUndefined())
    expect(await screen.findByText('Urlaub gelöscht')).toBeInTheDocument()
    await waitFor(() => expect(restList()).toHaveTextContent('Noch keine Rast geplant.'))
  })

  it('beendet eine laufende Rast ab heute – gestern bleibt geschützt', async () => {
    await addRestPeriod({ from: YESTERDAY, until: '2026-11-06' }, TODAY)
    const { user } = await setup()
    const row = within(restList()).getByRole('listitem')
    expect(row).toHaveTextContent('Läuft gerade')
    await user.click(within(row).getByRole('button', { name: 'Urlaub (Mo., 2. Nov. – Fr., 6. Nov.) ab heute beenden' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Rast ab heute beenden?' })
    expect(dialog).toHaveTextContent('Deine Rast endet dann gestern (Mo., 2. Nov.), gestern bleibt geschützt.')
    await user.click(within(dialog).getByRole('button', { name: 'Ab heute beenden' }))

    await waitFor(async () =>
      expect((await loadGameData()).restPeriods).toEqual([expect.objectContaining({ from: YESTERDAY, until: YESTERDAY })]),
    )
    expect(await screen.findByText('Willkommen zurück!')).toBeInTheDocument()
    // Der verbliebene Ruhetag gestern liegt noch in der Gnadenfrist und lässt sich löschen.
    await waitFor(() => expect(within(restList()).getByRole('listitem')).toHaveTextContent(/Ruhetag\s*Gestern/))
    const remaining = within(restList()).getByRole('listitem')
    expect(within(remaining).getByRole('button', { name: 'Ruhetag (Mo., 2. Nov.) löschen' })).toBeInTheDocument()
  })

  it('zeigt vergangene, abgerechnete Rasttage nur zum Ansehen', async () => {
    await db.restPeriods.add(makeRestPeriod('old', '2026-10-10', '2026-10-12', { note: 'Wandern' }))
    const { user } = await setup()
    expect(restList()).toHaveTextContent('Noch keine Rast geplant.')
    await user.click(within(restList()).getByRole('button', { name: 'Vergangene anzeigen (1)' }))
    const past = within(restList()).getByRole('list', { name: 'Vergangene Rasttage' })
    const row = within(past).getByRole('listitem')
    expect(row).toHaveTextContent('Wandern')
    expect(row).toHaveTextContent('Vorbei')
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  })
})
