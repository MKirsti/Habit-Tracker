// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createHabit,
  loadGameData,
  openChest,
  recordProgress,
  resetAllData,
  saveProfile,
  setCompletionValue,
} from '../../data/repository'
import { deriveGameState } from '../../domain/engine'
import type { CharacterProfile, Chest, DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { HeroPage } from '../HeroPage'

// Der Truhen-Dialog (Animation je Seltenheit) gehört zu `features/combat` und hat eigene Tests. Hier zählt nur, dass
// die Sammlung ihn für die richtige Truhe öffnet und danach weitermacht. Wie der echte Dialog gibt er den Fokus beim
// Verschwinden zurück: an das vorher fokussierte Element oder – ist es weg – an `returnFocus()`.
vi.mock('../../features/combat/ChestOpenDialog', async () => {
  const { openChest } = await import('../../data/repository')
  const { Component } = await import('react')
  interface Props {
    chestId: string
    open: boolean
    onClose(): void
    onOpened?: () => void
    returnFocus?: () => HTMLElement | null
  }
  class TestDialog extends Component<Omit<Props, 'open'>> {
    previous: HTMLElement | null = null
    componentDidMount() {
      this.previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    componentWillUnmount() {
      const target = this.previous?.isConnected ? this.previous : this.props.returnFocus?.()
      target?.focus()
    }
    render() {
      const { chestId, onClose, onOpened } = this.props
      return (
        <div role="dialog" aria-label="Truhe öffnen (Test)">
          <p>Truhe {chestId}</p>
          <button type="button" onClick={() => void openChest(chestId, '2026-11-03').then(() => onOpened?.())}>
            Aufklappen
          </button>
          <button type="button" onClick={onClose}>
            Schließen
          </button>
        </div>
      )
    }
  }
  return {
    ChestOpenDialog: ({ open, ...props }: Props) => (open ? <TestDialog {...props} /> : null),
  }
})

// Klang & Vibration: nur prüfen, dass im richtigen Moment gerufen wird.
const sounds = vi.hoisted(() => ({ play: vi.fn(), vibrate: vi.fn() }))
vi.mock('../../features/sound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/sound')>()),
  useGameSounds: () => sounds,
}))

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03; die Woche begann am Montag, 2. November. */
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

async function hero(profile: Partial<CharacterProfile> = {}) {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: CREATED, ...profile })
}

async function render(route: string) {
  const user = userEvent.setup()
  const view = renderWithGame(<HeroPage />, { route })
  await screen.findByRole('heading', { level: 1, name: 'Held' })
  return { user, ...view }
}

