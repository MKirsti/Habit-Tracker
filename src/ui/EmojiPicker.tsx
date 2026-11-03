import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Chip } from './Badge'
import { cn } from './cn'
import { Field } from './Field'
import { INPUT_CLASS, fieldIds } from './fieldStyles'
import { EMOJI_CATEGORIES, findEmojiCategory, firstGrapheme } from './emojis'
import type { EmojiCategory } from './emojis'

export interface EmojiPickerProps {
  value: string
  onChange: (emoji: string) => void
  label?: ReactNode
  hint?: ReactNode
  /** Eigene Kategorien statt der Standardauswahl. */
  categories?: readonly EmojiCategory[]
  id?: string
  className?: string
}

/**
 * Emoji-Auswahl: Vorschau, Kategorien (Lernen, Sport, Gesundheit, Achtsamkeit, Haushalt, Soziales,
 * Fantasy), Raster zum Antippen und ein Freitextfeld für jedes beliebige Emoji.
 */
export function EmojiPicker({
  value,
  onChange,
  label,
  hint,
  categories = EMOJI_CATEGORIES,
  id: idProp,
  className,
}: EmojiPickerProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const { labelId, hintId } = fieldIds(id)
  const customId = `${id}-custom`

  // Startkategorie: die (übergebene!) Kategorie, die das aktuelle Emoji enthält.
  const [categoryId, setCategoryId] = useState(
    () => (findEmojiCategory(value, categories) ?? categories[0])?.id ?? '',
  )
  const [custom, setCustom] = useState('')
  const category = categories.find((c) => c.id === categoryId) ?? categories[0]

  function handleCustom(text: string) {
    setCustom(text)
    const emoji = firstGrapheme(text)
    if (emoji !== '' && emoji !== value) onChange(emoji)
  }

  const content = (
    <div
      role="group"
      aria-labelledby={label !== undefined ? labelId : undefined}
      aria-label={label === undefined ? 'Emoji auswählen' : undefined}
      aria-describedby={hint !== undefined ? hintId : undefined}
      className={cn('rounded-2xl border border-border bg-bg-deep/50 p-3', className)}
    >
      {/* Vorschau + Freitext */}
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-radial from-gold/18 to-gold/5 text-[2rem] leading-none ring-1 ring-gold/35"
        >
          {value || '❔'}
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor={customId} className="mb-1 block text-xs font-medium text-muted">
            Eigenes Emoji
          </label>
          <input
            id={customId}
            type="text"
            value={custom}
            onChange={(event) => handleCustom(event.target.value)}
            placeholder="z. B. 🦉 einfügen"
            autoComplete="off"
            className={cn(INPUT_CLASS, 'h-10 text-base')}
          />
        </div>
      </div>

      {/* Kategorien */}
      <div
        role="group"
        aria-label="Kategorien"
        className="scrollbar-none -mx-3 mt-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]"
      >
        {categories.map((c) => (
          <Chip key={c.id} size="sm" selected={c.id === category?.id} onClick={() => setCategoryId(c.id)}>
            <span aria-hidden="true">{c.icon}</span>
            {c.label}
          </Chip>
        ))}
      </div>

      {/* Raster */}
      {category && (
        <div
          role="group"
          aria-label={`Emojis: ${category.label}`}
          className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(2.625rem,1fr))] gap-1"
        >
          {category.emojis.map((emoji) => {
            const selected = emoji === value
            return (
              <button
                key={emoji}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setCustom('')
                  onChange(emoji)
                }}
                className={cn(
                  'grid aspect-square place-items-center rounded-xl text-[1.5rem] leading-none transition-[background-color,transform,box-shadow] duration-150 active:scale-90',
                  selected
                    ? 'bg-gold/18 shadow-[inset_0_0_0_1.5px_var(--color-gold)]'
                    : 'hover:bg-surface-hover',
                )}
              >
                {emoji}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  if (label === undefined && hint === undefined) return content
  return (
    <Field id={id} label={label} hint={hint} group>
      {content}
    </Field>
  )
}
