// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../data/db'
import {
  createHabit,
  createSideQuest,
  completeSideQuest,
  loadGameData,
  markHpIntroSeen,
  recordProgress,
  resetAllData,
  saveProfile,
  setCompletionValue,
  updateProfile,
  updateSettings,
} from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import { dayRange } from '../../domain/dates'
import { deriveGameState } from '../../domain/engine'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { DashboardPage } from '../DashboardPage'

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

function setNow(year: number, month: number, day: number) {
  vi.setSystemTime(new Date(year, month - 1, day, 12, 0, 0))
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  setNow(2026, 11, 3)
  await resetAllData()
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: START })
  // Die Einführung der Lebenspunkte ist gesehen – sonst stünde sie vor der neuen Einführung.
  await markHpIntroSeen()
})
afterEach(cleanup)

async function renderDashboard() {
  const user = userEvent.setup()
  const view = renderWithGame(<DashboardPage />)
  await screen.findByRole('heading', { level: 1, name: 'Heute' })
  return { user, ...view }
}

/** Die Boss-Karte (Abschnitt mit der Überschrift = Boss-Name bzw. „Kein Boss in Sicht“). */
function bossCard(): HTMLElement {
  const card = document.querySelector<HTMLElement>('[data-boss-state]')
  if (card === null) throw new Error('Keine Boss-Karte')
  return card
}

/** Intelligenz auf Level 3 bis Sonntag (Lesen täglich ab dem 20. Oktober) → diese Woche Magier/in. */
async function becomeMage() {
  const habit = await createHabit(READING, START)
  for (const day of dayRange(START, '2026-11-01')) await setCompletionValue(habit.id, day, 1)
  return habit
}

describe('Dashboard Phase 3a – Helden-Kopf', () => {
  it('zeigt Level und Klasse in der Sprachform des Helden', async () => {
    await becomeMage()
    await updateProfile({ form: 'female' })
    await updateSettings({ combatIntroSeen: true })
    await renderDashboard()

    const hero = screen.getByRole('heading', { level: 2, name: 'Aria' }).closest('section') as HTMLElement
    await waitFor(() => expect(hero.querySelector('[data-hero-class="mage"]')).not.toBeNull())
    expect(hero).toHaveTextContent(/Lvl \d+ · 🔮 Magierin/)
    expect(within(hero).getByText(/Level \d+, Klasse Magierin/)).toBeInTheDocument()
  })

  it('zeigt am Anfang den Abenteurer – neutral als „Wanderseele“', async () => {
    await updateSettings({ combatIntroSeen: true })
    await renderDashboard()
    const hero = screen.getByRole('heading', { level: 2, name: 'Aria' }).closest('section') as HTMLElement
    expect(hero.querySelector('[data-hero-class="adventurer"]')).not.toBeNull()
    expect(hero).toHaveTextContent('Wanderseele')
  })

  it('zeigt den gewählten Titel unter dem Namen und den Rahmen – gesperrte nicht', async () => {
    await updateSettings({ combatIntroSeen: true })
    await updateProfile({ form: 'female', titleId: 'daring', frameId: 'wanderwood' })
    const view = await renderDashboard()
    const hero = screen.getByRole('heading', { level: 2, name: 'Aria' }).closest('section') as HTMLElement
    await waitFor(() => expect(hero.querySelector('[data-hero-title="daring"]')).toHaveTextContent('die Wagemutige'))
    expect(hero.querySelector('[data-hero-frame="wanderwood"]')).not.toBeNull()
    view.unmount()

    // „Furchtlos“ braucht einen Boss-Sieg – noch gesperrt, also nicht angezeigt.
    await updateProfile({ titleId: 'fearless' })
    await renderDashboard()
    const again = screen.getByRole('heading', { level: 2, name: 'Aria' }).closest('section') as HTMLElement
    expect(again.querySelector('[data-hero-title]')).toBeNull()
  })
})