describe('Held → Übersicht: Klassen-Karte', () => {
  it('zeigt den Abenteurer in neutraler Form – mit Grund, Bonus, nächsten Wegen und Wochenhinweis', async () => {
    await hero()
    const reading = await createHabit(
      { title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'medium', schedule: { type: 'daily' } },
      CREATED,
    )
    await setCompletionValue(reading.id, '2026-11-02', 1)
    await setCompletionValue(reading.id, TODAY, 1)
    await render('/held')

    const card = await screen.findByRole('region', { name: 'Deine Klasse: Wanderseele' })
    expect(card).toHaveTextContent('Startklasse · noch ohne Schwerpunkt')
    expect(card).toHaveTextContent('Noch suchst du deinen Weg')
    // Klasse der Woche: Stand Sonntag (alles Level 1).
    expect(within(card).getByRole('region', { name: 'Warum diese Klasse?' })).toHaveTextContent(
      'Noch hat kein Attribut Level 3 erreicht – alle stehen am Anfang.',
    )
    expect(within(card).getByRole('region', { name: 'Klassenbonus' })).toHaveTextContent(
      'Noch kein Klassenbonus – mit deiner ersten Klasse triffst du härter: +20 % mit einer Grundklasse, je +10 % mit einer Hybridklasse.',
    )
    // Aktueller Stand: Intelligenz Level 2 mit 1 / 95 XP (20 + 21 XP).
    const next = within(card).getByRole('region', { name: 'Nächste mögliche Klasse' })
    const paths = within(next).getAllByRole('listitem')
    expect(paths[0]).toHaveTextContent('Bring Intelligenz auf Level 3 für Arkane Seele')
    expect(paths[0]).toHaveTextContent('noch 94 XP')
    expect(paths[1]).toHaveTextContent('Bring Stärke auf Level 3 für Eisenherz')
    expect(card).toHaveTextContent('Klassen wechseln nur zu Wochenbeginn')
    expect(card).toHaveTextContent('Gilt seit Montag, 2. Nov.')
    // Angriffskraft je Attribut: noch überall ×1.
    const powers = within(within(card).getByRole('region', { name: 'Angriffskraft diese Woche' })).getAllByRole('listitem')
    expect(powers).toHaveLength(6)
    expect(powers[1]).toHaveTextContent('Intelligenz: Arkaner Blitz, Level 1, Faktor 1')
  })

  it('nutzt den Stand zu Wochenbeginn und die Sprachform: Magierin, ab Montag Erzmagierin', async () => {
    await hero({ form: 'female' })
    const study = await createHabit(
      { title: 'Lernen', icon: '🧠', attribute: 'intellect', difficulty: 'epic', schedule: { type: 'daily' } },
      CREATED,
    )
    const meditate = await createHabit(
      { title: 'Meditieren', icon: '🧘', attribute: 'wisdom', difficulty: 'epic', schedule: { type: 'daily' } },
      CREATED,
    )
    // Vor dem Montag: Intelligenz 80 + 84 XP → Level 3 → Magierin für diese Woche.
    await setCompletionValue(study.id, '2026-10-30', 1)
    await setCompletionValue(study.id, '2026-10-31', 1)
    // In dieser Woche: Weisheit ebenfalls Level 3 – das zählt erst ab nächstem Montag.
    await setCompletionValue(meditate.id, '2026-11-02', 1)
    await setCompletionValue(meditate.id, TODAY, 1)
    await render('/held')

    const card = await screen.findByRole('region', { name: 'Deine Klasse: Magierin' })
    expect(card).toHaveTextContent('Grundklasse · Intelligenz')
    expect(card).toHaveTextContent('Neu diese Woche')
    expect(card).toHaveTextContent('vorher 🧭 Abenteurerin')
    expect(within(card).getByRole('list', { name: 'Deine stärksten Attribute zu Wochenbeginn' })).toHaveTextContent(
      'IntelligenzLvl 3',
    )
    expect(within(card).getByRole('region', { name: 'Warum diese Klasse?' })).toHaveTextContent(
      'Intelligenz hat als einziges Attribut Level 3 erreicht.',
    )
    expect(within(card).getByRole('region', { name: 'Klassenbonus' })).toHaveTextContent('+20 % Schaden mit Intelligenz')
    expect(within(card).getByRole('region', { name: 'Ab Montag' })).toHaveTextContent(
      'Dein Stand reicht schon: 🌌 Erzmagierin erwacht mit der neuen Woche.',
    )
    const powers = within(within(card).getByRole('region', { name: 'Angriffskraft diese Woche' })).getAllByRole('listitem')
    // Intelligenz Level 3 als Magierin: (1 + 0,2) × 1,2 = 1,44.
    expect(powers[1]).toHaveTextContent('Faktor 1,44, mit Klassenbonus')
    expect(powers[1]).toHaveAttribute('data-boosted', 'true')
  })
})

