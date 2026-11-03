import { Map as MapIcon, ScrollText, Settings, Shield, Sun } from 'lucide-react'
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
}

/** Hauptnavigation – Reihenfolge = Reihenfolge in Bottom-Nav und Seitenleiste. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Heute', sidebarLabel: 'Heute', icon: Sun, end: true },
  { to: '/quests', label: 'Quests', sidebarLabel: 'Quests', icon: ScrollText },
  { to: '/kampagne', label: 'Kampagne', sidebarLabel: 'Kampagne', icon: MapIcon },
  { to: '/held', label: 'Held', sidebarLabel: 'Held', icon: Shield },
  { to: '/einstellungen', label: 'Optionen', sidebarLabel: 'Einstellungen', icon: Settings },
]
