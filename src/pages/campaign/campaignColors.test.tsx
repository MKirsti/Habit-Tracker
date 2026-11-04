// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { archiveMainQuest, createHabit, createMainQuest, resetAllData, saveProfile } from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import { ATTRIBUTES } from '../../domain/attributes'
import type { AttributeId, Chapter, ChapterState, DayKey, MainQuest, MainQuestState } from '../../domain/types'
import { ACCENT_BADGE_BACKGROUND, CAMPAIGN_FALLBACK_COLOR } from '../../features/campaignTheme'
import { renderWithGame } from '../../test/renderWithGame'
import { tintTextColor } from '../../ui'
import { CampaignPage } from '../CampaignPage'
import { CampaignSection } from '../dashboard/CampaignCard'
import { CampaignBanner } from './CampaignBanner'

/** Dienstag, 3. November 2026 → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'

const MANUAL: Chapter = { id: 'manual', title: 'Das erste Buch', criterion: { type: 'manual' } }

function quest(patch: Partial<MainQuest> = {}): MainQuest {
  return {
    id: 'q1',
    title: 'Der Weg des Gelehrten',
    icon: '📚',
    why: '',
    reward: '',
    startDay: '2026-10-01',
    chapters: [MANUAL, { ...MANUAL, id: 'second', title: 'Das zweite Buch' }],
    createdAt: 1,
    ...patch,
  }
}

/** Ausgewerteter Zustand einer Kampagne – ohne Engine, damit nur die Farbwahl der UI geprüft wird. */
function campaign(patch: Partial<MainQuest> = {}, dominantAttribute?: AttributeId, done = 1): MainQuestState {
  const q = quest(patch)
  const chapters: ChapterState[] = q.chapters.map((chapter, index) => ({
    chapter,
    current: index < done ? 1 : 0,
    target: 1,
    progress: index < done ? 1 : 0,
    done: index < done,
  }))
  const state: MainQuestState = {
    quest: q,
    chapters,
    progress: done / chapters.length,
    currentChapterIndex: done < chapters.length ? done : -1,
    complete: done === chapters.length,
    linkedHabitIds: [],
  }
  if (dominantAttribute !== undefined) state.dominantAttribute = dominantAttribute
  return state
}

/** Füllung eines Fortschrittsbalkens (motion.div im role="progressbar"). */
function fillOf(bar: HTMLElement): HTMLElement {
  const fill = bar.firstElementChild
  if (!(fill instanceof HTMLElement)) throw new Error('Keine Füllung gefunden')
  return fill
}

/** jsdom normalisiert Hex-Farben in Inline-Stilen zu rgb(). */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(cleanup)

