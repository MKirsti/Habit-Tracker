import { Lightbulb } from 'lucide-react'
import { useId } from 'react'
import { SectionTitle, cn, formatNumber } from '../../ui'
import {
  REWARD_SUGGESTION_PRICE_RANGES,
  REWARD_SUGGESTION_SIZES,
  REWARD_SUGGESTION_SIZE_LABELS,
} from './rewardSuggestions'
import type { RewardSuggestion } from './rewardSuggestions'

export interface RewardSuggestionsProps {
  /** Noch nicht übernommene Vorschläge (`openRewardSuggestions`). */
  suggestions: readonly RewardSuggestion[]
  /** Öffnet das Formular, vorbelegt mit dem Vorschlag. */
  onPick: (suggestion: RewardSuggestion) => void
}

function rangeText(size: RewardSuggestion['size']): string {
  const { min, max } = REWARD_SUGGESTION_PRICE_RANGES[size]
  return `${formatNumber(min)}–${formatNumber(max)} Gold`
}

/** „Ideen für deine Schatzkammer“: Vorschläge nach Größe, ein Tipp öffnet das vorbelegte Formular. */
export function RewardSuggestions({ suggestions, onPick }: RewardSuggestionsProps) {
  const titleId = useId()
  if (suggestions.length === 0) return null

  return (
    <section aria-labelledby={titleId}>
      <SectionTitle id={titleId}>Ideen für deine Schatzkammer</SectionTitle>
      <p className="mb-4 flex items-start gap-2 text-sm text-muted">
        <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
        <span>Tippe auf eine Idee, um sie zu übernehmen – Name, Preis und Symbol kannst du danach anpassen.</span>
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {REWARD_SUGGESTION_SIZES.map((size) => {
          const items = suggestions.filter((suggestion) => suggestion.size === size)
          if (items.length === 0) return null
          return (
            <div key={size} role="group" aria-label={REWARD_SUGGESTION_SIZE_LABELS[size]} className="min-w-0">
              <h3 className="mb-2 flex items-baseline justify-between gap-2 text-sm font-medium text-parchment">
                <span>{REWARD_SUGGESTION_SIZE_LABELS[size]}</span>
                <span className="text-xs font-normal text-muted tabular-nums">{rangeText(size)}</span>
              </h3>
              <ul className="flex flex-col gap-2">
                {items.map((suggestion) => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      onClick={() => onPick(suggestion)}
                      aria-label={`Idee übernehmen: ${suggestion.title}, ${formatNumber(suggestion.price)} Gold`}
                      className={cn(
                        'group flex min-h-12 w-full items-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface/50 px-3 py-2 text-left',
                        'transition-colors duration-150 hover:border-gold-dim hover:bg-surface-raised',
                      )}
                    >
                      <span aria-hidden="true" className="text-xl leading-none">
                        {suggestion.icon}
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium text-parchment">{suggestion.title}</span>
                      <span className="shrink-0 text-sm font-semibold text-gold tabular-nums">
                        {formatNumber(suggestion.price)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
