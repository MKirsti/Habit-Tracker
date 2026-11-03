// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup } from '../../data/backup'
import * as repository from '../../data/repository'
import { createScholarCampaign } from '../../data/seed'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { OnboardingPage } from '../OnboardingPage'

// saveProfile kann gezielt fehlschlagen, sonst gilt die echte Implementierung. Der Start des Abenteuers
// (`startAdventure` in seed.ts) speichert das Profil über saveProfile – in derselben Transaktion wie die Vorlage.
const failures = vi.hoisted(() => ({ saveProfile: false }))
vi.mock('../../data/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/repository')>()
  return {
    ...actual,
    saveProfile: async (...args: Parameters<typeof actual.saveProfile>) => {
      if (failures.saveProfile) throw new Error('Die Datenbank ist gerade nicht erreichbar.')
      return actual.saveProfile(...args)
    },
  }
})

const { createHabit, loadGameData, resetAllData, saveProfile } = repository

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  // Nur die Uhr anhalten – Timer (IndexedDB, userEvent) laufen normal weiter.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
  // Der Schrittwechsel scrollt nach oben; jsdom implementiert scrollTo nicht.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  failures.saveProfile = false
  await resetAllData()
})
afterEach(cleanup)

async function start() {
  const user = userEvent.setup()
  renderWithGame(<OnboardingPage />)
  await screen.findByRole('heading', { level: 1, name: 'Willkommen' })
  return user
}

async function toHeroStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Abenteuer beginnen' }))
  return screen.findByRole('heading', { level: 1, name: 'Erschaffe deinen Helden' })
}

async function toCampaignStep(user: ReturnType<typeof userEvent.setup>, name = 'Aria') {
  await toHeroStep(user)
  await user.type(screen.getByRole('textbox', { name: /^Name/ }), name)
  await user.click(screen.getByRole('button', { name: 'Weiter' }))
  return screen.findByRole('heading', { level: 1, name: 'Wähle deine erste Kampagne' })
}

