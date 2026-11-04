// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup } from '../../data/backup'
import * as repository from '../../data/repository'
import { createScholarCampaign } from '../../data/seed'
import { BLUEPRINTS } from '../../data/blueprints'
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
  return screen.findByRole('heading', { level: 1, name: 'Erschaffe deinen Charakter' })
}

async function toCampaignStep(user: ReturnType<typeof userEvent.setup>, name = 'Aria') {
  await toHeroStep(user)
  await user.type(screen.getByRole('textbox', { name: /^Name/ }), name)
  await user.click(screen.getByRole('button', { name: 'Weiter' }))
  return screen.findByRole('heading', { level: 1, name: 'Wähle deine erste Kampagne' })
}

type User = ReturnType<typeof userEvent.setup>

/** Vorlage in der Bibliothek öffnen (Einrichtungsdialog). */
async function openBlueprint(user: User, title: string) {
  await user.click(screen.getByRole('button', { name: title }))
  return screen.findByRole('dialog', { name: title })
}

/** „Der Weg des Gelehrten“ (Einsteiger) auswählen. */
async function chooseScholar(user: User) {
  const dialog = await openBlueprint(user, 'Der Weg des Gelehrten')
  await user.click(within(dialog).getByRole('button', { name: 'Auswählen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

function summary() {
  return screen.getByRole('region', { name: 'Deine Wahl' })
}

describe('Onboarding', () => {
  it('führt mit einer Vorlage aus der Bibliothek durch alle drei Schritte und legt Kampagne und Held an', async () => {
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
    // Nichts ist vorausgewählt – die Bibliothek zeigt alle Vorlagen, dazu „Ohne Vorlage starten“.
    for (const blueprint of BLUEPRINTS) {
      expect(screen.getByRole('heading', { level: 2, name: blueprint.title })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Ohne Vorlage starten' })).toHaveAttribute('aria-pressed', 'false')
    expect(summary()).toHaveTextContent('Noch keine Wahl')
    expect(screen.getByText(/bis zu 3 gleichzeitig/)).toBeInTheDocument()

    await chooseScholar(user)
    expect(summary()).toHaveTextContent('Der Weg des Gelehrten')
    expect(summary()).toHaveTextContent('Einsteiger · 5 Quests · 6 Kapitel')
    expect(screen.getByRole('button', { name: 'Der Weg des Gelehrten' })).toHaveAccessibleDescription(
      expect.stringContaining('Ausgewählt'),
    )

    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))

    await waitFor(async () => {
      expect((await loadGameData()).profile).toEqual({ name: 'Aria Sturmfeder', avatar: '🧝', createdDay: TODAY, form: 'neutral' })
    })
    const data = await loadGameData()
    expect(data.mainQuests).toHaveLength(1)
    expect(data.mainQuests[0]).toMatchObject({
      title: 'Der Weg des Gelehrten',
      startDay: TODAY,
      blueprint: { id: 'scholar', level: 'beginner' },
    })
    expect(data.habits).toHaveLength(5)
    expect(data.habits.every((habit) => habit.createdDay === TODAY && habit.mainQuestId === data.mainQuests[0].id)).toBe(
      true,
    )
  })

  it('zeigt in der Vorschau genau die Quests und Kapitel der echten Vorlage', async () => {
    const user = await start()
    await toCampaignStep(user)
    const dialog = await openBlueprint(user, 'Der Weg des Gelehrten')
    const { mainQuest, habits } = createScholarCampaign(TODAY)
    for (const habit of habits) expect(within(dialog).getByText(habit.title)).toBeInTheDocument()
    for (const chapter of mainQuest.chapters) expect(within(dialog).getByText(chapter.title)).toBeInTheDocument()
  })

  it('verlangt beim Sport die Klassenwahl und legt den Pfad des Kriegers samt Held an', async () => {
    const user = await start()
    await toCampaignStep(user, 'Brakka')
    let dialog = await openBlueprint(user, 'Der Weg des Körpers')
    // Ohne Klasse geht es nicht weiter.
    await user.click(within(dialog).getByRole('button', { name: 'Auswählen' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Bitte wähle deine Klasse')
    expect(screen.getByRole('dialog', { name: 'Der Weg des Körpers' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('radio', { name: /Krieger/ }))
    await user.click(within(dialog).getByRole('radio', { name: /Fortgeschritten/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Auswählen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Die Wahl steht auf der Karte und in der Zusammenfassung vor „Los geht’s“.
    expect(screen.getByRole('button', { name: 'Der Weg des Körpers' })).toHaveAccessibleDescription(
      expect.stringContaining('Fortgeschritten · 🗡️ Krieger'),
    )
    expect(summary()).toHaveTextContent('Der Pfad des Kriegers')
    expect(summary()).toHaveTextContent('Fortgeschritten · 🗡️ Krieger')

    // Erneutes Öffnen zeigt die bisherige Wahl.
    dialog = await openBlueprint(user, 'Der Weg des Körpers')
    expect(within(dialog).getByRole('radio', { name: /Krieger/ })).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))
    await waitFor(async () => {
      expect((await loadGameData()).profile).toEqual({ name: 'Brakka', avatar: '🧙', createdDay: TODAY, form: 'neutral' })
    })
    const data = await loadGameData()
    expect(data.mainQuests).toHaveLength(1)
    expect(data.mainQuests[0]).toMatchObject({
      title: 'Der Pfad des Kriegers',
      startDay: TODAY,
      blueprint: { id: 'body', level: 'advanced', pathId: 'strength' },
    })
    expect(data.habits.map((habit) => habit.title)).toContain('Krafttraining')
    expect(data.habits.every((habit) => habit.mainQuestId === data.mainQuests[0].id)).toBe(true)
  })

  it('verlangt eine Wahl, bevor das Abenteuer beginnt', async () => {
    const user = await start()
    await toCampaignStep(user)
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))
    expect(within(summary()).getByRole('alert')).toHaveTextContent('Wähle eine Vorlage – oder starte ohne Vorlage.')
    expect(screen.getByRole('button', { name: 'Los geht’s' })).toHaveAccessibleDescription(
      'Wähle eine Vorlage – oder starte ohne Vorlage.',
    )
    expect((await loadGameData()).profile).toBeUndefined()

    // Sobald gewählt ist, verschwindet der Hinweis.
    await user.click(screen.getByRole('button', { name: 'Ohne Vorlage starten' }))
    expect(within(summary()).queryByRole('alert')).not.toBeInTheDocument()
    expect(summary()).toHaveTextContent('Ohne Vorlage')
  })

  it('startet ohne Vorlage mit leerem Questlog', async () => {
    const user = await start()
    await toCampaignStep(user, 'Borin')
    await chooseScholar(user)
    // „Ohne Vorlage“ ersetzt die Auswahl der Vorlage.
    const none = screen.getByRole('button', { name: 'Ohne Vorlage starten' })
    await user.click(none)
    expect(none).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Der Weg des Gelehrten' })).not.toHaveAccessibleDescription(
      expect.stringContaining('Ausgewählt'),
    )
    expect(summary()).toHaveTextContent('Ohne Vorlage')
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))

    await waitFor(async () => {
      expect((await loadGameData()).profile).toEqual({ name: 'Borin', avatar: '🧙', createdDay: TODAY, form: 'neutral' })
    })
    const data = await loadGameData()
    expect(data.habits).toEqual([])
    expect(data.mainQuests).toEqual([])
  })

  it('wählt die Sprachform für Klassen- und Titelnamen (Standard neutral), behält sie beim Zurückgehen und speichert sie', async () => {
    const user = await start()
    await toHeroStep(user)
    const group = screen.getByRole('radiogroup', { name: 'Sprachform' })
    expect(group).toHaveAccessibleDescription('Für Klassen- und Titelnamen – du kannst sie jederzeit ändern.')
    expect(within(group).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Heldin', 'Held', 'Neutral'])
    expect(within(group).getByRole('radio', { name: 'Neutral' })).toBeChecked()
    const preview = screen.getByText(/^Zum Beispiel:/)
    expect(preview).toHaveTextContent('Zum Beispiel: 🔮 Arkane Seele · guten Mutes')

    // Die Überschrift spricht den Helden in der gewählten Form an – neutral ohne „Held“.
    expect(screen.getByRole('heading', { level: 1, name: 'Erschaffe deinen Charakter' })).toBeInTheDocument()
    expect(screen.getByText('Dein Charakter')).toBeInTheDocument()
    await user.click(within(group).getByRole('radio', { name: 'Heldin' }))
    expect(within(group).getByRole('radio', { name: 'Heldin' })).toBeChecked()
    expect(preview).toHaveTextContent('Zum Beispiel: 🔮 Magierin · die Wagemutige')
    expect(screen.getByRole('heading', { level: 1, name: 'Erschaffe deine Heldin' })).toBeInTheDocument()
    expect(screen.getByText('Deine Heldin')).toBeInTheDocument()
    await user.click(within(group).getByRole('radio', { name: 'Held' }))
    expect(preview).toHaveTextContent('Zum Beispiel: 🔮 Magier · der Wagemutige')
    expect(screen.getByRole('heading', { level: 1, name: 'Erschaffe deinen Helden' })).toBeInTheDocument()
    await user.click(within(group).getByRole('radio', { name: 'Heldin' }))

    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Mira')
    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    await screen.findByRole('heading', { level: 1, name: 'Wähle deine erste Kampagne' })
    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    await screen.findByRole('heading', { level: 1, name: 'Erschaffe deine Heldin' })
    expect(screen.getByRole('radio', { name: 'Heldin' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    await screen.findByRole('heading', { level: 1, name: 'Wähle deine erste Kampagne' })
    await user.click(screen.getByRole('button', { name: 'Ohne Vorlage starten' }))
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))
    await waitFor(async () => {
      expect((await loadGameData()).profile).toEqual({ name: 'Mira', avatar: '🧙', createdDay: TODAY, form: 'female' })
    })
  })

  it('verlangt einen Namen, bevor es weitergeht', async () => {
    const user = await start()
    await toHeroStep(user)
    const nameInput = screen.getByRole('textbox', { name: /^Name/ })
    expect(nameInput).toHaveAttribute('maxlength', '30')

    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.getByText('Bitte gib einen Namen ein.')).toBeInTheDocument()
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput).toHaveFocus()
    expect(screen.getByRole('heading', { level: 1, name: 'Erschaffe deinen Charakter' })).toBeInTheDocument()

    // Nur Leerzeichen zählen nicht als Name.
    await user.type(nameInput, '   ')
    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.getByText('Bitte gib einen Namen ein.')).toBeInTheDocument()

    // Nach dem Korrigieren verschwindet der Fehler sofort.
    await user.type(nameInput, 'Aria')
    expect(screen.queryByText('Bitte gib einen Namen ein.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Wähle deine erste Kampagne' })).toBeInTheDocument()
    expect((await loadGameData()).profile).toBeUndefined()
  })

  it('behält die Eingaben beim Zurückgehen', async () => {
    const user = await start()
    await toCampaignStep(user, 'Aria')
    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Erschaffe deinen Charakter' })).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Ohne Vorlage starten' }))
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))
    await waitFor(async () => {
      expect((await loadGameData()).profile?.avatar).toBe('🐙')
    })
  })

  it('zeigt Fehler als Toast und legt die Kampagne beim erneuten Versuch nicht doppelt an', async () => {
    failures.saveProfile = true
    const user = await start()
    await toCampaignStep(user)
    await chooseScholar(user)
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
    await chooseScholar(user)
    await user.click(screen.getByRole('button', { name: 'Los geht’s' }))
    expect(await screen.findByText('Dein Abenteuer konnte nicht beginnen')).toBeInTheDocument()

    failures.saveProfile = false
    await user.click(screen.getByRole('button', { name: 'Ohne Vorlage starten' }))
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
