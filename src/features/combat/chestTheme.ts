/**
 * Farbstimmung der Truhen je Seltenheit (Phase 3a) – für den Truhen-Dialog, die Siegesszene und Hinweise:
 * gewöhnlich Bronze, ungewöhnlich Silber, selten Blau-Violett, legendär Gold (mit Lichtstrahlen).
 *
 * Nur für Beschläge, Leuchten, Ringe und Abzeichen. Schrift in der Seltenheitsfarbe immer über `Badge color` bzw.
 * `tintTextColor` (mit Pergament aufgehellt) – wie bei den Attributfarben.
 */
import type { ChestRarity } from '../../domain/types'

export interface ChestTheme {
  /** Hauptfarbe (Hex) – Leuchten, Ring, Abzeichen. */
  color: string
  /** Zweite Leuchtfarbe (Hex) – bei „selten“ das Violett neben dem Blau, sonst eine hellere Stufe der Hauptfarbe. */
  glow: string
  /** Beschläge der Truhe: Licht, Mitte, Schatten (Hex). */
  metal: { light: string; mid: string; dark: string }
  /** Strahlenkranz beim Öffnen (nur legendär). */
  rays: boolean
  /** Konfetti beim Öffnen (selten und legendär – bei vollen Effekten). */
  confetti: boolean
}

export const CHEST_THEMES: Record<ChestRarity, ChestTheme> = {
  common: {
    color: '#c98a4b',
    glow: '#e3a76f',
    metal: { light: '#ecb47a', mid: '#b87333', dark: '#6e4120' },
    rays: false,
    confetti: false,
  },
  uncommon: {
    color: '#c9d1da',
    glow: '#eef2f6',
    metal: { light: '#f4f7fa', mid: '#b9c3ce', dark: '#5f6a76' },
    rays: false,
    confetti: false,
  },
  rare: {
    color: '#8f9cf5',
    glow: '#b48cf0',
    metal: { light: '#c3cbff', mid: '#7f8fe6', dark: '#3f3a92' },
    rays: false,
    confetti: true,
  },
  legendary: {
    color: '#f0c96a',
    glow: '#fff1c4',
    metal: { light: '#fff1c4', mid: '#f0c96a', dark: '#9c7834' },
    rays: true,
    confetti: true,
  },
}

/** Holz der Truhe (für alle Seltenheiten gleich – die Seltenheit zeigen Beschläge und Licht). */
export const CHEST_WOOD = {
  lidLight: '#8a5a33',
  lidDark: '#56351d',
  light: '#7a4e2c',
  mid: '#5a3820',
  dark: '#3a2413',
  grain: '#2f1c0e',
  outline: '#2a180b',
  /** Dunkles Innere, sichtbar bei offenem Deckel; auch das Schlüsselloch. */
  inside: '#140a04',
} as const

/** Farbstimmung einer Seltenheit – unbekannte Werte (alte/fremde Daten) wie „gewöhnlich“. */
export function chestTheme(rarity: ChestRarity | undefined): ChestTheme {
  return (rarity !== undefined && CHEST_THEMES[rarity]) || CHEST_THEMES.common
}
