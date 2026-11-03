import type { ReactNode } from 'react'
import { cn } from './cn'
import { Ornament } from './Ornament'

export interface EmptyStateProps {
  /** Emoji oder lucide-Icon. */
  icon?: ReactNode
  title: ReactNode
  text?: ReactNode
  /** Handlungsaufforderung, z. B. ein Button "Erste Quest anlegen". */
  action?: ReactNode
  titleAs?: 'h2' | 'h3'
  className?: string
}

/** Platzhalter für leere Listen/Bereiche – freundlich, mit klarer nächster Aktion. */
export function EmptyState({ icon, title, text, action, titleAs: TitleTag = 'h2', className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center rounded-2xl border border-dashed border-border-strong/80 bg-surface/45 px-6 py-12 text-center',
        className,
      )}
    >
      {icon !== undefined && (
        <div
          aria-hidden="true"
          className="relative mb-5 grid size-16 place-items-center rounded-full bg-radial from-gold/18 to-gold/4 text-[1.75rem] text-gold ring-1 ring-gold/30 [&_svg]:size-7"
        >
          <span className="absolute -inset-2 rounded-full ring-1 ring-gold/10" />
          {icon}
        </div>
      )}
      {/* wrap-anywhere: In der zentrierten Spalte bestimmt das längste Wort die Breite – lange Wörter
          (z. B. Quest-Titel) sollen umbrechen statt die Seite zu verbreitern. */}
      <TitleTag className="max-w-full font-display text-lg font-semibold tracking-wide wrap-anywhere text-parchment">
        {title}
      </TitleTag>
      <Ornament className="mt-2 h-3 w-16 text-gold-dim" />
      {text !== undefined && <p className="mt-3 max-w-sm text-[0.9375rem] wrap-anywhere text-muted">{text}</p>}
      {action !== undefined && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
