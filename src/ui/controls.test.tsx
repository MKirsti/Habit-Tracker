// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AttributeChip } from './AttributeChip'
import { Chip } from './Badge'
import { Button, IconButton } from './Button'
import { Card } from './Card'
import { EmojiPicker } from './EmojiPicker'
import { EMOJI_CATEGORIES, firstGrapheme } from './emojis'
import { Select } from './Select'
import { Switch } from './Switch'
import { TextField } from './TextField'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(cleanup)

describe('Switch', () => {
  it('ist ein benannter Schalter, der beim Klick umschaltet', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [on, setOn] = useState(false)
      return <Switch label="Effekte" description="Konfetti & Co." checked={on} onChange={setOn} />
    }
    render(<Harness />)
    const toggle = screen.getByRole('switch', { name: 'Effekte' })
    expect(toggle).toHaveAccessibleDescription('Konfetti & Co.')
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    expect(toggle).toBeChecked()
    await user.keyboard(' ')
    expect(toggle).not.toBeChecked()
  })
})

describe('Select', () => {
  it('liefert Zahlenwerte im Original-Typ zurück', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Select
        label="Tageswechsel"
        value={4}
        onChange={onChange}
        options={[0, 4, 6].map((h) => ({ value: h, label: `${h}:00 Uhr` }))}
      />,
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tageswechsel' }), '6:00 Uhr')
    expect(onChange).toHaveBeenCalledWith(6)
  })
})

describe('TextField', () => {
  it('meldet Text, zeigt Hinweise und markiert Fehler', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<TextField label="Titel" value="" onChange={onChange} hint="Kurz & knackig" />)
    const field = screen.getByRole('textbox', { name: 'Titel' })
    expect(field).toHaveAccessibleDescription('Kurz & knackig')
    await user.type(field, 'L')
    expect(onChange).toHaveBeenCalledWith('L')

    rerender(<TextField label="Titel" value="" onChange={onChange} error="Bitte einen Titel angeben." />)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('Bitte einen Titel angeben.')
  })

  it('zählt Zeichen wie das maxLength-Attribut des Browsers (UTF-16-Einheiten)', () => {
    // "Lesen 📖" belegt 8 Einheiten (das Emoji zählt doppelt) – das Feld ist damit voll.
    render(<TextField label="Titel" value="Lesen 📖" onChange={() => {}} maxLength={8} showCount />)
    expect(screen.getByRole('textbox', { name: 'Titel' })).toHaveAttribute('maxlength', '8')
    expect(screen.getByText('8/8')).toBeInTheDocument()
  })
})

describe('Card', () => {
  it('zeigt Untertitel und Icon auch ohne Titel', () => {
    render(<Card subtitle="Noch 211 Tage" icon="🏔️" />)
    expect(screen.getByText('Noch 211 Tage')).toBeInTheDocument()
    expect(screen.getByText('🏔️')).toBeInTheDocument()
  })

  it('benennt eine section über ihren Titel', () => {
    render(<Card title="Hauptquest">Inhalt</Card>)
    expect(screen.getByRole('region', { name: 'Hauptquest' })).toBeInTheDocument()
  })
})

describe('Buttons & Chips', () => {
  it('Button ist standardmäßig type="button" und im Ladezustand deaktiviert', () => {
    render(<Button loading>Speichern</Button>)
    const button = screen.getByRole('button', { name: 'Speichern' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('IconButton nutzt aria-label auch als Tooltip', () => {
    render(<IconButton aria-label="Archivieren" icon={<span>×</span>} />)
    expect(screen.getByRole('button', { name: 'Archivieren' })).toHaveAttribute('title', 'Archivieren')
  })

  it('Chip meldet seinen Zustand per aria-pressed', () => {
    render(<Chip selected>Mo</Chip>)
    expect(screen.getByRole('button', { name: 'Mo' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('AttributeChip', () => {
  it('zeigt Icon und Namen des Attributs', () => {
    render(<AttributeChip attribute="intellect" />)
    expect(screen.getByText('Intelligenz')).toBeInTheDocument()
    expect(screen.getByText('🧠')).toBeInTheDocument()
  })

  it('behält den Namen ohne Beschriftung für Screenreader', () => {
    render(<AttributeChip attribute="strength" showName={false} />)
    expect(screen.getByText('Stärke')).toHaveClass('sr-only')
  })
})

describe('EmojiPicker', () => {
  function Harness({ onValue }: { onValue: (emoji: string) => void }) {
    const [emoji, setEmoji] = useState('📖')
    return (
      <EmojiPicker
        label="Symbol"
        value={emoji}
        onChange={(next) => {
          setEmoji(next)
          onValue(next)
        }}
      />
    )
  }

  it('wählt ein Emoji aus dem Raster und markiert es', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    expect(screen.getByRole('group', { name: 'Symbol' })).toBeInTheDocument()
    // Startkategorie ist die des aktuellen Emojis (Lernen).
    expect(screen.getByRole('button', { name: /Lernen/ })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: /Fantasy/ }))
    await user.click(screen.getByRole('button', { name: '🐉' }))
    expect(onValue).toHaveBeenLastCalledWith('🐉')
    expect(screen.getByRole('button', { name: '🐉' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('startet bei eigenen Kategorien in der Kategorie des aktuellen Emojis', () => {
    const categories = [
      { id: 'obst', label: 'Obst', icon: '🍎', emojis: ['🍎', '🍐'] },
      { id: 'tiere', label: 'Tiere', icon: '🦉', emojis: ['🦊', '🦉'] },
    ]
    render(<EmojiPicker value="🦉" onChange={() => {}} categories={categories} />)
    expect(screen.getByRole('button', { name: /Tiere/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '🦉' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('verknüpft den Hinweis mit der Gruppe', () => {
    render(<EmojiPicker label="Symbol" hint="Erscheint in der Questliste." value="📖" onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Symbol' })).toHaveAccessibleDescription('Erscheint in der Questliste.')
  })

  it('übernimmt das erste Zeichen aus dem Freitextfeld', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    await user.type(screen.getByRole('textbox', { name: 'Eigenes Emoji' }), '🦉')
    expect(onValue).toHaveBeenLastCalledWith('🦉')
  })
})

describe('emojis', () => {
  it('firstGrapheme hält zusammengesetzte Emojis zusammen', () => {
    expect(firstGrapheme('🧑‍🤝‍🧑 Freunde')).toBe('🧑‍🤝‍🧑')
    expect(firstGrapheme('  ✍️x')).toBe('✍️')
    expect(firstGrapheme('   ')).toBe('')
  })

  it('enthält je Kategorie nur eindeutige Emojis', () => {
    for (const category of EMOJI_CATEGORIES) {
      expect(new Set(category.emojis).size, category.label).toBe(category.emojis.length)
      expect(category.emojis.length, category.label).toBeGreaterThanOrEqual(16)
    }
  })
})
