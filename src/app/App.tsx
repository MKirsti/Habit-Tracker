import { MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, createHashRouter } from 'react-router'
import type { RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { GameFeedback } from '../features/feedback/GameFeedback'
import { CampaignPage } from '../pages/CampaignPage'
import { DashboardPage } from '../pages/DashboardPage'
import { HeroPage } from '../pages/HeroPage'
import { OnboardingPage } from '../pages/OnboardingPage'
import { QuestsPage } from '../pages/QuestsPage'
import { SettingsPage } from '../pages/SettingsPage'
import { LoadingState } from '../ui/Spinner'
import { ToastProvider } from '../ui/Toast'
import { AppErrorBoundary } from './AppErrorBoundary'
import { useGameContext } from './gameContext'
import { GameProvider } from './GameProvider'
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

/**
 * Aufbau: Fehlergrenze → Toasts → Spieldaten (einmal geladen) → Effekte → Onboarding oder Router.
 */
export function App() {
  return (
    <AppErrorBoundary>
      <ToastProvider>
        <GameProvider>
          <EffectsConfig>
            <ProfileGate />
          </EffectsConfig>
        </GameProvider>
      </ToastProvider>
    </AppErrorBoundary>
  )
}

/** Setzt die Einstellung „Effekte“ für Animationen (motion) und CSS-Endlosanimationen um. */
function EffectsConfig({ children }: { children: ReactNode }) {
  const { effects } = useGameContext().data.settings
  useEffect(() => {
    document.documentElement.dataset.effects = effects ? 'on' : 'off'
  }, [effects])
  return <MotionConfig reducedMotion={effects ? 'user' : 'always'}>{children}</MotionConfig>
}

/** Ohne Charakter-Profil startet das Onboarding, sonst die eigentliche App. */
function ProfileGate() {
  const { data } = useGameContext()
  if (!data.profile) return <OnboardingPage />
  return <AppRouter />
}

function AppRouter() {
  // Router erst beim ersten Rendern erzeugen (nicht beim Modul-Import) – so bleibt das Modul testbar.
  const [router] = useState(() => createHashRouter(routes))
  return (
    <>
      <RouterProvider router={router} />
      <GameFeedback />
    </>
  )
}
