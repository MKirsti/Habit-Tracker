import { useCallback, useRef, useState } from 'react'

/**
 * Misst die Breite des Elements (ResizeObserver) – die Diagramme zeichnen damit 1 : 1 in Pixeln, Schrift und
 * Linien bleiben auf jedem Bildschirm gleich groß. Ohne Messung (Tests, kein ResizeObserver) gilt `fallback`.
 */
export function useChartWidth<T extends HTMLElement>(fallback = 320): [(element: T | null) => void, number] {
  const [width, setWidth] = useState(fallback)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((element: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!element) return
    const measure = () => {
      const measured = Math.floor(element.getBoundingClientRect().width)
      if (measured > 0) setWidth((current) => (current === measured ? current : measured))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    observer.current = new ResizeObserver(measure)
    observer.current.observe(element)
  }, [])
  return [ref, width]
}
