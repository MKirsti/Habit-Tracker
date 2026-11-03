import { LoaderCircle } from 'lucide-react'
import { cn } from './cn'

export interface SpinnerProps {
  /** Vorgelesener Text; `null` = rein dekorativ (z. B. innerhalb eines Buttons mit aria-busy). */
  label?: string | null
  className?: string
}

/** Kleiner Lade-Indikator. */
export function Spinner({ label = 'Lädt …', className }: SpinnerProps) {
  // Ohne eigene Klassen: 20 px, Gold. Mit `className` bestimmt der Aufrufer Größe/Farbe vollständig.
  const icon = <LoaderCircle aria-hidden className={cn('animate-spin', className ?? 'size-5 text-gold')} />
  if (label === null) return icon
  return (
    <span role="status" className="inline-flex items-center">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  )
}

export interface LoadingStateProps {
  label?: string
  className?: string
}

/** Zentrierter Ladezustand für ganze Seiten oder Bereiche. */
export function LoadingState({ label = 'Lädt …', className }: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted', className)}
    >
      <LoaderCircle aria-hidden className="size-7 animate-spin text-gold" />
      <span>{label}</span>
    </div>
  )
}
