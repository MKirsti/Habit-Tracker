import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/dom'

// Großzügigere Wartezeit für findBy…/waitFor (Standard: 1 s). Auf ausgelasteten CI-Runnern und bei
// parallelen Testläufen brauchen Seiten mit nachgeladenen Teilen sonst gelegentlich zu lange.
configure({ asyncUtilTimeout: 3000 })
