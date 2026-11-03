import { cn } from '../ui/cn'
import { useSvgId } from '../ui/useSvgId'

export interface CrestProps {
  className?: string
  /** Vorgelesener Titel; ohne Titel ist das Wappen dekorativ (aria-hidden). */
  title?: string
}

/**
 * Das Questlog-Wappen: goldgerandeter Schild mit aufgeschlagenem Buch und Stern.
 * Dieselbe Geometrie (Koordinatensystem 512 × 512) steckt in `public/favicon.svg`.
 */
export function Crest({ className, title }: CrestProps) {
  const shieldFill = useSvgId('crest-shield')
  const rim = useSvgId('crest-rim')
  const page = useSvgId('crest-page')
  const glow = useSvgId('crest-glow')

  return (
    <svg
      viewBox="106 64 300 398"
      // Ohne fill="none" füllt SVG offene Linienpfade (Buchzeilen) schwarz – alle Flächen setzen ihr fill selbst.
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={cn('h-10 w-auto drop-shadow-[0_4px_10px_rgb(0_0_0/0.6)]', className)}
    >
      <defs>
        <linearGradient id={shieldFill} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2e2318" />
          <stop offset="1" stopColor="#120d09" />
        </linearGradient>
        <linearGradient id={rim} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f6d78a" />
          <stop offset="0.5" stopColor="#d4a548" />
          <stop offset="1" stopColor="#8f6b2c" />
        </linearGradient>
        <linearGradient id={page} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f6ecd6" />
          <stop offset="1" stopColor="#d8c49c" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f0c96a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f0c96a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <CrestArtwork ids={{ shieldFill, rim, page, glow }} />
    </svg>
  )
}

/** Zeichnung des Wappens (ohne Hintergrund). Koordinaten im 512er-Raster. */
function CrestArtwork({ ids }: { ids: { shieldFill: string; rim: string; page: string; glow: string } }) {
  const shield =
    'M256 82Q322 112 388 112L388 248C388 336 332 404 256 442C180 404 124 336 124 248L124 112Q190 112 256 82Z'
  return (
    <>
      <path d={shield} fill={`url(#${ids.shieldFill})`} stroke={`url(#${ids.rim})`} strokeWidth="16" strokeLinejoin="round" />
      <path
        d={shield}
        fill="none"
        stroke="#d4a548"
        strokeOpacity="0.45"
        strokeWidth="3.5"
        strokeLinejoin="round"
        transform="translate(256 262) scale(0.86) translate(-256 -262)"
      />
      {/* Stern mit Schein */}
      <circle cx="256" cy="194" r="62" fill={`url(#${ids.glow})`} />
      <path d="M256 148Q261.5 188.5 298 194Q261.5 199.5 256 240Q250.5 199.5 214 194Q250.5 188.5 256 148Z" fill="#f6d78a" />
      {/* Buch: Einband, Seiten, Rücken, Zeilen */}
      <path
        d="M256 298C226 282 188 278 148 284L148 362C188 356 226 362 256 378C286 362 324 356 364 362L364 284C324 278 286 282 256 298Z"
        fill="#b8892f"
      />
      <path d="M256 284C230 266 196 260 160 266L160 346C196 340 230 346 256 364Z" fill={`url(#${ids.page})`} />
      <path d="M256 284C282 266 316 260 352 266L352 346C316 340 282 346 256 364Z" fill={`url(#${ids.page})`} />
      <path d="M256 284L256 364" stroke="#8f6b2c" strokeWidth="4" strokeLinecap="round" />
      <g stroke="#a88a58" strokeWidth="4" strokeLinecap="round" opacity="0.7">
        <path d="M178 286C200 282 222 285 240 294" />
        <path d="M178 306C200 302 222 305 240 314" />
        <path d="M178 326C200 322 222 325 240 334" />
        <path d="M272 294C290 285 312 282 334 286" />
        <path d="M272 314C290 305 312 302 334 306" />
        <path d="M272 334C290 325 312 322 334 326" />
      </g>
    </>
  )
}

export interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg'
  /** Schriftzug „Questlog“ neben dem Wappen (Standard: an). */
  showWordmark?: boolean
  className?: string
}

const CREST_SIZES = { sm: 'h-8', md: 'h-11', lg: 'h-20' } as const
const WORDMARK_SIZES = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' } as const

/** Logo der App: Wappen + Schriftzug in Cinzel mit goldenem Verlauf. */
export function AppLogo({ size = 'md', showWordmark = true, className }: AppLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Crest className={CREST_SIZES[size]} title={showWordmark ? undefined : 'Questlog'} />
      {showWordmark && (
        <span
          className={cn(
            'text-gold-gradient font-display leading-none font-bold tracking-[0.08em] drop-shadow-[0_1px_0_rgb(0_0_0/0.6)]',
            WORDMARK_SIZES[size],
          )}
        >
          Questlog
        </span>
      )}
    </span>
  )
}
