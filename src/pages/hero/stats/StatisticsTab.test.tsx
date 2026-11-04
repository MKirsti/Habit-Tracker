// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHabit, loadGameData, resetAllData, saveProfile, setCompletionValue } from '../../../data/repository'
import { deriveGameState } from '../../../domain/engine'
import type { DayKey } from '../../../domain/types'
import { renderWithGame } from '../../../test/renderWithGame'
import { HeroPage } from '../../HeroPage'

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'

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

/**
 * Abenteuer seit 1. Oktober; „Lesen“ (mittel, 10 Seiten) und „Meditieren“ (leicht) täglich seit 25. Oktober.
 * 1. und 2. November beide erledigt (perfekt), heute erst „Lesen“.
 */
async function setup(route = '/held?tab=statistik') {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
  const reading = await createHabit(
    {
      title: 'Lesen',
      icon: '📖',
      attribute: 'intellect',
      difficulty: 'medium',
      schedule: { type: 'daily' },
      measure: { target: 10, unit: 'Seiten' },
    },
    '2026-10-25',
  )
  const meditate = await createHabit(
    { title: 'Meditieren', icon: '🧘', attribute: 'wisdom', difficulty: 'easy', schedule: { type: 'daily' } },
    '2026-10-25',
  )
  for (const day of ['2026-11-01', '2026-11-02', TODAY]) await setCompletionValue(reading.id, day, 10)
  for (const day of ['2026-11-01', '2026-11-02']) await setCompletionValue(meditate.id, day, 1)
  const user = userEvent.setup()
  const view = renderWithGame(<HeroPage />, { route })
  await screen.findByRole('heading', { level: 1, name: 'Held' })
  return { user, ...view }
}

function card(name: string | RegExp): HTMLElement {
  return screen.getByRole('region', { name })
}

/** Live-Region neben einem Diagramm (liest die gewählte Position vor). */
function liveText(group: HTMLElement): string {
  return group.parentElement?.querySelector('[aria-live]')?.textContent ?? ''
}

