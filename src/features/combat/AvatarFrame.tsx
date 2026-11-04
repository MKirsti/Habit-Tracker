import { motion } from 'motion/react'
import { useContext } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { GameContext } from '../../app/gameContext'
import { FRAMES } from '../../domain/combat/cosmeticDefinitions'
import type { FrameDefinition } from '../../domain/types'
import { cn, useMediaQuery } from '../../ui'

export type AvatarFrameSize = 'sm' | 'md' | 'lg'

export interface AvatarFrameProps {
  /** Gewählter Rahmen (`FrameDefinition.id`). Ohne bzw. unbekannt: die vertraute goldene Plakette. */
  frameId?: string
  /** Rahmen direkt (z. B. Vorschau im Truhen-Dialog) – hat Vorrang vor `frameId`. */
  frame?: Pick<FrameDefinition, 'id' | 'colors' | 'rarity'>
  /** sm 44 px (Helden-Kopf am Handy), md 56 px, lg 72 px (Helden-Kopf ab md, Truhen-Dialog). Standard: md. */
  size?: AvatarFrameSize
  /** Das Avatar-Emoji. */
  children: ReactNode
  /**
   * Glanz bewegen (nur seltene und legendäre Rahmen). Standard: mit der Einstellung „Effekte“ und ohne reduzierte
   * Bewegung. `false` erzwingt den ruhenden Glanz (z. B. in langen Auswahllisten).
   */
  animate?: boolean
  /** Zugänglicher Name („Rahmen Sternenstaub“) – ohne bleibt das Bild dekorativ (`aria-hidden`). */
  label?: string
  /**
   * Eigene Maße statt `size` – für Stellen mit anderen Avatar-Größen (die Plakette der Heldenseite), damit ein Rahmen
   * überall gleich aussieht (Verlauf, Glanz, Lichtbogen, Schein).
   */
  dims?: AvatarFrameDims
  className?: string
}

/** Maße eines Avatars im Rahmen: Größe und Schrift (Tailwind-Klassen), Ringbreite in px, Abstand des Halo-Rings. */
export interface AvatarFrameDims {
  box: string
  text: string
  ring: number
  halo: string
}

const SIZES: Record<AvatarFrameSize, AvatarFrameDims> = {
  sm: { box: 'size-11', text: 'text-[1.625rem]', ring: 3, halo: '-inset-1' },
  md: { box: 'size-14', text: 'text-[2rem]', ring: 3.5, halo: '-inset-1' },
  lg: { box: 'size-[4.5rem]', text: 'text-[2.5rem]', ring: 4, halo: '-inset-1.5' },
}

/** Lichtbogen, der über den Ring wandert (seltene und legendäre Rahmen). */
const SHINE =
  'conic-gradient(from 0deg, transparent 0deg 290deg, rgb(255 255 255 / 0.15) 312deg, rgb(255 250 235 / 0.85) 332deg, rgb(255 255 255 / 0.15) 348deg, transparent 360deg)'

/** Metallischer Glanz von oben links auf jedem Rahmen. */
const GLOSS = 'linear-gradient(160deg, rgb(255 255 255 / 0.42), rgb(255 255 255 / 0) 42%, rgb(0 0 0 / 0) 60%, rgb(0 0 0 / 0.28))'

/** Maske: nur der Ring (äußere `ring` px) bleibt sichtbar. */
function ringMask(ring: number): CSSProperties {
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${ring}px), #000 calc(100% - ${ring - 0.5}px))`
  return { maskImage: mask, WebkitMaskImage: mask }
}

/** Rahmen zu einer ID (unbekannt → undefined). */
function frameById(id: string | undefined): FrameDefinition | undefined {
  return id === undefined ? undefined : FRAMES.find((frame) => frame.id === id)
}

