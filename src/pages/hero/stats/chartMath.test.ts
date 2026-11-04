import { describe, expect, it } from 'vitest'
import {
  areaPath,
  columnPath,
  formatAxisNumber,
  linePath,
  monthLabels,
  niceStep,
  niceTicks,
  polygonVertex,
  spreadIndexes,
  tooltipLeft,
} from './chartMath'

describe('Achsen', () => {
  it('wählt schöne Schrittweiten', () => {
    expect([0.7, 1, 1.3, 2.2, 3, 7, 12, 180, 2400].map(niceStep)).toEqual([1, 1, 2, 2.5, 5, 10, 20, 200, 2500])
    expect(niceStep(0)).toBe(1)
    expect(niceStep(Number.NaN)).toBe(1)
  })

  it('reicht mit ganzzahligen Schritten bis über das Maximum', () => {
    expect(niceTicks(694)).toEqual([0, 200, 400, 600, 800])
    expect(niceTicks(800)).toEqual([0, 200, 400, 600, 800])
    expect(niceTicks(11_623)).toEqual([0, 5_000, 10_000, 15_000])
    expect(niceTicks(3, 4)).toEqual([0, 1, 2, 3])
    // Ohne Daten: eine kleine, nicht leere Achse.
    expect(niceTicks(0, 4, 100)).toEqual([0, 25, 50, 75, 100])
    expect(niceTicks(Number.NaN)).toEqual([0, 2, 4, 6, 8, 10])
    expect(niceTicks(9, 4)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('schreibt Zahlen unter 10.000 aus und kürzt darüber', () => {
    expect(formatAxisNumber(0)).toBe('0')
    expect(formatAxisNumber(1500)).toBe('1.500')
    expect(formatAxisNumber(9999)).toBe('9.999')
    expect(formatAxisNumber(10_000)).toBe('10 Tsd.')
    expect(formatAxisNumber(12_500)).toBe('12,5 Tsd.')
    expect(formatAxisNumber(1_250_000)).toBe('1,3 Mio.')
  })

  it('verteilt Beschriftungen gleichmäßig – erster und letzter Punkt immer dabei', () => {
    expect(spreadIndexes(0, 4)).toEqual([])
    expect(spreadIndexes(1, 4)).toEqual([0])
    expect(spreadIndexes(10, 3)).toEqual([0, 5, 9])
    expect(spreadIndexes(3, 5)).toEqual([0, 1, 2])
  })
})

describe('Formen', () => {
  it('rundet Säulen oben ab und lässt sie an der Grundlinie eckig', () => {
    expect(columnPath(10, 20, 100, 50, 4)).toBe('M10 100V54Q10 50 14 50H26Q30 50 30 54V100Z')
    // Niedriger als der Radius: Radius schrumpft mit, nichts ragt unter die Grundlinie.
    expect(columnPath(0, 10, 100, 2, 4)).toBe('M0 100V100Q0 98 2 98H8Q10 98 10 100V100Z')
    expect(columnPath(0, 10, 100, 0)).toBe('')
    expect(columnPath(0, 0, 100, 10)).toBe('')
  })

  it('zeichnet Linien und Flächen', () => {
    const points = [
      { x: 0, y: 10 },
      { x: 5.04, y: 4 },
    ]
    expect(linePath(points)).toBe('M0 10L5 4')
    expect(areaPath(points, 20)).toBe('M0 10L5 4L5 20L0 20Z')
    expect(linePath([])).toBe('')
    expect(areaPath([], 20)).toBe('')
  })

  it('setzt die erste Ecke des Sechsecks nach oben, dann im Uhrzeigersinn', () => {
    const center = { x: 100, y: 100 }
    const top = polygonVertex(0, 6, center, 50)
    expect(top.x).toBeCloseTo(100)
    expect(top.y).toBeCloseTo(50)
    const right = polygonVertex(1, 6, center, 50)
    expect(right.x).toBeGreaterThan(100)
    expect(right.y).toBeLessThan(100)
    const bottom = polygonVertex(3, 6, center, 50)
    expect(bottom.y).toBeCloseTo(150)
  })
})

describe('monthLabels', () => {
  it('beschriftet die Woche mit dem Monatsersten – im Januar mit Jahreszahl', () => {
    // Montage vom 22. Dezember 2025 bis 9. Februar 2026
    const weeks = ['2025-12-22', '2025-12-29', '2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09']
    expect(monthLabels(weeks)).toEqual([
      // „Dez“ am linken Rand wäre nur eine Spalte vor „Jan“ – die jüngere Beschriftung gewinnt.
      { index: 1, label: 'Jan 2026' },
      { index: 5, label: 'Feb' },
    ])
  })

  it('beschriftet die erste Spalte, wenn genug Platz bis zum nächsten Monat ist', () => {
    const weeks = ['2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06']
    expect(monthLabels(weeks)).toEqual([
      { index: 0, label: 'Jun' },
      { index: 3, label: 'Jul' },
    ])
  })

  it('erkennt einen Montag, der selbst der Erste ist', () => {
    expect(monthLabels(['2026-05-25', '2026-06-01'], 1)).toEqual([
      { index: 0, label: 'Mai' },
      { index: 1, label: 'Jun' },
    ])
  })
})

describe('tooltipLeft', () => {
  it('zentriert über dem Anker, bleibt aber in der Fläche (plus 8 px Rand)', () => {
    expect(tooltipLeft(150, 100, 300)).toBe(100)
    expect(tooltipLeft(10, 100, 300)).toBe(-8)
    expect(tooltipLeft(295, 100, 300)).toBe(208)
    // Breiter als die Fläche: beginnt links.
    expect(tooltipLeft(50, 400, 300)).toBe(-8)
  })
})
