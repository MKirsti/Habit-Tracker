// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import type { ReactElement } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ATTRIBUTE_IDS } from '../domain/attributes'
import type { AttributeId, AttributeState, Habit } from '../domain/types'
import { AttributeGrid } from '../pages/hero/AttributeGrid'
import { StepIndicator } from '../pages/onboarding/StepParts'
import { QuestRow } from '../pages/quests/QuestRow'
import { Layout } from './Layout'
import { RouteError } from './RouteError'

/**
 * Der Token `faint` (#7d6d55) erreicht auf den Flächen nur 3.15–4.04:1 und ist deshalb Platzhaltern,
 * deaktivierten Elementen und Dekoration vorbehalten (siehe src/index.css). Echter Text – Beschreibungen,
 * Beschriftungen, Fehlerdetails – braucht mindestens `muted` (≥ 5.5:1).
 */

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Elemente mit lesbarem Text (Buchstaben/Ziffern), die in `text-faint` gesetzt sind und nicht dekorativ sind. */
function faintTextIn(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[class]')]
    .filter((el) => (el.getAttribute('class') ?? '').split(/\s+/).includes('text-faint'))
    .filter((el) => el.closest('[aria-hidden="true"]') === null)
    .filter((el) => /[\p{L}\p{N}]/u.test(el.textContent ?? ''))
    .map((el) => (el.textContent ?? '').trim())
}

function renderInRouter(element: ReactElement, errorElement?: ReactElement) {
  const router = createMemoryRouter([{ path: '*', element, errorElement }], { initialEntries: ['/quests'] })
  return render(<RouterProvider router={router} />)
}

const HABIT: Habit = {
  id: 'h1',
  title: 'Täglich lesen',
  icon: '📖',
  description: 'Mindestens zehn Seiten vor dem Schlafen',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
  order: 1,
  createdDay: '2026-10-01',
}

function attributes(): Record<AttributeId, AttributeState> {
  return Object.fromEntries(
    ATTRIBUTE_IDS.map((id) => [id, { id, level: 11, totalXp: 2400, xpIntoLevel: 30, xpForNextLevel: 80, progress: 0.375 }]),
  ) as Record<AttributeId, AttributeState>
}

describe('Echter Text nutzt nie den Token faint', () => {
  it('Quest-Beschreibung in der Quest-Verwaltung', () => {
    const { container } = render(
      <ul>
        <QuestRow
          habit={HABIT}
          streak={{ current: 0, best: 4, unit: 'day' }}
          isFirst
          isLast
          onMove={() => {}}
          onEdit={() => {}}
        />
      </ul>,
    )
    expect(screen.getByText('Mindestens zehn Seiten vor dem Schlafen')).toBeInTheDocument()
    expect(faintTextIn(container)).toEqual([])
  })

  it('„Level“-Beschriftung der Attribute auf der Heldenseite', () => {
    const { container } = render(<AttributeGrid attributes={attributes()} />)
    expect(screen.getAllByText('Level')).toHaveLength(ATTRIBUTE_IDS.length)
    expect(faintTextIn(container)).toEqual([])
  })

  it('kommende Schritte im Onboarding-Fortschritt', () => {
    const { container } = render(<StepIndicator steps={['Willkommen', 'Held', 'Kampagne']} current={0} />)
    expect(screen.getByText('Kampagne')).toBeInTheDocument()
    expect(faintTextIn(container)).toEqual([])
  })

  it('Leitspruch der Seitenleiste', () => {
    const { container } = renderInRouter(
      <Layout>
        <p>Inhalt</p>
      </Layout>,
    )
    expect(screen.getByText('Jeder Tag ist ein neues Kapitel deines Abenteuers.')).toBeInTheDocument()
    expect(faintTextIn(container)).toEqual([])
  })

  it('Fehlerdetail der Router-Fehlerseite', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    function Broken(): never {
      throw new Error('Kaputtes Kapitel')
    }
    const { container } = renderInRouter(<Broken />, <RouteError />)
    expect(screen.getByText('Kaputtes Kapitel')).toBeInTheDocument()
    expect(faintTextIn(container)).toEqual([])
  })
})
