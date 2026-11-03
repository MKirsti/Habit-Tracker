import { describe, expect, it } from 'vitest'
import { clamp, countDecimals, formatDecimalInput, formatNumber, parseDecimal } from './format'

describe('parseDecimal', () => {
  it.each([
    ['1,5', 1.5],
    ['1.5', 1.5],
    [',5', 0.5],
    ['12,', 12],
    ['42', 42],
    [' 42 ', 42],
    ['10.000', 10000],
    ['1.234.567', 1234567],
    ['1.234,5', 1234.5],
    ['1,234.5', 1234.5],
    ['0.500', 0.5],
    ['1 000', 1000],
    ['-3,25', -3.25],
    ['−2', -2],
    ['+7', 7],
  ])('liest %j als %d', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '1,2,3', '-', ',', '1e5', '12a', '1..2'])('liefert null für %j', (input) => {
    expect(parseDecimal(input)).toBeNull()
  })
})

describe('formatDecimalInput', () => {
  it('nutzt Dezimalkomma und keine Tausenderpunkte', () => {
    expect(formatDecimalInput(1.5)).toBe('1,5')
    expect(formatDecimalInput(10000)).toBe('10000')
    expect(formatDecimalInput(0)).toBe('0')
  })

  it('liefert leeren Text für null/undefined/NaN', () => {
    expect(formatDecimalInput(null)).toBe('')
    expect(formatDecimalInput(undefined)).toBe('')
    expect(formatDecimalInput(Number.NaN)).toBe('')
  })

  it('ist mit parseDecimal umkehrbar', () => {
    for (const value of [0.25, 3, 1234.5, -7.75, 10000]) {
      expect(parseDecimal(formatDecimalInput(value))).toBe(value)
    }
  })
})

describe('formatNumber', () => {
  it('formatiert de-DE mit Tausenderpunkt', () => {
    expect(formatNumber(1470)).toBe('1.470')
    expect(formatNumber(1.5)).toBe('1,5')
  })
})

describe('clamp & countDecimals', () => {
  it('begrenzt Werte und behandelt NaN', () => {
    expect(clamp(2, 0, 1)).toBe(1)
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(0.4, 0, 1)).toBe(0.4)
    expect(clamp(Number.NaN, 0, 1)).toBe(0)
  })

  it('zählt Nachkommastellen', () => {
    expect(countDecimals(3)).toBe(0)
    expect(countDecimals(0.25)).toBe(2)
    expect(countDecimals(1e-7)).toBe(7)
    expect(countDecimals(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
