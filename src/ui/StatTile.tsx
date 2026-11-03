import type { ReactNode } from 'react'
import { cn } from './cn'

export interface StatTileProps {
  label: ReactNode
  /** Der Wert – Zahlen vorher mit `formatNumber` (de-DE) formatieren. */
  value: ReactNode
  icon?: ReactNode
  /** Kleine Zusatzinfo unter dem Wert, z. B. "Rekord: 21". */
  hint?: ReactNode
  /** Akzentfarbe für Icon (Hex), z. B. eine Attributfarbe. Standard: Gold. */
  color?: string
  className?: string
}

/** Kachel für eine Kennzahl (Streak, Level, erledigte Quests …). */
export function StatTile({ label, value, icon, hint, color, className }: StatTileProps) {
  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col rounded-2xl border border-border bg-linear-to-b from-surface-raised/80 to-surface/85 p-4 shadow-card',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted uppercase">
        {icon !== undefined && (
          <span
            aria-hidden="true"
            className="text-base leading-none text-gold [&_svg]:size-4"
            style={color !== undefined ? { color } : undefined}
          >
            {icon}
          </span>
        )}
        {/* Umbrechen statt abschneiden – in zwei Spalten auf 360 px wäre sonst „Bester Stre…“ zu lesen. */}
        <span className="min-w-0 leading-snug">{label}</span>
      </div>
      <div className="mt-1.5 font-display text-[1.625rem] leading-tight font-semibold text-parchment tabular-nums">
        {value}
      </div>
      {hint !== undefined && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}
