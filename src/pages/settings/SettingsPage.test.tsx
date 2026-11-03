// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, parseBackup } from '../../data/backup'
import { createHabit, loadGameData, resetAllData, saveProfile, setCompletionValue } from '../../data/repository'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { SettingsPage } from '../SettingsPage'
import { formatExportDate, summarizeBackup } from './backupFiles'
import { dayStartLabel, matchesConfirmWord } from './settingsText'

// restoreBackup kann gezielt fehlschlagen, sonst gilt die echte Implementierung.
const failures = vi.hoisted(() => ({ restoreBackup: false }))
vi.mock('../../data/backup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/backup')>()
  return {
    ...actual,
    restoreBackup: async (...args: Parameters<typeof actual.restoreBackup>) => {
      if (failures.restoreBackup) throw new Error('Die Datenbank ist gerade nicht erreichbar.')
      return actual.restoreBackup(...args)
    },
  }
})

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'

const READING = {
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
} as const

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  failures.restoreBackup = false
  await resetAllData()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function setup() {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
  const habit = await createHabit({ ...READING }, '2026-10-01')
  await setCompletionValue(habit.id, TODAY, 1)
  const user = userEvent.setup()
  const view = renderWithGame(<SettingsPage />, { route: '/einstellungen' })
  await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })
  return { user, view }
}

/** Datei für den Backup-Import. */
function jsonFile(content: string, name = 'backup.json') {
  return new File([content], name, { type: 'application/json' })
}

