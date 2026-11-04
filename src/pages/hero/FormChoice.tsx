import { CLASS_DEFINITIONS, GRAMMATICAL_FORMS, GRAMMATICAL_FORM_LABELS } from '../../domain/combat/classDefinitions'
import { TITLES } from '../../domain/combat/cosmeticDefinitions'
import type { GrammaticalForm } from '../../domain/types'
import { SegmentedControl } from '../../ui'

/** Ein Name in drei Sprachformen (Klasse oder Titel), optional mit Symbol. */
export interface FormExample {
  icon?: string
  names: Record<GrammaticalForm, string>
}

/** Standard-Beispiele: Magierin / Magier / Arkane Seele und der erste Titel („die Wagemutige“). */
const DEFAULT_EXAMPLES: readonly FormExample[] = [CLASS_DEFINITIONS.mage, ...TITLES.filter((title) => title.id === 'daring')]

export interface FormChoiceProps {
  value: GrammaticalForm
  onChange: (value: GrammaticalForm) => void
  /** Namen, an denen die Wahl live gezeigt wird (Standard: Magier-Klasse und ein Titel). */
  examples?: readonly FormExample[]
  /** Einleitung der Vorschau, z. B. „Zum Beispiel“ oder „So heißt du dann“. */
  examplePrefix?: string
  className?: string
}

/**
 * Sprachform des Helden (Heldin / Held / Neutral) für Klassen- und Titelnamen – mit Live-Vorschau an Beispielen.
 * Gemeinsam für das Onboarding und „Held bearbeiten“.
 */
export function FormChoice({
  value,
  onChange,
  examples = DEFAULT_EXAMPLES,
  examplePrefix = 'Zum Beispiel',
  className,
}: FormChoiceProps) {
  const preview = examples
    .map((example) => {
      // Wie `classNameFor`/`titleNameFor`: fehlt eine Form, gilt die neutrale.
      const name = example.names[value] ?? example.names.neutral
      return example.icon !== undefined ? `${example.icon} ${name}` : name
    })
    .join(' · ')

  return (
    <div className={className}>
      <SegmentedControl<GrammaticalForm>
        label="Sprachform"
        hint="Für Klassen- und Titelnamen – du kannst sie jederzeit ändern."
        value={value}
        onChange={onChange}
        options={GRAMMATICAL_FORMS.map((form) => ({ value: form, label: GRAMMATICAL_FORM_LABELS[form] }))}
      />
      {preview !== '' && (
        <p aria-live="polite" className="mt-2 text-[0.8125rem] text-muted" data-form-preview={value}>
          {examplePrefix}: <span className="font-medium text-gold-bright">{preview}</span>
        </p>
      )}
    </div>
  )
}
