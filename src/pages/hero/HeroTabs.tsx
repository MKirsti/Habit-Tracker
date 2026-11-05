import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../../ui'
import { panelId, tabId } from './heroTabs'

export interface HeroTab<T extends string> {
  id: T
  label: ReactNode
  /** Kleine Zusatzinfo hinter dem Label, z. B. "12/31" – auf dem Handy nur vorgelesen (spart Platz in der Leiste). */
  meta?: ReactNode
  /** Auf dem Handy statt `meta` ein kleiner Leuchtpunkt (z. B. ungeöffnete Truhen). */
  metaDot?: boolean
  icon?: ReactNode
}

export interface HeroTabsProps<T extends string> {
  tabs: readonly HeroTab<T>[]
  value: T
  onChange: (value: T) => void
  /** Zugänglicher Name der Reiterleiste. */
  'aria-label': string
  /** Präfix für die IDs von Reitern und Panels (`tabId`/`panelId`). */
  idBase: string
  className?: string
}

/** Ist die Leiste an einer Seite abgeschnitten (horizontal scrollbar)? */
interface OverflowEdges {
  start: boolean
  end: boolean
}

/** Reicht die Leiste links/rechts über den Rand? */
function readEdges(node: HTMLElement): OverflowEdges {
  return {
    start: node.scrollLeft > 1,
    end: node.scrollLeft + node.clientWidth < node.scrollWidth - 1,
  }
}

/** Weiche Kanten, wo die Leiste weitergeht – als Hinweis, dass man wischen kann. */
function edgeMask(edges: OverflowEdges): string | undefined {
  if (!edges.start && !edges.end) return undefined
  const left = edges.start ? 'transparent, black 2rem' : 'black, black'
  const right = edges.end ? 'black calc(100% - 2rem), transparent' : 'black, black'
  return `linear-gradient(to right, ${left}, ${right})`
}

/**
 * Reiter der Held-Seite (WAI-ARIA Tabs): nur der gewählte Reiter ist per Tab erreichbar, Pfeiltasten (mit
 * Umlauf), Pos1 und Ende wechseln – automatisch aktiviert, weil jedes Panel sofort da ist.
 * Auf schmalen Bildschirmen scrollt die Leiste waagerecht (ohne die Seite zu verbreitern); der gewählte Reiter wird
 * dabei sichtbar gehalten, weiche Kanten zeigen, dass es weitergeht.
 */
export function HeroTabs<T extends string>({
  tabs,
  value,
  onChange,
  'aria-label': ariaLabel,
  idBase,
  className,
}: HeroTabsProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const list = useRef<HTMLDivElement>(null)
  // Weiche Kanten nur, wenn die Leiste wirklich überläuft (gemessen per ResizeObserver und beim Scrollen; ohne
  // Messung – jsdom – gilt „passt“).
  const [edges, setEdges] = useState<OverflowEdges>({ start: false, end: false })
  const selectedIndex = tabs.findIndex((tab) => tab.id === value)

  function measure() {
    const node = list.current
    if (node === null) return
    const next = readEdges(node)
    setEdges((current) => (current.start === next.start && current.end === next.end ? current : next))
  }

  useEffect(() => {
    const node = list.current
    if (node === null || typeof ResizeObserver === 'undefined') return
    // Meldet sich auch gleich nach dem Beobachten – damit ist der Startzustand gemessen.
    const observer = new ResizeObserver(() => {
      const next = readEdges(node)
      setEdges((current) => (current.start === next.start && current.end === next.end ? current : next))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Den gewählten Reiter in den sichtbaren Bereich der Leiste holen – nur waagerecht, die Seite selbst scrollt nicht.
  useLayoutEffect(() => {
    const node = list.current
    const button = buttons.current[selectedIndex]
    if (node === null || button == null || node.scrollWidth <= node.clientWidth) return
    // Die Leiste ist `relative` und damit offsetParent der Reiter: offsetLeft zählt ab ihrem Rand.
    const left = button.offsetLeft
    const right = left + button.offsetWidth
    const margin = 24
    // Das Scrollen meldet sich per `scroll`-Ereignis – dort werden die Kanten neu gemessen.
    if (left - margin < node.scrollLeft) node.scrollLeft = Math.max(0, left - margin)
    else if (right + margin > node.scrollLeft + node.clientWidth) node.scrollLeft = right + margin - node.clientWidth
  }, [selectedIndex])

  function select(index: number) {
    const tab = tabs[index]
    if (!tab) return
    buttons.current[index]?.focus()
    if (tab.id !== value) onChange(tab.id)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1
    let target: number
    switch (event.key) {
      case 'ArrowRight':
        target = index === last ? 0 : index + 1
        break
      case 'ArrowLeft':
        target = index === 0 ? last : index - 1
        break
      case 'Home':
        target = 0
        break
      case 'End':
        target = last
        break
      default:
        return
    }
    event.preventDefault()
    select(target)
  }

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={ariaLabel}
      onScroll={measure}
      data-overflow-start={edges.start || undefined}
      data-overflow-end={edges.end || undefined}
      style={{ maskImage: edgeMask(edges), WebkitMaskImage: edgeMask(edges) }}
      className={cn(
        // Waagerecht scrollbar, falls die Reiter nicht nebeneinander passen (Handy) – die Seite bleibt so breit wie sie ist.
        'scrollbar-none relative flex w-full max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-xl border border-border-strong bg-bg-deep/70 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.45)] sm:inline-flex sm:w-auto',
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type="button"
            role="tab"
            id={tabId(idBase, tab.id)}
            aria-selected={selected}
            // Nur das gezeigte Panel existiert – ein Verweis auf ein fehlendes Element wäre ungültiges ARIA.
            aria-controls={selected ? panelId(idBase, tab.id) : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              // Auf dem Handy nach Inhalt verteilt (nie gekürzt – reicht der Platz nicht, scrollt die Leiste), ohne Icons und
              // ohne sichtbare Zusatzinfo; unter sm etwas kleiner und ohne Sperrung.
              'relative isolate flex h-10 shrink-0 grow items-center justify-center gap-1 rounded-lg px-2.5 text-[0.8125rem] font-semibold tracking-normal whitespace-nowrap transition-colors duration-150 sm:grow-0 sm:gap-2 sm:px-4 sm:text-sm sm:tracking-wide',
              'focus-visible:outline-offset-0 [&_svg]:size-4 [&_svg]:shrink-0 max-sm:[&>svg]:hidden',
              selected ? 'text-gold-bright' : 'text-muted hover:text-parchment',
            )}
          >
            {selected && (
              <motion.span
                aria-hidden="true"
                layoutId={`${idBase}-active`}
                className="absolute inset-0 -z-10 rounded-lg bg-linear-to-b from-gold/22 to-gold/10 shadow-[inset_0_1px_0_rgb(240_201_106/0.25)] ring-1 ring-gold/55 ring-inset"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            {tab.icon}
            <span>{tab.label}</span>
            {tab.meta !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-xs font-medium tracking-normal tabular-nums max-sm:sr-only',
                  selected ? 'bg-gold/15 text-gold-bright' : 'bg-surface-raised text-muted',
                )}
              >
                {tab.meta}
              </span>
            )}
            {tab.metaDot === true && (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-gold-bright shadow-[0_0_6px_rgb(240_201_106/0.8)] sm:hidden"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
