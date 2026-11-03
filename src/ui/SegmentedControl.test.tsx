// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'
import type { SegmentedOption } from './SegmentedControl'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(cleanup)

type Level = 'easy' | 'medium' | 'hard' | 'epic'

const OPTIONS: SegmentedOption<Level>[] = [
  { value: 'easy', label: 'Leicht' },
  { value: 'medium', label: 'Mittel' },
  { value: 'hard', label: 'Schwer', disabled: true },
  { value: 'epic', label: 'Episch' },
]

function Harness({ onValue }: { onValue?: (value: Level) => void }) {
  const [value, setValue] = useState<Level>('medium')
  return (
    <SegmentedControl
      label="Schwierigkeit"
      value={value}
      options={OPTIONS}
      onChange={(next) => {
        setValue(next)
        onValue?.(next)
      }}
    />
  )
}

describe('SegmentedControl', () => {
  it('ist eine benannte Radiogruppe mit genau einem Tab-Stopp', () => {
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'Schwierigkeit' })
    const radios = screen.getAllByRole('radio')
    expect(group).toContainElement(radios[0])
    expect(radios).toHaveLength(4)
    expect(screen.getByRole('radio', { name: 'Mittel' })).toBeChecked()
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([screen.getByRole('radio', { name: 'Mittel' })])
  })

  it('wählt per Klick', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    await user.click(screen.getByRole('radio', { name: 'Episch' }))
    expect(onValue).toHaveBeenCalledWith('epic')
    expect(screen.getByRole('radio', { name: 'Episch' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Mittel' })).not.toBeChecked()
  })

  it('wechselt mit Pfeiltasten, überspringt deaktivierte Optionen und läuft um', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.tab()
    expect(screen.getByRole('radio', { name: 'Mittel' })).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    const epic = screen.getByRole('radio', { name: 'Episch' })
    expect(epic).toBeChecked()
    expect(epic).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Leicht' })).toBeChecked()

    await user.keyboard('{ArrowLeft}')
    expect(epic).toBeChecked()
  })

  it('springt mit Home/End an Anfang und Ende', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.tab()
    await user.keyboard('{End}')
    expect(screen.getByRole('radio', { name: 'Episch' })).toBeChecked()
    await user.keyboard('{Home}')
    expect(screen.getByRole('radio', { name: 'Leicht' })).toBeChecked()
  })

  it('funktioniert auch ohne sichtbares Label über aria-label', () => {
    render(<SegmentedControl aria-label="Rhythmus" value="a" onChange={() => {}} options={[{ value: 'a', label: 'A' }]} />)
    expect(screen.getByRole('radiogroup', { name: 'Rhythmus' })).toBeInTheDocument()
  })
})
