import { Gem, Map as MapIcon, ScrollText, Shield, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  /** Kurzes Label (untere Navigation auf dem Handy). */
  label: string
  /** Label in der Seitenleiste (Desktop) – darf länger sein. */
  sidebarLabel: string
  icon: LucideIcon
  /** Nur bei exakt passendem Pfad aktiv (für "/"). */
  end?: boolean
  /**
   * Unterseiten ohne eigenen Eintrag, auf denen dieser Eintrag ebenfalls hervorgehoben wird – z. B. die
   * Einstellungen (erreichbar über das Zahnrad der Held-Seite) unter „Held“.
   */
  alsoActiveOn?: readonly string[]
}

/** Hauptnavigation – Reihenfolge = Reihenfolge in Bottom-Nav und Seitenleiste. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Heute', sidebarLabel: 'Heute', icon: Sun, end: true },
  { to: '/quests', label: 'Quests', sidebarLabel: 'Quests', icon: ScrollText },
  { to: '/kampagne', label: 'Kampagne', sidebarLabel: 'Kampagne', icon: MapIcon },
  // Kurz „Schätze“: „Schatzkammer“ passt auf 360–390 px nicht in eine der fünf Spalten der unteren Leiste.
  { to: '/schatzkammer', label: 'Schätze', sidebarLabel: 'Schatzkammer', icon: Gem },
  { to: '/held', label: 'Held', sidebarLabel: 'Held', icon: Shield, alsoActiveOn: ['/einstellungen'] },
]

/** Einstellungen: keine eigene Leisten-Position mehr, erreichbar über das Zahnrad im Kopf der Held-Seite. */
export const SETTINGS_PATH = '/einstellungen'

/** true, wenn `pathname` eine der Unterseiten aus `alsoActiveOn` ist (exakt oder darunter). */
export function isAlsoActive(item: Pick<NavItem, 'alsoActiveOn'>, pathname: string): boolean {
  return (item.alsoActiveOn ?? []).some((path) => pathname === path || pathname.startsWith(`${path}/`))
}
