// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BLUEPRINTS } from '../../data/blueprints'
import { archiveMainQuest, createHabit, resetAllData, saveProfile } from '../../data/repository'
import { installBlueprint } from '../../data/seed'
import type { AdventureChoice } from '../../data/seed'
import { ATTRIBUTES } from '../../domain/attributes'
import { CAMPAIGN_LIMIT_MESSAGE } from '../../domain/campaigns'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { ACCENT_SURFACE } from '../campaignTheme'
import { BlueprintLibrary } from './index'
import type { BlueprintLibraryProps } from './index'

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  // Nur die Uhr anhalten – Timer (IndexedDB, userEvent) laufen normal weiter.
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

async function renderLibrary(props: Partial<BlueprintLibraryProps> = {}) {
  const user = userEvent.setup()
  const onConfirm = props.onConfirm ?? vi.fn<(choice: AdventureChoice) => void>()
  const view = renderWithGame(<BlueprintLibrary mode="select" {...props} onConfirm={onConfirm} />)
  await screen.findByRole('button', { name: 'Der Weg des Gelehrten' })
  return { user, onConfirm, ...view }
}

async function openCard(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getByRole('button', { name: title }))
  return screen.findByRole('dialog', { name: title })
}

/** Zeile der Vorschau zu einer Quest (Listeneintrag mit dem Titel). */
function questRow(dialog: HTMLElement, title: string): HTMLElement {
  const quests = within(dialog).getByRole('region', { name: /Quests?$/ })
  const row = within(quests).getByText(title).closest('li')
  if (!row) throw new Error(`Keine Vorschau-Zeile für ${title}`)
  return row
}

async function withProfile() {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
}

describe('BlueprintLibrary – Galerie', () => {
  it('zeigt alle Vorlagen als Karten mit Titel, Tagline und Laufzeit', async () => {
    await renderLibrary()
    const cards = screen.getAllByRole('listitem').filter((item) => item.querySelector('article'))
    expect(cards).toHaveLength(BLUEPRINTS.length)
    for (const blueprint of BLUEPRINTS) {
      const button = screen.getByRole('button', { name: blueprint.title })
      expect(button).toHaveAccessibleDescription(expect.stringContaining(blueprint.tagline))
      expect(screen.getByRole('heading', { level: 3, name: blueprint.title })).toBeInTheDocument()
    }
    // Sport-Vorlage: Klassenwahl mit allen drei Klassen; Laufzeiten in Worten.
    const body = screen.getByRole('button', { name: 'Der Weg des Körpers' })
    expect(body).toHaveAccessibleDescription(expect.stringContaining('Klassenwahl: Krieger, Waldläufer, Gladiator'))
    expect(body).toHaveAccessibleDescription(expect.stringContaining('7 Monate'))
    expect(screen.getByRole('button', { name: 'Der Weg des Gelehrten' })).toHaveAccessibleDescription(
      expect.stringContaining('1 Jahr'),
    )
  })

  it('zeigt im Modus „select“ keine Plätze an', async () => {
    await renderLibrary()
    expect(screen.queryByText(/Kampagnen aktiv/)).not.toBeInTheDocument()
  })
})

