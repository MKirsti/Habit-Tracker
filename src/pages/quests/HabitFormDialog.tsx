import { Archive, Check, ChevronDown, Info, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useGameContext } from '../../app/gameContext'
import { archiveHabit, createHabit, updateHabit } from '../../data/repository'
import { DIFFICULTIES, DIFFICULTY_META } from '../../domain/balancing'
import { isArchivedOn, questXp } from '../../domain/schedule'
import type { Habit } from '../../domain/types'
import {
  Button,
  Chip,
  ConfirmDialog,
  Dialog,
  EmojiPicker,
  Field,
  NumberField,
  SegmentedControl,
  Select,
  Switch,
  TextArea,
  TextField,
  cn,
  formatNumber,
  useToast,
} from '../../ui'
import type { SelectOption } from '../../ui'
import { AttributePicker } from './AttributePicker'
import { errorMessage } from './errors'
import {
  DEFAULT_ICON,
  DESCRIPTION_MAX,
  FIELD_ORDER,
  TITLE_MAX,
  UNIT_MAX,
  UNIT_SUGGESTIONS,
  WEEKDAYS,
  habitDraftFromValues,
  hasErrors,
  initialHabitFormValues,
  sameFormValues,
  todayEntryNote,
  toggleWeekday,
  validateHabitForm,
} from './habitForm'
import type { HabitFormErrors, HabitFormField, HabitFormValues, ScheduleType } from './habitForm'

export interface HabitFormDialogProps {
  open: boolean
  onClose: () => void
  /** Zu bearbeitende Quest. Ohne Quest legt der Dialog eine neue an. */
  habit?: Habit
  /** Vorausgewählte Kampagne beim Anlegen (wird ignoriert, wenn es sie nicht oder nur archiviert gibt). */
  initialMainQuestId?: string
  /** Nach erfolgreichem Anlegen (direkt bevor sich der Dialog schließt), z. B. um zur neuen Quest zu springen. */
  onCreated?: (habit: Habit) => void
  /** Nach erfolgreichem Archivieren (direkt bevor sich der Dialog schließt), z. B. um den Fokus zu setzen. */
  onArchived?: (habit: Habit) => void
}

const SCHEDULE_OPTIONS: { value: ScheduleType; label: string }[] = [
  { value: 'daily', label: 'Täglich' },
  { value: 'weekdays', label: 'Wochentage' },
  { value: 'weekly', label: 'X pro Woche' },
]

/**
 * Längere Einheiten stehen nicht zusätzlich im Zielfeld: Auf dem Handy würden sie die Zahl aus dem Feld
 * drängen. Die Einheit steht ohnehin direkt daneben bzw. darunter im Feld „Einheit“.
 */
const UNIT_SUFFIX_MAX = 10

const DIFFICULTY_OPTIONS = DIFFICULTIES.map((difficulty) => ({
  value: difficulty,
  label: DIFFICULTY_META[difficulty].label,
}))

/**
 * Dialog zum Anlegen und Bearbeiten einer Quest. Speichert selbst über das Repository und zeigt
 * Erfolg bzw. Fehler als Toast. Beim Bearbeiten lässt sich die Quest hier auch archivieren.
 */
