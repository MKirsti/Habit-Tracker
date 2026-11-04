// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createHabit,
  recordAchievementUnlocks,
  resetAllData,
  saveProfile,
  setCompletionValue,
} from '../../data/repository'
import { ACHIEVEMENTS } from '../../domain/achievements/definitions'
import type { AchievementState, DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { HeroPage } from '../HeroPage'
import { formatUnlockDate, groupAchievements, isHidden, progressText, summarizeAchievements } from './achievementView'
import { parseHeroTab } from './heroTabs'

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'
const CREATED: DayKey = '2026-10-01'

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

/** Zwei Tage „Lesen“ erledigt → zwei Perfekte Tage: „Makellos“ (perfect-days-1) ist erreicht. */
async function setup(route = '/held') {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: CREATED })
  const reading = await createHabit(
    { title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'medium', schedule: { type: 'daily' } },
    CREATED,
  )
  await setCompletionValue(reading.id, '2026-11-02', 1)
  await setCompletionValue(reading.id, TODAY, 1)
  await recordAchievementUnlocks([{ id: 'perfect-days-1', day: '2026-11-02' }])
  const user = userEvent.setup()
  const view = renderWithGame(<HeroPage />, { route })
  await screen.findByRole('heading', { level: 1, name: 'Held' })
  return { user, ...view }
}

function card(name: string | RegExp): HTMLElement {
  return screen.getByRole('listitem', { name })
}

describe('Held-Seite: Reiter', () => {
  it('zeigt ohne Parameter die Übersicht und hat ein Zahnrad zu den Einstellungen', async () => {
    await setup()
    const tabs = within(screen.getByRole('tablist', { name: 'Bereiche des Charakterbogens' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Übersicht',
      expect.stringMatching(/^Erfolge1\/\d+, 1 von \d+ freigeschaltet$/),
    ])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    const panel = screen.getByRole('tabpanel', { name: 'Übersicht' })
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id)
    expect(within(panel).getByRole('heading', { level: 2, name: 'Aria' })).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute('href', '/einstellungen')
  })

  it('verweist per aria-controls nur auf das Panel, das es gibt (gültiges ARIA)', async () => {
    const { user } = await setup()
    for (const name of [/^Erfolge/, 'Übersicht']) {
      for (const tab of screen.getAllByRole('tab')) {
        const controls = tab.getAttribute('aria-controls')
        if (controls !== null) expect(document.getElementById(controls)).toHaveAttribute('role', 'tabpanel')
      }
      expect(screen.getByRole('tab', { selected: true })).toHaveAttribute('aria-controls')
      await user.click(screen.getByRole('tab', { name }))
    }
  })

  it('wechselt per Klick zu den Erfolgen und hält den Reiter in der Adresse (?tab=erfolge)', async () => {
    const { user, router } = await setup()
    await user.click(screen.getByRole('tab', { name: /^Erfolge/ }))
    expect(screen.getByRole('tab', { name: /^Erfolge/ })).toHaveAttribute('aria-selected', 'true')
    expect(router.state.location.search).toBe('?tab=erfolge')
    expect(screen.getByRole('tabpanel', { name: /^Erfolge/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Aria' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Übersicht' }))
    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('heading', { level: 2, name: 'Aria' })).toBeInTheDocument()
  })

  it('bedient sich per Tastatur (Pfeiltasten, Pos1/Ende)', async () => {
    const { user } = await setup()
    const overview = screen.getByRole('tab', { name: 'Übersicht' })
    overview.focus()
    await user.keyboard('{ArrowRight}')
    const achievements = screen.getByRole('tab', { name: /^Erfolge/ })
    expect(achievements).toHaveFocus()
    expect(achievements).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Übersicht' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: /^Erfolge/ })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Übersicht' })).toHaveAttribute('aria-selected', 'true')
  })

  it('öffnet die Erfolge direkt per Adresse; unbekannte Reiter fallen auf die Übersicht zurück', async () => {
    await setup('/held?tab=erfolge')
    expect(screen.getByRole('tab', { name: /^Erfolge/ })).toHaveAttribute('aria-selected', 'true')
    expect(parseHeroTab('erfolge')).toBe('erfolge')
    expect(parseHeroTab('statistik')).toBe('uebersicht')
    expect(parseHeroTab(null)).toBe('uebersicht')
  })
})