describe('Dashboard Phase 3a – Boss-Karte', () => {
  beforeEach(async () => {
    await updateSettings({ combatIntroSeen: true })
  })

  it('zeigt den Wochen-Boss mit Lebensbalken, Restzeit, Schwäche und Truhe', async () => {
    await createHabit(READING, '2026-11-02')
    await renderDashboard()
    const state = deriveGameState(await loadGameData(), TODAY)
    const boss = state.bosses.current
    expect(boss).toBeDefined()
    if (!boss) return

    const card = bossCard()
    expect(card.dataset.bossState).toBe('active')
    const name = within(card).getByRole('heading', { name: boss.boss.name })
    // Der Name ist die wichtigste Angabe: Auf schmalen Handys bricht er um statt als „Fürst der Ablenku…“ zu enden.
    expect(name).not.toHaveClass('truncate')
    expect(within(card).getByText('Wochen-Boss')).toBeInTheDocument()
    const bar = within(card).getByRole('progressbar', { name: `Lebenspunkte von ${boss.boss.name}` })
    expect(bar).toHaveAttribute('aria-valuetext', `${boss.boss.name}: noch ${boss.hp} von ${boss.maxHp} Lebenspunkten`)
    expect(card).toHaveTextContent(`${boss.hp} / ${boss.maxHp} HP`)
    expect(card).toHaveTextContent('noch 6 Tage')
    // Nur Intelligenz ist geplant → die Schwäche ist Intelligenz (Angriff: Arkaner Blitz, im Tooltip).
    expect(card).toHaveTextContent('Schwäche: 🧠 Intelligenz')
    expect(card).toHaveTextContent('Truhe beim Sieg')
    expect(within(card).queryByRole('link')).toBeNull()
  })

  it('ohne geplante Quests: kein Boss in Sicht', async () => {
    await renderDashboard()
    const card = bossCard()
    expect(card.dataset.bossState).toBe('none')
    expect(within(card).getByRole('heading', { name: 'Kein Boss in Sicht' })).toBeInTheDocument()
  })

  it('zeigt beim Abhaken den Treffer – auf die Schwäche als „Schwachstelle!“ – und sagt ihn an', async () => {
    await createHabit(READING, '2026-11-02')
    const { user } = await renderDashboard()
    const card = bossCard()
    const before = Number(card.dataset.bossHp)

    await user.click(screen.getByRole('checkbox', { name: 'Lesen erledigt' }))
    // Mittlere Quest (20) × Schwäche 1,5 = 30 Schaden.
    const hit = await within(card).findByText('Arkaner Blitz', { selector: '[data-boss-hit] *' })
    const float = hit.closest('[data-boss-hit]') as HTMLElement
    expect(float.dataset.bossHit).toBe('weak')
    expect(float.dataset.bossHitMotion).toBe('float')
    expect(float).toHaveTextContent('🧠Arkaner Blitz−30Schwachstelle!')
    await waitFor(() => expect(Number(card.dataset.bossHp)).toBe(before - 30))
    const name = within(card).getByRole('heading', { level: 2 }).textContent
    expect(card.querySelector('[aria-live="polite"]')).toHaveTextContent(
      `Treffer gegen ${name}: Arkaner Blitz, 30 Schaden. Schwachstelle!`,
    )
    // Der Treffer verschwindet wieder.
    await waitFor(() => expect(card.querySelector('[data-boss-hit]')).toBeNull(), { timeout: 3000 })
  })

  it('ohne Effekte erscheint der Treffer ruhig (ohne Aufsteigen); Nebenquests treffen auch', async () => {
    await updateSettings({ effects: false })
    await createHabit(READING, '2026-11-02')
    const { user } = await renderDashboard()
    const card = bossCard()

    await user.click(screen.getByRole('checkbox', { name: 'Lesen erledigt' }))
    const float = await waitFor(() => {
      const element = card.querySelector<HTMLElement>('[data-boss-hit]')
      if (element === null) throw new Error('Kein Treffer')
      return element
    })
    expect(float.dataset.bossHitMotion).toBe('still')

    const side = await createSideQuest({ title: 'Steuer', icon: '🧾', attribute: 'discipline', difficulty: 'easy' }, TODAY)
    await completeSideQuest(side.id, TODAY)
    await within(card).findByText('Schildstoß', { selector: '[data-boss-hit] *' })
  })

  it('zeigt auch den entscheidenden Treffer – über dem Siegesspruch', async () => {
    // Leichte tägliche Quest ab heute: 6 × 10 geplant → Boss mit 60 HP, Schwäche Intelligenz (×1,5).
    await createHabit({ ...READING, difficulty: 'easy' }, TODAY)
    for (const difficulty of ['medium', 'easy'] as const) {
      const side = await createSideQuest({ title: `Lernen ${difficulty}`, icon: '📘', attribute: 'intellect', difficulty }, TODAY)
      await completeSideQuest(side.id, TODAY)
    }
    const { user } = await renderDashboard()
    const card = bossCard()
    expect(Number(card.dataset.bossHp)).toBe(15)

    await user.click(screen.getByRole('checkbox', { name: 'Lesen erledigt' }))
    await waitFor(() => expect(card.dataset.bossState).toBe('defeated'))
    expect(card.querySelector('[data-boss-hit="weak"]')).toHaveTextContent('Arkaner Blitz−15')
    expect(card.querySelector('[aria-live="polite"]')).toHaveTextContent(/ist besiegt!$/)
  })

  it('beim ersten Laden gibt es keine Treffer', async () => {
    const habit = await createHabit(READING, '2026-11-02')
    await setCompletionValue(habit.id, TODAY, 1)
    await renderDashboard()
    expect(bossCard().querySelector('[data-boss-hit]')).toBeNull()
  })

  it('besiegt: Sieges-Abzeichen, Spruch und Link zur ungeöffneten Truhe', async () => {
    const habit = await createHabit({ ...READING, difficulty: 'easy' }, TODAY)
    await setCompletionValue(habit.id, TODAY, 1)
    const side = await createSideQuest({ title: 'Prüfung', icon: '🎓', attribute: 'intellect', difficulty: 'epic' }, TODAY)
    await completeSideQuest(side.id, TODAY)
    const state = deriveGameState(await loadGameData(), TODAY)
    expect(state.bosses.current?.defeated).toBe(true)
    await renderDashboard()

    const card = bossCard()
    expect(card.dataset.bossState).toBe('defeated')
    expect(within(card).getByText('Besiegt')).toBeInTheDocument()
    expect(card).toHaveTextContent(state.bosses.current?.boss.defeatLine ?? '')
    expect(within(card).queryByRole('progressbar')).toBeNull()
    // Die Boss-Truhe (dazu mit etwas Glück eine Quest-Truhe).
    const unopened = state.inventory.unopenedChests
    expect(unopened).toBeGreaterThanOrEqual(1)
    const link = within(card).getByRole('link', { name: /ungeöffnete Truhen? – in der Sammlung öffnen/ })
    expect(link).toHaveAttribute('href', '/held?tab=sammlung')
    expect(link).toHaveTextContent(unopened === 1 ? 'Truhe öffnen' : `${unopened} Truhen öffnen`)
  })

  it('verlinkt ungeöffnete Truhen auch ohne Boss', async () => {
    await db.chests.put({ id: 'chapter:q:c', source: 'chapter', foundDay: TODAY, rarity: 'common', content: { kind: 'gold', amount: 30 } })
    await db.chests.put({ id: 'quest:x', source: 'quest', foundDay: TODAY, rarity: 'uncommon', content: { kind: 'gold', amount: 70 } })
    await renderDashboard()
    const card = bossCard()
    expect(card.dataset.bossState).toBe('none')
    expect(within(card).getByRole('link', { name: '2 ungeöffnete Truhen – in der Sammlung öffnen' })).toHaveTextContent(
      '2 Truhen öffnen',
    )
  })
})

