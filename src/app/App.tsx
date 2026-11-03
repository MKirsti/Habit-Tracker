import { MotionConfig } from 'motion/react'
import { useState } from 'react'
import { Navigate, createHashRouter } from 'react-router'
import type { RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { CampaignPage } from '../pages/CampaignPage'
import { DashboardPage } from '../pages/DashboardPage'
import { HeroPage } from '../pages/HeroPage'
import { QuestsPage } from '../pages/QuestsPage'
import { SettingsPage } from '../pages/SettingsPage'
import { LoadingState } from '../ui/Spinner'
import { ToastProvider } from '../ui/Toast'
import { Layout } from './Layout'
import { RouteError } from './RouteError'

/**
 * Routen (Hash-Router, damit GitHub Pages ohne Server-Rewrites funktioniert):
 * `/` Heute · `/quests` · `/kampagne` · `/held` · `/einstellungen` · alles andere → `/`.
 */
const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'quests', element: <QuestsPage /> },
      { path: 'kampagne', element: <CampaignPage /> },
      { path: 'held', element: <HeroPage /> },
      { path: 'einstellungen', element: <SettingsPage /> },
      // Nur in der Entwicklung: lebende Übersicht aller Design-System-Bausteine unter #/designsystem.
      ...(import.meta.env.DEV
        ? [
            {
              path: 'designsystem',
              hydrateFallbackElement: <LoadingState />,
              lazy: async () => ({ Component: (await import('./DesignShowcase')).DesignShowcase }),
            },
          ]
        : []),
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]

export function App() {
  // Router erst beim ersten Rendern erzeugen (nicht beim Modul-Import) – so bleibt das Modul testbar.
  const [router] = useState(() => createHashRouter(routes))

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </MotionConfig>
  )
}