describe('Held-Seite: Erfolge', () => {
  it('fasst zusammen: freigeschaltet, Gold aus Erfolgen, je Stufe', async () => {
    await setup('/held?tab=erfolge')
    const summary = screen.getByRole('region', { name: 'Deine Erfolge' })
    expect(summary).toHaveTextContent(`1 / ${ACHIEVEMENTS.length} freigeschaltet`)
    expect(summary).toHaveTextContent('+25 Gold aus Erfolgen')
    const tiers = within(within(summary).getByRole('list', { name: 'Nach Stufe' })).getAllByRole('listitem')
    expect(tiers.map((tier) => tier.textContent)).toEqual([
      expect.stringMatching(/^Bronze1\/\d+$/),
      expect.stringMatching(/^Silber0\/\d+$/),
      expect.stringMatching(/^Gold0\/\d+$/),
    ])
  })

  it('gruppiert nach Kategorie in fester Reihenfolge', async () => {
    await setup('/held?tab=erfolge')
    const panel = screen.getByRole('tabpanel', { name: /^Erfolge/ })
    const headings = within(panel)
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent?.replace(/\s*–.*$/, ''))
    expect(headings).toEqual([
      'Deine Erfolge',
      'Beständigkeit',
      'Fleiß',
      'Perfektion',
      'Kampagnen',
      'Wachstum',
      'Schatzkammer',
      'Besondere Momente',
    ])
    const perfection = screen.getByRole('region', { name: /^Perfektion/ })
    expect(perfection).toHaveAccessibleName(/1 \/ 4$/)
  })

  it('zeigt freigeschaltete mit Stufe, Gold und Datum, gesperrte mit Fortschritt', async () => {
    await setup('/held?tab=erfolge')
    const unlocked = card('Makellos')
    expect(unlocked).toHaveAttribute('data-unlocked', 'true')
    expect(unlocked).toHaveAttribute('data-tier', 'bronze')
    expect(unlocked).toHaveTextContent('Stufe: Bronze')
    expect(unlocked).toHaveTextContent('+25 Gold')
    expect(unlocked).toHaveTextContent('Freigeschaltet am 2. November 2026')
    expect(within(unlocked).queryByRole('progressbar')).not.toBeInTheDocument()

    const locked = card('Sieben Sterne')
    expect(locked).not.toHaveAttribute('data-unlocked')
    expect(locked).toHaveTextContent('2 / 7')
    const bar = within(locked).getByRole('progressbar', { name: 'Fortschritt: Sieben Sterne' })
    expect(bar).toHaveAttribute('aria-valuenow', '29')
    expect(bar).toHaveAttribute('aria-valuetext', '2 von 7')
  })

  it('verbirgt geheime Erfolge bis zum Freischalten', async () => {
    await setup('/held?tab=erfolge')
    const special = screen.getByRole('region', { name: /^Besondere Momente/ })
    const secrets = within(special).getAllByRole('listitem')
    expect(secrets.length).toBeGreaterThan(0)
    for (const secret of secrets) {
      expect(secret).toHaveAccessibleName('Geheimer Erfolg')
      expect(secret).toHaveTextContent('???')
      expect(secret).toHaveTextContent('Ein geheimer Erfolg – er zeigt sich erst, wenn du ihn erreichst.')
      expect(within(secret).queryByRole('progressbar')).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Phönix')).not.toBeInTheDocument()
  })
})

describe('achievementView', () => {
  const definition = ACHIEVEMENTS[0]
  function state(overrides: Partial<AchievementState> & { secret?: boolean; tier?: 'bronze' | 'silver' | 'gold' }) {
    const { secret, tier, ...rest } = overrides
    return {
      definition: { ...definition, secret, tier: tier ?? definition.tier },
      unlocked: false,
      current: 0,
      target: 7,
      progress: 0,
      ...rest,
    } satisfies AchievementState
  }

  it('fasst Stufen zusammen und gruppiert ohne leere Kategorien', () => {
    const items = [
      state({ unlocked: true, tier: 'bronze' }),
      state({ tier: 'silver' }),
      state({ unlocked: true, tier: 'gold' }),
    ]
    expect(summarizeAchievements(items)).toEqual({
      unlocked: 2,
      total: 3,
      byTier: { bronze: { unlocked: 1, total: 1 }, silver: { unlocked: 0, total: 1 }, gold: { unlocked: 1, total: 1 } },
    })
    const groups = groupAchievements(items)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ category: definition.category, unlocked: 2 })
  })

  it('verbirgt nur gesperrte geheime Erfolge und formatiert den Fortschritt (de-DE)', () => {
    expect(isHidden(state({ secret: true }))).toBe(true)
    expect(isHidden(state({ secret: true, unlocked: true }))).toBe(false)
    expect(isHidden(state({}))).toBe(false)
    expect(progressText({ current: 1234.6, target: 10000 })).toBe('1.234 / 10.000')
    expect(formatUnlockDate('2026-03-29')).toBe('29. März 2026')
  })
})
