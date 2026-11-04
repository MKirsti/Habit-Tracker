// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameProvider } from '../../app/GameProvider'
import { recordProgress, resetAllData, saveProfile, updateSettings } from '../../data/repository'
import type { Chest, DayKey } from '../../domain/types'
import { ToastProvider } from '../../ui/Toast'
import { HeroPage } from '../HeroPage'
import { chestOpenButtonId } from './collectionView'

/*
 * Fokus nach dem Truhen-Dialog in der Sammlung – mit dem echten Dialog. Solange er offen ist, ist die App (`#root`)
 * `inert`: Ein Browser ignoriert dort `focus()`. jsdom setzt `inert` nicht um, deshalb bildet der Test es nach – sonst
 * fiele nicht auf, dass ein Fokusziel, das noch während des Dialogs gesetzt wird, verpufft und der Fokus nach dem
 * Schließen auf <body> landet.
 */

const TODAY: DayKey = '2026-11-04'
const nativeFocus = HTMLElement.prototype.focus

function isInert(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if ((node as HTMLElement).inert === true) return true
  }
  return false
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0))
  HTMLElement.prototype.focus = function focusUnlessInert(this: HTMLElement, options?: FocusOptions) {
    if (isInert(this)) return
    nativeFocus.call(this, options)
  }
})
afterAll(() => {
  HTMLElement.prototype.focus = nativeFocus
  vi.useRealTimers()
})
beforeEach(async () => {
  await resetAllData()
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01', form: 'female' })
  // Ohne Effekte erscheint die Beute sofort.
  await updateSettings({ effects: false })
})
afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

function chest(id: string, foundDay: DayKey): Chest {
  return { id, source: 'chapter', foundDay, rarity: 'common', content: { kind: 'gold', amount: 30 } }
}

/** Wie die App: alles in `#root`, damit der Dialog die Seite wirklich `inert` macht. */
async function renderCollection() {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
  const router = createMemoryRouter([{ path: '*', element: <HeroPage /> }], { initialEntries: ['/held?tab=sammlung'] })
  render(
    <ToastProvider>
      <GameProvider>
        <RouterProvider router={router} />
      </GameProvider>
    </ToastProvider>,
    { container: root },
  )
  await screen.findByRole('heading', { level: 1, name: 'Held' })
  return userEvent.setup()
}

async function openAndClose(user: ReturnType<typeof userEvent.setup>, chestId: string) {
  await screen.findAllByRole('button', { name: /Kapitel-Truhe öffnen$/ })
  const button = document.getElementById(chestOpenButtonId(chestId))
  expect(button).not.toBeNull()
  await user.click(button!)
  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Truhe öffnen' }))
  await within(dialog).findByText('+30 Gold')
  await user.click(within(dialog).getByRole('button', { name: 'Weiter' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

describe('Sammlung: Fokus nach dem Öffnen einer Truhe', () => {
  it('springt auf „Öffnen“ der nächsten Truhe – nicht auf <body>', async () => {
    await recordProgress({ chests: [chest('chapter:mq:a', TODAY), chest('chapter:mq:b', '2026-11-03')] })
    const user = await renderCollection()

    // Neueste zuerst: die von heute.
    await openAndClose(user, 'chapter:mq:a')

    await waitFor(() => expect(document.getElementById(chestOpenButtonId('chapter:mq:b'))).toHaveFocus())
  })

  it('springt auf die Chronik, wenn keine Truhe mehr wartet', async () => {
    await recordProgress({ chests: [chest('chapter:mq:a', TODAY)] })
    const user = await renderCollection()

    await openAndClose(user, 'chapter:mq:a')

    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: /^Chronik/ })).toHaveFocus())
  })

  it('bleibt auf „Öffnen“, wenn die Truhe zu bleibt („Später öffnen“)', async () => {
    await recordProgress({ chests: [chest('chapter:mq:a', TODAY)] })
    const user = await renderCollection()
    const button = await screen.findByRole('button', { name: /Kapitel-Truhe öffnen$/ })
    await user.click(button)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Später öffnen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await waitFor(() => expect(document.getElementById(chestOpenButtonId('chapter:mq:a'))).toHaveFocus())
  })
})