describe('Held → Statistik', () => {
  it('ist ein eigener Reiter in der Adresse (?tab=statistik)', async () => {
    const { user, router } = await setup('/held')
    await user.click(screen.getByRole('tab', { name: 'Statistik' }))
    expect(router.state.location.search).toBe('?tab=statistik')
    expect(screen.getByRole('tab', { name: 'Statistik' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Statistik' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Kennzahlen' })).toBeInTheDocument()
  })

  it('zeigt die Kennzahlen des Abenteuers', async () => {
    await setup()
    const state = deriveGameState(await loadGameData(), TODAY)
    const figures = within(card('Kennzahlen'))
    const tile = (label: string) => figures.getByText(label).closest('li') as HTMLElement
    expect(tile('Gesamt-XP')).toHaveTextContent(state.level.totalXp.toLocaleString('de-DE'))
    expect(tile('Quests erledigt')).toHaveTextContent('5an 3 Tagen')
    expect(tile('Perfekte Tage')).toHaveTextContent('2')
    expect(tile('Längster Streak')).toHaveTextContent('3Tage')
    expect(tile('Gold verdient')).toHaveTextContent(state.gold.earned.toLocaleString('de-DE'))
    expect(tile('Gold ausgegeben')).toHaveTextContent('0Gönn dir was!')
    expect(tile('Niederlagen')).toHaveTextContent(/^Niederlagen0(ungebrochen|Sanfter Modus)$/)
    expect(tile('Tag des Abenteuers')).toHaveTextContent('34seit 1. Okt. 2026')
  })

  it('Heatmap: ein Feld pro Tag (26 Wochen), Zusammenfassung, Tastatur und Tooltip', async () => {
    const { user, container } = await setup()
    const heat = card('Aktivität')
    const image = within(heat).getByRole('img', { name: 'Letzte 26 Wochen: 2 perfekte Tage, 1 guter Tag.' })
    // 26 × 7 Tage, ohne die fünf Tage nach heute (Mi – So).
    expect(image.querySelectorAll('rect[data-day]')).toHaveLength(26 * 7 - 5)
    expect(image.querySelector('rect[data-day="2026-11-04"]')).toBeNull()

    const group = within(heat).getByRole('group', { name: 'Aktivität aller Quests – mit den Pfeiltasten Tage wählen' })
    group.focus()
    await user.keyboard('{End}')
    expect(liveText(group)).toMatch(/^Dienstag, 3\. November 2026 – Heute · 1 von 2 Tagesquests · \+\d+ XP · läuft noch$/)
    await user.keyboard('{ArrowUp}')
    expect(liveText(group)).toMatch(/^Montag, 2\. November 2026 – Perfekter Tag · 2 von 2 Tagesquests · \+\d+ XP$/)
    await user.keyboard('{ArrowLeft}')
    // Fällig sind die Quests erst seit dem 25. Oktober (davor „Keine Tagesquests“ – zählt für die Pause nicht mit).
    // 25., 26., 27. Oktober nichts erledigt: der 1., 2. und 3. Tag mit Schaden in Folge – also noch verpasst.
    expect(liveText(group)).toBe('Montag, 26. Oktober 2026 – Nichts erledigt · 0 von 2 Tagesquests')
    // Ab dem 28. Oktober (nach drei Tagen mit Schaden) ruht der Schaden: Pause bis zum perfekten 1. November.
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(liveText(group)).toBe('Mittwoch, 28. Oktober 2026 – Pause · der Schaden ruht')
    // In die Zukunft geht es nicht – die Auswahl bleibt stehen.
    await user.keyboard('{End}{ArrowRight}')
    expect(liveText(group)).toMatch(/^Dienstag, 3\. November 2026/)
    await user.keyboard('{Escape}')
    expect(liveText(group)).toBe('')

    // Zeiger: Tooltip am Feld (heute: letzte Spalte, zweite Zeile).
    const svg = container.querySelector('svg[aria-label^="Letzte 26 Wochen"]') as SVGSVGElement
    const todayCell = svg.querySelector('rect[data-day="2026-11-03"]') as SVGRectElement
    fireEvent.pointerMove(svg, {
      clientX: Number(todayCell.getAttribute('x')) + 2,
      clientY: Number(todayCell.getAttribute('y')) + 2,
    })
    expect(within(heat).getByText(/^Heute · 1 von 2 Tagesquests/)).toBeInTheDocument()
    expect(within(heat).getByText('Dienstag, 3. November 2026')).toBeInTheDocument()

    // Tabelle als barrierefreier Zwilling.
    await user.click(within(heat).getByText('Als Tabelle anzeigen'))
    const table = within(heat).getByRole('table', { name: 'Deine Tage, neueste zuerst' })
    const firstRow = within(table).getAllByRole('row')[1]
    expect(firstRow).toHaveTextContent(/^Di, 3\. Nov\.Gut geschafft \(heute\)1 \/ 2\d+$/)
  })

  it('Heatmap einer Quest: per Auswahl, in ihrer Attributfarbe', async () => {
    const { user } = await setup()
    const heat = card('Aktivität')
    await user.selectOptions(within(heat).getByLabelText('Zeigen'), '📖 Lesen')
    expect(within(heat).getByRole('img', { name: '📖 Lesen, letzte 26 Wochen: 3-mal erledigt.' })).toBeInTheDocument()
    expect(within(heat).getByRole('list', { name: 'Legende' })).toHaveTextContent('Erledigt')
    const done = within(heat).getByRole('img').querySelector('rect[data-day="2026-11-02"]') as SVGRectElement
    expect(done.style.fill).toBe('rgb(91, 155, 213)') // Intelligenz-Blau

    const group = within(heat).getByRole('group', { name: 'Aktivität „Lesen“ – mit den Pfeiltasten Tage wählen' })
    group.focus()
    await user.keyboard('{End}{ArrowUp}')
    expect(liveText(group)).toBe('Montag, 2. November 2026 – erledigt · 10 / 10 Seiten')
  })

  it('XP pro Woche: 12 Säulen, die laufende Woche zuletzt, mit Tabelle', async () => {
    const { user } = await setup()
    const weekly = card('XP pro Woche')
    expect(within(weekly).getByRole('img', { name: /^Letzte 12 Wochen: \d+ XP, im Schnitt \d+ XP pro Woche\./ })).toBeInTheDocument()
    const group = within(weekly).getByRole('group', { name: 'XP pro Woche – mit den Pfeiltasten Wochen wählen' })
    group.focus()
    await user.keyboard('{End}')
    expect(liveText(group)).toMatch(/^Diese Woche: \d+ XP \(Quests \d+ · Perfekte Tage \d+\), läuft noch$/)
    await user.keyboard('{ArrowLeft}')
    expect(liveText(group)).toMatch(/^Woche 26\. Okt\. – 1\. Nov\.: \d+ XP \(Quests \d+ · Perfekte Tage \d+\)$/)

    await user.click(within(weekly).getByText('Als Tabelle anzeigen'))
    const rows = within(within(weekly).getByRole('table', { name: 'XP pro Woche, neueste zuerst' })).getAllByRole('row')
    expect(rows).toHaveLength(13)
    expect(rows[1]).toHaveTextContent('2. Nov. – 8. Nov. (läuft)')
  })

  it('Erfüllungsquote, Radar und XP-Verlauf', async () => {
    await setup()
    const rates = within(card('Erfüllungsquote')).getByRole('list', { name: 'Erfüllungsquote pro Quest' })
    const [reading, meditate] = within(rates).getAllByRole('listitem')
    // Seit 25. Oktober fällig; heute zählt bei „Lesen“ mit, weil schon erledigt – bei „Meditieren“ noch nicht.
    expect(reading).toHaveTextContent('📖Lesen30 %, 3 von 10 Tagen')
    expect(meditate).toHaveTextContent('🧘Meditieren22 %, 2 von 9 Tagen')

    expect(
      within(card('Attribut-Radar')).getByRole('img', {
        name: 'Stärke Level 1, Intelligenz Level 2, Weisheit Level 1, Charisma Level 1, Vitalität Level 1, Disziplin Level 1. Am stärksten: Intelligenz.',
      }),
    ).toBeInTheDocument()

    const timeline = card('XP- & Level-Verlauf')
    expect(
      within(timeline).getByRole('img', {
        name: /^Gesamt-XP von 0 am 1\. Okt\. auf 100 am 3\. Nov\., jetzt Level 2\. 1 Level-Aufstieg, zuletzt auf Level 2 am 3\. Nov\.$/,
      }),
    ).toBeInTheDocument()
  })

  it('macht einem frischen Helden Mut statt leerer Diagramme', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    renderWithGame(<HeroPage />, { route: '/held?tab=statistik' })
    await screen.findByRole('region', { name: 'Kennzahlen' })
    expect(within(card('XP pro Woche')).getByText('Deine erste Quest füllt die erste Säule.')).toBeInTheDocument()
    expect(within(card('XP- & Level-Verlauf')).getByText('Ab morgen zeichnet sich hier die Linie deines Aufstiegs ab.')).toBeInTheDocument()
    expect(within(card('Erfüllungsquote')).getByText(/Sobald du Quests hast/)).toBeInTheDocument()
    expect(within(card('Aktivität')).getByRole('img', { name: 'Letzte 26 Wochen: noch keine Erledigungen.' })).toBeInTheDocument()
  })

  it('rechnet den Wochenschnitt erst ab dem Abenteuerbeginn – kein „0 XP pro Woche“ in der ersten Woche', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-11-02' })
    const habit = await createHabit(
      { title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'medium', schedule: { type: 'daily' } },
      '2026-11-02',
    )
    await setCompletionValue(habit.id, '2026-11-02', 1)
    renderWithGame(<HeroPage />, { route: '/held?tab=statistik' })
    await screen.findByRole('region', { name: 'Kennzahlen' })
    const weekly = card('XP pro Woche')
    expect(within(weekly).getByText(/^Diese Woche bisher \d+ XP – den Schnitt gibt es nach deiner ersten ganzen Woche\.$/)).toBeInTheDocument()
    expect(weekly).not.toHaveTextContent('Im Schnitt 0 XP')
  })
})