describe('Held → Sammlung', () => {
  it('ist ein eigener Reiter (?tab=sammlung) mit Überblick und Sprungzielen', async () => {
    await hero()
    const { user, router } = await render('/held')
    await user.click(screen.getByRole('tab', { name: /^Sammlung/ }))
    expect(router.state.location.search).toBe('?tab=sammlung')
    const panel = screen.getByRole('tabpanel', { name: /^Sammlung/ })
    const overview = within(panel).getByRole('navigation', { name: 'Deine Sammlung' })
    const tiles = within(overview).getAllByRole('button')
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      '🎁Truhen0 geöffnet',
      expect.stringMatching(/^🎖️Titel1 \/ \d+ freigeschaltet$/),
      expect.stringMatching(/^🖼️Rahmen1 \/ \d+ freigeschaltet$/),
      '🐉Bestiarium0 / 18 bezwungen',
    ])
    await user.click(tiles[3])
    expect(screen.getByRole('region', { name: /^Bestiarium/ })).toHaveFocus()
  })

  it('zeigt im Bestiarium besiegte Bosse mit Anzahl und Datum, den aktuellen Gegner und Unbekannte als Silhouette', async () => {
    await hero()
    const run = await createHabit(
      { title: 'Laufen', icon: '🏃', attribute: 'strength', difficulty: 'medium', schedule: { type: 'daily' } },
      CREATED,
    )
    await setCompletionValue(run.id, '2026-10-20', 1)
    await recordProgress({
      bossVictories: [
        { weekStart: '2026-10-19', bossId: 'couch-golem', day: '2026-10-23', maxHp: 100 },
        { weekStart: '2026-10-26', bossId: 'couch-golem', day: '2026-10-30', maxHp: 100 },
      ],
    })
    const current = deriveGameState(await loadGameData(), TODAY).bosses.current
    await render('/held?tab=sammlung')

    const bestiary = await screen.findByRole('region', { name: /^Bestiarium/ })
    expect(screen.getByRole('heading', { name: /^Bestiarium/ })).toHaveTextContent('1 / 18 bezwungen')
    expect(bestiary).toHaveTextContent('Bisher 2 Siege.')
    const strength = within(bestiary).getByRole('region', { name: /^Bosse der Stärke/ })
    const couch = within(strength).getByRole('heading', { level: 4, name: 'Sofagolem' }).closest('li') as HTMLElement
    expect(couch).toHaveTextContent('×2')
    expect(couch).toHaveTextContent('2-mal besiegt')
    expect(couch).toHaveTextContent('Zuletzt besiegt am 30. Okt.')
    expect(couch).toHaveTextContent('Ein Koloss aus Kissen und Kuscheldecken.')

    // Der Gegner dieser Woche ist bekannt, aber noch nicht besiegt.
    expect(current).toBeDefined()
    const facing = within(bestiary).getByRole('heading', { level: 4, name: current!.boss.name }).closest('li') as HTMLElement
    expect(facing).toHaveTextContent('Gerade im Kampf – noch nicht bezwungen')

    const unknown = within(bestiary).getAllByRole('heading', { level: 4, name: /^Unbekannter Boss (der|des) / })
    expect(unknown).toHaveLength(16)
    expect(unknown[0].closest('li')).toHaveTextContent('???')
    expect(within(bestiary).getAllByRole('region', { name: /^Bosse (der|des) / })).toHaveLength(6)
    // Charisma ist sächlich: „des Charismas“, nicht „der Charisma“.
    const charisma = within(bestiary).getByRole('region', { name: /^Bosse des Charismas/ })
    expect(within(charisma).getAllByRole('heading', { level: 4, name: 'Unbekannter Boss des Charismas' })).toHaveLength(3)
    expect(bestiary).not.toHaveTextContent('der Charisma')
  })

  it('öffnet ungeöffnete Truhen im Truhen-Dialog, führt die Chronik und setzt den Fokus auf die nächste Truhe', async () => {
    await hero({ form: 'female' })
    const chests: Chest[] = [
      { id: 'boss:2026-10-26', source: 'boss', foundDay: '2026-10-30', rarity: 'legendary', content: { kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: 'chosen-one' } },
      { id: 'chapter:dev-a', source: 'chapter', foundDay: '2026-11-02', rarity: 'rare', content: { kind: 'item', itemId: 'streakFreeze' } },
    ]
    await recordProgress({
      bossVictories: [{ weekStart: '2026-10-26', bossId: 'couch-golem', day: '2026-10-30', maxHp: 100 }],
      chests,
    })
    const { user } = await render('/held?tab=sammlung')

    expect(screen.getByRole('tab', { name: /^Sammlung/ })).toHaveTextContent('Sammlung🎁 2, 2 ungeöffnete Truhen')
    const section = await screen.findByRole('region', { name: /^Truhen/ })
    const list = within(section).getByRole('list', { name: 'Ungeöffnete Truhen' })
    const items = within(list).getAllByRole('listitem')
    // Neueste zuerst; der Inhalt bleibt bis zum Öffnen verborgen.
    expect(items.map((item) => item.getAttribute('data-rarity'))).toEqual(['rare', 'legendary'])
    expect(items[0]).toHaveTextContent('Seltene Truhe')
    expect(items[0]).toHaveTextContent('Kapitel-Truhe · Ein abgeschlossenes Kapitel')
    expect(items[0]).toHaveTextContent('Gefunden am 2. Nov.')
    expect(items[1]).toHaveTextContent('Boss-Truhe · 🛋️ Sofagolem besiegt')
    expect(section).not.toHaveTextContent('Streak-Schutz')
    expect(section).not.toHaveTextContent('Chronik')

    await user.click(within(items[0]).getByRole('button', { name: 'Seltene Kapitel-Truhe öffnen' }))
    const dialog = screen.getByRole('dialog', { name: 'Truhe öffnen (Test)' })
    expect(dialog).toHaveTextContent('Truhe chapter:dev-a')
    expect(sounds.play).not.toHaveBeenCalledWith('chest')
    await user.click(within(dialog).getByRole('button', { name: 'Aufklappen' }))
    await waitFor(() => expect(within(section).getByRole('list', { name: /^Chronik/ })).toHaveTextContent('Streak-Schutz'))
    // Das Öffnen klingt (und summt) – wie eine Truhe aus der Siegesszene.
    expect(sounds.play).toHaveBeenCalledWith('chest')
    expect(sounds.vibrate).toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Schließen' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(section).getAllByRole('listitem').filter((item) => item.closest('[aria-label="Ungeöffnete Truhen"]'))).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Legendäre Boss-Truhe öffnen' })).toHaveFocus())
    const chronicle = within(section).getByRole('list', { name: /^Chronik/ })
    expect(within(chronicle).getAllByRole('listitem')[0]).toHaveTextContent('❄️Streak-Schutz')
    expect(within(chronicle).getAllByRole('listitem')[0]).toHaveTextContent('Kapitel-Truhe · Ein abgeschlossenes Kapitel')
    expect(within(chronicle).getAllByRole('listitem')[0]).toHaveTextContent('geöffnet am 3. Nov.')
    expect(screen.getByRole('tab', { name: /^Sammlung/ })).toHaveTextContent('1 ungeöffnete Truhe')
  })

  it('wählt Titel und Rahmen (in der Sprachform des Helden), zeigt gesperrte mit Hinweis und die Vorschau', async () => {
    await hero({ form: 'male' })
    const { user } = await render('/held?tab=sammlung')
    const section = await screen.findByRole('region', { name: 'Titel & Rahmen' })
    const titles = within(section).getByRole('group', { name: /^Titel/ })
    expect(titles).toHaveAccessibleName(expect.stringMatching(/^Titel · 1 \/ \d+ freigeschaltet$/))
    expect(within(titles).getByRole('radio', { name: 'Ohne Titel' })).toBeChecked()
    const fearless = within(titles).getByRole('radio', { name: 'der Furchtlose' })
    expect(fearless).toBeDisabled()
    expect(fearless).toHaveAccessibleDescription(expect.stringContaining('Besiege deinen ersten Wochen-Boss.'))
    expect(within(titles).getByRole('radio', { name: 'der Furchtlose' }).closest('label')).toHaveTextContent('0 / 1 Boss-Siege')

    await user.click(within(titles).getByRole('radio', { name: 'der Wagemutige' }))
    await waitFor(async () => expect((await loadGameData()).profile?.titleId).toBe('daring'))
    expect(within(titles).getByRole('radio', { name: 'der Wagemutige' })).toBeChecked()

    const frames = within(section).getByRole('group', { name: /^Rahmen/ })
    expect(within(frames).getByRole('radio', { name: 'Goldene Plakette' })).toBeChecked()
    const bronze = within(frames).getByRole('radio', { name: 'Bronzereif' })
    expect(bronze).toBeDisabled()
    expect(bronze).toHaveAccessibleDescription(expect.stringContaining('Erreiche Level 5.'))
    expect(within(frames).getByRole('progressbar', { name: 'Fortschritt: Bronzereif' })).toBeInTheDocument()
    await user.click(within(frames).getByRole('radio', { name: 'Wanderholz' }))
    await waitFor(async () => expect((await loadGameData()).profile?.frameId).toBe('wanderwood'))

    // Vorschau: so erscheint der Held.
    const preview = within(section).getByText('So erscheinst du').parentElement as HTMLElement
    await waitFor(() => expect(preview).toHaveTextContent('der Wagemutige'))
    expect(preview).toHaveTextContent('Rahmen: Wanderholz')
    expect(preview).toHaveTextContent('Lvl 1 · 🧭 Abenteurer')

    // Titel ablegen: entfernt die Wahl wieder.
    await user.click(within(titles).getByRole('radio', { name: 'Ohne Titel' }))
    await waitFor(async () => expect((await loadGameData()).profile?.titleId).toBeUndefined())
    expect((await loadGameData()).profile?.frameId).toBe('wanderwood')
  })

  it('zeigt Titel und Rahmen auch im Charakterbogen – gesperrte erscheinen nicht', async () => {
    await hero({ form: 'female', titleId: 'daring', frameId: 'wanderwood' })
    await render('/held')
    const sheet = await screen.findByRole('region', { name: 'Aria' })
    expect(within(sheet).getByText('die Wagemutige')).toBeInTheDocument()
    expect(sheet.querySelector('[data-avatar-frame="wanderwood"]')).not.toBeNull()
    cleanup()

    // Ein (noch) gesperrter Titel bzw. Rahmen wird nicht gezeigt.
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: CREATED, titleId: 'fearless', frameId: 'gold' })
    await render('/held')
    const locked = await screen.findByRole('region', { name: 'Aria' })
    expect(locked).not.toHaveTextContent('die Furchtlose')
    expect(locked.querySelector('[data-avatar-frame]')).toBeNull()
  })

  it('zeichnet den Rahmen wie im Helden-Kopf – ein legendärer mit Lichtbogen und Schein', async () => {
    await hero({ frameId: 'stardust' })
    await recordProgress({
      chests: [{ id: 'chapter:mq:c1', source: 'chapter', foundDay: TODAY, rarity: 'legendary', content: { kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'stardust' } }],
    })
    await openChest('chapter:mq:c1', TODAY)
    await render('/held')
    const sheet = await screen.findByRole('region', { name: 'Aria' })
    const frame = await waitFor(() => {
      const element = sheet.querySelector<HTMLElement>('[data-avatar-frame="stardust"]')
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    expect(frame).toHaveAttribute('data-rarity', 'legendary')
    expect(frame.querySelector('[data-frame-shine]')).not.toBeNull()
  })
})

