import { useState } from 'react'
import type { FocusEvent, KeyboardEvent, PointerEvent } from 'react'

export interface ChartCursorOptions {
  /** Anzahl der wählbaren Positionen (Zellen, Balken, Punkte). */
  count: number
  /** Position beim ersten Fokussieren per Tastatur, z. B. heute bzw. der jüngste Wert. */
  initial: number
  /**
   * Nächste Position für eine Taste (`undefined` = Taste wird nicht behandelt). Standard: ←/↑ eine zurück,
   * →/↓ eine weiter, Pos1/Ende an den Rand.
   */
  move?: (index: number, key: string) => number | undefined
  /** Darf die Position gewählt werden (z. B. keine Tage in der Zukunft)? */
  selectable?: (index: number) => boolean
}

export interface ChartCursor {
  /** Gewählte Position (Zeiger oder Tastatur), sonst `null`. */
  active: number | null
  /** Die Fläche hat den Tastaturfokus – dann wird die gewählte Position vorgelesen. */
  keyboard: boolean
  /** Zeiger über bzw. Antippen einer Position. */
  point: (index: number) => void
  /** Props für die fokussierbare Fläche des Diagramms. */
  surfaceProps: {
    tabIndex: 0
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
    onFocus: (event: FocusEvent<HTMLElement>) => void
    onBlur: () => void
    onPointerLeave: (event: PointerEvent<HTMLElement>) => void
  }
}

function defaultMove(index: number, key: string, count: number): number | undefined {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return index - 1
    case 'ArrowRight':
    case 'ArrowDown':
      return index + 1
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return undefined
  }
}

/** Fokus kam per Tastatur (nicht per Klick) – nur dann springt die Auswahl sofort auf `initial`. */
function focusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible')
  } catch {
    return true
  }
}

/**
 * Gemeinsame Bedienung der Diagramme: Zeiger (Hover und Antippen) und Tastatur (Pfeiltasten, Pos1/Ende, Esc)
 * wählen eine Position – Tooltip und Vorlese-Text zeigen dasselbe. Tooltips ergänzen nur: Jeder Wert steht auch
 * in der Tabelle unter dem Diagramm.
 */
export function useChartCursor({ count, initial, move, selectable }: ChartCursorOptions): ChartCursor {
  const [active, setActive] = useState<number | null>(null)
  const [keyboard, setKeyboard] = useState(false)
  const current = active !== null && active >= 0 && active < count ? active : null
  const canSelect = (index: number) => index >= 0 && index < count && (selectable?.(index) ?? true)

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      if (current !== null) {
        event.preventDefault()
        setActive(null)
      }
      return
    }
    const from = current ?? initial
    const next = move ? move(from, event.key) : defaultMove(from, event.key, count)
    if (next === undefined) return
    event.preventDefault()
    setKeyboard(true)
    if (current === null && canSelect(from)) {
      setActive(from)
      return
    }
    if (canSelect(next)) setActive(next)
  }

  return {
    active: current,
    keyboard,
    point: (index) => {
      if (canSelect(index)) setActive(index)
    },
    surfaceProps: {
      tabIndex: 0,
      onKeyDown: handleKeyDown,
      onFocus: (event) => {
        if (!focusVisible(event.currentTarget)) return
        setKeyboard(true)
        if (current === null && canSelect(initial)) setActive(initial)
      },
      onBlur: () => {
        setKeyboard(false)
        setActive(null)
      },
      onPointerLeave: (event) => {
        // Nach dem Antippen verlässt der Finger die Fläche sofort – der Tooltip bleibt, bis woanders getippt wird.
        if (event.pointerType !== 'touch' && !keyboard) setActive(null)
      },
    },
  }
}