describe('Kampagnenfarbe im Banner', () => {
  it('nimmt die Farbe des am stärksten trainierten Attributs – vor dem der Vorlage', () => {
    // Vorlage „Gelehrter“ (Intelligenz), die Quests trainieren aber vor allem Vitalität.
    render(<CampaignBanner campaign={campaign({ blueprint: { id: 'scholar', level: 'beginner' } }, 'vitality')} today={TODAY} />)
    const banner = screen.getByRole('region', { name: 'Der Weg des Gelehrten' })
    const green = ATTRIBUTES.vitality.color
    expect(banner).toHaveAttribute('data-campaign-color', green)
    expect(banner.style.getPropertyValue('--accent')).toBe(green)
    expect(banner.style.getPropertyValue('--accent-35')).toBe(`color-mix(in srgb, ${green} 35%, transparent)`)
    expect(banner.style.getPropertyValue('--accent-text')).toContain(green)
    // Der Gesamtfortschritt füllt sich in der Kampagnenfarbe.
    const bar = within(banner).getByRole('progressbar')
    expect(fillOf(bar).style.backgroundColor).toBe(rgb(green))
  })

  it('fällt ohne aktive Quest auf das Haupt-Attribut der Vorlage zurück – beim Sport auf das des Pfads', () => {
    const { unmount } = render(
      <CampaignBanner campaign={campaign({ title: 'Der stille Mönch', blueprint: { id: 'monk', level: 'advanced' } })} today={TODAY} />,
    )
    expect(screen.getByRole('region', { name: 'Der stille Mönch' })).toHaveAttribute(
      'data-campaign-color',
      ATTRIBUTES.wisdom.color,
    )
    unmount()

    // Sport-Vorlage (Stärke), Pfad „Waldläufer“ (Ausdauer → Vitalität).
    render(
      <CampaignBanner
        campaign={campaign({ title: 'Der Pfad des Waldläufers', blueprint: { id: 'body', level: 'beginner', pathId: 'endurance' } })}
        today={TODAY}
      />,
    )
    expect(screen.getByRole('region', { name: 'Der Pfad des Waldläufers' })).toHaveAttribute(
      'data-campaign-color',
      ATTRIBUTES.vitality.color,
    )
  })

  it('bleibt golden ohne Quests und ohne Vorlage', () => {
    render(<CampaignBanner campaign={campaign({ title: 'Eigenes Projekt' })} today={TODAY} />)
    const banner = screen.getByRole('region', { name: 'Eigenes Projekt' })
    expect(banner).toHaveAttribute('data-campaign-color', CAMPAIGN_FALLBACK_COLOR)
    expect(banner.style.getPropertyValue('--accent')).toBe(CAMPAIGN_FALLBACK_COLOR)
  })

  it('tönt das Klassen-Abzeichen in der Kampagnenfarbe, lässt aber XP und „Gemeistert“ golden', () => {
    const state = campaign({ title: 'Der Pfad des Kriegers', blueprint: { id: 'body', level: 'beginner', pathId: 'strength' } }, 'strength', 2)
    render(<CampaignBanner campaign={state} today={TODAY} />)
    const banner = screen.getByRole('region', { name: 'Der Pfad des Kriegers' })
    const badge = within(banner).getByText(/Krieger · Kraftsport/)
    // Rahmen in Rot, die Schrift leicht aufgehellt und die Fläche deckend (Kontrast trotz Lichtschein dahinter).
    expect(badge.style.borderColor).toContain(rgb(ATTRIBUTES.strength.color))
    expect(badge.style.color).toBe(tintTextColor(ATTRIBUTES.strength.color))
    expect(badge.style.backgroundColor).toBe(ACCENT_BADGE_BACKGROUND)
    expect(within(banner).getByText('Gemeistert')).toHaveClass('text-gold')
    expect(within(banner).getByText(/XP pro Kapitel/)).toHaveClass('text-gold/90')
  })
})

describe('Kampagnenfarbe auf dem Dashboard', () => {
  function renderSection(campaigns: MainQuestState[]) {
    render(
      <MemoryRouter>
        <CampaignSection campaigns={campaigns} />
      </MemoryRouter>,
    )
  }

  /** Die Karte (article) einer Kampagne – gefunden über ihren Link. */
  function cardOf(title: string): HTMLElement {
    const link = screen.getByRole('link', { name: `Kampagne „${title}“ öffnen` })
    const card = link.closest('article')
    if (!card) throw new Error(`Keine Karte für ${title}`)
    return card
  }

  it('färbt die große Karte samt Fortschritt in der Kampagnenfarbe', () => {
    renderSection([campaign({ blueprint: { id: 'scholar', level: 'beginner' } }, 'intellect')])
    const card = cardOf('Der Weg des Gelehrten')
    const blue = ATTRIBUTES.intellect.color
    expect(card).toHaveAttribute('data-campaign-color', blue)
    expect(card.style.getPropertyValue('--accent')).toBe(blue)
    expect(fillOf(within(card).getByRole('progressbar')).style.backgroundColor).toBe(rgb(blue))
  })

  it('gibt mehreren Kampagnen ihre eigene Farbe – dominantes Attribut, Vorlage, sonst Gold', () => {
    renderSection([
      campaign({ id: 'a', title: 'Der Weg des Gelehrten', blueprint: { id: 'scholar', level: 'beginner' } }, 'intellect'),
      campaign({ id: 'b', title: 'Der Pfad des Kriegers', blueprint: { id: 'body', level: 'beginner', pathId: 'strength' } }),
      campaign({ id: 'c', title: 'Eigenes Projekt' }),
    ])
    expect(cardOf('Der Weg des Gelehrten')).toHaveAttribute('data-campaign-color', ATTRIBUTES.intellect.color)
    expect(cardOf('Der Pfad des Kriegers')).toHaveAttribute('data-campaign-color', ATTRIBUTES.strength.color)
    expect(cardOf('Eigenes Projekt')).toHaveAttribute('data-campaign-color', CAMPAIGN_FALLBACK_COLOR)
    const bar = within(cardOf('Der Pfad des Kriegers')).getByRole('progressbar')
    expect(fillOf(bar).style.backgroundColor).toBe(rgb(ATTRIBUTES.strength.color))
  })
})

