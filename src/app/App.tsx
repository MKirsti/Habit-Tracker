import { MotionConfig } from 'motion/react'
import { Suspense, lazy, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, createHashRouter } from 'react-router'
import type { RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { GameFeedback } from '../features/feedback/GameFeedback'
import { DashboardPage } from '../pages/DashboardPage'
import { LoadingState } from '../ui/Spinner'
import { ToastProvider } from '../ui/Toast'
import { AppErrorBoundary } from './AppErrorBoundary'
import { useGameContext } from './gameContext'
import { AppLoading, GameProvider } from './GameProvider'
import { Layout } from './Layout'
import { requestPersistentStorage } from './persistentStorage'
import { RouteError } from './RouteError'

/*
 * Code-Splitting: „Heute“ (Startseite) ist im Hauptpaket, alle anderen Seiten und das Onboarding
 * werden erst bei Bedarf geladen. Der Service Worker hält alle Teile vorab im Cache (offline).
 */
const OnboardingPage = lazy(async () => ({ default: (await import('../pages/OnboardingPage')).OnboardingPage }))

/**
 * Routen (Hash-Router, damit GitHub Pages ohne Server-Rewrites funktioniert):
 * `/` Heute · `/quests` · `/kampagne` · `/held` · `/einstellungen` · alles andere → `/`.
 */
const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteError />,
    // Wird die App direkt auf einer nachgeladenen Seite geöffnet (z. B. #/quests), bis diese da ist.
    hydrateFallbackElement: <AppLoading />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'quests', lazy: async () => ({ Component: (await import('../pages/QuestsPage')).QuestsPage }) },
      { path: 'kampagne', lazy: async () => ({ Component: (await import('../pages/CampaignPage')).CampaignPage }) },
      { path: 'held', lazy: async () => ({ Component: (await import('../pages/HeroPage')).HeroPage }) },
      {
        path: 'einstellungen',
        lazy: async () => ({ Component: (await import('../pages/SettingsPage')).SettingsPage }),
      },
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
  if (!data.profile) {
    return (
      <Suspense fallback={<AppLoading />}>
        <OnboardingPage />
      </Suspense>
    )
  }
  return <AppRouter />
}

function AppRouter() {
  // Router erst beim ersten Rendern erzeugen (nicht beim Modul-Import) – so bleibt das Modul testbar.
  const [router] = useState(() => createHashRouter(routes))
  // Sobald ein Held existiert (nach dem Onboarding und bei jedem Start): den Browser bitten, den
  // Spielstand – die einzige Kopie – nicht bei Speicherknappheit zu löschen.
  useEffect(() => {
    void requestPersistentStorage()
  }, [])
  return (
    <>
      <RouterProvider router={router} />
      <GameFeedback />
    </>
  )
}