describe('Onboarding', () => {
  it('führt mit der Vorlage durch alle drei Schritte und legt Kampagne und Held an', async () => {
    const user = await start()
    const steps = screen.getByRole('list', { name: 'Fortschritt der Einrichtung' })
    expect(within(steps).getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Schritt 1 von 3')).toBeInTheDocument()

    const heroHeading = await toHeroStep(user)
    // Der neue Schritt wird angesagt: Fokus auf der Überschrift.
    expect(heroHeading).toHaveFocus()
    expect(within(steps).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step')

    await user.type(screen.getByRole('textbox', { name: /^Name/ }), '  Aria Sturmfeder  ')
    await user.click(screen.getByRole('radio', { name: 'Elfe' }))
    expect(screen.getByRole('radio', { name: 'Elfe' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Magier' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Weiter' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Wähle deine erste Kampagne' })).toHaveFocus()
    // Die Vorlage ist empfohlen und vorausgewählt.
    expect(screen.getByRole('radio', { name: 'Der Weg des Gelehrten' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Ohne Vorlage starten' })).not.toBeChecked()
    expect(screen.getByText('Empfohlen')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))

    await waitFor(async () => {
      expect((await loadGameData()).profile).toEqual({ name: 'Aria Sturmfeder', avatar: '🧝', createdDay: TODAY })
    })
    const data = await loadGameData()
    expect(data.mainQuests).toHaveLength(1)
    expect(data.mainQuests[0]).toMatchObject({ title: 'Der Weg des Gelehrten', startDay: TODAY })
    expect(data.habits).toHaveLength(5)
    expect(data.habits.every((habit) => habit.createdDay === TODAY && habit.mainQuestId === data.mainQuests[0].id)).toBe(
      true,
    )
  })

  it('zeigt in der Vorschau genau die Quests und Kapitel der echten Vorlage', async () => {
    const user = await start()
    await toCampaignStep(user)
    const { mainQuest, habits } = createScholarCampaign(TODAY)
    for (const habit of habits) expect(screen.getByText(habit.title)).toBeInTheDocument()
    for (const chapter of mainQuest.chapters) expect(screen.getByText(chapter.title)).toBeInTheDocument()
    expect(screen.getByText(`${habits.length} Quests`)).toBeInTheDocument()
    expect(screen.getByText(`${mainQuest.chapters.length} Kapitel`)).toBeInTheDocument()
  })

  it('startet ohne Vorlage mit leerem Questlog', async () => {
    const user = await start()
    await toCampaignStep(user, 'Borin')
    await user.click(screen.getByRole('radio', { name: 'Ohne Vorlage starten' }))
    expect(screen.getByRole('radio', { name: 'Der Weg des Gelehrten' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))

    await waitFor(async () => {
      expect((await loadGameData()).profile).toEqual({ name: 'Borin', avatar: '🧙', createdDay: TODAY })
    })
    const data = await loadGameData()
    expect(data.habits).toEqual([])
    expect(data.mainQuests).toEqual([])
  })

  it('verlangt einen Namen, bevor es weitergeht', async () => {
    const user = await start()
    await toHeroStep(user)
    const nameInput = screen.getByRole('textbox', { name: /^Name/ })
    expect(nameInput).toHaveAttribute('maxlength', '30')

    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.getByText('Bitte gib deinem Helden einen Namen.')).toBeInTheDocument()
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput).toHaveFocus()
    expect(screen.getByRole('heading', { level: 1, name: 'Erschaffe deinen Helden' })).toBeInTheDocument()

    // Nur Leerzeichen zählen nicht als Name.
    await user.type(nameInput, '   ')
    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.getByText('Bitte gib deinem Helden einen Namen.')).toBeInTheDocument()

    // Nach dem Korrigieren verschwindet der Fehler sofort.
    await user.type(nameInput, 'Aria')
    expect(screen.queryByText('Bitte gib deinem Helden einen Namen.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Wähle deine erste Kampagne' })).toBeInTheDocument()
    expect((await loadGameData()).profile).toBeUndefined()
  })

  it('behält die Eingaben beim Zurückgehen', async () => {
    const user = await start()
    await toCampaignStep(user, 'Aria')
    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Erschaffe deinen Helden' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('Aria')
    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zurück' })).not.toBeInTheDocument()
  })

  it('übernimmt ein eigenes Emoji als Avatar', async () => {
    const user = await start()
    await toHeroStep(user)
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Okto')
    const more = screen.getByRole('button', { name: 'Weitere Avatare & eigenes Emoji' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    await user.type(screen.getByLabelText('Eigenes Emoji'), '🐙')
    // Kein Schnellauswahl-Avatar ist mehr gewählt.
    expect(screen.getByRole('radio', { name: 'Magier' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Eigener Avatar gewählt' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    await screen.findByRole('heading', { level: 1, name: 'Wähle deine erste Kampagne' })
    await user.click(screen.getByRole('radio', { name: 'Ohne Vorlage starten' }))
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))
    await waitFor(async () => {
      expect((await loadGameData()).profile?.avatar).toBe('🐙')
    })
  })

  it('zeigt Fehler als Toast und legt die Kampagne beim erneuten Versuch nicht doppelt an', async () => {
    failures.saveProfile = true
    const user = await start()
    await toCampaignStep(user)
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))
    expect(await screen.findByText('Dein Abenteuer konnte nicht beginnen')).toBeInTheDocument()
    expect(screen.getByText('Die Datenbank ist gerade nicht erreichbar.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Los geht’s' })).toBeEnabled()
    // Alles oder nichts: Ohne Profil bleibt auch keine Kampagne zurück (auch nicht nach einem Neuladen).
    expect(await loadGameData()).toMatchObject({ habits: [], mainQuests: [] })

    failures.saveProfile = false
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))
    await waitFor(async () => {
      expect((await loadGameData()).profile?.name).toBe('Aria')
    })
    const data = await loadGameData()
    expect(data.mainQuests).toHaveLength(1)
    expect(data.habits).toHaveLength(5)
  })

  it('startet nach einem Fehlschlag mit der Vorlage auf Wunsch wirklich ohne Vorlage', async () => {
    failures.saveProfile = true
    const user = await start()
    await toCampaignStep(user)
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))
    expect(await screen.findByText('Dein Abenteuer konnte nicht beginnen')).toBeInTheDocument()

    failures.saveProfile = false
    await user.click(screen.getByRole('radio', { name: 'Ohne Vorlage starten' }))
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))
    await waitFor(async () => {
      expect((await loadGameData()).profile?.name).toBe('Aria')
    })
    const data = await loadGameData()
    expect(data.mainQuests).toEqual([])
    expect(data.habits).toEqual([])
  })

  it('stellt auf Wunsch ein Backup wieder her', async () => {
    await saveProfile({ name: 'Borin', avatar: '🐺', createdDay: '2026-09-01' })
    await createHabit(
      { title: 'Laufen', icon: '🏃', attribute: 'strength', difficulty: 'hard', schedule: { type: 'daily' } },
      '2026-09-01',
    )
    const backup = await createBackup(new Date(2026, 9, 30, 18, 30))
    await resetAllData()

    const user = await start()
    const file = new File([JSON.stringify(backup)], 'questlog-backup.json', { type: 'application/json' })
    await user.upload(screen.getByTestId('backup-file-input'), file)

    const dialog = await screen.findByRole('alertdialog', { name: 'Backup wiederherstellen?' })
    expect(within(dialog).getByText('Borin')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Wiederherstellen' }))

    await waitFor(async () => {
      expect((await loadGameData()).profile).toEqual({ name: 'Borin', avatar: '🐺', createdDay: '2026-09-01' })
    })
    expect((await loadGameData()).habits.map((habit) => habit.title)).toEqual(['Laufen'])
    expect(await screen.findByText('Backup wiederhergestellt')).toBeInTheDocument()
  })
})
