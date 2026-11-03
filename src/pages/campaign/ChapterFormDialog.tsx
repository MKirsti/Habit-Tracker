import { Check, Flag, Info, Trash2, TriangleAlert } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useGameContext } from '../../app/gameContext'
import { BALANCING } from '../../domain/balancing'
import type { Chapter, Habit } from '../../domain/types'
import {
  Button,
  ConfirmDialog,
  Dialog,
  NumberField,
  SegmentedControl,
  Select,
  TextArea,
  TextField,
  cn,
  formatNumber,
} from '../../ui'
import type { SegmentedOption, SelectOption } from '../../ui'
import {
  CHAPTER_DESCRIPTION_MAX,
  CHAPTER_FIELD_ORDER,
  CHAPTER_TITLE_MAX,
  COUNTER_LABEL_MAX,
  chapterFromValues,
  hasErrors,
  initialChapterFormValues,
  sortHabitsForChapter,
  validateChapterForm,
} from './campaignForm'
import type { ChapterFormErrors, ChapterFormField, ChapterFormValues } from './campaignForm'
import { CHAPTER_TYPE_LABELS, METRIC_LABELS, isArchived, metricUnit } from './campaignText'
import type { ChapterType, HabitMetric } from './campaignText'

export interface ChapterFormDialogProps {
  open: boolean
  onClose: () => void
  /** Zu bearbeitendes Kapitel. Ohne Kapitel legt der Dialog ein neues an. */
  chapter?: Chapter
  /** Nummer des Kapitels (1-basiert) für die Überschrift. */
  number: number
  /** Kampagne, zu der das Kapitel gehört – ihre Quests stehen in der Auswahl oben. */
  campaignId?: string
  /**
   * Übernimmt das Kapitel. Darf ein Promise liefern; wirft es, bleibt der Dialog offen
   * (Fehler selbst anzeigen, z. B. per Toast).
   */
  onSubmit: (chapter: Chapter) => void | Promise<void>
  /** Löschen (nur beim Bearbeiten). Wird nach einer Rückfrage aufgerufen; wirft es, bleibt alles offen. */
  onDelete?: () => void | Promise<void>
  /** XP, die beim Löschen verloren gehen (für die Rückfrage). 0 = keine. */
  deleteXp?: number
  /** Beschriftung des Speichern-Buttons. Standard: "Speichern" bzw. "Kapitel anlegen". */
  submitLabel?: string
  /**
   * Warnung vor dem Speichern, z. B. wenn das Kapitel dadurch seinen Abschluss (und XP) verliert. Liefert sie
   * einen Text, fragt der Dialog erst nach; Abbrechen führt zurück ins Formular. `undefined` = direkt speichern.
   */
  submitWarning?: (chapter: Chapter) => string | undefined
}

const TYPE_OPTIONS: SegmentedOption<ChapterType>[] = [
  { value: 'manual', label: CHAPTER_TYPE_LABELS.manual },
  { value: 'counter', label: CHAPTER_TYPE_LABELS.counter },
  { value: 'habit', label: CHAPTER_TYPE_LABELS.habit },
]

const TYPE_HINTS: Record<ChapterType, string> = {
  manual: 'Du hakst das Kapitel selbst ab, sobald du es geschafft hast.',
  counter: 'Du zählst selbst hoch – z. B. jedes beendete Buch.',
  habit: 'Wird automatisch aus einer Quest berechnet. Es zählen nur Tage ab dem Start der Kampagne.',
}

function metricHint(metric: HabitMetric, habit: Habit | undefined): string {
  switch (metric) {
    case 'completions':
      return 'Zählt die Tage, an denen du die Quest erledigt hast.'
    case 'total':
      return habit?.measure
        ? `Summiert alle erfassten ${habit.measure.unit}, auch Teilfortschritte.`
        : 'Summiert alle erfassten Werte – nur für messbare Quests.'
    case 'streak':
      return habit?.schedule.type === 'weekly'
        ? 'Längste Serie erfüllter Wochen seit dem Start der Kampagne.'
        : 'Längste Serie erledigter Tage seit dem Start der Kampagne.'
  }
}

/**
 * Dialog zum Anlegen und Bearbeiten eines Kapitels: Titel, Beschreibung und Art
 * (Abhaken, Zähler oder Quest-Ziel mit Messgröße und Zielwert).
 */
