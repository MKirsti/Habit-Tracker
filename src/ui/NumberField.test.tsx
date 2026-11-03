// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NumberField } from './NumberField'
import type { NumberFieldProps } from './NumberField'

afterEach(cleanup)

type HarnessProps = Omit<NumberFieldProps, 'value' | 'onChange'> & {
  initial?: number | null
  onValue?: (value: number | null) => void
}

/** Kontrollierte Nutzung wie in einer echten Seite. */
function Harness({ initial = null, onValue, ...props }: HarnessProps) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <>
      <NumberField
        label="Menge"
        value={value}
        onChange={(next) => {
          setValue(next)
          onValue?.(next)
        }}
        {...props}
      />
      <output data-testid="value">{value === null ? 'leer' : String(value)}</output>
    </>
  )
}

function input() {
  return screen.getByRole('spinbutton', { name: 'Menge' })
}

describe('NumberField', () => {
  it('akzeptiert das Komma als Dezimaltrenner', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    await user.type(input(), '1,5')
    expect(onValue).toHaveBeenLastCalledWith(1.5)
    expect(input()).toHaveValue('1,5')
    expect(input()).toHaveAttribute('inputmode', 'decimal')
  })

  it('versteht Tausenderpunkte und meldet leere Eingaben als null', async () => {
    const user = userEvent.setup()
    render(<Harness initial={5} />)
    await user.clear(input())
    expect(screen.getByTestId('value')).toHaveTextContent('leer')
    await user.type(input(), '10.000')
    expect(screen.getByTestId('value')).toHaveTextContent('10000')
  })

  it('begrenzt beim Verlassen auf min/max und formatiert neu', async () => {
    const user = userEvent.setup()
    render(<Harness initial={10} min={1} max={100} />)
    await user.clear(input())
    await user.type(input(), '250')
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    await user.tab()
    expect(screen.getByTestId('value')).toHaveTextContent('100')
    expect(input()).toHaveValue('100')
    expect(input()).not.toHaveAttribute('aria-invalid')
  })

  it('setzt ungültigen Text beim Verlassen auf den letzten gültigen Wert zurück', async () => {
    const user = userEvent.setup()
    render(<Harness initial={2.5} />)
    await user.clear(input())
    await user.type(input(), 'abc')
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    await user.tab()
    expect(input()).toHaveValue('')
    // Leeren hat null gemeldet → zurück auf den letzten gültigen Wert (leer).
    expect(screen.getByTestId('value')).toHaveTextContent('leer')
  })

  it('zählt mit Pfeiltasten in Schritten ohne Rundungsfehler', () => {
    render(<Harness initial={0.1} step={0.2} />)
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input()).toHaveValue('0,3')
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(screen.getByTestId('value')).toHaveTextContent('0.5')
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(input()).toHaveValue('0,3')
  })

  it('hat ±-Buttons, die an den Grenzen deaktiviert sind', async () => {
    const user = userEvent.setup()
    render(<Harness initial={9} max={10} />)
    const plus = screen.getByRole('button', { name: 'Erhöhen' })
    await user.click(plus)
    expect(input()).toHaveValue('10')
    expect(plus).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Verringern' }))
    expect(input()).toHaveValue('9')
  })

  it('übernimmt externe Wertänderungen', () => {
    const { rerender } = render(<NumberField label="Menge" value={3} onChange={() => {}} />)
    expect(input()).toHaveValue('3')
    rerender(<NumberField label="Menge" value={7.25} onChange={() => {}} />)
    expect(input()).toHaveValue('7,25')
  })

  it('liest die (nur sichtbar dargestellte) Einheit mit vor', () => {
    const { rerender } = render(<NumberField label="Menge" value={10} onChange={() => {}} unit="Seiten" />)
    expect(input()).toHaveAttribute('aria-valuenow', '10')
    expect(input()).toHaveAttribute('aria-valuetext', '10 Seiten')
    rerender(<NumberField label="Menge" value={1.5} onChange={() => {}} unit="L" />)
    expect(input()).toHaveAttribute('aria-valuetext', '1,5 L')
    rerender(<NumberField label="Menge" value={null} onChange={() => {}} unit="L" />)
    expect(input()).not.toHaveAttribute('aria-valuetext')
  })

  it('zählt von einem leeren Feld aus bei min (bzw. 0) los', () => {
    render(<Harness min={1} max={5} />)
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input()).toHaveValue('1')
    expect(screen.getByTestId('value')).toHaveTextContent('1')
  })

  it('begrenzt beim Drücken von Enter (vor dem Absenden eines Formulars)', async () => {
    const user = userEvent.setup()
    render(<Harness initial={3} min={1} max={10} />)
    await user.clear(input())
    await user.type(input(), '0{Enter}')
    expect(input()).toHaveValue('1')
    expect(screen.getByTestId('value')).toHaveTextContent('1')
  })

  it('verknüpft Fehlermeldung per aria-describedby', () => {
    render(<NumberField label="Menge" value={3} onChange={() => {}} error="Zu viel" />)
    expect(input()).toHaveAccessibleDescription('Zu viel')
    expect(input()).toHaveAttribute('aria-invalid', 'true')
  })
})
