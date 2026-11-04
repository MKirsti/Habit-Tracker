import { Check, ChevronDown, EyeOff } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useGameContext } from '../../app/gameContext'
import { archiveReward, createReward, updateReward } from '../../data/repository'
import type { Reward } from '../../domain/types'
import {
  Button,
  Chip,
  Dialog,
  EmojiPicker,
  Field,
  NumberField,
  Switch,
  TextArea,
  TextField,
  cn,
  formatNumber,
  useToast,
} from '../../ui'
import { errorMessage } from './errors'
import {
  DEFAULT_REWARD_ICON,
  REWARD_DESCRIPTION_MAX,
  REWARD_FIELD_ORDER,
  REWARD_PRICE_MAX,
  REWARD_PRICE_MIN,
  REWARD_PRICE_PRESETS,
  REWARD_TITLE_MAX,
  daysToEarn,
  hasRewardErrors,
  initialRewardFormValues,
  rewardDraftFromValues,
  sameRewardFormValues,
  validateRewardForm,
} from './rewardForm'
import type { RewardFormErrors, RewardFormField, RewardFormValues } from './rewardForm'
import type { RewardSuggestion } from './rewardSuggestions'

export interface RewardFormDialogProps {
  open: boolean
  onClose: () => void
  /** Zu bearbeitende Belohnung. Ohne Belohnung legt der Dialog eine neue an. */
  reward?: Reward
  /** Vorlage für eine neue Belohnung (aus den Vorschlägen). */
  suggestion?: RewardSuggestion
  /** Nach dem Anlegen (vor dem Schließen) – z. B. um die neue Karte zu fokussieren. */
  onCreated?: (reward: Reward) => void
  /** Nach dem Ausblenden (vor dem Schließen). */
  onArchived?: (reward: Reward) => void
}

/**
 * Dialog zum Anlegen und Bearbeiten einer Belohnung: Symbol, Name, Beschreibung, Preis (ganze Gold-Münzen) und
 * „Wiederholbar“. Speichert selbst über das Repository und meldet Erfolg bzw. Fehler als Toast. Beim Bearbeiten
 * lässt sich die Belohnung hier ausblenden (ihre Einlösungen bleiben in der Chronik).
 */
