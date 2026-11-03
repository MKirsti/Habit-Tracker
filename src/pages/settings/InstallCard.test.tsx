// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallCard } from './InstallCard'

function mockPersisted(persisted: boolean) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persisted: vi.fn(async () => persisted), persist: vi.fn(async () => persisted) },
  })
}

afterEach(() => {
  cleanup()
  delete (navigator as { storage?: StorageManager }).storage
})

describe('InstallCard – Speicherschutz', () => {
  it('zeigt an, wenn der Speicher dauerhaft geschützt ist', async () => {
    mockPersisted(true)
    render(<InstallCard />)
    expect(await screen.findByText('Speicher geschützt: ja')).toBeInTheDocument()
    expect(screen.getByText(/löscht deinen Spielstand nicht von selbst/)).toBeInTheDocument()
  })

  it('warnt, wenn der Browser die Daten bei Platzmangel löschen darf, und empfiehlt Installation und Backup', async () => {
    mockPersisted(false)
    render(<InstallCard />)
    expect(await screen.findByText('Speicher geschützt: nein')).toBeInTheDocument()
    expect(screen.getByText(/Als installierte App/)).toBeInTheDocument()
    expect(screen.getByText(/Backup/)).toBeInTheDocument()
    // Die Installationsanleitung bleibt sichtbar.
    expect(screen.getByText(/Zum Home-Bildschirm/)).toBeInTheDocument()
  })

  it('zeigt ohne StorageManager-API keinen Status', async () => {
    render(<InstallCard />)
    expect(screen.getByText('iPhone & iPad (Safari)')).toBeInTheDocument()
    // Einen Moment warten, damit eine (fälschliche) asynchrone Anzeige auffiele.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByText(/Speicher geschützt/)).not.toBeInTheDocument()
  })
})
