// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StepActions, StepIndicator } from './StepParts'

afterEach(cleanup)

describe('StepActions', () => {
  it('markiert die klebende Leiste, damit der Fokus beim Tabben nicht dahinter verschwindet', () => {
    // index.css hält per `html:has([data-step-actions="sticky"])` scroll-padding-bottom frei.
    render(
      <StepActions>
        <button type="submit">Weiter</button>
      </StepActions>,
    )
    expect(screen.getByRole('button', { name: 'Weiter' }).parentElement).toHaveAttribute('data-step-actions', 'sticky')
  })

  it('markiert eine nicht klebende Leiste nicht als klebend', () => {
    render(
      <StepActions sticky={false}>
        <button type="button">Abenteuer beginnen</button>
      </StepActions>,
    )
    expect(screen.getByRole('button', { name: 'Abenteuer beginnen' }).parentElement).toHaveAttribute(
      'data-step-actions',
      'static',
    )
  })
})

describe('StepIndicator', () => {
  it('kennzeichnet erledigte, aktuelle und kommende Schritte', () => {
    render(<StepIndicator steps={['Willkommen', 'Held', 'Kampagne']} current={1} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Willkommen (erledigt)')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[2]).toHaveTextContent('Kampagne')
    expect(items[2]).not.toHaveAttribute('aria-current')
  })
})