export function RewardFormDialog({ open, onClose, reward, suggestion, onCreated, onArchived }: RewardFormDialogProps) {
  const { state } = useGameContext()
  const { toast } = useToast()
  const baseId = useId()
  const formId = `${baseId}form`
  const ids: Record<RewardFormField, string> = {
    title: `${baseId}title`,
    description: `${baseId}description`,
    price: `${baseId}price`,
  }
  const pickerId = `${baseId}emoji`
  const isEdit = reward !== undefined

  const [initialValues, setInitialValues] = useState(() => initialRewardFormValues(reward, suggestion))
  const [values, setValues] = useState(initialValues)
  const [touched, setTouched] = useState<ReadonlySet<RewardFormField>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Bei jedem Öffnen frisch starten (Muster „State während des Renderns anpassen“).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      const next = initialRewardFormValues(reward, suggestion)
      setInitialValues(next)
      setValues(next)
      setTouched(new Set())
      setSubmitted(false)
      setSaving(false)
      setPickerOpen(false)
    }
  }

  const errors = validateRewardForm(values)
  const dirty = !sameRewardFormValues(values, initialValues)
  function shownError(field: RewardFormField): string | undefined {
    return submitted || touched.has(field) ? errors[field] : undefined
  }

  function update<K extends keyof RewardFormValues>(key: K, value: RewardFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function touch(field: RewardFormField) {
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)))
  }

  function focusFirstError(currentErrors: RewardFormErrors) {
    const first = REWARD_FIELD_ORDER.find((field) => currentErrors[field] !== undefined)
    if (first) document.getElementById(ids[first])?.focus()
  }

  function close() {
    if (!saving) onClose()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current) return
    setSubmitted(true)
    const currentErrors = validateRewardForm(values)
    if (hasRewardErrors(currentErrors)) {
      focusFirstError(currentErrors)
      return
    }
    savingRef.current = true
    setSaving(true)
    const draft = rewardDraftFromValues(values)
    try {
      if (reward) {
        await updateReward(reward.id, draft)
        toast({
          tone: 'success',
          title: 'Belohnung gespeichert',
          description: `„${draft.title}“ ist auf dem neuesten Stand.`,
        })
      } else {
        const created = await createReward(draft)
        onCreated?.(created)
        toast({
          tone: 'success',
          title: 'Belohnung angelegt',
          description: `„${draft.title}“ liegt jetzt in deiner Schatzkammer bereit.`,
        })
      }
      setSaving(false)
      onClose()
    } catch (error) {
      setSaving(false)
      toast({ tone: 'error', title: 'Belohnung konnte nicht gespeichert werden', description: errorMessage(error) })
    } finally {
      savingRef.current = false
    }
  }

  async function handleArchive() {
    if (!reward || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      await archiveReward(reward.id)
      onArchived?.(reward)
      toast({
        tone: 'success',
        title: 'Belohnung ausgeblendet',
        description: `„${reward.title}“ findest du unter „Ausgeblendete Belohnungen“. Die Chronik bleibt erhalten.`,
      })
      setSaving(false)
      onClose()
    } catch (error) {
      setSaving(false)
      toast({ tone: 'error', title: 'Ausblenden fehlgeschlagen', description: errorMessage(error) })
    } finally {
      savingRef.current = false
    }
  }

  const price = values.price
  const priceValid = errors.price === undefined && price !== null
  const days = priceValid ? daysToEarn(price, state.gold.fromXp, state.adventureDay) : undefined

  return (
    <Dialog
      open={open}
      onClose={close}
      closeOnOverlayClick={!saving && !dirty}
      size="md"
      icon={values.icon || DEFAULT_REWARD_ICON}
      title={isEdit ? 'Belohnung bearbeiten' : 'Neue Belohnung'}
      description={isEdit ? undefined : 'Womit willst du dich für deine Taten belohnen?'}
      footer={
        <>
          <div className={cn('gap-2 sm:contents', isEdit ? 'grid grid-cols-2' : 'flex')}>
            {isEdit && (
              <Button
                variant="ghost"
                icon={<EyeOff />}
                onClick={handleArchive}
                disabled={saving}
                className="sm:mr-auto"
              >
                Ausblenden
              </Button>
            )}
            <Button variant="secondary" onClick={close} disabled={saving} className="flex-1 sm:flex-none">
              Abbrechen
            </Button>
          </div>
          <Button type="submit" form={formId} loading={saving} icon={<Check />}>
            {isEdit ? 'Speichern' : 'Belohnung anlegen'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Field id={`${baseId}icon`} label="Symbol" group>
              <button
                type="button"
                aria-label={`Symbol ändern (aktuell ${values.icon || DEFAULT_REWARD_ICON})`}
                aria-expanded={pickerOpen}
                aria-controls={pickerId}
                onClick={() => setPickerOpen((current) => !current)}
                className={cn(
                  'flex h-11 w-[4.5rem] items-center justify-center gap-1 rounded-xl border bg-bg-deep/70 transition-colors',
                  pickerOpen ? 'border-gold ring-2 ring-gold/25' : 'border-border-strong hover:border-gold-dim',
                )}
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  {values.icon || DEFAULT_REWARD_ICON}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn('size-4 text-gold transition-transform', pickerOpen && 'rotate-180')}
                />
              </button>
            </Field>
            <TextField
              id={ids.title}
              label="Name"
              value={values.title}
              onChange={(title) => update('title', title)}
              onBlur={() => touch('title')}
              error={shownError('title')}
              placeholder="z. B. Pizza bestellen"
              maxLength={REWARD_TITLE_MAX}
              showCount
              required
              autoComplete="off"
              fieldClassName="min-w-0 flex-1"
            />
          </div>
          {pickerOpen && (
            <div id={pickerId}>
              <EmojiPicker value={values.icon} onChange={(icon) => update('icon', icon)} />
            </div>
          )}
        </div>

        <TextArea
          id={ids.description}
          label="Beschreibung"
          value={values.description}
          onChange={(description) => update('description', description)}
          onBlur={() => touch('description')}
          error={shownError('description')}
          hint="Optional – was genau gönnst du dir?"
          placeholder="z. B. Von der Pizzeria um die Ecke, mit extra Käse."
          maxLength={REWARD_DESCRIPTION_MAX}
          showCount
          rows={2}
        />

        <div className="space-y-2.5">
          <NumberField
            id={ids.price}
            label="Preis"
            value={values.price}
            onChange={(next) => update('price', next)}
            onBlur={() => touch('price')}
            min={REWARD_PRICE_MIN}
            max={REWARD_PRICE_MAX}
            step={10}
            unit="Gold"
            error={shownError('price')}
            hint={
              days !== undefined ? (
                <>
                  Bei deinem bisherigen Tempo etwa{' '}
                  <span className="font-medium text-gold-bright">
                    {formatNumber(days)} {days === 1 ? 'Tag' : 'Tage'}
                  </span>{' '}
                  Abenteuer.
                </>
              ) : (
                'Ganze Gold-Münzen – je größer der Wunsch, desto höher der Preis.'
              )
            }
            required
            fieldClassName="max-w-sm"
          />
          <div role="group" aria-label="Preis schnell wählen" className="flex flex-wrap gap-1.5">
            {REWARD_PRICE_PRESETS.map((preset) => (
              <Chip
                key={preset}
                size="sm"
                selected={values.price === preset}
                onClick={() => {
                  touch('price')
                  update('price', preset)
                }}
                aria-label={`${formatNumber(preset)} Gold`}
              >
                {formatNumber(preset)}
              </Chip>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-bg-deep/40 px-4 py-2">
          <Switch
            label="Wiederholbar"
            description={
              values.repeatable
                ? 'Beliebig oft einlösbar – z. B. ein Kinoabend.'
                : 'Nur einmal einlösbar – danach steht sie als „Eingelöst“ in der Schatzkammer.'
            }
            checked={values.repeatable}
            onChange={(repeatable) => update('repeatable', repeatable)}
          />
        </div>
      </form>
    </Dialog>
  )
}
