import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { EmojiPicker, Field, cn, fieldIds } from '../../ui'
import { AVATAR_CATEGORIES, HERO_AVATARS, isQuickAvatar } from './heroProfile'

export interface AvatarPickerProps {
  value: string
  onChange: (avatar: string) => void
  label?: string
  className?: string
}

/**
 * Avatar-Auswahl: zwölf Helden zum Antippen (Radiogruppe) und aufklappbar jedes beliebige Emoji
 * über den EmojiPicker (Helden, Tiere, Fantasy oder frei eingefügt).
 */
export function AvatarPicker({ value, onChange, label = 'Avatar', className }: AvatarPickerProps) {
  const id = useId()
  const { labelId } = fieldIds(id)
  const moreId = `${id}-more`
  const custom = !isQuickAvatar(value)
  // Ein eigener Avatar ist nur in der erweiterten Auswahl sichtbar – dann gleich aufgeklappt starten.
  const [expanded, setExpanded] = useState(custom)

  return (
    <Field id={id} label={label} group className={className}>
      {/* Sechs Spalten; in breiten Containern (Onboarding auf dem Desktop) alle zwölf in einer Reihe. */}
      <div role="radiogroup" aria-labelledby={labelId} className="@container">
        <div className="grid grid-cols-6 gap-2 @min-[34rem]:grid-cols-12">
          {HERO_AVATARS.map(({ emoji, name }) => (
            <label key={emoji} title={name} className="relative block">
              <input
                type="radio"
                name={`${id}-avatar`}
                value={emoji}
                checked={value === emoji}
                onChange={() => onChange(emoji)}
                aria-label={name}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'grid aspect-square min-h-10 place-items-center rounded-xl border text-[1.625rem] leading-none @min-[26rem]:@max-[34rem]:text-[2rem]',
                  'transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-90',
                  'border-border bg-bg-deep/55 hover:border-gold-dim hover:bg-surface-hover',
                  'peer-checked:border-gold peer-checked:bg-gold/16 peer-checked:shadow-[inset_0_0_14px_rgb(212_165_72/0.18),0_0_12px_-4px_rgb(240_201_106/0.6)]',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-bright',
                )}
              >
                {emoji}
              </span>
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? moreId : undefined}
        onClick={() => setExpanded((open) => !open)}
        className={cn(
          'mt-1 flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm font-medium',
          'text-gold transition-colors hover:bg-surface-raised hover:text-gold-bright',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {custom && (
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold/16 text-xl leading-none ring-1 ring-gold"
            >
              {value}
            </span>
          )}
          <span className="truncate">{custom ? 'Eigener Avatar gewählt' : 'Weitere Avatare & eigenes Emoji'}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 transition-transform duration-200', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div id={moreId}>
          <EmojiPicker value={value} onChange={onChange} categories={AVATAR_CATEGORIES} />
        </div>
      )}
    </Field>
  )
}