describe('Kampagnenfarbe auf der Kampagnen-Seite (mit Engine)', () => {
  const YOGA: HabitDraft = {
    title: 'Yoga',
    icon: '🧘',
    attribute: 'wisdom',
    difficulty: 'hard',
    schedule: { type: 'daily' },
  }
  const READING: HabitDraft = {
    title: 'Lesen',
    icon: '📖',
    attribute: 'intellect',
    difficulty: 'easy',
    schedule: { type: 'weekly', times: 2 },
  }

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
  })
  afterAll(() => {
    vi.useRealTimers()
  })
  beforeEach(async () => {
    await resetAllData()
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
  })

  it('färbt Banner, Zeitleiste und Auswahl nach dem Attribut mit den meisten XP pro Woche', async () => {
    // Vorlage „Gelehrter“ (Intelligenz) – die Quests trainieren aber vor allem Weisheit (täglich, schwer).
    const studies = await createMainQuest({
      title: 'Der Weg des Gelehrten',
      icon: '📚',
      why: '',
      reward: '',
      startDay: '2026-10-01',
      chapters: [
        { ...MANUAL, manualDone: true, completedDay: '2026-10-05' },
        { id: 'next', title: 'Weiter', criterion: { type: 'counter', target: 3, label: 'Bücher beendet' }, counter: 1 },
      ],
      blueprint: { id: 'scholar', level: 'beginner' },
    })
    await createHabit({ ...YOGA, mainQuestId: studies.id }, '2026-10-01')
    await createHabit({ ...READING, mainQuestId: studies.id }, '2026-10-01')
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 1))
    await createMainQuest({ title: 'Eigenes Projekt', icon: '🪓', why: '', reward: '', startDay: TODAY, chapters: [MANUAL] })
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))

    renderWithGame(<CampaignPage />, { route: `/kampagne?id=${studies.id}` })
    const banner = await screen.findByRole('region', { name: 'Der Weg des Gelehrten' })
    const silver = ATTRIBUTES.wisdom.color
    expect(banner).toHaveAttribute('data-campaign-color', silver)

    // Zeitleiste: Knoten, Weg und Balken nutzen dieselben Variablen; die Balken füllen sich in der Farbe.
    const chapters = document.querySelector<HTMLElement>('ol[data-campaign-color]')
    expect(chapters).toHaveAttribute('data-campaign-color', silver)
    expect(chapters?.style.getPropertyValue('--accent')).toBe(silver)
    expect(fillOf(screen.getByRole('progressbar', { name: 'Fortschritt: Weiter' })).style.backgroundColor).toBe(rgb(silver))
    expect(within(chapters as HTMLElement).getByText('Aktuelles Kapitel').style.color).toBe(tintTextColor(silver))

    // Auswahl: ein Farbpunkt je Kampagne (Gold für die eigene ohne Quests).
    const selector = screen.getByRole('radiogroup', { name: 'Kampagne wählen' })
    const dots = [...selector.querySelectorAll('[data-campaign-color]')].map((dot) => dot.getAttribute('data-campaign-color'))
    expect(dots).toEqual([silver, CAMPAIGN_FALLBACK_COLOR])
  })

  it('eine beendete Kampagne behält ihre Farbe – auch wenn ihre Quests mitarchiviert sind', async () => {
    // Eigene Kampagne ohne Vorlage: Ohne den Plan ihrer (archivierten) Quests fiele sie auf Gold zurück.
    const own = await createMainQuest({ title: 'Stille Abende', icon: '🕯️', why: '', reward: '', startDay: '2026-10-01', chapters: [MANUAL] })
    await createHabit({ ...YOGA, mainQuestId: own.id }, '2026-10-01')
    await archiveMainQuest(own.id, TODAY, { archiveQuests: true })
    await createMainQuest({ title: 'Eigenes Projekt', icon: '🪓', why: '', reward: '', startDay: TODAY, chapters: [MANUAL] })

    renderWithGame(<CampaignPage />)
    const title = await screen.findByRole('heading', { name: 'Stille Abende' })
    const row = title.closest('li')
    expect(row).toHaveAttribute('data-campaign-color', ATTRIBUTES.wisdom.color)
  })
})
