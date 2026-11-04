import { motion } from 'motion/react'
import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../../ui'
import { questPanelId, questTabId } from './questTabIds'
import type { QuestTabId } from './questTabIds'

export interface QuestTab {
  id: QuestTabId
  label: ReactNode
  /** Kleine Zahl hinter dem Label, z. B. Anzahl aktiver Quests. */
  meta?: ReactNode
  /** Vorgelesene Ergänzung zur Zahl, z. B. "aktiv" bzw. "offen". */
  metaLabel?: string
}

export interface QuestTabsProps {
  tabs: readonly QuestTab[]
  value: QuestTabId
  onChange: (value: QuestTabId) => void
  className?: string
}

/**
 * Reiter der Quests-Seite „Gewohnheiten“ / „Nebenquests“ (WAI-ARIA Tabs, automatisch aktiviert): nur der
 * gewählte Reiter ist per Tab erreichbar, Pfeiltasten (mit Umlauf), Pos1 und Ende wechseln. Gleiche Optik wie
 * die Reiter der Held-Seite (goldene Segmente).
 */
export function QuestTabs({ tabs, value, onChange, className }: QuestTabsProps) {
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
      aria-label="Art der Quests"
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
            id={questTabId(tab.id)}
            aria-selected={selected}
            // Nur das gezeigte Panel existiert – ein Verweis auf ein fehlendes Element wäre ungültiges ARIA.
            aria-controls={selected ? questPanelId(tab.id) : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'relative isolate flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold tracking-wide whitespace-nowrap transition-colors duration-150 sm:flex-none',
              'focus-visible:outline-offset-0',
              selected ? 'text-gold-bright' : 'text-muted hover:text-parchment',
            )}
          >
            {selected && (
              <motion.span
                aria-hidden="true"
                layoutId="quests-tab-active"
                className="absolute inset-0 -z-10 rounded-lg bg-linear-to-b from-gold/22 to-gold/10 shadow-[inset_0_1px_0_rgb(240_201_106/0.25)] ring-1 ring-gold/55 ring-inset"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="truncate">{tab.label}</span>
            {tab.meta !== undefined && (
              <>
                {' '}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-xs font-medium tracking-normal tabular-nums',
                    selected ? 'bg-gold/15 text-gold-bright' : 'bg-surface-raised text-muted',
                  )}
                >
                  {tab.meta}
                  {tab.metaLabel !== undefined && (
                    <>
                      {' '}
                      <span className="sr-only">{tab.metaLabel}</span>
                    </>
                  )}
                </span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