describe('BlueprintLibrary – Einrichtung', () => {
  it('Sport-Vorlage: Klassenwahl ist Pflicht, nichts ist vorausgewählt', async () => {
    const { user, onConfirm } = await renderLibrary()
    const dialog = await openCard(user, 'Der Weg des Körpers')

    const classes = within(dialog).getByRole('radiogroup', { name: /Wähle deine Klasse/ })
    const radios = within(classes).getAllByRole('radio')
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual(['strength', 'endurance', 'sports'])
    for (const radio of radios) expect(radio).not.toBeChecked()
    expect(within(dialog).getByText(/Wähle deine Klasse – dann siehst du hier/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Auswählen' }))
    expect(onConfirm).not.toHaveBeenCalled()
    const alert = within(dialog).getByRole('alert')
    expect(alert).toHaveTextContent('Bitte wähle deine Klasse')
    // Steht über den Karten (auf dem Handy sonst außerhalb des sichtbaren Bereichs) und beschreibt die Gruppe.
    expect(alert.compareDocumentPosition(classes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(classes).toHaveAccessibleDescription(expect.stringContaining('Bitte wähle deine Klasse'))
    expect(classes).toHaveAttribute('aria-invalid', 'true')
    expect(radios[0]).toHaveFocus()

    await user.click(within(dialog).getByRole('radio', { name: 'Krieger – Kraftsport' }))
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(questRow(dialog, 'Liegestütze')).toHaveTextContent('10 Mal')

    await user.click(within(dialog).getByRole('button', { name: 'Auswählen' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({ blueprintId: 'body', options: { level: 'beginner', pathId: 'strength' } })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Stufenwechsel ändert die Werte der Vorschau und den Hinweis', async () => {
    const { user } = await renderLibrary()
    const dialog = await openCard(user, 'Der Weg des Gelehrten')
    // Ohne Pfade gibt es keine Klassenwahl, die Vorschau ist sofort da (Einsteiger ist Standard).
    expect(within(dialog).queryByRole('radiogroup', { name: /Klasse/ })).not.toBeInTheDocument()
    const levels = within(dialog).getByRole('radiogroup', { name: 'Stufe' })
    expect(within(levels).getByRole('radio', { name: 'Einsteiger' })).toHaveAttribute('aria-checked', 'true')
    expect(questRow(dialog, 'Täglich lesen')).toHaveTextContent('Täglich · 10 Seiten')
    expect(questRow(dialog, 'Täglich lesen')).toHaveTextContent('+20 XP')
    const scholar = BLUEPRINTS.find((blueprint) => blueprint.id === 'scholar')
    expect(levels).toHaveAccessibleDescription(scholar?.levelHints.beginner)
    const chapters = within(dialog).getByRole('region', { name: /Kapitel$/ })
    expect(within(chapters).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4)

    await user.click(within(levels).getByRole('radio', { name: 'Fortgeschritten' }))
    expect(questRow(dialog, 'Täglich lesen')).toHaveTextContent('Täglich · 25 Seiten')
    expect(questRow(dialog, 'Tiefenlese-Session')).toHaveTextContent('4× pro Woche')
    expect(levels).toHaveAccessibleDescription(scholar?.levelHints.advanced)
    // Laufzeit und Zieldatum: 1 Jahr ab heute.
    expect(dialog).toHaveTextContent('1 Jahr · bis 3. Nov. 2027')
  })

  it('Vorschau fasst die Kapitelziele zusammen', async () => {
    const { user } = await renderLibrary()
    const dialog = await openCard(user, 'Der Weg des Körpers')
    await user.click(within(dialog).getByRole('radio', { name: 'Krieger – Kraftsport' }))
    const chapters = within(dialog).getByRole('region', { name: /Kapitel$/ })
    expect(chapters).toHaveTextContent('4× Krafttraining')
    expect(chapters).toHaveTextContent('Zähler: 10 Neue Bestleistungen')
    expect(chapters).toHaveTextContent('8 Wochen Streak')
    expect(chapters).toHaveTextContent('Meilenstein')
    expect(chapters).toHaveTextContent('1.000 Mal gesamt')
  })

  it('Modus „select“: onConfirm bekommt Vorlage und Optionen (ohne pathId bei Vorlagen ohne Pfade)', async () => {
    const { user, onConfirm } = await renderLibrary()
    const dialog = await openCard(user, 'Der Weg des Gelehrten')
    await user.click(within(dialog).getByRole('radio', { name: 'Fortgeschritten' }))
    await user.click(within(dialog).getByRole('button', { name: 'Auswählen' }))
    expect(onConfirm).toHaveBeenCalledWith({ blueprintId: 'scholar', options: { level: 'advanced' } })
  })

  it('Modus „select“: die Auswahl ist hervorgehoben und belegt den Dialog vor', async () => {
    const selected: AdventureChoice = { blueprintId: 'body', options: { level: 'advanced', pathId: 'endurance' } }
    const { user } = await renderLibrary({ selected })
    const card = screen.getByRole('button', { name: 'Der Weg des Körpers' })
    expect(card).toHaveAccessibleDescription(expect.stringContaining('Ausgewählt'))
    expect(card.closest('article')).toHaveTextContent('Fortgeschritten · 🏹 Waldläufer')
    expect(screen.getByRole('button', { name: 'Der Weg des Gelehrten' })).not.toHaveAccessibleDescription(
      expect.stringContaining('Ausgewählt'),
    )

    const dialog = await openCard(user, 'Der Weg des Körpers')
    expect(within(dialog).getByRole('radio', { name: 'Waldläufer – Ausdauersport' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'Fortgeschritten' })).toHaveAttribute('aria-checked', 'true')
  })

  it('Abbrechen schließt ohne Auswahl; erneutes Öffnen beginnt von vorn', async () => {
    const { user, onConfirm } = await renderLibrary()
    let dialog = await openCard(user, 'Der Weg des Körpers')
    await user.click(within(dialog).getByRole('radio', { name: 'Gladiator – Sport allgemein & Spielsport' }))
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onConfirm).not.toHaveBeenCalled()
    // Der Fokus kehrt zur Karte zurück.
    expect(screen.getByRole('button', { name: 'Der Weg des Körpers' })).toHaveFocus()

    dialog = await openCard(user, 'Der Weg des Körpers')
    for (const radio of within(dialog).getAllByRole('radio', { name: /–/ })) expect(radio).not.toBeChecked()
  })

  it('weist auf geteilte Quests hin (vorhandene Quest mit gleichem Titel wird mitbenutzt)', async () => {
    await withProfile()
    await createHabit(
      {
        title: 'Wasser trinken',
        icon: '🥤',
        attribute: 'vitality',
        difficulty: 'easy',
        schedule: { type: 'daily' },
        measure: { target: 2, unit: 'L' },
      },
      TODAY,
    )
    const { user } = await renderLibrary({ mode: 'start' })
    const alchemist = BLUEPRINTS.find((blueprint) => blueprint.id === 'alchemist')
    if (!alchemist) throw new Error('Vorlage fehlt')
    const dialog = await openCard(user, alchemist.title)
    const row = questRow(dialog, 'Wasser trinken')
    // Die Quest gehört zu keiner aktiven Kampagne – sie wird übernommen.
    expect(row).toHaveTextContent('Hast du schon – deine Quest wird mit ihren Einstellungen und ihrem Verlauf übernommen')
    expect(row).toHaveTextContent('nicht verdoppelt')
    // Gezeigt werden die Einstellungen der vorhandenen Quest – ohne Stufen-Vergleich (der gälte ja nicht).
    expect(row).toHaveTextContent('2 L')
    expect(row.querySelector('[data-level-delta]')).toBeNull()
  })

  it('nennt die Kampagne, der eine geteilte Quest gehört', async () => {
    await withProfile()
    await installBlueprint('body', { level: 'advanced', pathId: 'strength' }, TODAY)
    const { user } = await renderLibrary({ mode: 'start' })
    const dialog = await openCard(user, 'Der Alchemist')
    const row = questRow(dialog, 'Wasser trinken')
    expect(row).toHaveTextContent(
      'Hast du schon für „Der Pfad des Kriegers“ – sie zählt mit deinen Einstellungen für beide Kampagnen, nichts wird verdoppelt.',
    )
    // Einstellungen der vorhandenen Quest (Fortgeschritten: 2,5 L), nicht die der Vorlage (1,5 L).
    expect(row).toHaveTextContent('2,5 L')
  })

  it('zeigt beim Stufenwechsel, was sich ändert – je Quest und für zusätzliche Quests', async () => {
    const { user } = await renderLibrary()
    const dialog = await openCard(user, 'Der Weg des Körpers')
    await user.click(within(dialog).getByRole('radio', { name: 'Krieger – Kraftsport' }))

    // Einsteiger: daneben die Werte von Fortgeschritten …
    expect(questRow(dialog, 'Krafttraining')).toHaveTextContent('2× pro Woche')
    expect(questRow(dialog, 'Krafttraining')).toHaveTextContent('Stufe Fortgeschritten: 4× pro Woche')
    expect(questRow(dialog, 'Liegestütze')).toHaveTextContent('Stufe Fortgeschritten: 30 Mal · +20 XP')
    // … gleiche Werte bleiben unmarkiert, und was Fortgeschritten zusätzlich bringt, steht unter der Liste.
    expect(questRow(dialog, 'Trainingswoche planen').querySelector('[data-level-delta]')).toBeNull()
    const quests = within(dialog).getByRole('region', { name: /Quests?$/ })
    expect(quests).toHaveTextContent('Bei Fortgeschritten zusätzlich: 💧 Wasser trinken')

    await user.click(within(dialog).getByRole('radio', { name: 'Fortgeschritten' }))
    expect(questRow(dialog, 'Krafttraining')).toHaveTextContent('4× pro Woche')
    expect(questRow(dialog, 'Krafttraining')).toHaveTextContent('Stufe Einsteiger: 2× pro Woche')
    expect(questRow(dialog, 'Wasser trinken')).toHaveTextContent('Nur Fortgeschritten')
    // Die Vorschau wird beim Wechsel neu aufgebaut – also neu suchen.
    expect(within(dialog).getByRole('region', { name: /Quests?$/ })).not.toHaveTextContent('zusätzlich')
  })
})

describe('BlueprintLibrary – Modus „start“', () => {
  beforeEach(withProfile)

  it('zeigt die freien Plätze und sperrt laufende Vorlagen', async () => {
    await installBlueprint('scholar', { level: 'beginner' }, TODAY)
    const { user } = await renderLibrary({ mode: 'start' })
    expect(screen.getByText('1 von 3 Kampagnen aktiv')).toBeInTheDocument()
    expect(screen.getByText('2 Plätze frei')).toBeInTheDocument()

    const scholar = screen.getByRole('button', { name: 'Der Weg des Gelehrten' })
    expect(scholar).toHaveAttribute('aria-disabled', 'true')
    expect(scholar).toHaveAccessibleDescription(expect.stringContaining('Läuft bereits'))
    await user.click(scholar)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Andere Vorlagen bleiben startbar.
    expect(screen.getByRole('button', { name: 'Der Weg des Körpers' })).not.toHaveAttribute('aria-disabled')
  })

  it('„Kampagne beginnen“ ruft onConfirm, zeigt den Ladezustand und schließt nach Erfolg', async () => {
    let finish: () => void = () => {}
    const onConfirm = vi.fn(
      (choice: AdventureChoice) =>
        new Promise<void>((resolve) => {
          finish = () => {
            void installBlueprint(choice.blueprintId, choice.options, TODAY).then(() => resolve())
          }
        }),
    )
    const { user } = await renderLibrary({ mode: 'start', onConfirm })
    const dialog = await openCard(user, 'Der Weg des Gelehrten')
    const confirm = within(dialog).getByRole('button', { name: 'Kampagne beginnen' })
    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledWith({ blueprintId: 'scholar', options: { level: 'beginner' } })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute('aria-busy', 'true')
    expect(within(dialog).getByRole('button', { name: 'Abbrechen' })).toBeDisabled()

    finish()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Der Weg des Gelehrten' })).toHaveAttribute('aria-disabled', 'true'),
    )
    expect(screen.getByText('1 von 3 Kampagnen aktiv')).toBeInTheDocument()
  })

  it('bleibt bei einem Fehler offen (den Fehler zeigt der Aufrufer)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onConfirm = vi.fn(async () => {
      throw new Error('Diese Kampagne läuft bereits.')
    })
    const { user } = await renderLibrary({ mode: 'start', onConfirm })
    const dialog = await openCard(user, 'Der Weg des Gelehrten')
    const confirm = within(dialog).getByRole('button', { name: 'Kampagne beginnen' })
    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(confirm).toBeEnabled())
    expect(screen.getByRole('dialog', { name: 'Der Weg des Gelehrten' })).toBeInTheDocument()
    expect(confirm).toHaveFocus()
    consoleError.mockRestore()
  })

  it('alle Plätze belegt: erklärt das Limit und sperrt das Beginnen (Ansehen bleibt möglich)', async () => {
    await installBlueprint('scholar', { level: 'beginner' }, TODAY)
    await installBlueprint('body', { level: 'beginner', pathId: 'sports' }, TODAY)
    await installBlueprint('monk', { level: 'advanced' }, TODAY)
    const onConfirm = vi.fn()
    const { user } = await renderLibrary({ mode: 'start', onConfirm })
    expect(screen.getByText('3 von 3 Kampagnen aktiv')).toBeInTheDocument()
    expect(screen.getByText('Kein Platz frei')).toBeInTheDocument()
    expect(screen.getByText(CAMPAIGN_LIMIT_MESSAGE)).toBeInTheDocument()

    // Laufende Kampagne der Sport-Vorlage zeigt ihre Klasse.
    const body = screen.getByRole('button', { name: 'Der Weg des Körpers' })
    expect(body.closest('article')).toHaveTextContent('Einsteiger · 🛡️ Gladiator')

    const fortress = BLUEPRINTS.find((blueprint) => blueprint.id === 'fortress')
    if (!fortress) throw new Error('Vorlage fehlt')
    const dialog = await openCard(user, fortress.title)
    const confirm = within(dialog).getByRole('button', { name: 'Kampagne beginnen' })
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAccessibleDescription(CAMPAIGN_LIMIT_MESSAGE)
    // Die Vorschau ist trotzdem da.
    expect(within(dialog).getByRole('region', { name: /Kapitel$/ })).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('weist auf eine beendete Kampagne derselben Vorlage hin, die sich zurückholen lässt', async () => {
    const quest = await installBlueprint('alchemist', { level: 'beginner' }, TODAY)
    await archiveMainQuest(quest.id, TODAY)
    const { user } = await renderLibrary({ mode: 'start' })
    const dialog = await openCard(user, 'Der Alchemist')
    expect(dialog).toHaveTextContent(
      'Du hast „Der Alchemist“ beendet. Unter „Beendete & gemeisterte Kampagnen“ kannst du sie mit deinem Fortschritt zurückholen',
    )
    // Andere Vorlagen: kein Hinweis.
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const monk = await openCard(user, 'Der stille Mönch')
    expect(monk).not.toHaveTextContent('beendet')
  })

  it('kennzeichnet gemeisterte Vorlagen – sie sind erneut startbar', async () => {
    const quest = await installBlueprint('scholar', { level: 'beginner' }, TODAY)
    const { db } = await import('../../data/db')
    await db.mainQuests.update(quest.id, {
      chapters: [{ id: 'x', title: 'Fertig', criterion: { type: 'manual' }, manualDone: true, completedDay: TODAY }],
    })
    await renderLibrary({ mode: 'start' })
    const scholar = await screen.findByRole('button', {
      name: 'Der Weg des Gelehrten',
      description: /Gemeistert/,
    })
    expect(scholar).not.toHaveAttribute('aria-disabled')
    expect(screen.getByText('0 von 3 Kampagnen aktiv')).toBeInTheDocument()
  })
})

/** Akzentfarbe (`--accent`) des nächsten Elements mit `data-accent` – Karte, Klasse, Dialog-Inhalt, Vorschau. */
function accentOf(element: Element | null): string {
  const holder = element?.closest('[data-accent]')
  if (!(holder instanceof HTMLElement)) throw new Error('Kein Element mit Akzentfarbe gefunden')
  return holder.style.getPropertyValue('--accent')
}

const BODY = BLUEPRINTS.find((blueprint) => blueprint.id === 'body')

function pathHint(pathId: string, level: 'beginner' | 'advanced'): string {
  const hint = BODY?.paths?.find((path) => path.id === pathId)?.levelHints?.[level]
  if (hint === undefined) throw new Error(`Kein Hinweis für ${pathId}/${level}`)
  return hint
}

describe('BlueprintLibrary – Farben', () => {
  it('jede Karte trägt die Farbe ihres Haupt-Attributs (Rahmen, Schein, Icon-Rahmen)', async () => {
    await renderLibrary()
    for (const blueprint of BLUEPRINTS) {
      const card = screen.getByRole('button', { name: blueprint.title }).closest('article')
      expect(card, blueprint.id).toHaveAttribute('data-accent', blueprint.primaryAttribute)
      expect(card?.style.getPropertyValue('--accent'), blueprint.id).toBe(ATTRIBUTES[blueprint.primaryAttribute].color)
      expect(card?.style.getPropertyValue('--accent-35'), blueprint.id).toContain(ATTRIBUTES[blueprint.primaryAttribute].color)
      // Der Icon-Rahmen nutzt die Variablen der Karte.
      expect(card?.querySelector('[data-medallion]')?.className, blueprint.id).toContain('var(--accent')
    }
    // Das Etikett „Klassenwahl“ steht in der Akzentfarbe (aufgehellt für Lesbarkeit auf der getönten Fläche).
    const body = screen.getByRole('button', { name: 'Der Weg des Körpers' }).closest('article')
    const classes = body?.querySelector<HTMLElement>('[data-classes]')
    expect(classes).toHaveTextContent('Klassenwahl')
    expect(classes?.style.color).toBe('var(--accent-text)')
    expect(classes?.style.borderColor).toBe('var(--accent-35)')
  })

  it('die gewählte Vorlage leuchtet in ihrer Farbe', async () => {
    const selected: AdventureChoice = { blueprintId: 'monk', options: { level: 'beginner' } }
    await renderLibrary({ selected })
    const card = screen.getByRole('button', { name: 'Der stille Mönch' }).closest('article')
    expect(card).toHaveAttribute('data-state', 'selected')
    expect(card?.style.getPropertyValue('--accent')).toBe(ATTRIBUTES.wisdom.color)
    expect(card?.className).toContain('border-(--accent-60)')
    // Dieselbe hervorgehobene Fläche wie Kampagnen-Rahmen und gewählte Klasse (Kontrast der Chips darauf geprüft).
    expect(card).toHaveClass(...ACCENT_SURFACE.split(' '))
  })

  it('mit gewählter bzw. laufender Klasse trägt die Karte die Farbe dieser Klasse', async () => {
    const selected: AdventureChoice = { blueprintId: 'body', options: { level: 'advanced', pathId: 'endurance' } }
    await renderLibrary({ selected })
    const card = screen.getByRole('button', { name: 'Der Weg des Körpers' }).closest('article')
    expect(card).toHaveAttribute('data-accent', 'vitality')
    expect(card?.style.getPropertyValue('--accent')).toBe(ATTRIBUTES.vitality.color)
    cleanup()

    // Modus „start“: Eine laufende Waldläufer-Kampagne färbt ihre (gesperrte) Karte grün.
    await withProfile()
    await installBlueprint('body', { level: 'beginner', pathId: 'endurance' }, TODAY)
    await renderLibrary({ mode: 'start' })
    const running = await screen.findByRole('button', { name: 'Der Weg des Körpers', description: /Läuft bereits/ })
    expect(running.closest('article')?.style.getPropertyValue('--accent')).toBe(ATTRIBUTES.vitality.color)
    // Ohne Wahl bleibt es beim Haupt-Attribut der Vorlage.
    const scholar = screen.getByRole('button', { name: 'Der Weg des Gelehrten' }).closest('article')
    expect(scholar?.style.getPropertyValue('--accent')).toBe(ATTRIBUTES.intellect.color)
  })

  it('Einrichtung: Klassen je in ihrer Farbe, der Dialog wechselt auf die Farbe der gewählten Klasse', async () => {
    const { user } = await renderLibrary()
    const dialog = await openCard(user, 'Der Weg des Körpers')
    const red = ATTRIBUTES.strength.color
    const green = ATTRIBUTES.vitality.color
    const classes = within(dialog).getByRole('radiogroup', { name: /Wähle deine Klasse/ })
    const headerIcon = dialog.querySelector<HTMLElement>('[data-dialog-accent]')

    // Vor der Wahl: Haupt-Attribut der Vorlage (Stärke).
    expect(accentOf(classes)).toBe(red)
    expect(headerIcon).toHaveAttribute('data-dialog-accent', 'strength')
    expect(headerIcon?.style.getPropertyValue('--accent')).toBe(red)

    // Jede Klassenkarte in der Farbe ihres Haupt-Attributs.
    const warrior = within(dialog).getByRole('radio', { name: 'Krieger – Kraftsport' })
    const ranger = within(dialog).getByRole('radio', { name: 'Waldläufer – Ausdauersport' })
    const gladiator = within(dialog).getByRole('radio', { name: 'Gladiator – Sport allgemein & Spielsport' })
    expect(accentOf(warrior)).toBe(red)
    expect(accentOf(ranger)).toBe(green)
    expect(accentOf(gladiator)).toBe(red)

    // Waldläufer gewählt: Kopf, Inhalt und Vorschau in Vitalität-Grün; die Karte ist markiert.
    await user.click(ranger)
    expect(ranger.closest('[data-accent]')).toHaveAttribute('data-checked', 'true')
    expect(ranger.closest('[data-accent]')).toHaveClass(...ACCENT_SURFACE.split(' '))
    expect(accentOf(classes)).toBe(green)
    expect(dialog.querySelector('[data-dialog-accent]')).toHaveAttribute('data-dialog-accent', 'vitality')
    expect(dialog.querySelector<HTMLElement>('[data-dialog-accent]')?.style.getPropertyValue('--accent')).toBe(green)
    const preview = dialog.querySelector<HTMLElement>('[data-preview]')
    expect(preview).toHaveAttribute('data-accent', 'vitality')
    expect(preview?.style.getPropertyValue('--accent')).toBe(green)
    // XP bleiben golden.
    expect(within(questRow(dialog, 'Ausdauer-Einheit')).getByText('+40 XP').className).toContain('text-gold-bright')

    // Gladiator: zurück zu Stärke-Rot.
    await user.click(gladiator)
    expect(accentOf(classes)).toBe(red)
    expect(dialog.querySelector<HTMLElement>('[data-preview]')?.style.getPropertyValue('--accent')).toBe(red)
  })

  it('Vorlage ohne Pfade: Dialog und Vorschau in der Farbe der Vorlage', async () => {
    const { user } = await renderLibrary()
    const dialog = await openCard(user, 'Der stille Mönch')
    const silver = ATTRIBUTES.wisdom.color
    expect(dialog.querySelector<HTMLElement>('[data-dialog-accent]')?.style.getPropertyValue('--accent')).toBe(silver)
    expect(dialog.querySelector<HTMLElement>('[data-preview]')?.style.getPropertyValue('--accent')).toBe(silver)
    const chapters = within(dialog).getByRole('region', { name: /Kapitel$/ })
    expect(chapters.querySelectorAll('[data-chapter-node]').length).toBeGreaterThanOrEqual(4)
  })
})

describe('BlueprintLibrary – Klassen-Hinweise', () => {
  it('zeigt vor der Klassenwahl den allgemeinen Hinweis, danach den der Klasse – auch beim Stufenwechsel', async () => {
    const { user } = await renderLibrary()
    const dialog = await openCard(user, 'Der Weg des Körpers')
    const levels = within(dialog).getByRole('radiogroup', { name: 'Stufe' })
    expect(BODY?.levelHints.beginner).toBeDefined()
    expect(levels).toHaveAccessibleDescription(BODY?.levelHints.beginner)

    await user.click(within(dialog).getByRole('radio', { name: 'Krieger – Kraftsport' }))
    expect(levels).toHaveAccessibleDescription(pathHint('strength', 'beginner'))
    expect(dialog).toHaveTextContent(pathHint('strength', 'beginner'))
    expect(dialog).not.toHaveTextContent(BODY?.levelHints.beginner ?? '')

    await user.click(within(levels).getByRole('radio', { name: 'Fortgeschritten' }))
    expect(levels).toHaveAccessibleDescription(pathHint('strength', 'advanced'))

    await user.click(within(dialog).getByRole('radio', { name: 'Waldläufer – Ausdauersport' }))
    expect(levels).toHaveAccessibleDescription(pathHint('endurance', 'advanced'))

    await user.click(within(dialog).getByRole('radio', { name: 'Gladiator – Sport allgemein & Spielsport' }))
    expect(levels).toHaveAccessibleDescription(pathHint('sports', 'advanced'))

    await user.click(within(levels).getByRole('radio', { name: 'Einsteiger' }))
    expect(levels).toHaveAccessibleDescription(pathHint('sports', 'beginner'))
  })

  it('übernimmt beim Öffnen mit Vorbelegung gleich den Hinweis der gewählten Klasse', async () => {
    const selected: AdventureChoice = { blueprintId: 'body', options: { level: 'advanced', pathId: 'endurance' } }
    const { user } = await renderLibrary({ selected })
    const dialog = await openCard(user, 'Der Weg des Körpers')
    expect(within(dialog).getByRole('radiogroup', { name: 'Stufe' })).toHaveAccessibleDescription(pathHint('endurance', 'advanced'))
    expect(accentOf(within(dialog).getByRole('radiogroup', { name: /Wähle deine Klasse/ }))).toBe(ATTRIBUTES.vitality.color)
  })
})
