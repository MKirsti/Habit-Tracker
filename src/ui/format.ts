/**
 * Zahlen-Helfer für deutschsprachige Ein- und Ausgabe.
 */

/** Formatiert eine Zahl für die Anzeige (de-DE, mit Tausenderpunkten), z. B. 1470 → "1.470". */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString('de-DE', options)
}

/** Begrenzt `value` auf [min, max]. NaN wird zu `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * Formatiert eine Zahl für ein Eingabefeld: Dezimalkomma, keine Tausenderpunkte
 * (damit der Text beim erneuten Parsen eindeutig bleibt). `null` → leerer Text.
 */
export function formatDecimalInput(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return value.toLocaleString('de-DE', { useGrouping: false, maximumFractionDigits: 10 })
}

/**
 * Liest eine vom Menschen getippte Zahl – tolerant gegenüber deutscher und englischer Schreibweise.
 *
 * - Komma ist Dezimaltrennzeichen: "1,5" → 1.5, ",5" → 0.5, "12," → 12 (während des Tippens).
 * - Punkt allein ist ebenfalls Dezimaltrenner ("1.5" → 1.5) – außer er steht im typischen
 *   Tausender-Muster ohne führende Null: "10.000" → 10000, "1.234.567" → 1234567.
 * - Kommen beide Zeichen vor, ist das letzte der Dezimaltrenner: "1.234,5" → 1234.5, "1,234.5" → 1234.5.
 * - Leerzeichen (auch geschützte) und Apostrophe als Tausendertrenner werden ignoriert.
 *
 * @returns die Zahl, oder `null` bei leerer oder ungültiger Eingabe.
 */
export function parseDecimal(input: string): number | null {
  let text = input
    .trim()
    .replace(/[\s  '’]/g, '')
    .replace(/−/g, '-') // typografisches Minus
    .replace(/^\+/, '')
  if (text === '') return null

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')

  if (lastComma !== -1 && lastDot !== -1) {
    text =
      lastComma > lastDot
        ? text.replace(/\./g, '').replace(',', '.') // 1.234,5
        : text.replace(/,/g, '') // 1,234.5
  } else if (lastComma !== -1) {
    // Mehrere Kommas sind im Deutschen keine gültige Zahl.
    if (text.indexOf(',') !== lastComma) return null
    text = text.replace(',', '.')
  } else if (lastDot !== -1 && /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '') // 10.000
  }

  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/** Anzahl der Nachkommastellen einer Zahl (für rundungsfehlerfreie Schritte wie 0,1 + 0,2). */
export function countDecimals(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0
  const text = String(value)
  const exp = /e-(\d+)$/.exec(text)
  if (exp) return Number(exp[1]) + (text.split('e')[0].split('.')[1]?.length ?? 0)
  return text.split('.')[1]?.length ?? 0
}
