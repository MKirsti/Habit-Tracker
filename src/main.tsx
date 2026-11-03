import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Schriften lokal gebündelt (offline-fähig, keine externen Requests):
// Cinzel für Überschriften, Inter (variabel) für Fließtext.
import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/700.css'
import '@fontsource-variable/inter'
import './index.css'
import { App } from './app/App'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Questlog: #root fehlt in index.html')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
