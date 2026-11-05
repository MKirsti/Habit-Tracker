// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createHabit,
  createSideQuest,
  loadGameData,
  markCompanionIntroSeen,
  resetAllData,
  saveJournalNote,
  saveProfile,
  setCompanion,
  setCompletionValue,
  updateSettings,
} from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import { dayRange } from '../../domain/dates'
import type { DayKey, WeeklyReview } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { DashboardPage } from '../DashboardPage'
import { WeeklyReviewCard } from './WeeklyReviewCard'

// Feste IDs: Truhen-Funde hängen (deterministisch) an den IDs der Erledigungen.
vi.mock('../../data/ids', () => {
  let next = 0
  return { newId: () => `dash3b-id-${(next += 1)}` }
})

// Klang & Vibration: nur prüfen, dass im richtigen Moment gerufen wird.
const sounds = vi.hoisted(() => ({ play: vi.fn(), vibrate: vi.fn() }))
vi.mock('../../features/sound', () => ({ useGameSounds: () => sounds }))

/** Dienstag, 3. November 2026, 12:00 Uhr → Spieltag 2026-11-03 (die Woche begann am Montag, 2. November). */
const TODAY: DayKey = '2026-11-03'
const START: DayKey = '2026-10-20'

const READING: HabitDraft = {
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
  await resetAllData()
  sounds.play.mockClear()
  sounds.vibrate.mockClear()
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: START })
  // Ältere Einführungen sind gesehen – sonst stünden sie vor den neuen Karten.
  await updateSettings({ hpIntroSeen: true, combatIntroSeen: true })
})
afterEach(cleanup)

async function renderDashboard() {
  const user = userEvent.setup()
  const view = renderWithGame(<DashboardPage />)
  await screen.findByRole('heading', { level: 1, name: 'Heute' })
  return { user, ...view }
}

function bossCard(): HTMLElement {
  const card = document.querySelector<HTMLElement>('[data-boss-state]')
  if (card === null) throw new Error('Keine Boss-Karte')
  return card
}

