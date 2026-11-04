import type { HTMLAttributes } from 'react'
import { ACCENT_SURFACE, accentVars, campaignColor } from '../../features/campaignTheme'
import type { CampaignColorSource } from '../../features/campaignTheme'
import { CornerFlourish, cn } from '../../ui'

export interface CampaignFrameProps extends HTMLAttributes<HTMLElement> {
  /** Kampagne, deren Hauptfarbe den Rahmen färbt (`campaignColor`). */
  campaign: CampaignColorSource
  as?: 'section' | 'article'
  padding?: 'md' | 'lg'
  /** Eckschnörkel in der Kampagnenfarbe (Standard: an). */
  ornate?: boolean
}

const PADDING = {
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
} as const

/**
 * Hervorgehobene Kampagnen-Karte – wie `<Card tone="gold" ornate>`, aber in der Hauptfarbe der Kampagne:
 * Rahmen, Lichtkante, Leuchten und Eckschnörkel. Setzt die Akzent-Variablen (`accentVars`), Inhalte
 * nutzen sie per `border-(--accent-35)`, `text-(--accent-text)` usw.
 */
export function CampaignFrame({
  campaign,
  as: Tag = 'section',
  padding = 'lg',
  ornate = true,
  className,
  style,
  children,
  ...rest
}: CampaignFrameProps) {
  const color = campaignColor(campaign)
  return (
    <Tag
      // Die Farbe auch als Attribut – zum Nachvollziehen (DevTools, Tests).
      data-campaign-color={color}
      style={{ ...accentVars(color), ...style }}
      className={cn(
        'relative isolate rounded-2xl border border-(--accent-35)',
        ACCENT_SURFACE,
        'shadow-[inset_0_1px_0_var(--accent-20),0_0_0_1px_var(--accent-5),0_16px_40px_-18px_var(--accent-35)]',
        PADDING[padding],
        className,
      )}
      {...rest}
    >
      {/* Feine Lichtkante oben (wie bei Card) – in der Kampagnenfarbe. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-(--accent-60) to-transparent"
      />
      {ornate && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 text-(--accent-60)">
          <CornerFlourish className="absolute top-1.5 left-1.5" />
          <CornerFlourish className="absolute top-1.5 right-1.5 rotate-90" />
          <CornerFlourish className="absolute right-1.5 bottom-1.5 rotate-180" />
          <CornerFlourish className="absolute bottom-1.5 left-1.5 -rotate-90" />
        </span>
      )}
      {children}
    </Tag>
  )
}
