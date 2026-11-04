// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../data/db'
import {
  addRestPeriod,
  createHabit,
  loadGameData,
  markHpIntroSeen,
  resetAllData,
  saveProfile,
  setCompletionValue,
  setPenaltiesEnabled,
} from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import type { DayKey, HpLedgerEntry } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { DashboardPage } from '../DashboardPage'

/** Dienstag, 3. November 2026, 12:00 Uhr → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'
const YESTERDAY: DayKey = '2026-11-02'
/** Sonntag – der zuletzt abgerechnete Tag (heute − 2). */
const SETTLED: DayKey = '2026-11-01'

const READING: HabitDraft = {
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
}
const MEDITATION: HabitDraft = {
  title: 'Meditieren',
  icon: '🧘',
  attribute: 'wisdom',
  difficulty: 'easy',
  schedule: { type: 'daily' },
}

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
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20' })
  // Lebenspunkte zählen ab dem 25. Oktober (sonst rechnet die App erst ab heute ab).
  await setPenaltiesEnabled(true, '2026-10-25')
})
afterEach(cleanup)

/** Ein abgerechneter Tag (wie ihn `settleHpDays` schreibt) – Level 1, also 50 Max-HP. */
async function settled(day: DayKey, extra: Partial<HpLedgerEntry> = {}) {
  await db.hpLedger.put({
    day,
    score: 'missed',
    frozen: false,
    hpDelta: -6,
    hpAfter: 44,
    maxHp: 50,
    penalties: true,
    ...extra,
  })
}

async function renderDashboard() {
  const user = userEvent.setup()
  const view = renderWithGame(<DashboardPage />)
  await screen.findByRole('heading', { level: 1, name: 'Heute' })
  return { user, ...view }
}

function hero(): HTMLElement {
  return screen.getByRole('region', { name: 'Aria' })
}

function dailySection(): HTMLElement {
  return screen.getByRole('region', { name: /^Tagesquests/ })
}

describe('Dashboard – Lebenspunkte im Helden-Kopf', () => {
  it('zeigt die HP unter dem XP-Balken und die letzte Abrechnung ruhig als Notiz (kein Toast)', async () => {
    await markHpIntroSeen()
    await createHabit(READING, '2026-10-20')
    await settled(SETTLED, { hpAfter: 42, hpDelta: -6 })
    await renderDashboard()

    const bar = within(hero()).getByRole('progressbar', { name: 'Lebenspunkte' })
    expect(bar).toHaveAttribute('aria-valuetext', '42 von 50 Lebenspunkten')
    expect(within(hero()).getByText('Sonntag: −6 HP')).toBeInTheDocument()
    expect(within(hero()).getByText('Sonntag abgerechnet: minus 6 Lebenspunkte')).toHaveClass('sr-only')
    // Ruhig: kein Hinweis auf wenig HP, keine Meldung.
    expect(within(hero()).queryByText(/angeschlagen/)).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /HP/ })).not.toBeInTheDocument()
  })

  it('gibt unter 25 % einen leisen, ermutigenden Hinweis', async () => {
    await markHpIntroSeen()
    await createHabit(READING, '2026-10-20')
    await settled(SETTLED, { hpAfter: 11 })
    await renderDashboard()
    expect(within(hero()).getByRole('progressbar', { name: 'Lebenspunkte' })).toHaveAttribute(
      'aria-valuetext',
      '11 von 50 Lebenspunkten',
    )
    expect(within(hero()).getByText('Etwas angeschlagen – ein Perfekter Tag heilt +10 HP.')).toBeInTheDocument()
  })

  it('blendet die HP im Sanften Modus aus', async () => {
    await createHabit(READING, '2026-10-20')
    await setPenaltiesEnabled(false, TODAY)
    await renderDashboard()
    expect(within(hero()).queryByRole('progressbar', { name: 'Lebenspunkte' })).not.toBeInTheDocument()
    // Auch die Einführung erscheint im Sanften Modus nicht.
    expect(screen.queryByRole('region', { name: 'Lebenspunkte' })).not.toBeInTheDocument()
  })
})