/**
 * Avatar im Rahmen (Phase 3a): ein Ring als Verlauf aus `FrameDefinition.colors` mit metallischem Glanz; seltene und
 * legendäre Rahmen tragen zusätzlich einen Lichtbogen, der langsam um den Ring wandert (nur mit „Effekte“ und ohne
 * reduzierte Bewegung – sonst steht er still), legendäre dazu einen sanften Schein. Ohne Rahmen genau die bisherige
 * goldene Plakette des Helden-Kopfs. Gemeinsamer Baustein für Helden-Kopf, Truhen-Dialog und Sammlung.
 */
export function AvatarFrame({ frameId, frame, size = 'md', children, animate, label, dims: customDims, className }: AvatarFrameProps) {
  const game = useContext(GameContext)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const effects = game?.data.settings.effects ?? true
  const definition = frame ?? frameById(frameId)
  const dims = customDims ?? SIZES[size]
  const a11y = label !== undefined ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }

  if (definition === undefined || definition.colors.length === 0) {
    return (
      <span
        {...a11y}
        data-avatar-frame="none"
        className={cn(
          'relative grid shrink-0 place-items-center rounded-full leading-none select-none',
          'bg-radial from-gold/25 via-gold/8 to-transparent ring-2 ring-gold/45',
          dims.box,
          dims.text,
          className,
        )}
      >
        <span className={cn('absolute rounded-full ring-1 ring-gold/15', dims.halo)} />
        {children}
      </span>
    )
  }

  const stops = definition.colors
  const bright = stops.reduce((best, color) => (luminance(color) > luminance(best) ? color : best), stops[0])
  const special = definition.rarity === 'rare' || definition.rarity === 'legendary'
  const legendary = definition.rarity === 'legendary'
  const moving = special && (animate ?? (effects && !reducedMotion))

  return (
    <span
      {...a11y}
      data-avatar-frame={definition.id}
      data-rarity={definition.rarity}
      data-shine={special ? (moving ? 'moving' : 'still') : undefined}
      className={cn('relative isolate grid shrink-0 place-items-center rounded-full leading-none select-none', dims.box, dims.text, className)}
      style={{
        background: `conic-gradient(from 210deg, ${[...stops, stops[0]].join(', ')})`,
        padding: dims.ring,
        boxShadow: legendary
          ? `0 0 0 1px color-mix(in srgb, ${bright} 28%, transparent), 0 0 18px -3px color-mix(in srgb, ${bright} 70%, transparent)`
          : `0 0 0 1px color-mix(in srgb, ${bright} 16%, transparent), 0 6px 16px -8px rgb(0 0 0 / 0.8)`,
      }}
    >
      {legendary && (
        // Sanfter Schein hinter dem Rahmen – pulsiert nur mit „Effekte“ (index.css schaltet `animate-glow-pulse` ab).
        <span
          aria-hidden="true"
          className={cn('pointer-events-none absolute -inset-2 -z-10 rounded-full blur-md', moving && 'motion-safe:animate-glow-pulse')}
          style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${bright} 45%, transparent), transparent)` }}
        />
      )}
      <span className="grid size-full place-items-center rounded-full bg-radial from-surface-raised via-surface to-bg-deep shadow-[inset_0_2px_6px_rgb(0_0_0/0.55)]">
        <span className="drop-shadow-[0_3px_8px_rgb(0_0_0/0.55)]">{children}</span>
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full" style={{ background: GLOSS, ...ringMask(dims.ring) }} />
      {special && (
        <motion.span
          aria-hidden="true"
          data-frame-shine=""
          className="pointer-events-none absolute inset-0 rounded-full mix-blend-screen"
          style={{ background: SHINE, rotate: -70, ...ringMask(dims.ring) }}
          animate={moving ? { rotate: 290 } : undefined}
          transition={moving ? { duration: legendary ? 5.5 : 8, ease: 'linear', repeat: Infinity } : undefined}
        />
      )}
    </span>
  )
}

/** Grobe Helligkeit eines Hex-Werts (für die Leuchtfarbe) – ungültig → 0. */
function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return 0
  const value = Number.parseInt(match[1], 16)
  return 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)
}
