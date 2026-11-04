/**
 * Reiter der Held-Seite und ihr Platz in der Adresse (`/held?tab=erfolge`). Ohne (gültigen) Parameter: Übersicht.
 * Phase 2b ergänzt „Statistik“.
 */
export type HeroTabId = 'uebersicht' | 'erfolge'

export const HERO_TAB_PARAM = 'tab'
export const DEFAULT_HERO_TAB: HeroTabId = 'uebersicht'

const HERO_TAB_IDS: readonly HeroTabId[] = ['uebersicht', 'erfolge']

export function parseHeroTab(value: string | null): HeroTabId {
  return HERO_TAB_IDS.find((id) => id === value) ?? DEFAULT_HERO_TAB
}

/** ID eines Reiters (für `aria-labelledby` des Panels). */
export function tabId(idBase: string, tab: string): string {
  return `${idBase}-tab-${tab}`
}

/** ID eines Panels (für `aria-controls` des Reiters). */
export function panelId(idBase: string, tab: string): string {
  return `${idBase}-panel-${tab}`
}
