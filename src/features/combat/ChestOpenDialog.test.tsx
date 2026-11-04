// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameContext } from '../../app/gameContext'
import { db } from '../../data/db'
import { loadGameData, purchaseItem, recordProgress, resetAllData, saveProfile, updateSettings } from '../../data/repository'
import type { Chest, ChestContent, ChestRarity } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { ChestOpenDialog } from './ChestOpenDialog'

const TODAY = '2026-11-04'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  await resetAllData()
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01', form: 'female' })
  // Ohne Effekte: kein Mindest-Klappern, kein Konfetti – die Beute erscheint sofort.
  await updateSettings({ effects: false })
})
afterEach(() => {
  cleanup()
})

async function grant(id: string, rarity: ChestRarity, content: ChestContent): Promise<Chest> {
  const chest: Chest = { id, source: 'chapter', foundDay: TODAY, rarity, content }
  await recordProgress({ chests: [chest] })
  return chest
}

/** Zeigt, dass die Live-Daten geladen sind (und wie viele Truhen der Zustand kennt). */
function Harness({ chestId }: { chestId: string }) {
  const { state } = useGameContext()
  const [open, setOpen] = useState(true)
  return (
    <>
      <p data-testid="chests">{state.chests.length}</p>
      <button type="button" onClick={() => setOpen(true)}>
        Wieder öffnen
      </button>
      <ChestOpenDialog chestId={chestId} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

async function renderDialog(chestId: string) {
  renderWithGame(<Harness chestId={chestId} />)
  await screen.findByTestId('chests')
  return screen.findByRole('dialog')
}

describe('ChestOpenDialog', () => {
  it('zeigt die geschlossene Truhe, öffnet sie per Enter und enthüllt das Gold', async () => {
    await grant('chapter:mq:c1', 'uncommon', { kind: 'gold', amount: 75 })
    const dialog = await renderDialog('chapter:mq:c1')
    expect(dialog).toHaveAccessibleName('Ungewöhnliche Truhe')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('Kapitel-Truhe')
    const open = within(dialog).getByRole('button', { name: 'Truhe öffnen' })
    await waitFor(() => expect(open).toHaveFocus())

    const user = userEvent.setup()
    await user.keyboard('{Enter}')

    await within(dialog).findByText('+75 Gold')
    expect(within(dialog).getByRole('status')).toHaveTextContent('In der Truhe: 75 Gold.')
    expect(dialog.querySelector('[data-chest-phase="open"]')).not.toBeNull()
    const stored = await db.chests.get('chapter:mq:c1')
    expect(stored?.openedAt).toBeTypeOf('number')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Weiter' })).toHaveFocus())

    await user.click(within(dialog).getByRole('button', { name: 'Weiter' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('öffnet auch per Tipp auf die Truhe', async () => {
    await grant('chapter:mq:c1', 'common', { kind: 'gold', amount: 30 })
    const dialog = await renderDialog('chapter:mq:c1')
    const user = userEvent.setup()
    const chest = dialog.querySelector<HTMLElement>('[data-chest-tap]')
    expect(chest).not.toBeNull()
    if (chest) await user.click(chest)
    await within(dialog).findByText('+30 Gold')
  })

  it('legt einen gefundenen Titel in der Sprachform auf Wunsch gleich an', async () => {
    await grant('chapter:mq:c1', 'legendary', { kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: 'timeless' })
    const dialog = await renderDialog('chapter:mq:c1')
    expect(dialog).toHaveAccessibleName('Legendäre Truhe')
    const user = userEvent.setup()
    await user.click(within(dialog).getByRole('button', { name: 'Truhe öffnen' }))

    await within(dialog).findByText('die Zeitlose')
    expect(dialog).toHaveTextContent('So klingt es: Aria, die Zeitlose')
    const equip = within(dialog).getByRole('button', { name: 'Jetzt anlegen' })
    await waitFor(() => expect(equip).toHaveFocus())
    await user.click(equip)

    await within(dialog).findByText('Titel angelegt')
    expect((await loadGameData()).profile?.titleId).toBe('timeless')
    expect((await loadGameData()).cosmeticUnlocks?.map((unlock) => unlock.id)).toEqual(['timeless'])
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Weiter' })).toHaveFocus())
  })

  it('zeigt einen gefundenen Rahmen am eigenen Avatar und legt ihn an', async () => {
    await grant('chapter:mq:c1', 'rare', { kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'dragon-scale' })
    const dialog = await renderDialog('chapter:mq:c1')
    const user = userEvent.setup()
    await user.click(within(dialog).getByRole('button', { name: 'Truhe öffnen' }))
    await within(dialog).findByText('Drachenschuppe')
    expect(dialog.querySelector('[data-avatar-frame="dragon-scale"]')).toHaveTextContent('🧙')
    await user.click(within(dialog).getByRole('button', { name: 'Jetzt anlegen' }))
    await within(dialog).findByText('Rahmen angelegt')
    expect((await loadGameData()).profile?.frameId).toBe('dragon-scale')
  })

  it('zahlt bei vollem Beutel Gold statt Streak-Schutz aus – und sagt warum', async () => {
    await grant('chapter:mq:gold', 'legendary', { kind: 'gold', amount: 2000 })
    await db.chests.update('chapter:mq:gold', { openedAt: 1 })
    for (let i = 0; i < 5; i++) await purchaseItem('streakFreeze', TODAY)
    await grant('chapter:mq:c1', 'rare', { kind: 'item', itemId: 'streakFreeze' })
    const dialog = await renderDialog('chapter:mq:c1')
    const user = userEvent.setup()
    await user.click(within(dialog).getByRole('button', { name: 'Truhe öffnen' }))
    await within(dialog).findByText('+100 Gold')
    expect(dialog).toHaveTextContent('Dein Beutel war schon voll mit Streak-Schutz')
  })

  it('legt einen Streak-Schutz in den Beutel', async () => {
    await grant('chapter:mq:c1', 'rare', { kind: 'item', itemId: 'streakFreeze' })
    const dialog = await renderDialog('chapter:mq:c1')
    const user = userEvent.setup()
    await user.click(within(dialog).getByRole('button', { name: 'Truhe öffnen' }))
    await within(dialog).findByText('Streak-Schutz')
    await waitFor(() => expect(dialog).toHaveTextContent('Im Beutel: 1 / 5.'))
  })

  it('meldet Fehler als Toast und in der Ebene – die Truhe bleibt zu', async () => {
    await grant('chapter:mq:c1', 'common', { kind: 'gold', amount: 30 })
    const dialog = await renderDialog('chapter:mq:c1')
    // In einem anderen Tab schon geöffnet.
    await db.chests.update('chapter:mq:c1', { openedAt: 1 })
    const user = userEvent.setup()
    await user.click(within(dialog).getByRole('button', { name: 'Truhe öffnen' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Diese Truhe hast du schon geöffnet.')
    expect(await screen.findByText('Die Truhe klemmt')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Truhe öffnen' })).toBeEnabled()
  })

  it('zeigt eine schon geöffnete Truhe mit ihrem Inhalt', async () => {
    await grant('chapter:mq:c1', 'common', { kind: 'gold', amount: 30 })
    await db.chests.update('chapter:mq:c1', { openedAt: 1 })
    const dialog = await renderDialog('chapter:mq:c1')
    expect(dialog).toHaveTextContent('Schon geöffnet')
    expect(dialog).toHaveTextContent('+30 Gold')
    expect(within(dialog).queryByRole('button', { name: 'Truhe öffnen' })).not.toBeInTheDocument()
  })

  it('erklärt freundlich, wenn die Truhe fort ist', async () => {
    const dialog = await renderDialog('chapter:mq:weg')
    expect(dialog).toHaveAccessibleName('Die Truhe ist fort')
    const user = userEvent.setup()
    await user.click(within(dialog).getByRole('button', { name: 'Schließen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('schließt mit Esc und „Später öffnen“, ohne die Truhe zu öffnen', async () => {
    await grant('chapter:mq:c1', 'common', { kind: 'gold', amount: 30 })
    await renderDialog('chapter:mq:c1')
    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Wieder öffnen' }))
    await user.click(await screen.findByRole('button', { name: 'Später öffnen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await db.chests.get('chapter:mq:c1'))?.openedAt).toBeUndefined()
  })
})
