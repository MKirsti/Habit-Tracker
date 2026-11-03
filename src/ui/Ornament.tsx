import type { ReactNode } from 'react'
import { cn } from './cn'
import { useSvgId } from './useSvgId'

export interface OrnamentProps {
  /** Auslaufende Linien links und rechts (Standard: an). Ohne Linien bleibt nur das Mittelmotiv. */
  lines?: boolean
  className?: string
}

/**
 * Kleines goldenes Zier-Element: auslaufende Linien, zwei Schnörkel und eine Raute in der Mitte.
 * Rein dekorativ (aria-hidden). Farbe über `text-*`, Größe über `w-*`/`h-*` steuerbar.
 */
export function Ornament({ lines = true, className }: OrnamentProps) {
  const left = useSvgId('orn-l')
  const right = useSvgId('orn-r')
  return (
    <svg
      viewBox={lines ? '0 0 120 20' : '41 0 38 20'}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn(lines ? 'h-4 w-24' : 'h-4 w-[1.9rem]', 'text-gold', className)}
    >
      <defs>
        <linearGradient id={left} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={right} x1="1" x2="0" y1="0" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      {lines && <path d="M2 10H42" stroke={`url(#${left})`} strokeWidth="1" />}
      {lines && <path d="M78 10H118" stroke={`url(#${right})`} strokeWidth="1" />}
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.9">
        <path d="M42 10C46 10 47 6 50.5 6C53 6 53.5 8.5 52 9.2" />
        <path d="M42 10C46 10 47 14 50.5 14C53 14 53.5 11.5 52 10.8" />
        <path d="M78 10C74 10 73 6 69.5 6C67 6 66.5 8.5 68 9.2" />
        <path d="M78 10C74 10 73 14 69.5 14C67 14 66.5 11.5 68 10.8" />
      </g>
      <path d="M60 4.2L65.8 10L60 15.8L54.2 10Z" fill="currentColor" />
      <path d="M60 7.6L62.4 10L60 12.4L57.6 10Z" fill="var(--color-bg)" />
    </svg>
  )
}

export interface DividerProps {
  /** Text in der Mitte (z. B. "oder"). Hat Vorrang vor `ornament`. */
  label?: ReactNode
  /** Zier-Element in der Mitte. */
  ornament?: boolean
  className?: string
}

/** Horizontale Trennlinie, optional mit Ornament oder Beschriftung in der Mitte. */
export function Divider({ label, ornament = false, className }: DividerProps) {
  const hasCenter = label !== undefined || ornament
  return (
    <div role="separator" className={cn('flex items-center', label !== undefined ? 'gap-3' : 'gap-1.5', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'h-px flex-1',
          hasCenter
            ? 'bg-linear-to-r from-transparent to-gold-dim/60'
            : 'bg-linear-to-r from-transparent via-border-strong to-transparent',
        )}
      />
      {label !== undefined ? (
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</span>
      ) : ornament ? (
        <Ornament lines={false} className="h-3.5 w-[1.65rem] text-gold-dim" />
      ) : null}
      {hasCenter && (
        <span aria-hidden="true" className="h-px flex-1 bg-linear-to-l from-transparent to-gold-dim/60" />
      )}
    </div>
  )
}

/** Goldener Eckschnörkel für verzierte Karten (oben links ausgerichtet, per Rotation für andere Ecken). */
export function CornerFlourish({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={cn('size-5', className)}>
      <path
        d="M1.5 15V8C1.5 4.4 4.4 1.5 8 1.5H15"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M5 10.5V9C5 6.8 6.8 5 9 5H10.5"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <circle cx="1.5" cy="18.5" r="1" fill="currentColor" />
      <circle cx="18.5" cy="1.5" r="1" fill="currentColor" />
    </svg>
  )
}
