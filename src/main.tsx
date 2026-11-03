import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
// Schriften lokal gebündelt (offline-fähig, keine externen Requests):
// Cinzel für Überschriften, Inter (variabel) für Fließtext.
import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import '@fontsource-variable/inter'
import './index.css'
import { App } from './app/App'

/** Wie oft eine offene App zusätzlich nach einer neuen Version sucht. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
/** Merker gegen Neulade-Schleifen (z. B. offline ohne Cache): höchstens ein automatischer Versuch je 10 s. */
const STALE_CHUNK_RELOAD_KEY = 'questlog:stale-chunk-reload'

// Nur in der Entwicklung: Hilfsfunktionen unter window.questlog (z. B. questlog.seedDemo(30)).
if (import.meta.env.DEV) {
  void import('./dev/devtools').then(({ installDevtools }) => installDevtools())
}

// Nur im Produktions-Build: Service Worker (Offline-Cache + Updates). Dev-Server und Tests bleiben unberührt.
if (import.meta.env.PROD) {
  setUpServiceWorker()
  reloadOnStaleChunk()
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Questlog: #root fehlt in index.html')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * Registriert den Service Worker und sucht aktiv nach neuen Versionen: stündlich und jedes Mal, wenn
 * die App wieder in den Vordergrund kommt (eine installierte App wird selten wirklich neu gestartet).
 * Eine neue Version übernimmt sofort (`registerType: 'autoUpdate'`), danach lädt die Seite neu.
 * Der Spielstand liegt bei jedem Tippen schon in IndexedDB – nur ein offenes Formular ginge verloren,
 * deshalb wartet das Neuladen, bis kein Dialog mehr offen ist.
 */
function setUpServiceWorker() {
  registerSW({
    immediate: true,
    onNeedReload: reloadWhenNoDialogOpen,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {})
      }
      setInterval(check, UPDATE_CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}

function reloadWhenNoDialogOpen() {
  const dialogOpen = () => document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
  if (!dialogOpen()) {
    window.location.reload()
    return
  }
  // Spätestens, wenn die App in den Hintergrund geht (dann ist das Formular ohnehin nicht im Blick).
  const timer = setInterval(() => {
    if (dialogOpen() && document.visibilityState === 'visible') return
    clearInterval(timer)
    window.location.reload()
  }, 1000)
}

/**
 * Sicherheitsnetz für nachgeladene Seiten: Läuft noch der alte App-Code, während eine neue Version
 * veröffentlicht wurde, gibt es dessen Dateien auf dem Server nicht mehr. Dann einmal neu laden – das
 * holt die neue Version. Klappt auch das nicht, zeigt die Fehlerseite „Neu laden“ an.
 */
function reloadOnStaleChunk() {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      const last = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) || 0
      if (Date.now() - last < 10_000) return
      sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()))
    } catch {
      return // Ohne Merker kein automatisches Neuladen – sonst droht eine Schleife.
    }
    event.preventDefault()
    window.location.reload()
  })
}
