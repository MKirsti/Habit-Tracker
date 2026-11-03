// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PageHeader, SectionTitle } from './PageHeader'

afterEach(cleanup)

describe('SectionTitle', () => {
  it('trennt Titel und Meta im vorgelesenen Namen („Kapitel – 2 / 6“ statt „Kapitel2 / 6“)', () => {
    render(<SectionTitle meta="2 / 6">Kapitel</SectionTitle>)
    expect(screen.getByRole('heading', { level: 2, name: 'Kapitel – 2 / 6' })).toBeInTheDocument()
  })

  it('zeigt die Meta-Angabe weiterhin sichtbar ohne den Trenner', () => {
    render(<SectionTitle meta={<>0 / 3</>}>Tagesquests</SectionTitle>)
    const meta = screen.getByText('0 / 3')
    expect(meta).toBeVisible()
    expect(meta.textContent).toBe('0 / 3')
  })

  it('kommt ohne Meta ohne Trenner aus', () => {
    render(
      <SectionTitle as="h3" id="titel">
        Attribute
      </SectionTitle>,
    )
    const heading = screen.getByRole('heading', { level: 3, name: 'Attribute' })
    expect(heading).toHaveAttribute('id', 'titel')
    expect(heading.textContent).toBe('Attribute')
  })
})

describe('PageHeader', () => {
  it('rendert den Seitentitel als h1 mit Untertitel', () => {
    render(<PageHeader title="Quests" subtitle="Deine Gewohnheiten" eyebrow="Tag 12" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Quests' })).toBeInTheDocument()
    expect(screen.getByText('Deine Gewohnheiten')).toBeInTheDocument()
    expect(screen.getByText('Tag 12')).toBeInTheDocument()
  })
})