describe('Held bearbeiten: Sprachform', () => {
  it('ändert die Sprachform mit Live-Vorschau und behält Titel und Rahmen', async () => {
    await hero({ titleId: 'daring', frameId: 'wanderwood' })
    const { user } = await render('/held')
    await user.click(screen.getByRole('button', { name: 'Held bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Held bearbeiten' })
    const group = within(dialog).getByRole('radiogroup', { name: 'Sprachform' })
    expect(within(group).getByRole('radio', { name: 'Neutral' })).toBeChecked()
    const preview = within(dialog).getByText(/^So heißt du dann:/)
    expect(preview).toHaveTextContent('So heißt du dann: 🧭 Wanderseele · guten Mutes')

    await user.click(within(group).getByRole('radio', { name: 'Heldin' }))
    expect(preview).toHaveTextContent('So heißt du dann: 🧭 Abenteurerin · die Wagemutige')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(async () =>
      expect((await loadGameData()).profile).toEqual({
        name: 'Aria',
        avatar: '🧙',
        createdDay: CREATED,
        form: 'female',
        titleId: 'daring',
        frameId: 'wanderwood',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('region', { name: 'Deine Klasse: Abenteurerin' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Aria' })).getByText('die Wagemutige')).toBeInTheDocument()
  })
})