export function HabitFormDialog({
  open,
  onClose,
  habit,
  initialMainQuestId,
  onCreated,
  onArchived,
}: HabitFormDialogProps) {
  const { data, today } = useGameContext()
  const { toast } = useToast()
  const baseId = useId()
  const formId = `${baseId}form`
  const ids: Record<HabitFormField, string> = {
    title: `${baseId}title`,
    description: `${baseId}description`,
    weekdays: `${baseId}weekdays`,
    timesPerWeek: `${baseId}times`,
    target: `${baseId}target`,
    unit: `${baseId}unit`,
  }
  const pickerId = `${baseId}emoji`

  const isEdit = habit !== undefined

  // Kampagnen-Auswahl: aktive Kampagnen, beim Bearbeiten zusätzlich die aktuell verknüpfte (auch archiviert).
  const campaigns = data.mainQuests.filter((quest) => !quest.archived || quest.id === habit?.mainQuestId)
  const campaignOptions: SelectOption<string>[] = [
    { value: '', label: 'Keine Kampagne' },
    ...campaigns.map((quest) => ({
      value: quest.id,
      label: `${quest.icon} ${quest.title}${quest.archived ? ' (archiviert)' : ''}`,
    })),
  ]

  function startValues(): HabitFormValues {
    const values = initialHabitFormValues(habit, initialMainQuestId)
    if (values.mainQuestId !== '' && !campaigns.some((quest) => quest.id === values.mainQuestId)) {
      values.mainQuestId = ''
    }
    return values
  }

  const [initialValues, setInitialValues] = useState(startValues)
  const [values, setValues] = useState(initialValues)
  const [touched, setTouched] = useState<ReadonlySet<HabitFormField>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  // Bei jedem Öffnen frisch starten (Muster „State während des Renderns anpassen“).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      const next = startValues()
      setInitialValues(next)
      setValues(next)
      setTouched(new Set())
      setSubmitted(false)
      setSaving(false)
      setPickerOpen(false)
      setConfirmArchive(false)
    }
  }

  const errors = validateHabitForm(values)
  // Mit Eingaben schließt ein (versehentlicher) Tipp auf den Hintergrund den Dialog nicht – sonst wäre alles weg.
  const dirty = !sameFormValues(values, initialValues)
  function shownError(field: HabitFormField): string | undefined {
    return submitted || touched.has(field) ? errors[field] : undefined
  }

  function update<K extends keyof HabitFormValues>(key: K, value: HabitFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function touch(field: HabitFormField) {
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)))
  }

  function focusFirstError(currentErrors: HabitFormErrors) {
    const first = FIELD_ORDER.find((field) => currentErrors[field] !== undefined)
    if (first) document.getElementById(ids[first])?.focus()
  }

  function close() {
    if (!saving) onClose()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Ref statt State: schützt auch vor doppeltem Absenden innerhalb desselben Renders (Doppel-Enter).
    if (savingRef.current) return
    setSubmitted(true)
    const currentErrors = validateHabitForm(values)
    if (hasErrors(currentErrors)) {
      focusFirstError(currentErrors)
      return
    }
    savingRef.current = true
    setSaving(true)
    const draft = habitDraftFromValues(values)
    try {
      if (habit) {
        await updateHabit(habit.id, draft, today)
        toast({ tone: 'success', title: 'Quest gespeichert', description: `„${draft.title}“ ist auf dem neuesten Stand.` })
      } else {
        const created = await createHabit(draft, today)
        toast({ tone: 'success', title: 'Quest angelegt', description: `„${draft.title}“ steht ab heute in deinem Questbuch.` })
        onCreated?.(created)
      }
      setSaving(false)
      onClose()
    } catch (error) {
      setSaving(false)
      toast({ tone: 'error', title: 'Quest konnte nicht gespeichert werden', description: errorMessage(error) })
    } finally {
      savingRef.current = false
    }
  }

  async function handleArchive() {
    if (!habit) return
    try {
      await archiveHabit(habit.id, today)
    } catch (error) {
      toast({ tone: 'error', title: 'Archivieren fehlgeschlagen', description: errorMessage(error) })
      throw error
    }
    toast({
      tone: 'success',
      title: 'Quest archiviert',
      description: `„${habit.title}“ ruht jetzt im Archiv. Verlauf und XP bleiben erhalten.`,
    })
    onArchived?.(habit)
    onClose()
  }

  // Gleiche Regel wie in der Quest-Liste und im Repository: Ein archivedDay nach heute zählt noch nicht.
  const canArchive = habit !== undefined && !isArchivedOn(habit, today)
  const xp = questXp(values.difficulty)
  const unitLabel = values.unit.trim()
  // Die Änderung gilt auch für den heutigen Eintrag – kostet sie heutigen Fortschritt, sagt der Dialog es vorher.
  const todayCompletion = habit && data.completions.find((c) => c.habitId === habit.id && c.day === today)
  const todayNote = habit ? todayEntryNote(habit, todayCompletion, values) : undefined

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        closeOnOverlayClick={!saving && !dirty}
        size="lg"
        icon={values.icon || DEFAULT_ICON}
        title={isEdit ? 'Quest bearbeiten' : 'Neue Quest'}
        description={isEdit ? undefined : 'Was willst du regelmäßig meistern?'}
        footer={
          <>
            {/* Handy: „Archivieren“ und „Abbrechen“ nebeneinander unter „Speichern“; ab sm eine Zeile. */}
            <div className={cn('gap-2 sm:contents', canArchive ? 'grid grid-cols-2' : 'flex')}>
              {canArchive && (
                <Button
                  variant="ghost"
                  icon={<Archive />}
                  onClick={() => setConfirmArchive(true)}
                  disabled={saving}
                  className="sm:mr-auto"
                >
                  Archivieren
                </Button>
              )}
              <Button variant="secondary" onClick={close} disabled={saving} className="flex-1 sm:flex-none">
                Abbrechen
              </Button>
            </div>
            <Button type="submit" form={formId} loading={saving} icon={<Check />}>
              {isEdit ? 'Speichern' : 'Quest anlegen'}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {isEdit && (
            <p className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/8 px-3.5 py-2.5 text-sm text-parchment/90"
            >
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
              <span>Änderungen gelten ab heute – auch für den heutigen Eintrag; frühere Tage behalten ihre Werte.</span>
            </p>
          )}
          {/* Symbol + Titel */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Field id={`${baseId}icon`} label="Symbol" group>
                <button
                  type="button"
                  aria-label={`Symbol ändern (aktuell ${values.icon || DEFAULT_ICON})`}
                  aria-expanded={pickerOpen}
                  aria-controls={pickerId}
                  onClick={() => setPickerOpen((current) => !current)}
                  className={cn(
                    'flex h-11 w-[4.5rem] items-center justify-center gap-1 rounded-xl border bg-bg-deep/70 transition-colors',
                    pickerOpen ? 'border-gold ring-2 ring-gold/25' : 'border-border-strong hover:border-gold-dim',
                  )}
                >
                  <span aria-hidden="true" className="text-2xl leading-none">
                    {values.icon || DEFAULT_ICON}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className={cn('size-4 text-gold transition-transform', pickerOpen && 'rotate-180')}
                  />
                </button>
              </Field>
              <TextField
                id={ids.title}
                label="Titel"
                value={values.title}
                onChange={(title) => update('title', title)}
                onBlur={() => touch('title')}
                error={shownError('title')}
                placeholder="z. B. 10 Seiten lesen"
                maxLength={TITLE_MAX}
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
            hint="Optional – was genau gehört dazu?"
            placeholder="z. B. In meinem aktuellen Buch, am liebsten abends."
            maxLength={DESCRIPTION_MAX}
            showCount
            rows={2}
          />

          <AttributePicker
            value={values.attribute}
            onChange={(attribute) => update('attribute', attribute)}
            hint="Dieses Attribut wächst mit jeder Erledigung."
          />

          <SegmentedControl
            label="Schwierigkeit"
            value={values.difficulty}
            onChange={(difficulty) => update('difficulty', difficulty)}
            options={DIFFICULTY_OPTIONS}
            hint={
              <span className="font-medium text-gold-bright tabular-nums">
                +{formatNumber(xp)} XP pro Erledigung
              </span>
            }
          />

          <div className="space-y-3">
            <SegmentedControl
              label="Rhythmus"
              value={values.scheduleType}
              onChange={(scheduleType) => update('scheduleType', scheduleType)}
              options={SCHEDULE_OPTIONS}
            />
            {values.scheduleType === 'daily' && (
              <p className="text-[0.8125rem] text-muted">Jeden Tag fällig – zählt für den Perfekten Tag.</p>
            )}
            {values.scheduleType === 'weekdays' && (
              <WeekdayPicker
                id={ids.weekdays}
                value={values.weekdays}
                onToggle={(day) => {
                  touch('weekdays')
                  update('weekdays', toggleWeekday(values.weekdays, day))
                }}
                error={shownError('weekdays')}
              />
            )}
            {values.scheduleType === 'weekly' && (
              <NumberField
                id={ids.timesPerWeek}
                label="Mal pro Woche"
                value={values.timesPerWeek}
                onChange={(times) => update('timesPerWeek', times)}
                onBlur={() => touch('timesPerWeek')}
                min={1}
                max={7}
                error={shownError('timesPerWeek')}
                hint="An beliebigen Tagen von Montag bis Sonntag."
                fieldClassName="max-w-xs"
              />
            )}
          </div>

          <div className="rounded-2xl border border-border bg-bg-deep/40 px-4 py-2">
            <Switch
              label="Messbar"
              description="Mit Tagesziel und Teilfortschritt, z. B. 10 Seiten oder 2 L Wasser."
              checked={values.measurable}
              onChange={(measurable) => update('measurable', measurable)}
            />
            {values.measurable && (
              <div className="grid gap-4 border-t border-border pt-4 pb-3 sm:grid-cols-2">
                <NumberField
                  id={ids.target}
                  label="Ziel pro Tag"
                  value={values.target}
                  onChange={(target) => update('target', target)}
                  onBlur={() => touch('target')}
                  min={0}
                  unit={unitLabel === '' || unitLabel.length > UNIT_SUFFIX_MAX ? undefined : unitLabel}
                  placeholder="z. B. 10"
                  error={shownError('target')}
                  required
                />
                <div className="space-y-2">
                  <TextField
                    id={ids.unit}
                    label="Einheit"
                    value={values.unit}
                    onChange={(unit) => update('unit', unit)}
                    onBlur={() => touch('unit')}
                    error={shownError('unit')}
                    placeholder="z. B. Seiten"
                    maxLength={UNIT_MAX}
                    autoComplete="off"
                    required
                  />
                  <div role="group" aria-label="Vorschläge für die Einheit" className="flex flex-wrap gap-1.5">
                    {UNIT_SUGGESTIONS.map((suggestion) => (
                      <Chip
                        key={suggestion}
                        size="sm"
                        selected={unitLabel === suggestion}
                        onClick={() => {
                          touch('unit')
                          update('unit', suggestion)
                        }}
                      >
                        {suggestion}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          {isEdit && (
            <div aria-live="polite" className="-mt-3 empty:hidden">
              {todayNote !== undefined && (
                <p className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/8 px-3.5 py-2.5 text-sm text-parchment/90">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>{todayNote}</span>
                </p>
              )}
            </div>
          )}

          <Select
            label="Kampagne"
            value={values.mainQuestId}
            onChange={(mainQuestId) => update('mainQuestId', mainQuestId)}
            options={campaignOptions}
            hint={
              campaigns.length === 0
                ? 'Noch keine Kampagne – auf der Kampagnen-Seite kannst du eine beginnen.'
                : 'Verknüpfte Quests erscheinen bei ihrer Kampagne.'
            }
          />
        </form>
      </Dialog>

      {habit && (
        <ConfirmDialog
          open={open && confirmArchive}
          onClose={() => setConfirmArchive(false)}
          onConfirm={handleArchive}
          icon={habit.icon}
          title="Quest archivieren?"
          message={
            <>
              „{habit.title}“ verschwindet ab heute aus deinen Tagesquests. Verlauf, Serien und alle verdienten XP
              bleiben erhalten – du kannst sie jederzeit aus dem Archiv zurückholen.
            </>
          }
          confirmLabel="Archivieren"
        />
      )}
    </>
  )
}

interface WeekdayPickerProps {
  id: string
  value: readonly number[]
  onToggle: (day: (typeof WEEKDAYS)[number]['day']) => void
  error?: string
}

/** Sieben Umschalt-Chips Mo–So. Die ID gehört zum ersten Chip (für den Fokus bei Fehlern). */
function WeekdayPicker({ id, value, onToggle, error }: WeekdayPickerProps) {
  const groupId = `${id}-group`
  return (
    <Field id={groupId} label="Wochentage" error={error} group>
      <div
        role="group"
        aria-labelledby={`${groupId}-label`}
        aria-describedby={error !== undefined ? `${groupId}-error` : undefined}
        className="grid max-w-md grid-cols-7 gap-1.5"
      >
        {WEEKDAYS.map(({ day, short, long }, index) => (
          <Chip
            key={day}
            id={index === 0 ? id : undefined}
            selected={value.includes(day)}
            onClick={() => onToggle(day)}
            aria-label={long}
            className="min-w-0 px-0"
          >
            {short}
          </Chip>
        ))}
      </div>
    </Field>
  )
}
