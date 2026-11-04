import { motion } from 'motion/react'
import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../../ui'
import { panelId, tabId } from './heroTabs'

export interface HeroTab<T extends string> {
  id: T
  label: ReactNode
  /** Kleine Zusatzinfo hinter dem Label, z. B. "12/31". */
  meta?: ReactNode
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

/**
 * Reiter der Held-Seite (WAI-ARIA Tabs): nur der gewählte Reiter ist per Tab erreichbar, Pfeiltasten (mit
 * Umlauf), Pos1 und Ende wechseln – automatisch aktiviert, weil jedes Panel sofort da ist.
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
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'relative flex w-full gap-1 rounded-xl border border-border-strong bg-bg-deep/70 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.45)] sm:inline-flex sm:w-auto',
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
              // Auf dem Handy nach Inhalt verteilt und ohne Icons – sonst würde bei drei Reitern „Erfolge 19/39“ gekürzt.
              'relative isolate flex h-10 min-w-0 flex-auto items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold tracking-wide whitespace-nowrap transition-colors duration-150 sm:flex-none sm:gap-2 sm:px-4',
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
            <span className="truncate">{tab.label}</span>
            {tab.meta !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-xs font-medium tracking-normal tabular-nums',
                  selected ? 'bg-gold/15 text-gold-bright' : 'bg-surface-raised text-muted',
                )}
              >
                {tab.meta}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
