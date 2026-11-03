import type { ReactNode } from 'react'
import { cn } from './cn'

export interface PageHeaderProps {
  /** Seitentitel (h1, Cinzel). */
  title: ReactNode
  subtitle?: ReactNode
  /** Kleine Zeile über dem Titel, z. B. "Tag 12 deines Abenteuers". */
  eyebrow?: ReactNode
  /** Aktion(en) rechts, z. B. ein Button "Neue Quest". */
  action?: ReactNode
  className?: string
}

/** Kopf einer Seite: Titel in Cinzel, optional Untertitel, Eyebrow und Aktion. */
export function PageHeader({ title, subtitle, eyebrow, action, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mb-8', className)}>
      <div className="min-w-0">
        {eyebrow !== undefined && (
          <p className="mb-1.5 text-xs font-semibold tracking-[0.2em] text-gold uppercase">{eyebrow}</p>
        )}
        <h1 className="font-display text-[1.75rem] leading-tight font-bold tracking-wide text-parchment sm:text-[2.125rem]">
          {title}
        </h1>
        <div aria-hidden="true" className="mt-2.5 h-px w-20 bg-linear-to-r from-gold/80 to-transparent" />
        {subtitle !== undefined && <p className="mt-2.5 max-w-prose text-[0.9375rem] text-muted">{subtitle}</p>}
      </div>
      {action !== undefined && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}

export interface SectionTitleProps {
  children: ReactNode
  /** Kleine Ergänzung direkt hinter dem Titel, z. B. "3/5". */
  meta?: ReactNode
  /** Aktion rechts (z. B. ein Ghost-Button). */
  action?: ReactNode
  as?: 'h2' | 'h3'
  id?: string
  className?: string
}

/** Abschnittsüberschrift: Kapitälchen in Gold mit auslaufender Linie. */
export function SectionTitle({ children, meta, action, as: Tag = 'h2', id, className }: SectionTitleProps) {
  return (
    <div className={cn('mb-3 flex items-center gap-3', className)}>
      {/* min-w-0 + Umbruch: lange Titel samt Meta und Aktion dürfen auf 360 px nicht seitlich überlaufen. */}
      <Tag
        id={id}
        className="min-w-0 font-display text-[0.8125rem] font-semibold tracking-[0.16em] text-gold uppercase"
      >
        {children}
        {/* Unsichtbarer Gedankenstrich zwischen echten Leerzeichen: vorgelesen „Tagesquests – 0 / 3“ statt
            „Tagesquests0 / 3“. Die Leerzeichen fallen sichtbar zu einem zusammen; es ersetzt einen Teil des
            Abstands (ml-1 statt ml-2), optisch bleibt die Lücke gleich. */}
        {meta !== undefined && (
          <>
            {' '}
            <span className="sr-only">–</span>{' '}
            <span className="ml-1 font-sans tracking-normal text-muted tabular-nums">{meta}</span>
          </>
        )}
      </Tag>
      <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-linear-to-r from-border-strong to-transparent" />
      {action}
    </div>
  )
}
