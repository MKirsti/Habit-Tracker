import { motion } from 'motion/react'
import type { ChestRarity } from '../../domain/types'
import { useSvgId } from '../../ui'
import { CHEST_WOOD, chestTheme } from './chestTheme'

/** closed: zu (bei vollen Effekten ein leichtes Wackeln als Einladung) · opening: der Deckel klappert · open: offen. */
export type ChestPhase = 'closed' | 'opening' | 'open'

export interface ChestGraphicProps {
  rarity: ChestRarity
  phase: ChestPhase
  /** Volle Effekte (Wackeln, Klappern). Ohne: der Deckel springt nur auf. */
  fancy: boolean
  className?: string
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const

/**
 * Gezeichnete Holztruhe mit Beschlägen in der Farbe ihrer Seltenheit (Bronze, Silber, Blau-Violett, Gold). Der Deckel
 * hebt sich beim Öffnen nach hinten, aus dem Spalt strahlt Licht in der Seltenheitsfarbe. Rein dekorativ.
 */
export function ChestGraphic({ rarity, phase, fancy, className }: ChestGraphicProps) {
  const theme = chestTheme(rarity)
  const { metal } = theme
  const wood = useSvgId('chest-wood')
  const lidWood = useSvgId('chest-lid')
  const metalId = useSvgId('chest-metal')
  const glowId = useSvgId('chest-glow')
  const blur = useSvgId('chest-blur')
  const lidClip = useSvgId('chest-lid-clip')
  const gem = rarity === 'rare' || rarity === 'legendary'

  const lid =
    phase === 'open'
      ? { y: -24, rotate: -14 }
      : phase === 'opening' && fancy
        ? { y: [0, -4, 0, -6, -2], rotate: [0, -2, 1, -3, 0] }
        : { y: 0, rotate: 0 }

  return (
    <motion.svg
      viewBox="0 0 160 130"
      aria-hidden="true"
      focusable="false"
      data-chest-phase={phase}
      data-rarity={rarity}
      className={className}
      style={{ overflow: 'visible', transformOrigin: '50% 95%' }}
      animate={phase === 'closed' && fancy ? { rotate: [0, -3, 3, -2, 1, 0] } : { rotate: 0 }}
      transition={
        phase === 'closed' && fancy
          ? { duration: 0.7, repeat: Infinity, repeatDelay: 2.6, ease: 'easeInOut' }
          : { duration: 0.2 }
      }
    >
      <defs>
        <linearGradient id={wood} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CHEST_WOOD.light} />
          <stop offset="0.55" stopColor={CHEST_WOOD.mid} />
          <stop offset="1" stopColor={CHEST_WOOD.dark} />
        </linearGradient>
        <linearGradient id={lidWood} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CHEST_WOOD.lidLight} />
          <stop offset="1" stopColor={CHEST_WOOD.lidDark} />
        </linearGradient>
        <linearGradient id={metalId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={metal.light} />
          <stop offset="0.5" stopColor={metal.mid} />
          <stop offset="1" stopColor={metal.dark} />
        </linearGradient>
        <radialGradient id={glowId} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="rgb(255 250 240)" />
          <stop offset="0.35" stopColor={theme.glow} />
          <stop offset="1" stopColor={theme.color} stopOpacity="0" />
        </radialGradient>
        <filter id={blur} x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <clipPath id={lidClip}>
          <path d="M20 64 V46 C20 27 46 18 80 18 C114 18 140 27 140 46 V64 Z" />
        </clipPath>
      </defs>

      {/* Schatten am Boden */}
      <ellipse cx="80" cy="122" rx="62" ry="6" fill="rgb(0 0 0 / 0.45)" />

      {/* Licht aus dem Spalt – stärker, je weiter der Deckel offen ist */}
      <motion.ellipse
        cx="80"
        cy="60"
        rx="58"
        ry="14"
        fill={`url(#${glowId})`}
        filter={`url(#${blur})`}
        initial={false}
        animate={{ opacity: phase === 'open' ? 1 : phase === 'opening' ? 0.65 : 0 }}
        transition={{ duration: fancy ? 0.5 : 0.15 }}
      />

      {/* Korpus */}
      <rect x="20" y="62" width="120" height="56" rx="6" fill={`url(#${wood})`} stroke={CHEST_WOOD.outline} strokeWidth="1.5" />
      <path d="M22 90 H138" stroke={CHEST_WOOD.grain} strokeWidth="1.5" opacity="0.7" />
      <path d="M22 76 H138 M22 104 H138" stroke={CHEST_WOOD.grain} strokeWidth="1" opacity="0.35" />
      {/* Öffnung (nur sichtbar, wenn der Deckel offen ist) */}
      <motion.path
        d="M24 64 Q80 54 136 64 Q80 70 24 64 Z"
        fill={CHEST_WOOD.inside}
        initial={false}
        animate={{ opacity: phase === 'closed' ? 0 : 1 }}
        transition={{ duration: 0.2 }}
      />
      {/* Beschläge am Korpus */}
      <rect x="36" y="62" width="11" height="56" fill={`url(#${metalId})`} />
      <rect x="113" y="62" width="11" height="56" fill={`url(#${metalId})`} />
      <rect x="18" y="112" width="124" height="8" rx="3" fill={`url(#${metalId})`} />
      {[72, 88, 104].map((y) => (
        <g key={y}>
          <circle cx="41.5" cy={y} r="1.8" fill={metal.light} />
          <circle cx="118.5" cy={y} r="1.8" fill={metal.light} />
        </g>
      ))}
      {/* Schloss */}
      <rect x="69" y="66" width="22" height="24" rx="4" fill={`url(#${metalId})`} stroke={metal.dark} strokeWidth="1" />
      <circle cx="80" cy="75" r="3.2" fill={CHEST_WOOD.inside} />
      <path d="M78.6 76 L77.6 84 H82.4 L81.4 76 Z" fill={CHEST_WOOD.inside} />

      {/* Deckel – kippt um sein hinteres Scharnier nach oben */}
      <motion.g
        style={{ transformBox: 'fill-box', transformOrigin: '12% 100%' }}
        initial={false}
        animate={lid}
        transition={
          phase === 'open'
            ? { duration: fancy ? 0.55 : 0.15, ease: EASE_OUT }
            : phase === 'opening' && fancy
              ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.25, ease: EASE_OUT }
        }
      >
        <path
          d="M20 64 V46 C20 27 46 18 80 18 C114 18 140 27 140 46 V64 Z"
          fill={`url(#${lidWood})`}
          stroke={CHEST_WOOD.outline}
          strokeWidth="1.5"
        />
        <g clipPath={`url(#${lidClip})`}>
          <path d="M20 40 C46 31 114 31 140 40" stroke={CHEST_WOOD.dark} strokeWidth="1" fill="none" opacity="0.6" />
          <rect x="36" y="14" width="11" height="52" fill={`url(#${metalId})`} />
          <rect x="113" y="14" width="11" height="52" fill={`url(#${metalId})`} />
          <rect x="18" y="58" width="124" height="7" fill={`url(#${metalId})`} />
          {/* Lichtkante oben */}
          <path d="M26 44 C30 30 52 23 80 22 C108 23 130 30 134 44" stroke="rgb(255 236 200 / 0.22)" strokeWidth="2" fill="none" />
        </g>
        {[30, 44].map((y) => (
          <g key={y}>
            <circle cx="41.5" cy={y} r="1.8" fill={metal.light} />
            <circle cx="118.5" cy={y} r="1.8" fill={metal.light} />
          </g>
        ))}
        {/* Riegel */}
        <rect x="73" y="54" width="14" height="16" rx="3" fill={`url(#${metalId})`} stroke={metal.dark} strokeWidth="1" />
        {gem && (
          <path
            d="M80 30 L86 37 L80 44 L74 37 Z"
            fill={theme.glow}
            stroke={metal.dark}
            strokeWidth="1"
          />
        )}
      </motion.g>
    </motion.svg>
  )
}
