import { Check, Feather, Swords } from 'lucide-react'
import { useId, useMemo } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createScholarCampaign } from '../../data/seed'
import { describeSchedule } from '../../domain/schedule'
import type { DayKey } from '../../domain/types'
import { Badge, Button, cn } from '../../ui'
import { StepActions, StepHeading } from './StepParts'

export type CampaignChoice = 'scholar' | 'none'

export interface CampaignStepProps {
  today: DayKey
  choice: CampaignChoice
  onChoiceChange: (choice: CampaignChoice) => void
  onFinish: () => void
  saving: boolean
  focusOnMount: boolean
}

/** Schritt 3: Vorlage „Der Weg des Gelehrten“ (empfohlen) oder ohne Vorlage starten. */
export function CampaignStep({ today, choice, onChoiceChange, onFinish, saving, focusOnMount }: CampaignStepProps) {
  const groupName = useId()
  // Vorschau direkt aus der Vorlage ableiten, damit sie nie von der echten Kampagne abweicht.
  const preview = useMemo(() => createScholarCampaign(today), [today])
  const { mainQuest, habits } = preview

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onFinish()
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <StepHeading
        eyebrow="Deine Kampagne"
        title="Wähle deine erste Kampagne"
        subtitle="Eine Kampagne ist dein großes Ziel – deine Quests bringen dich ihm Kapitel für Kapitel näher. Starte mit der Vorlage oder ganz ohne."
        focusOnMount={focusOnMount}
      />

      <div role="radiogroup" aria-label="Erste Kampagne" className="mt-6 flex flex-col gap-4">
        <ChoiceCard
          name={groupName}
          value="scholar"
          checked={choice === 'scholar'}
          onSelect={onChoiceChange}
          icon={<span className="text-[1.75rem] leading-none">{mainQuest.icon}</span>}
          title={mainQuest.title}
          badge={<Badge tone="gold">Empfohlen</Badge>}
          description={mainQuest.description ?? mainQuest.why}
        >
          <div className="mt-4 grid gap-4 border-t border-border/80 pt-4 sm:grid-cols-2 sm:gap-6">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-gold uppercase">
                {habits.length} Quests
              </p>
              <ul className="flex flex-col gap-2">
                {habits.map((habit) => (
                  <li key={habit.id} className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-black/25 text-lg leading-none ring-1 ring-white/5 ring-inset"
                    >
                      {habit.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm leading-snug text-parchment">{habit.title}</span>
                      <span className="block text-xs text-muted">
                        {describeSchedule(habit.schedule)}
                        {habit.measure ? ` · ${habit.measure.target} ${habit.measure.unit}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-gold uppercase">
                {mainQuest.chapters.length} Kapitel
              </p>
              <ol className="flex flex-col gap-1.5">
                {mainQuest.chapters.map((chapter, index) => (
                  <li key={chapter.id} className="flex items-baseline gap-2.5 text-sm text-parchment">
                    <span
                      aria-hidden="true"
                      className="w-5 shrink-0 text-right font-display text-xs font-semibold text-gold/80 tabular-nums"
                    >
                      {toRoman(index + 1)}
                    </span>
                    <span className="min-w-0">{chapter.title}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </ChoiceCard>

        <ChoiceCard
          name={groupName}
          value="none"
          checked={choice === 'none'}
          onSelect={onChoiceChange}
          icon={<Feather />}
          title="Ohne Vorlage starten"
          description="Du legst deine Quests und Kampagnen selbst an – volle Freiheit von Anfang an."
        />
      </div>

      <StepActions>
        <Button type="submit" size="lg" fullWidth icon={<Swords />} loading={saving}>
          Los geht’s
        </Button>
      </StepActions>
    </form>
  )
}

interface ChoiceCardProps {
  name: string
  value: CampaignChoice
  checked: boolean
  onSelect: (value: CampaignChoice) => void
  icon: ReactNode
  title: string
  badge?: ReactNode
  description: string
  children?: ReactNode
}

/**
 * Auswählbare Karte mit echtem Radio-Button (Pfeiltasten, Screenreader). Der Titel ist das Label
 * und spannt sich unsichtbar über die ganze Karte – so ist sie überall antippbar, der zugängliche
 * Name bleibt aber kurz, und die Vorschau darunter ist normal lesbar.
 */
function ChoiceCard({ name, value, checked, onSelect, icon, title, badge, description, children }: ChoiceCardProps) {
  const id = useId()
  const inputId = `${id}-input`
  const descriptionId = `${id}-description`
  return (
    <div
      className={cn(
        'relative rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] duration-200 sm:p-5',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold-bright',
        checked
          ? 'border-gold/70 bg-linear-to-b from-[#2a2010]/95 to-surface/95 shadow-[inset_0_1px_0_rgb(240_201_106/0.14),0_0_0_1px_rgb(212_165_72/0.2),0_16px_40px_-18px_rgb(212_165_72/0.45)]'
          : 'border-border bg-surface/70 hover:border-border-strong hover:bg-surface-raised/70',
      )}
    >
      <input
        id={inputId}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        aria-describedby={descriptionId}
        className="sr-only"
      />
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-xl ring-1 ring-inset [&_svg]:size-6',
            checked ? 'bg-gold/14 text-gold-bright ring-gold/40' : 'bg-black/25 text-muted ring-white/6',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-8">
            <label
              htmlFor={inputId}
              className="cursor-pointer font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment after:absolute after:inset-0 after:z-10 after:rounded-2xl"
            >
              {title}
            </label>
            {badge}
          </div>
          <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-muted">
            {description}
          </p>
        </div>
      </div>
      {/* Radio-Anzeige oben rechts */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-4 right-4 grid size-6 place-items-center rounded-full border-2 transition-colors duration-200 sm:top-5 sm:right-5',
          checked ? 'border-gold-bright bg-gold-bright text-on-gold' : 'border-border-strong bg-bg-deep/60',
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3.5} />}
      </span>
      {children}
    </div>
  )
}

/** Kapitelnummer als römische Zahl (I–XII genügt für Vorlagen). */
function toRoman(value: number): string {
  const numerals: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let rest = value
  let result = ''
  for (const [amount, numeral] of numerals) {
    while (rest >= amount) {
      result += numeral
      rest -= amount
    }
  }
  return result
}
