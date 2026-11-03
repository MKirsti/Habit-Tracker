import { useId } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { CornerFlourish } from './Ornament'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'
export type CardTone = 'default' | 'gold' | 'flat'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  /** Icon/Emoji links neben dem Titel. */
  icon?: ReactNode
  /** Aktionen rechts im Kopf (z. B. IconButtons). */
  actions?: ReactNode
  /** Goldene Eckschnörkel – für hervorgehobene Karten (Kampagne, Held). */
  ornate?: boolean
  padding?: CardPadding
  /** default = dunkle Fläche, gold = hervorgehoben mit Goldschimmer, flat = ohne Schatten/Verlauf. */
  tone?: CardTone
  /** HTML-Element der Karte. Standard: section (mit aria-labelledby, falls ein Titel existiert). */
  as?: 'section' | 'div' | 'article' | 'li'
  /** Überschriften-Ebene des Titels. Standard: h2. */
  titleAs?: 'h2' | 'h3'
}

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
}

const TONES: Record<CardTone, string> = {
  default: 'border-border bg-linear-to-b from-surface-raised/85 to-surface/90 shadow-card',
  gold:
    'border-gold/35 bg-linear-to-b from-[#2a2010]/95 to-surface/95 ' +
    'shadow-[inset_0_1px_0_rgb(240_201_106/0.12),0_0_0_1px_rgb(212_165_72/0.06),0_16px_40px_-18px_rgb(212_165_72/0.35)]',
  flat: 'border-border bg-surface/70',
}

/** Fläche für zusammengehörige Inhalte, optional mit Kopfzeile (Titel, Untertitel, Aktionen). */
export function Card({
  title,
  subtitle,
  icon,
  actions,
  ornate = false,
  padding = 'md',
  tone = 'default',
  as: Tag = 'section',
  titleAs: TitleTag = 'h2',
  className,
  children,
  ...rest
}: CardProps) {
  const titleId = useId()
  const hasHeader = title !== undefined || subtitle !== undefined || icon !== undefined || actions !== undefined

  return (
    <Tag
      aria-labelledby={title !== undefined && Tag === 'section' ? titleId : undefined}
      className={cn('relative isolate rounded-2xl border', TONES[tone], PADDING[padding], className)}
      {...rest}
    >
      {/* Feine Lichtkante oben – lässt die Karte wie aus Metall/Leder gearbeitet wirken. */}
      {tone !== 'flat' && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent to-transparent',
            tone === 'gold' ? 'via-gold-bright/60' : 'via-gold/30',
          )}
        />
      )}
      {ornate && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 text-gold/55">
          <CornerFlourish className="absolute top-1.5 left-1.5" />
          <CornerFlourish className="absolute top-1.5 right-1.5 rotate-90" />
          <CornerFlourish className="absolute right-1.5 bottom-1.5 rotate-180" />
          <CornerFlourish className="absolute bottom-1.5 left-1.5 -rotate-90" />
        </span>
      )}

      {hasHeader && (
        <div className={cn('mb-4 flex items-start gap-3', padding === 'none' && 'px-4 pt-4')}>
          {icon !== undefined && (
            <div
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-xl text-gold ring-1 ring-gold/25 ring-inset [&_svg]:size-5"
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1 self-center">
            {title !== undefined && (
              <TitleTag
                id={titleId}
                className="font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment"
              >
                {title}
              </TitleTag>
            )}
            {subtitle !== undefined && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          {actions !== undefined && <div className="-my-1 flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      )}

      {children}
    </Tag>
  )
}