describe('Dashboard Phase 3b – Gefährte an der Boss-Karte', () => {
  it('steht mit Emoji, Name und Stufen-Glanz da und führt zur Gefährten-Karte', async () => {
    await createHabit(READING, START)
    // Heute gewählt: noch kein Tag ohne Quest – hellwach.
    await setCompanion({ species: 'fox', name: 'Flink' }, TODAY)
    await renderDashboard()

    const badge = await waitFor(() => {
      const element = bossCard().querySelector<HTMLAnchorElement>('[data-companion="fox"]')
      expect(element).not.toBeNull()
      return element as HTMLAnchorElement
    })
    expect(badge).toHaveTextContent('🦊')
    expect(badge).toHaveTextContent('Flink')
    expect(badge).toHaveAttribute('href', '/held#gefaehrte')
    expect(badge).toHaveAccessibleName('Dein Gefährte Flink, Fuchswelpe (Jungtier) – zur Gefährten-Karte')
    expect(badge).toHaveAttribute('data-companion-stage', '0')
    expect(badge.querySelector('[data-companion-zzz]')).toBeNull()
  })

  it('schläft nach drei Tagen ohne Quest – mit 💤 und einer freundlichen Einladung', async () => {
    const habit = await createHabit(READING, START)
    await setCompletionValue(habit.id, '2026-10-25', 1)
    await setCompanion({ species: 'owl', name: 'Nox' }, START)
    await renderDashboard()

    const badge = await waitFor(() => {
      const element = bossCard().querySelector<HTMLElement>('[data-companion="owl"]')
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    expect(badge).toHaveAttribute('data-companion-sleeping')
    expect(badge.querySelector('[data-companion-zzz]')).toHaveTextContent('💤')
    expect(badge).toHaveAccessibleName(/schläft gerade\. Eine erledigte Quest weckt Nox\./)
  })

  it('auch ohne Boss in Sicht ist der Gefährte da', async () => {
    await setCompanion({ species: 'dragon', name: 'Funke' }, START)
    await renderDashboard()
    await waitFor(() => expect(bossCard()).toHaveAttribute('data-boss-state', 'none'))
    expect(bossCard().querySelector('[data-companion="dragon"]')).toHaveTextContent('Funke')
  })

  it('springt am Perfekten Tag mit an: „🦊 Flink springt mit an −N“ – mit Klang', async () => {
    const habit = await createHabit(READING, START)
    await setCompanion({ species: 'fox', name: 'Flink' }, START)
    const { user } = await renderDashboard()
    await waitFor(() => expect(bossCard()).toHaveAttribute('data-boss-state', 'active'))

    await user.click(screen.getByRole('checkbox', { name: 'Lesen erledigt' }))
    expect(sounds.play).toHaveBeenCalledWith('check')

    const companionHit = await waitFor(() => {
      const element = bossCard().querySelector<HTMLElement>('[data-boss-hit="companion"]')
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    expect(companionHit).toHaveTextContent(/🦊Flinkspringt mit an−\d+/)
    expect(bossCard().querySelector('[data-boss-hit="normal"], [data-boss-hit="weak"]')).not.toBeNull()
    // Glanz: Funken sprühen vom Boss-Symbol, der Gefährte hüpft.
    expect(bossCard().querySelector('[data-particles]')).not.toBeNull()
    await waitFor(() => expect(sounds.play).toHaveBeenCalledWith('bossHit'))
    // Vorgelesen wird der letzte Treffer – der des Gefährten.
    expect(within(bossCard()).getByText(/^Flink springt mit an: \d+ Schaden gegen /)).toBeInTheDocument()

    // Haken wieder weg: Klang „uncheck“.
    await user.click(screen.getByRole('checkbox', { name: 'Lesen erledigt' }))
    expect(sounds.play).toHaveBeenCalledWith('uncheck')
    await waitFor(async () => expect((await loadGameData()).completions.some((c) => c.habitId === habit.id && c.day === TODAY)).toBe(false))
  })

  it('ohne Effekte: Treffer ja, Funken nein', async () => {
    await createHabit(READING, START)
    await updateSettings({ effects: false })
    const { user } = await renderDashboard()
    await waitFor(() => expect(bossCard()).toHaveAttribute('data-boss-state', 'active'))
    await user.click(screen.getByRole('checkbox', { name: 'Lesen erledigt' }))
    await waitFor(() => expect(bossCard().querySelector('[data-boss-hit]')).not.toBeNull())
    expect(bossCard().querySelector('[data-boss-hit-motion="still"]')).not.toBeNull()
    expect(bossCard().querySelector('[data-particles]')).toBeNull()
  })

  it('Nebenquests klingen beim Abhaken ebenfalls', async () => {
    await createSideQuest({ title: 'Zahnarzt anrufen', icon: '🦷', attribute: 'vitality', difficulty: 'easy' }, TODAY)
    const { user } = await renderDashboard()
    await user.click(await screen.findByRole('checkbox', { name: /Zahnarzt anrufen/ }))
    expect(sounds.play).toHaveBeenCalledWith('check')
    expect(sounds.vibrate).toHaveBeenCalled()
  })
})

describe('Dashboard Phase 3b – Einführung „Neu: Gefährten“', () => {
  it('lässt gleich wählen: Art per Karte, Name vorgeschlagen und änderbar → Gefährte gespeichert', async () => {
    await createHabit(READING, START)
    const { user } = await renderDashboard()
    const card = await screen.findByRole('region', { name: 'Gefährten' })
    expect(card).toHaveTextContent('Neu')

    const picker = within(card).getByRole('radiogroup', { name: 'Wer begleitet dich?' })
    const radios = within(picker).getAllByRole('radio')
    expect(radios.map((radio) => radio.textContent)).toEqual(['🐉Drache', '🦝Waschbär', '🐍Schlange', '🦉Eule', '🦊Fuchs'])
    expect(within(picker).getByRole('radio', { name: /Fuchs/ })).toBeChecked()
    const name = within(card).getByRole('textbox', { name: /Name/ })
    expect(name).toHaveValue('Flink')

    // Art wechseln – der Vorschlag wechselt mit, solange nichts Eigenes eingetippt ist.
    await user.click(within(picker).getByRole('radio', { name: /Eule/ }))
    expect(name).toHaveValue('Nox')
    expect(card.querySelector('[data-companion-personality]')).toHaveTextContent('Startet als Flaumkäuzchen.')
    // Pfeiltasten wechseln die Art.
    await user.keyboard('{ArrowLeft}')
    expect(within(picker).getByRole('radio', { name: /Schlange/ })).toBeChecked()
    expect(within(picker).getByRole('radio', { name: /Schlange/ })).toHaveFocus()

    await user.clear(name)
    await user.type(name, 'Sisi')
    await user.click(within(picker).getByRole('radio', { name: /Drache/ }))
    expect(name).toHaveValue('Sisi')

    await user.click(within(card).getByRole('button', { name: 'Mit Sisi losziehen' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Gefährten' })).not.toBeInTheDocument())
    const data = await loadGameData()
    expect(data.profile?.companion).toEqual({ species: 'dragon', name: 'Sisi', chosenDay: TODAY })
    expect(data.settings.companionIntroSeen).toBe(true)
    await waitFor(() => expect(bossCard().querySelector('[data-companion="dragon"]')).toHaveTextContent('Sisi'))
  })

  it('nennt für erfahrene Helden die Stufe, mit der der Gefährte wirklich startet', async () => {
    // 14 aktive Tage (20. Oktober bis 2. November) – der Gefährte startet gleich auf Stufe 2.
    const habit = await createHabit(READING, START)
    for (const day of dayRange(START, '2026-11-02')) await setCompletionValue(habit.id, day, 1)
    const { user } = await renderDashboard()
    const card = await screen.findByRole('region', { name: 'Gefährten' })
    const personality = () => card.querySelector('[data-companion-personality]')
    expect(personality()).toHaveTextContent('Startet dank deiner 14 aktiven Tage gleich als Spitzohr.')
    expect(personality()).not.toHaveTextContent('Fuchswelpe')
    await user.click(within(card).getByRole('radio', { name: /Eule/ }))
    expect(personality()).toHaveTextContent('Startet dank deiner 14 aktiven Tage gleich als Nachtschwinge.')

    await user.click(within(card).getByRole('button', { name: 'Mit Nox losziehen' }))
    // Und so steht der Gefährte dann auch da.
    await waitFor(() => expect(bossCard().querySelector('[data-companion="owl"]')).toHaveAttribute('data-companion-stage', '1'))
  })

  it('ohne Namen geht es nicht – eine freundliche Bitte statt eines Fehlers beim Speichern', async () => {
    const { user } = await renderDashboard()
    const card = await screen.findByRole('region', { name: 'Gefährten' })
    await user.clear(within(card).getByRole('textbox', { name: /Name/ }))
    await user.click(within(card).getByRole('button', { name: 'Gefährten wählen' }))
    expect(card).toHaveTextContent('Gib deinem Gefährten einen Namen.')
    expect((await loadGameData()).profile?.companion).toBeUndefined()
  })

  it('„Später“ merkt sich die Einführung, ohne einen Gefährten zu wählen', async () => {
    const { user } = await renderDashboard()
    const card = await screen.findByRole('region', { name: 'Gefährten' })
    await user.click(within(card).getByRole('button', { name: 'Später' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Gefährten' })).not.toBeInTheDocument())
    const data = await loadGameData()
    expect(data.settings.companionIntroSeen).toBe(true)
    expect(data.profile?.companion).toBeUndefined()
  })

  it('erscheint nicht vor den älteren Einführungen und nicht, wenn schon ein Gefährte da ist', async () => {
    await updateSettings({ combatIntroSeen: false })
    const view = await renderDashboard()
    expect(screen.queryByRole('region', { name: 'Gefährten' })).not.toBeInTheDocument()
    view.unmount()

    await updateSettings({ combatIntroSeen: true })
    await setCompanion({ species: 'fox', name: 'Flink' }, TODAY)
    await renderDashboard()
    expect(screen.queryByRole('region', { name: 'Gefährten' })).not.toBeInTheDocument()
  })
})

const REVIEW: WeeklyReview = {
  weekStart: '2026-10-26',
  weekEnd: '2026-11-01',
  xp: 1240,
  xpChangePercent: -8,
  questsCompleted: 23,
  perfectDays: 4,
  bestStreak: 12,
  topAttribute: 'intellect',
  boss: { name: 'Sofagolem', icon: '🛋️', defeated: false },
  restDays: 1,
  line: 'Auch ruhigere Wochen bauen Muskeln auf.',
}

describe('Dashboard Phase 3b – Wochenrückblick', () => {
  it('zeigt den Bericht des Gildenmeisters; „Weiter“ merkt sich die Woche', async () => {
    const user = userEvent.setup()
    renderWithGame(<WeeklyReviewCard review={REVIEW} />)
    const card = await screen.findByRole('region', { name: 'Bericht des Gildenmeisters Woche vom 26. Okt.' })
    expect(card).toHaveTextContent('+1.240 XP')
    // Weniger als die Vorwoche: ruhig, ohne Rot.
    const trend = card.querySelector('[data-review-trend="down"]')
    expect(trend).toHaveTextContent('▼ 8 %')
    expect(trend).toHaveTextContent('8 % weniger als in der Vorwoche')
    expect(trend).not.toHaveClass('text-danger')
    expect(within(card).getByRole('list', { name: 'Deine Woche in Zahlen' })).toHaveTextContent('23Quests erledigt')
    expect(card).toHaveTextContent('Sofagolemist entwischt')
    expect(card).toHaveTextContent('1Ruhetag')
    expect(card).toHaveTextContent('„Auch ruhigere Wochen bauen Muskeln auf.“')

    await user.click(within(card).getByRole('button', { name: 'Weiter' }))
    await waitFor(async () => expect((await loadGameData()).settings.weeklyReviewSeen).toBe('2026-10-26'))
  })
})

describe('Dashboard Phase 3b – Notiz zu heute', () => {
  it('ist zugeklappt; aufgeklappt mit Text und Stimmung → ins Tagebuch', async () => {
    await markCompanionIntroSeen()
    const { user } = await renderDashboard()
    const toggle = await screen.findByRole('button', { name: /Notiz zu heute/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('textbox', { name: /Deine Notiz/ })).not.toBeInTheDocument()

    await user.click(toggle)
    const text = screen.getByRole('textbox', { name: /Deine Notiz/ })
    await waitFor(() => expect(text).toHaveFocus())
    expect(text).toHaveAttribute('maxlength', '280')
    await user.type(text, 'Endlich wieder gelesen!')
    const moods = screen.getByRole('group', { name: /Stimmung/ })
    await user.click(within(moods).getByRole('button', { name: 'Gut' }))
    expect(within(moods).getByRole('button', { name: 'Gut' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(async () =>
      expect((await loadGameData()).journalNotes).toEqual([expect.objectContaining({ day: TODAY, text: 'Endlich wieder gelesen!', mood: '🙂' })]),
    )
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'))
    expect(toggle).toHaveFocus()
    expect(document.querySelector('[data-journal-preview]')).toHaveTextContent('Endlich wieder gelesen!')
    expect(document.querySelector('[data-journal-note]')).toHaveAttribute('data-journal-note', 'written')
  })

  it('zeigt eine geschriebene Notiz zum Bearbeiten; leer und ohne Stimmung wird sie entfernt', async () => {
    await markCompanionIntroSeen()
    await saveJournalNote(TODAY, { text: 'Ein guter Tag', mood: '😄' }, TODAY)
    const { user } = await renderDashboard()
    const toggle = await screen.findByRole('button', { name: /Notiz zu heute/ })
    await waitFor(() => expect(document.querySelector('[data-journal-preview]')).toHaveTextContent('Ein guter Tag'))

    await user.click(toggle)
    const text = screen.getByRole('textbox', { name: /Deine Notiz/ })
    expect(text).toHaveValue('Ein guter Tag')
    expect(screen.getByRole('button', { name: 'Strahlend' })).toHaveAttribute('aria-pressed', 'true')
    await user.clear(text)
    await user.click(screen.getByRole('button', { name: 'Strahlend' }))
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect((await loadGameData()).journalNotes ?? []).toEqual([]))
  })
})

describe('Dashboard Phase 3b – eine Karte zur Zeit', () => {
  it('ohne Gefährten-Einführung und ohne Rückblick bleibt es bei der Boss-Karte', async () => {
    await markCompanionIntroSeen()
    const habit = await createHabit(READING, START)
    for (const day of dayRange(START, '2026-11-01')) await setCompletionValue(habit.id, day, 1)
    await renderDashboard()
    await waitFor(() => expect(bossCard()).toBeInTheDocument())
    expect(screen.queryByRole('region', { name: 'Gefährten' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-companion-intro]')).toBeNull()
  })
})