describe('Dashboard – Einführung „Neu: Lebenspunkte“', () => {
  it('erklärt die Tageswertung einmalig und merkt sich „Verstanden“', async () => {
    await createHabit(READING, '2026-10-20')
    const { user } = await renderDashboard()

    const intro = screen.getByRole('region', { name: 'Lebenspunkte' })
    expect(within(intro).getByText('Neu')).toBeInTheDocument()
    for (const text of ['Eine Wertung pro Tag', 'Wochenquests', 'Gnadenfrist', 'Pause', 'Bei 0 HP']) {
      expect(within(intro).getByText(text)).toBeInTheDocument()
    }
    expect(intro).toHaveTextContent('Nichts zählt rückwirkend.')
    expect(intro).toHaveTextContent('Ein Perfekter Tag heilt +10 HP')
    expect(intro).toHaveTextContent('höchstens −6 HP')
    expect(intro).toHaveTextContent('Ein Ruhetag schont Lebenspunkte und Serien')
    expect(within(intro).getByRole('link', { name: 'Sanften Modus' })).toHaveAttribute('href', '/einstellungen')

    await user.click(within(intro).getByRole('button', { name: 'Verstanden' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Lebenspunkte' })).not.toBeInTheDocument())
    expect((await loadGameData()).settings.hpIntroSeen).toBe(true)
  })
})

describe('Dashboard – Vorschau für gestern', () => {
  it('zeigt freundlich, was gestern droht, und führt direkt zum Nachtragen', async () => {
    await markHpIntroSeen()
    const reading = await createHabit(READING, '2026-10-20')
    // Kürzlich aktiv (sonst gälte der Held als abwesend – dann kostet gestern nichts).
    await setCompletionValue(reading.id, '2026-10-31', 1)
    await settled(SETTLED, { hpAfter: 44 })
    const { user } = await renderDashboard()

    expect(screen.getByText('Gestern ist noch offen')).toBeInTheDocument()
    expect(screen.getByText('Bleibt es so: −6 HP')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Nachtragen' }))
    const notice = await screen.findByText(/Du trägst für gestern nach/)
    // Der Knopf ist weg – der Fokus landet auf dem Nachtrag-Hinweis.
    expect(notice.closest('p')).toHaveFocus()
    expect(screen.getByText('Stand jetzt: −6 HP · Noch nichts erledigt')).toBeInTheDocument()
    expect(screen.queryByText('Gestern ist noch offen')).not.toBeInTheDocument()

    // Nachgetragen: Der Stand wird freundlich.
    await user.click(screen.getByRole('checkbox', { name: 'Lesen erledigt' }))
    expect(await screen.findByText('Stand jetzt: +10 HP · Perfekter Tag')).toBeInTheDocument()
    expect((await loadGameData()).completions.some((c) => c.habitId === reading.id && c.day === YESTERDAY)).toBe(true)
  })

  it('erscheint nicht, wenn gestern gut lief, und nennt sonst den rettenden Streak-Schutz', async () => {
    await markHpIntroSeen()
    const reading = await createHabit(READING, '2026-10-20')
    await setCompletionValue(reading.id, '2026-10-31', 1)
    await setCompletionValue(reading.id, YESTERDAY, 1)
    await settled(SETTLED)
    const view = await renderDashboard()
    expect(screen.queryByText('Gestern ist noch offen')).not.toBeInTheDocument()
    view.unmount()

    await setCompletionValue(reading.id, YESTERDAY, 0)
    await db.purchases.put({
      id: 'freeze',
      kind: 'item',
      itemId: 'streakFreeze',
      title: 'Streak-Schutz',
      icon: '❄️',
      price: 150,
      day: '2026-10-30',
      createdAt: 1,
    })
    await renderDashboard()
    expect(screen.getByText('Gestern ist noch offen')).toBeInTheDocument()
    expect(screen.getByText(/sonst fängt ❄️ ein Streak-Schutz den Tag auf/)).toBeInTheDocument()
    expect(screen.queryByText(/Bleibt es so/)).not.toBeInTheDocument()
  })
})

describe('Dashboard – Ruhetag', () => {
  it('legt nach Rückfrage einen Ruhetag an – die Quests bleiben erledigbar – und hebt ihn wieder auf', async () => {
    await markHpIntroSeen()
    const reading = await createHabit(READING, '2026-10-20')
    await createHabit(MEDITATION, '2026-10-20')
    const { user } = await renderDashboard()

    await user.click(within(dailySection()).getByRole('button', { name: 'Heute Ruhetag' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Heute Ruhetag einlegen?' })
    expect(dialog).toHaveTextContent('Nichts ist Pflicht')
    await user.click(within(dialog).getByRole('button', { name: 'Ruhetag einlegen' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await within(dailySection()).findByText('Heute ist Ruhetag')).toBeInTheDocument()
    const periods = (await loadGameData()).restPeriods ?? []
    expect(periods).toHaveLength(1)
    expect(periods[0]).toMatchObject({ from: TODAY, until: TODAY })
    // Keine zweite Rückfrage an einem Ruhetag, keine Pflicht – aber die Quests stehen weiter da.
    expect(within(dailySection()).queryByRole('button', { name: 'Heute Ruhetag' })).not.toBeInTheDocument()
    expect(within(dailySection()).queryByText(/bis zum Perfekten Tag/)).not.toBeInTheDocument()
    await user.click(within(dailySection()).getByRole('checkbox', { name: 'Lesen erledigt' }))
    await waitFor(async () =>
      expect((await loadGameData()).completions.some((c) => c.habitId === reading.id && c.day === TODAY)).toBe(true),
    )

    await user.click(within(dailySection()).getByRole('button', { name: 'Ruhetag aufheben' }))
    await waitFor(() => expect(within(dailySection()).queryByText('Heute ist Ruhetag')).not.toBeInTheDocument())
    expect((await loadGameData()).restPeriods).toBeUndefined()
    expect(within(dailySection()).getByText(/bis zum Perfekten Tag/)).toBeInTheDocument()
  })

  it('zeigt einen geplanten Urlaub mit Notiz – ohne „aufheben“ (das geht in den Einstellungen)', async () => {
    await markHpIntroSeen()
    await createHabit(READING, '2026-10-20')
    await addRestPeriod({ from: YESTERDAY, until: '2026-11-06', note: 'Urlaub in Italien' }, TODAY)
    await renderDashboard()
    expect(within(dailySection()).getByText('Urlaub · bis Freitag, 6. Nov.')).toBeInTheDocument()
    expect(within(dailySection()).getByText('Urlaub in Italien')).toBeInTheDocument()
    expect(within(dailySection()).queryByRole('button', { name: 'Ruhetag aufheben' })).not.toBeInTheDocument()
    expect(within(dailySection()).getByRole('checkbox', { name: 'Lesen erledigt' })).toBeInTheDocument()
    // Gestern war Urlaub: keine Vorschau, nichts droht.
    expect(screen.queryByText('Gestern ist noch offen')).not.toBeInTheDocument()
  })

  it('bietet „Heute Ruhetag“ nicht an, wenn heute schon perfekt ist oder keine Tagesquest ansteht', async () => {
    await markHpIntroSeen()
    const reading = await createHabit(READING, '2026-10-20')
    await setCompletionValue(reading.id, TODAY, 1)
    const view = await renderDashboard()
    expect(screen.queryByRole('button', { name: 'Heute Ruhetag' })).not.toBeInTheDocument()
    view.unmount()

    await resetAllData()
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20' })
    await markHpIntroSeen()
    await createHabit({ ...READING, schedule: { type: 'weekly', times: 3 } }, '2026-10-20')
    await renderDashboard()
    expect(screen.queryByRole('button', { name: 'Heute Ruhetag' })).not.toBeInTheDocument()
  })
})

describe('Dashboard – sanfte Wege (Krankheitstag, halber Tag, Vorrat, Rückkehr)', () => {
  it('trägt gestern nach Rückfrage als Ruhetag ein – kein Schaden, die Vorschau verschwindet', async () => {
    await markHpIntroSeen()
    const reading = await createHabit(READING, '2026-10-20')
    await setCompletionValue(reading.id, '2026-10-31', 1)
    await settled(SETTLED, { hpAfter: 44 })
    const { user } = await renderDashboard()

    expect(screen.getByText('Bleibt es so: −6 HP')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gestern als Ruhetag eintragen' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Gestern als Ruhetag eintragen?' })
    expect(dialog).toHaveTextContent('Krank, unterwegs oder einfach eine Pause gebraucht?')
    await user.click(within(dialog).getByRole('button', { name: 'Ruhetag eintragen' }))

    await waitFor(() => expect(screen.queryByText('Gestern ist noch offen')).not.toBeInTheDocument())
    expect(await screen.findByText('Gestern war Ruhetag')).toBeInTheDocument()
    expect((await loadGameData()).restPeriods).toMatchObject([{ from: YESTERDAY, until: YESTERDAY }])
    // Der Knopf ist weg – der Fokus landet auf der Tagesbilanz statt auf <body>.
    await waitFor(() => expect(document.getElementById('day-summary')).toHaveFocus())
  })

  it('zeigt das Zwischenziel „guter Tag“ – und feiert die erreichte Hälfte', async () => {
    await markHpIntroSeen()
    await createHabit(READING, '2026-10-20')
    await createHabit(MEDITATION, '2026-10-20')
    const { user } = await renderDashboard()

    expect(within(dailySection()).getByText('Ab 1 von 2: guter Tag · +2 HP')).toBeInTheDocument()
    await user.click(within(dailySection()).getByRole('checkbox', { name: 'Lesen erledigt' }))
    expect(await within(dailySection()).findByText('Guter Tag geschafft · +2 HP')).toBeInTheDocument()
    // Der Perfekte Tag bleibt das große Ziel.
    expect(within(dailySection()).getByText(/bis zum Perfekten Tag/)).toBeInTheDocument()
  })

  it('zeigt das Zwischenziel nicht im Sanften Modus', async () => {
    await createHabit(READING, '2026-10-20')
    await createHabit(MEDITATION, '2026-10-20')
    await setPenaltiesEnabled(false, TODAY)
    await renderDashboard()
    expect(within(dailySection()).queryByText(/guter Tag/)).not.toBeInTheDocument()
    expect(within(dailySection()).getByText(/bis zum Perfekten Tag/)).toBeInTheDocument()
  })

  it('zeigt den Vorrat an Streak-Schutz neben den HP', async () => {
    await markHpIntroSeen()
    await createHabit(READING, '2026-10-20')
    await db.purchases.put({
      id: 'freeze',
      kind: 'item',
      itemId: 'streakFreeze',
      title: 'Streak-Schutz',
      icon: '❄️',
      price: 150,
      day: '2026-10-30',
      createdAt: 1,
    })
    await renderDashboard()
    expect(within(hero()).getByText('1 Streak-Schutz im Beutel – fängt einen schwachen Tag auf')).toHaveClass('sr-only')
  })

  it('heißt den Helden nach einer längeren Pause willkommen', async () => {
    await markHpIntroSeen()
    await createHabit(READING, '2026-10-20')
    await settled(SETTLED, { score: 'absent', hpDelta: 0, hpAfter: 13 })
    await renderDashboard()
    expect(within(hero()).getByText('Willkommen zurück – schön, dass du da bist!')).toBeInTheDocument()
  })

  it('führt aus der Ruhetag-Zeile direkt zu „Rast & Urlaub“', async () => {
    await markHpIntroSeen()
    await createHabit(READING, '2026-10-20')
    await renderDashboard()
    expect(within(dailySection()).getByRole('link', { name: 'Urlaub planen' })).toHaveAttribute(
      'href',
      '/einstellungen?bereich=rast',
    )
  })
})