describe('Einstellungen', () => {
  it('ändert den Tageswechsel', async () => {
    const { user } = await setup()
    const select = screen.getByRole('combobox', { name: 'Ein neuer Tag beginnt um' })
    expect(select).toHaveDisplayValue('4:00 Uhr (Standard)')
    expect(within(select).getAllByRole('option')).toHaveLength(13)
    expect(screen.getByText(/Bis dahin zählt die Nacht noch zum Vortag/)).toBeInTheDocument()

    await user.selectOptions(select, '0')
    expect(select).toHaveDisplayValue('0:00 Uhr (Mitternacht)')
    await waitFor(async () => expect((await loadGameData()).settings.dayStartHour).toBe(0))
    expect(screen.getByText('Dienstag, 3. November 2026')).toBeInTheDocument()
  })

  it('schaltet Effekte & Animationen aus und wieder an', async () => {
    const { user } = await setup()
    const toggle = screen.getByRole('switch', { name: 'Effekte anzeigen' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await waitFor(async () => expect((await loadGameData()).settings.effects).toBe(false))
    await user.click(toggle)
    await waitFor(async () => expect((await loadGameData()).settings.effects).toBe(true))
  })

  it('zeigt nach einer Änderung von außen (Backup) wieder den gespeicherten Wert', async () => {
    const { user } = await setup()
    // Backup mit dem Standard: Effekte an, Tageswechsel 4 Uhr.
    const backup = await createBackup(new Date(2026, 10, 3, 11, 0))
    const toggle = screen.getByRole('switch', { name: 'Effekte anzeigen' })
    const select = screen.getByRole('combobox', { name: 'Ein neuer Tag beginnt um' })

    await user.click(toggle)
    await user.selectOptions(select, '6')
    await waitFor(async () => expect((await loadGameData()).settings).toEqual({ dayStartHour: 6, effects: false }))

    await user.upload(screen.getByTestId('backup-file-input'), jsonFile(JSON.stringify(backup)))
    const dialog = await screen.findByRole('alertdialog', { name: 'Backup wiederherstellen?' })
    await user.click(within(dialog).getByRole('button', { name: 'Wiederherstellen' }))
    await waitFor(async () => expect((await loadGameData()).settings).toEqual({ dayStartHour: 4, effects: true }))

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(select).toHaveDisplayValue('4:00 Uhr (Standard)')
  })

  it('lädt ein gültiges Backup als JSON-Datei herunter', async () => {
    const { user } = await setup()
    const blobs: Blob[] = []
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:questlog-test'
    })
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true })
    const clicked: { href: string; download: string; connected: boolean }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download, connected: this.isConnected })
    })

    await user.click(screen.getByRole('button', { name: 'Backup herunterladen' }))

    expect(await screen.findByText('Backup heruntergeladen')).toBeInTheDocument()
    expect(clicked).toEqual([{ href: 'blob:questlog-test', download: 'questlog-backup-2026-11-03.json', connected: true }])
    // Der temporäre Link ist wieder entfernt.
    expect(document.querySelector('a[download]')).toBeNull()
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe('application/json')

    const parsed = parseBackup(await blobs[0].text())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.data.profile?.name).toBe('Aria')
    expect(parsed.backup.data.habits.map((habit) => habit.title)).toEqual(['Lesen'])
    expect(parsed.backup.data.completions).toHaveLength(1)

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:questlog-test'), { timeout: 3000 })
  })

  it('meldet ungültige Backup-Dateien und ändert nichts', async () => {
    const { user } = await setup()
    const input = screen.getByTestId('backup-file-input')

    await user.upload(input, jsonFile('{kaputt', 'kaputt.json'))
    expect(await screen.findByText('Backup konnte nicht gelesen werden')).toBeInTheDocument()
    expect(screen.getByText('Die Datei enthält kein gültiges JSON.')).toBeInTheDocument()

    await user.upload(input, jsonFile(JSON.stringify({ app: 'etwas-anderes', data: {} }), 'fremd.json'))
    expect(await screen.findByText('Diese Datei ist kein Questlog-Backup.')).toBeInTheDocument()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect((await loadGameData()).profile?.name).toBe('Aria')
  })

  it('stellt ein gültiges Backup nach Rückfrage mit Zusammenfassung wieder her', async () => {
    // Backup eines anderen Spielstands vorbereiten …
    await saveProfile({ name: 'Borin', avatar: '🐺', createdDay: '2026-09-01' })
    const first = await createHabit({ ...READING, title: 'Laufen' }, '2026-09-01')
    await createHabit({ ...READING, title: 'Meditieren' }, '2026-09-01')
    await setCompletionValue(first.id, '2026-09-02', 1)
    await setCompletionValue(first.id, '2026-09-03', 1)
    await setCompletionValue(first.id, '2026-09-04', 1)
    const backup = await createBackup(new Date(2026, 9, 30, 18, 30))
    await resetAllData()

    // … und mit dem aktuellen Spielstand die Seite öffnen.
    const { user } = await setup()
    await user.upload(screen.getByTestId('backup-file-input'), jsonFile(JSON.stringify(backup)))

    const dialog = await screen.findByRole('alertdialog', { name: 'Backup wiederherstellen?' })
    // Vorgelesen wird die kurze Warnung – die Zusammenfassung steht im (scrollbaren) Inhalt des Dialogs,
    // nicht im Kopf. Sonst schiebt sie im Querformat die Buttons aus dem sichtbaren Bereich.
    expect(dialog).toHaveAccessibleDescription(
      'Achtung: Alle aktuellen Daten auf diesem Gerät werden durch das Backup ersetzt.',
    )
    const row = (label: string) => within(dialog).getByText(label).closest('div') as HTMLElement
    expect(row('Held')).toHaveTextContent('Borin')
    expect(row('Quests')).toHaveTextContent('2')
    expect(row('Erledigungen')).toHaveTextContent('3')
    expect(row('Kampagnen')).toHaveTextContent('0')
    expect(row('Exportiert am')).toHaveTextContent(formatExportDate(backup.exportedAt))
    expect(within(dialog).getByText(/Alle aktuellen Daten auf diesem Gerät werden/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Wiederherstellen' }))

    await waitFor(async () => expect((await loadGameData()).profile?.name).toBe('Borin'))
    const data = await loadGameData()
    expect(data.habits.map((habit) => habit.title)).toEqual(['Laufen', 'Meditieren'])
    expect(data.completions).toHaveLength(3)
    expect(await screen.findByText('Backup wiederhergestellt')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('lässt die Rückfrage offen, wenn das Wiederherstellen fehlschlägt', async () => {
    const backup = await createBackup(new Date(2026, 9, 30, 18, 30))
    const { user } = await setup()
    failures.restoreBackup = true
    await user.upload(screen.getByTestId('backup-file-input'), jsonFile(JSON.stringify(backup)))
    const dialog = await screen.findByRole('alertdialog', { name: 'Backup wiederherstellen?' })
    const confirm = within(dialog).getByRole('button', { name: 'Wiederherstellen' })
    await user.click(confirm)

    expect(await screen.findByText('Wiederherstellen fehlgeschlagen')).toBeInTheDocument()
    expect(screen.getByText('Die Datenbank ist gerade nicht erreichbar.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog', { name: 'Backup wiederherstellen?' })).toBe(dialog)
    expect(confirm).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeEnabled()
    expect((await loadGameData()).profile?.name).toBe('Aria')

    // Ein zweiter Versuch klappt.
    failures.restoreBackup = false
    await user.click(confirm)
    await waitFor(async () => expect((await loadGameData()).profile).toBeUndefined())
    expect(await screen.findByText('Backup wiederhergestellt')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('bricht das Wiederherstellen auf Wunsch ab', async () => {
    const backup = await createBackup(new Date(2026, 9, 30, 18, 30))
    const { user } = await setup()
    await user.upload(screen.getByTestId('backup-file-input'), jsonFile(JSON.stringify(backup)))
    const dialog = await screen.findByRole('alertdialog', { name: 'Backup wiederherstellen?' })
    expect(within(dialog).getByText('kein Held angelegt')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect((await loadGameData()).profile?.name).toBe('Aria')
  })

  it('setzt erst nach Eintippen von „LÖSCHEN“ alles zurück', async () => {
    const { user, view } = await setup()
    // Eigener Abschnitt der Seite (nicht Teil von „Daten & Gerät“).
    expect(screen.getByRole('region', { name: 'Gefahrenzone' })).toContainElement(
      screen.getByRole('heading', { level: 2, name: 'Gefahrenzone' }),
    )
    await user.click(screen.getByRole('button', { name: 'Alles zurücksetzen' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Wirklich alles löschen?' })
    const confirm = within(dialog).getByRole('button', { name: 'Endgültig löschen' })
    const input = within(dialog).getByRole('textbox', { name: /zur Bestätigung/ })
    // Sicherer Start: Fokus auf „Abbrechen“.
    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toHaveFocus()
    expect(confirm).toBeDisabled()

    await user.type(input, 'LÖSCH')
    expect(confirm).toBeDisabled()
    await user.type(input, 'EN')
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    await waitFor(async () => {
      const data = await loadGameData()
      expect(data.profile).toBeUndefined()
      expect(data.habits).toEqual([])
      expect(data.completions).toEqual([])
    })
    expect(view.router.state.location.pathname).toBe('/')
    expect(await screen.findByText('Alles zurückgesetzt')).toBeInTheDocument()
  })

  it('schließt die Rückfrage zum Zurücksetzen ohne zu löschen', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Alles zurücksetzen' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Wirklich alles löschen?' })
    await user.type(within(dialog).getByRole('textbox', { name: /zur Bestätigung/ }), 'LÖSCHEN')
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect((await loadGameData()).profile?.name).toBe('Aria')

    // Beim nächsten Öffnen ist das Feld wieder leer.
    await user.click(screen.getByRole('button', { name: 'Alles zurücksetzen' }))
    const again = await screen.findByRole('alertdialog', { name: 'Wirklich alles löschen?' })
    expect(within(again).getByRole('textbox', { name: /zur Bestätigung/ })).toHaveValue('')
  })

  it('zeigt Installationshinweise und den Fuß mit Version', async () => {
    await setup()
    expect(screen.getByText('iPhone & iPad (Safari)')).toBeInTheDocument()
    expect(screen.getByText('Android (Chrome)')).toBeInTheDocument()
    expect(screen.getByText(/Zum Home-Bildschirm/)).toBeInTheDocument()
    expect(screen.getByText(/App installieren“/)).toBeInTheDocument()
    expect(screen.getByText('Questlog · Version 0.1 (MVP)')).toBeInTheDocument()
    expect(screen.getByText('Deine Daten verlassen nie dein Gerät.')).toBeInTheDocument()
  })
})

describe('Hilfsfunktionen der Einstellungen', () => {
  it('beschriftet die Uhrzeiten für den Tageswechsel', () => {
    expect(dayStartLabel(0)).toBe('0:00 Uhr (Mitternacht)')
    expect(dayStartLabel(4)).toBe('4:00 Uhr (Standard)')
    expect(dayStartLabel(7)).toBe('7:00 Uhr')
    expect(dayStartLabel(12)).toBe('12:00 Uhr (Mittag)')
  })

  it('akzeptiert das Bestätigungswort unabhängig von Groß-/Kleinschreibung', () => {
    expect(matchesConfirmWord('LÖSCHEN')).toBe(true)
    expect(matchesConfirmWord(' löschen ')).toBe(true)
    // Zerlegtes „ö“ (o + Trema), wie es manche Tastaturen liefern.
    expect(matchesConfirmWord('löschen')).toBe(true)
    expect(matchesConfirmWord('LOESCHEN')).toBe(false)
    expect(matchesConfirmWord('')).toBe(false)
  })

  it('fasst ein Backup zusammen', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    await createHabit({ ...READING }, TODAY)
    const summary = summarizeBackup(await createBackup(new Date(2026, 10, 3, 14, 5)))
    expect(summary).toMatchObject({ heroName: 'Aria', avatar: '🧙', quests: 1, completions: 0, campaigns: 0 })
    expect(summary.exportedAt).toMatch(/^3\. Nov\. 2026/)
    expect(summary.exportedAt).toMatch(/14:05 Uhr$/)
    expect(formatExportDate('kein Datum')).toBe('kein Datum')
  })
})
