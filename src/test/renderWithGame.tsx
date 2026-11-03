/**
 * Test-Helfer für Seiten & Features: rendert eine Komponente mit allen App-Providern
 * (Toasts, Spieldaten aus fake-indexeddb, Memory-Router).
 *
 * Benutzung (Testdatei beginnt mit `// @vitest-environment jsdom` und `import 'fake-indexeddb/auto'`):
 *
 *   beforeEach(async () => { await resetAllData(); await saveProfile({ ... }) })
 *   afterEach(cleanup)
 *   renderWithGame(<QuestsPage />, { route: '/quests?neu=1' })
 */
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { GameProvider } from '../app/GameProvider'
import { ToastProvider } from '../ui/Toast'

export function renderWithGame(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [route] })
  const result = render(
    <ToastProvider>
      <GameProvider>
        <RouterProvider router={router} />
      </GameProvider>
    </ToastProvider>,
  )
  return { ...result, router }
}