export function ChapterFormDialog({
  open,
  onClose,
  chapter,
  number,
  campaignId,
  onSubmit,
  onDelete,
  deleteXp = 0,
  submitLabel,
  submitWarning,
}: ChapterFormDialogProps) {
  const { data, today } = useGameContext()
  const baseId = useId()
  const formId = `${baseId}form`
  const ids: Record<ChapterFormField, string> = {
    title: `${baseId}title`,
    description: `${baseId}description`,
    counterTarget: `${baseId}counter-target`,
    counterLabel: `${baseId}counter-label`,
    habitId: `${baseId}habit`,
    habitTarget: `${baseId}habit-target`,
  }

  const habits = useMemo(() => sortHabitsForChapter(data.habits, campaignId, today), [data.habits, campaignId, today])
  const habitsById = useMemo(() => new Map(habits.map((habit) => [habit.id, habit])), [habits])
  const defaultHabitId = habits[0]?.id ?? ''

  const [values, setValues] = useState(() => initialChapterFormValues(chapter, defaultHabitId))
  const [touched, setTouched] = useState<ReadonlySet<ChapterFormField>>(() => new Set())
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Beim Öffnen der Rückfrage festgehalten – nach dem Löschen ändert sich der Spielstand schon während
  // der Ausblend-Animation.
  const [confirmXp, setConfirmXp] = useState(0)
  // Rückfrage vor dem Speichern: das fertige Kapitel und der Warntext, beide beim Öffnen festgehalten.
  const [pendingSave, setPendingSave] = useState<{ chapter: Chapter; warning: string } | null>(null)

  // Bei jedem Öffnen frisch starten (Muster „State während des Renderns anpassen“).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(initialChapterFormValues(chapter, defaultHabitId))
      setTouched(new Set())
      setSubmitted(false)
      setSaving(false)
      setConfirmDelete(false)
      setPendingSave(null)
    }
  }

  const errors = validateChapterForm(values, habitsById)
  function shownError(field: ChapterFormField): string | undefined {
    return submitted || touched.has(field) ? errors[field] : undefined
  }

  function update<K extends keyof ChapterFormValues>(key: K, value: ChapterFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function touch(field: ChapterFormField) {
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)))
  }

  function focusFirstError(currentErrors: ChapterFormErrors) {
    const first = CHAPTER_FIELD_ORDER.find((field) => currentErrors[field] !== undefined)
    if (first) document.getElementById(ids[first])?.focus()
  }

  function selectHabit(habitId: string) {
    const habit = habitsById.get(habitId)
    setValues((current) => ({
      ...current,
      habitId,
      // Gesamtmenge gibt es nur für messbare Quests.
      metric: current.metric === 'total' && !habit?.measure ? 'completions' : current.metric,
    }))
  }

  function close() {
    if (!saving) onClose()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Der Dialog kann in einem anderen Formular (Kampagnen-Dialog) stecken: React-Events laufen
    // auch durch Portale nach oben – das äußere Formular darf davon nichts mitbekommen.
    event.stopPropagation()
    if (savingRef.current) return
    setSubmitted(true)
    const currentErrors = validateChapterForm(values, habitsById)
    if (hasErrors(currentErrors)) {
      focusFirstError(currentErrors)
      return
    }
    const result = chapterFromValues(values, chapter, today)
    const warning = submitWarning?.(result)
    if (warning !== undefined) {
      setPendingSave({ chapter: result, warning })
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      await onSubmit(result)
      setSaving(false)
      onClose()
    } catch {
      setSaving(false)
    } finally {
      savingRef.current = false
    }
  }

  const isEdit = chapter !== undefined
  const selectedHabit = habitsById.get(values.habitId)
  const habitOptions: SelectOption<string>[] = [
    ...(selectedHabit ? [] : [{ value: '', label: 'Quest wählen …', disabled: true }]),
    ...habits.map((habit) => ({
      value: habit.id,
      label: `${habit.icon} ${habit.title}${isArchived(habit, today) ? ' (archiviert)' : ''}`,
    })),
  ]
  const linkedCount = campaignId === undefined ? 0 : habits.filter((habit) => habit.mainQuestId === campaignId).length
  const metricOptions: SegmentedOption<HabitMetric>[] = [
    { value: 'completions', label: METRIC_LABELS.completions },
    { value: 'total', label: METRIC_LABELS.total, disabled: selectedHabit !== undefined && !selectedHabit.measure },
    { value: 'streak', label: METRIC_LABELS.streak },
  ]
  const targetUnit = metricUnit(values.metric, selectedHabit, values.habitTarget ?? 2)
  // Beim Bearbeiten eines Kapitels, dessen Quest gelöscht wurde: darauf hinweisen.
  const lostHabit = chapter?.criterion.type === 'habit' && !habitsById.has(chapter.criterion.habitId)

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        closeOnOverlayClick={!saving}
        size="md"
        icon={<Flag />}
        title={isEdit ? 'Kapitel bearbeiten' : 'Neues Kapitel'}
        description={`Kapitel ${formatNumber(number)} · +${formatNumber(BALANCING.chapterXp)} XP beim Abschluss`}
        footer={
          <>
            <div className={cn('gap-2 sm:contents', onDelete && isEdit ? 'grid grid-cols-2' : 'flex')}>
              {onDelete && isEdit && (
                <Button
                  variant="ghost"
                  icon={<Trash2 />}
                  onClick={() => {
                    setConfirmXp(deleteXp)
                    setConfirmDelete(true)
                  }}
                  disabled={saving}
                  className="text-danger! hover:text-danger! sm:mr-auto"
                >
                  Löschen
                </Button>
              )}
              <Button variant="secondary" onClick={close} disabled={saving} className="flex-1 sm:flex-none">
                Abbrechen
              </Button>
            </div>
            <Button type="submit" form={formId} loading={saving} icon={<Check />}>
              {submitLabel ?? (isEdit ? 'Speichern' : 'Kapitel anlegen')}
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={handleSubmit} className="space-y-5">
          {lostHabit && (
            <Notice tone="warning">
              Die bisher verknüpfte Quest wurde gelöscht. Wähle eine andere Quest oder ändere die Art des Kapitels.
            </Notice>
          )}
          <TextField
            id={ids.title}
            label="Titel"
            value={values.title}
            onChange={(title) => update('title', title)}
            onBlur={() => touch('title')}
            error={shownError('title')}
            placeholder="z. B. Das erste Buch"
            className="scroll-mt-10"
            maxLength={CHAPTER_TITLE_MAX}
            showCount
            required
            autoComplete="off"
          />

          <TextArea
            id={ids.description}
            label="Beschreibung"
            value={values.description}
            onChange={(description) => update('description', description)}
            onBlur={() => touch('description')}
            error={shownError('description')}
            hint="Optional – was genau ist zu tun?"
            placeholder="z. B. Beende dein erstes Buch – egal wie dick."
            maxLength={CHAPTER_DESCRIPTION_MAX}
            showCount
            rows={2}
          />

          <div className="space-y-4 rounded-2xl border border-border bg-bg-deep/40 p-4">
            <SegmentedControl
              label="Art"
              value={values.type}
              onChange={(type) => update('type', type)}
              options={TYPE_OPTIONS}
              hint={TYPE_HINTS[values.type]}
            />

            {values.type === 'counter' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  id={ids.counterTarget}
                  label="Ziel"
                  value={values.counterTarget}
                  onChange={(target) => update('counterTarget', target)}
                  onBlur={() => touch('counterTarget')}
                  min={1}
                  placeholder="z. B. 12"
                  error={shownError('counterTarget')}
                  required
                />
                <TextField
                  id={ids.counterLabel}
                  label="Bezeichnung"
                  value={values.counterLabel}
                  onChange={(label) => update('counterLabel', label)}
                  onBlur={() => touch('counterLabel')}
                  error={shownError('counterLabel')}
                  hint="Was zählst du?"
                  placeholder="z. B. Bücher beendet"
                  maxLength={COUNTER_LABEL_MAX}
                  autoComplete="off"
                />
              </div>
            )}

            {values.type === 'habit' &&
              (habits.length === 0 ? (
                <Notice>
                  Du hast noch keine Quests. Lege zuerst eine Quest an – dann kann dieses Kapitel automatisch
                  mitzählen.
                  {shownError('habitId') && <span className="mt-1 block text-danger">{shownError('habitId')}</span>}
                </Notice>
              ) : (
                <>
                  <Select
                    id={ids.habitId}
                    label="Quest"
                    value={selectedHabit ? values.habitId : ''}
                    onChange={selectHabit}
                    options={habitOptions}
                    error={shownError('habitId')}
                    hint={linkedCount > 0 ? 'Die Quests dieser Kampagne stehen oben.' : undefined}
                    required
                  />
                  <SegmentedControl
                    label="Messgröße"
                    value={values.metric}
                    onChange={(metric) => update('metric', metric)}
                    options={metricOptions}
                    hint={
                      selectedHabit && !selectedHabit.measure && values.metric !== 'total'
                        ? `${metricHint(values.metric, selectedHabit)} „Gesamtmenge“ gibt es nur für messbare Quests.`
                        : metricHint(values.metric, selectedHabit)
                    }
                  />
                  <NumberField
                    id={ids.habitTarget}
                    label="Ziel"
                    value={values.habitTarget}
                    onChange={(target) => update('habitTarget', target)}
                    onBlur={() => touch('habitTarget')}
                    min={values.metric === 'total' ? 0 : 1}
                    unit={targetUnit}
                    placeholder={values.metric === 'total' ? 'z. B. 1000' : 'z. B. 21'}
                    error={shownError('habitTarget')}
                    required
                    fieldClassName="sm:max-w-xs"
                  />
                </>
              ))}
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={open && pendingSave !== null}
        onClose={() => setPendingSave(null)}
        onConfirm={async () => {
          if (!pendingSave) return
          // Wirft onSubmit, bleibt die Rückfrage offen (der Fehler wird dort per Toast gemeldet).
          await onSubmit(pendingSave.chapter)
          onClose()
        }}
        title="Änderung kostet XP"
        message={pendingSave?.warning}
        confirmLabel="Trotzdem speichern"
        danger
        icon={<TriangleAlert />}
      />

      {onDelete && isEdit && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await onDelete()
            onClose()
          }}
          title="Kapitel löschen?"
          message={`„${chapter.title}“ wird aus der Kampagne entfernt.${
            confirmXp > 0 ? ` Die damit verdienten ${formatNumber(confirmXp)} XP entfallen.` : ''
          }`}
          confirmLabel="Löschen"
          danger
          icon={<Trash2 />}
        />
      )}
    </>
  )
}

function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm text-parchment/90',
        tone === 'warning' ? 'border-warning/40 bg-warning/8' : 'border-info/30 bg-info/8',
      )}
    >
      {tone === 'warning' ? (
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      ) : (
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      )}
      <span>{children}</span>
    </p>
  )
}