describe('Dashboard Phase 3a – Montags-Hinweis', () => {
  beforeEach(async () => {
    await updateSettings({ combatIntroSeen: true })
  })

  it('entkommen: augenzwinkernder Spruch und „Nachtragen“ für den Sonntag', async () => {
    await createHabit(READING, '2026-11-02')
    setNow(2026, 11, 9)
    const state = deriveGameState(await loadGameData(), '2026-11-09')
    const previous = state.bosses.previous
    expect(previous?.defeated).toBe(false)
    const { user } = await renderDashboard()

    const note = await screen.findByRole('note', { name: 'Letzte Woche' })
    expect(note.dataset.lastWeek).toBe('escaped')
    expect(note).toHaveTextContent(previous?.boss.escapeLine ?? '')
    expect(note).toHaveTextContent(`Sonntag vergessen abzuhaken? Es zählt noch – ${previous?.hp} HP bis zum Sieg.`)
    await user.click(within(note).getByRole('button', { name: 'Sonntag nachtragen' }))
    expect(screen.getByRole('radio', { name: /Gestern/ })).toBeChecked()
  })

  it('besiegt: kleiner Jubel – und an anderen Tagen kein Hinweis', async () => {
    await createHabit(READING, '2026-11-02')
    await recordProgress({ bossVictories: [{ weekStart: '2026-11-02', bossId: 'couch-golem', day: '2026-11-06', maxHp: 98 }] })
    setNow(2026, 11, 9)
    const view = await renderDashboard()
    const note = await screen.findByRole('note', { name: 'Letzte Woche' })
    expect(note.dataset.lastWeek).toBe('victory')
    expect(note).toHaveTextContent('Letzte Woche besiegt: Sofagolem – stark gekämpft!')
    view.unmount()

    setNow(2026, 11, 10)
    await renderDashboard()
    expect(screen.queryByRole('note', { name: 'Letzte Woche' })).toBeNull()
  })
})

describe('Dashboard Phase 3a – Einführung', () => {
  it('erklärt kurz, lässt die Sprachform wählen und verschwindet mit „Los geht’s“', async () => {
    await becomeMage()
    const { user } = await renderDashboard()
    const intro = screen.getByRole('region', { name: 'Klassen, Bosse & Beute' })
    expect(intro).toHaveTextContent('Entkommt er, kostet dich das nichts.')
    expect(within(intro).getByRole('radio', { name: 'Neutral' })).toBeChecked()

    await user.click(within(intro).getByRole('radio', { name: 'Heldin' }))
    await waitFor(async () => expect((await loadGameData()).profile?.form).toBe('female'))
    expect(intro.querySelector('[data-combat-intro-preview]')).toHaveTextContent('🔮 Magierin')
    // Der Helden-Kopf zieht sofort mit.
    const hero = screen.getByRole('heading', { level: 2, name: 'Aria' }).closest('section') as HTMLElement
    await waitFor(() => expect(hero).toHaveTextContent('Magierin'))

    await user.click(within(intro).getByRole('button', { name: 'Los geht’s' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Klassen, Bosse & Beute' })).toBeNull())
    expect((await loadGameData()).settings.combatIntroSeen).toBe(true)
  })

  it('steht nie gleichzeitig mit der Einführung der Lebenspunkte da', async () => {
    await updateSettings({ hpIntroSeen: false })
    await renderDashboard()
    expect(screen.getByRole('region', { name: 'Lebenspunkte' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Klassen, Bosse & Beute' })).toBeNull()
  })
})
