import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { confettiLifetime, createConfettiParticles } from './confetti'
import type { ConfettiMode, ConfettiParticle } from './confetti'

export interface ConfettiBurstSpec {
  id: number
  mode: ConfettiMode
  /** light: dezent (Toasts), full: großes Feuerwerk (Feier-Szenen). */
  intensity: 'light' | 'full'
  /** Ursprung als Anteil der Fensterbreite/-höhe (0..1). */
  x: number
  y: number
}

export interface ConfettiProps {
  bursts: readonly ConfettiBurstSpec[]
  /** Wird aufgerufen, sobald ein Burst verglüht ist (zum Entfernen aus der Liste). */
  onBurstEnd: (id: number) => void
}

/**
 * Leichtgewichtiges DOM-Konfetti in Gold, Pergament und Attributfarben. Liegt über allem, fängt
 * keine Klicks ab und ist für Screenreader unsichtbar. Ob überhaupt Konfetti fliegt (Einstellung
 * „Effekte“, reduzierte Bewegung), entscheidet der Aufrufer.
 */
export function Confetti({ bursts, onBurstEnd }: ConfettiProps) {
  if (typeof document === 'undefined' || bursts.length === 0) return null
  return createPortal(
    <div aria-hidden="true" data-confetti="" className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {bursts.map((burst) => (
        <ConfettiBurst key={burst.id} burst={burst} onEnd={onBurstEnd} />
      ))}
    </div>,
    document.body,
  )
}

const COUNTS: Record<ConfettiBurstSpec['intensity'], Record<ConfettiMode, number>> = {
  light: { burst: 40, cannon: 36, spray: 36 },
  full: { burst: 110, cannon: 70, spray: 70 },
}

function ConfettiBurst({ burst, onEnd }: { burst: ConfettiBurstSpec; onEnd: (id: number) => void }) {
  const [particles] = useState(() => {
    const size = Math.min(window.innerWidth, window.innerHeight)
    const distance = burst.mode === 'burst' ? Math.max(180, size * 0.5) : Math.max(160, window.innerHeight * 0.42)
    return createConfettiParticles({
      count: COUNTS[burst.intensity][burst.mode],
      mode: burst.mode,
      distance: burst.intensity === 'light' ? distance * 0.75 : distance,
    })
  })

  const onEndRef = useRef(onEnd)
  useEffect(() => {
    onEndRef.current = onEnd
  })

  useEffect(() => {
    const timer = window.setTimeout(() => onEndRef.current(burst.id), confettiLifetime(particles) * 1000 + 150)
    return () => window.clearTimeout(timer)
  }, [burst.id, particles])

  return (
    <div className="absolute size-0" style={{ left: `${burst.x * 100}%`, top: `${burst.y * 100}%` }}>
      {particles.map((particle) => (
        <Particle key={particle.id} particle={particle} />
      ))}
    </div>
  )
}

function Particle({ particle }: { particle: ConfettiParticle }) {
  const { width, height, color, shape } = particle
  return (
    <motion.span
      className="absolute top-0 left-0 block will-change-transform"
      style={{
        width,
        height,
        marginLeft: -width / 2,
        marginTop: -height / 2,
        background: color,
        borderRadius: shape === 'circle' || shape === 'spark' ? '9999px' : shape === 'sliver' ? '2px' : '1.5px',
        boxShadow: shape === 'spark' ? `0 0 8px 2px ${color}` : undefined,
      }}
      initial={{ x: 0, y: 0, rotate: 0, opacity: 0, scale: 0.6 }}
      animate={{ x: particle.x, y: particle.y, rotate: particle.rotate, opacity: [1, 1, 0], scale: [1, 1, 0.8] }}
      transition={{
        duration: particle.duration,
        delay: particle.delay,
        times: [0, 0.3, 1],
        ease: ['easeOut', 'easeIn'],
      }}
    />
  )
}
