// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useRef, useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog, Dialog } from './Dialog'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  document.getElementById('root')?.remove()
})

function DialogHarness({ onClose, withInitialFocus = false }: { onClose?: () => void; withInitialFocus?: boolean }) {
  const [open, setOpen] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false)
          onClose?.()
        }}
        title="Quest bearbeiten"
        description="Änderungen gelten ab heute."
        initialFocusRef={withInitialFocus ? nameRef : undefined}
      >
        <input ref={nameRef} aria-label="Name" />
        <button type="button">Speichern</button>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('öffnet sich als benannter, modaler Dialog und setzt den Fokus hinein', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)
    await user.click(screen.getByRole('button', { name: 'Öffnen' }))

    const dialog = screen.getByRole('dialog', { name: 'Quest bearbeiten' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Änderungen gelten ab heute.')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('schließt mit Esc und gibt den Fokus zurück', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DialogHarness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Öffnen' })
    await user.click(opener)
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('fokussiert initialFocusRef und hält den Tab-Fokus im Dialog', async () => {
    const user = userEvent.setup()
    render(<DialogHarness withInitialFocus />)
    await user.click(screen.getByRole('button', { name: 'Öffnen' }))
    const dialog = screen.getByRole('dialog')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()

    for (let i = 0; i < 5; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await user.tab({ shift: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('schließt über den Schließen-Button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DialogHarness onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Öffnen' }))
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('schließt per Klick auf den Hintergrund – außer closeOnOverlayClick ist aus', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog open onClose={onClose} title="Hintergrund">
        Inhalt
      </Dialog>,
    )
    const overlay = () => screen.getByRole('dialog').previousElementSibling as HTMLElement
    await user.click(overlay())
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <Dialog open onClose={onClose} title="Hintergrund" closeOnOverlayClick={false}>
        Inhalt
      </Dialog>,
    )
    await user.click(overlay())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('hebt Scroll-Sperre erst auf, wenn der letzte von zwei Dialogen schließt', () => {
    document.body.style.overflow = 'scroll'
    const { rerender } = render(
      <>
        <Dialog open onClose={() => {}} title="Eins" />
        <Dialog open onClose={() => {}} title="Zwei" />
      </>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    rerender(
      <>
        <Dialog open onClose={() => {}} title="Eins" />
        <Dialog open={false} onClose={() => {}} title="Zwei" />
      </>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    rerender(
      <>
        <Dialog open={false} onClose={() => {}} title="Eins" />
        <Dialog open={false} onClose={() => {}} title="Zwei" />
      </>,
    )
    expect(document.body.style.overflow).toBe('scroll')
    document.body.style.overflow = ''
  })

  it('macht #root während des Öffnens inert', async () => {
    const user = userEvent.setup()
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    render(<DialogHarness />, { container: root })

    await user.click(screen.getByRole('button', { name: 'Öffnen' }))
    expect(root.inert).toBe(true)
    await user.keyboard('{Escape}')
    expect(root.inert).toBe(false)
  })
})

function ConfirmHarness({
  onConfirm,
  onClose = () => {},
  danger = false,
}: {
  onConfirm: () => void | Promise<void>
  onClose?: () => void
  danger?: boolean
}) {
  const [open, setOpen] = useState(true)
  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        setOpen(false)
        onClose()
      }}
      onConfirm={onConfirm}
      title="Quest löschen?"
      message="Das kann nicht rückgängig gemacht werden."
      confirmLabel="Löschen"
      danger={danger}
    />
  )
}

describe('ConfirmDialog', () => {
  it('startet bei destruktiven Aktionen mit dem Fokus auf „Abbrechen“', () => {
    render(<ConfirmHarness onConfirm={() => {}} danger />)
    expect(screen.getByRole('alertdialog', { name: 'Quest löschen?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toHaveFocus()
  })

  it('bestätigt und schließt danach', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(<ConfirmHarness onConfirm={onConfirm} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('bleibt offen, wenn die Aktion fehlschlägt', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onClose = vi.fn()
    render(<ConfirmHarness onConfirm={() => Promise.reject(new Error('kaputt'))} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Löschen' })).toBeEnabled())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    consoleError.mockRestore()
  })

  it('gibt den Fokus nach einer fehlgeschlagenen Aktion an den Bestätigen-Button zurück', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ConfirmHarness
        onConfirm={() => {
          // Wie im Browser: Ein Button, der (im Ladezustand) deaktiviert wird, verliert den Fokus an <body>.
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          return Promise.reject(new Error('kaputt'))
        }}
      />,
    )
    const confirm = screen.getByRole('button', { name: 'Löschen' })
    await user.click(confirm)
    await waitFor(() => expect(confirm).toBeEnabled())
    await waitFor(() => expect(confirm).toHaveFocus())
    consoleError.mockRestore()
  })

  it('lässt sich während einer laufenden Aktion weder per Esc noch per Abbrechen schließen', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    let finish: () => void = () => {}
    render(<ConfirmHarness onConfirm={() => new Promise<void>((resolve) => (finish = resolve))} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()

    finish()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('schließt bei verschachtelten Dialogen mit Esc nur den obersten', async () => {
    const user = userEvent.setup()
    const outerClose = vi.fn()

    function Nested() {
      const [confirmOpen, setConfirmOpen] = useState(false)
      return (
        <Dialog open onClose={outerClose} title="Außen">
          <button type="button" onClick={() => setConfirmOpen(true)}>
            Quest löschen …
          </button>
          <ConfirmDialog
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => {}}
            title="Innen"
          />
        </Dialog>
      )
    }

    render(<Nested />)
    const trigger = screen.getByRole('button', { name: 'Quest löschen …' })
    await user.click(trigger)
    expect(screen.getByRole('alertdialog', { name: 'Innen' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(outerClose).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(outerClose).toHaveBeenCalledTimes(1)
  })
})
