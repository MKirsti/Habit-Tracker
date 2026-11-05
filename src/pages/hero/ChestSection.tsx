import { Gift, PackageOpen } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { BALANCING } from '../../domain/balancing'
import { formatDay, toDayKey } from '../../domain/dates'
import type { Chest, GrammaticalForm } from '../../domain/types'
import { accentVars } from '../../features/campaignTheme'
import { ChestGraphic } from '../../features/combat/ChestGraphic'
import { ChestOpenDialog } from '../../features/combat/ChestOpenDialog'
import { FEEDBACK_CUES, useFeedbackCue } from '../../features/feedback/feedbackSounds'
import { Badge, Button, SectionTitle, cn, formatNumber } from '../../ui'
import { usePendingFocus } from '../treasury/focus'
import {
  RARITY_COLORS,
  RARITY_LABELS,
  chestContentInfo,
  chestOpenButtonId,
  chestSource,
  openedChests,
  unopenedChests,
  unopenedCountText,
} from './collectionView'
import type { ChestSourceContext } from './collectionView'

/** So viele Einträge zeigt die Chronik, bevor „Alle anzeigen“ nötig ist. */
const CHRONICLE_PREVIEW = 8

/** „Seltene Truhe“ (Seltenheit als Adjektiv vor „Truhe“). */
function rarityChestName(chest: Pick<Chest, 'rarity'>, noun = 'Truhe'): string {
  return `${RARITY_LABELS[chest.rarity] ?? RARITY_LABELS.common}e ${noun}`
}

export interface ChestSectionProps {
  /** Alle Truhen (`GameState.chests`). */
  chests: readonly Chest[]
  context: ChestSourceContext
  form?: GrammaticalForm
  dayStartHour: number
  /** Leuchten ungeöffneter Truhen animieren (Einstellung „Effekte“). */
  effects: boolean
  /** DOM-ID des Abschnitts (Sprungziel der Übersicht). */
  id: string
}

/**
 * Truhen: ungeöffnete in ihrer Seltenheitsfarbe mit „Öffnen“ (öffnet den Truhen-Dialog aus `features/combat`) und
 * die Chronik der geöffneten mit Fundort und Inhalt. Der Inhalt bleibt bis zum Öffnen eine Überraschung. Das Öffnen
 * klingt bzw. vibriert (Phase 3b, wenn eingeschaltet).
 */
export function ChestSection({ chests, context, form, dayStartHour, effects, id }: ChestSectionProps) {
  const titleId = useId()
  const chronicleId = useId()
  const unopened = unopenedChests(chests)
  const opened = openedChests(chests)
  const [dialog, setDialog] = useState<{ chestId: string; open: boolean } | undefined>(undefined)
  const [showAll, setShowAll] = useState(false)
  // Klang & Vibration beim Öffnen (wie bei der Truhe aus der Siegesszene) – nur, wenn eingeschaltet.
  const cue = useFeedbackCue()
  // Immer die aktuellen Truhen – das Fokusziel wird erst beim Schließen des Dialogs bestimmt.
  const latestChests = useRef(chests)
  useEffect(() => {
    latestChests.current = chests
  })

  // Im Dialog geöffnete Truhe (ihr „Öffnen“-Knopf verschwindet gleich).
  const openedInDialog = useRef<string | undefined>(undefined)
  const requestFocus = usePendingFocus<readonly Chest[]>(chests, dialog?.open === true)

  /**
   * Nach dem Öffnen verschwindet der Knopf: Der Fokus springt auf „Öffnen“ der nächsten Truhe bzw. auf die Chronik.
   * Der Dialog fragt das ab, wenn er weg ist (`returnFocus`) – solange er offen ist, ist die Seite `inert` und nimmt
   * keinen Fokus an. Hinken die Live-Daten hinterher (der Knopf verschwindet erst nach dem Dialog), springt der Fokus,
   * sobald sie da sind (`requestFocus`, nur wenn er dann verloren ist).
   */
  function focusTargetAfter(closing: string | undefined, snapshot: readonly Chest[] = latestChests.current): HTMLElement | null {
    const remaining = unopenedChests(snapshot)
    const target = remaining.find((chest) => chest.id === closing) ?? remaining[0]
    if (target) return document.getElementById(chestOpenButtonId(target.id))
    return document.getElementById(chronicleId)
  }

  function openDialog(chestId: string) {
    openedInDialog.current = undefined
    setDialog({ chestId, open: true })
  }

  function closeDialog() {
    const closing = dialog?.chestId
    setDialog((current) => (current ? { ...current, open: false } : current))
    if (closing === undefined || openedInDialog.current !== closing) return
    requestFocus({
      resolve: (snapshot) =>
        unopenedChests(snapshot).some((chest) => chest.id === closing) ? undefined : focusTargetAfter(closing, snapshot),
    })
  }

  const visibleOpened = showAll ? opened : opened.slice(0, CHRONICLE_PREVIEW)

  return (
    <section id={id} tabIndex={-1} aria-labelledby={titleId} className="scroll-mt-6 rounded-2xl">
      <SectionTitle id={titleId} meta={unopened.length > 0 ? unopenedCountText(unopened.length) : undefined}>
        Truhen
      </SectionTitle>
      <p className="mb-4 max-w-prose text-sm text-muted">
        Eine Truhe gibt es für jeden Boss-Sieg, jedes abgeschlossene Kapitel – und mit etwas Glück für erledigte Quests (
        {formatNumber(Math.round(BALANCING.chests.questDropChance * 100))} %, höchstens eine am Tag). Was drin ist, steht
        beim Fund fest – du erfährst es beim Öffnen.
      </p>

      {unopened.length > 0 ? (
        <ul aria-label="Ungeöffnete Truhen" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {unopened.map((chest) => {
            const source = chestSource(chest, context)
            const name = rarityChestName(chest)
            return (
              <li
                key={chest.id}
                data-rarity={chest.rarity}
                style={accentVars(RARITY_COLORS[chest.rarity] ?? RARITY_COLORS.common)}
                // Umbrechend: Wird die Karte schmal, rutscht „Öffnen“ in eine eigene Zeile, statt den Text zu quetschen.
                className="relative isolate flex min-w-0 flex-wrap items-center gap-3.5 rounded-2xl border border-(--accent-35) bg-linear-to-br from-(--accent-10) to-surface/90 p-3.5 shadow-[0_0_0_1px_var(--accent-10),0_16px_36px_-22px_var(--accent-60)]"
              >
                <ChestIcon rarity={chest.rarity} effects={effects} />
                <div className="min-w-32 flex-1 basis-32">
                  <h3 className="font-display text-[0.9375rem] leading-snug font-semibold tracking-wide text-parchment">
                    {name}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug text-muted">
                    {source.label} · {source.detail}
                  </p>
                  <p className="text-xs text-faint">Gefunden am {formatDay(chest.foundDay, 'short')}</p>
                </div>
                <Button
                  id={chestOpenButtonId(chest.id)}
                  size="sm"
                  icon={<Gift />}
                  aria-label={`${rarityChestName(chest, source.label)} öffnen`}
                  onClick={() => openDialog(chest.id)}
                  className="ml-auto shrink-0"
                >
                  Öffnen
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="flex items-start gap-3 rounded-2xl border border-dashed border-border-strong bg-surface/40 px-4 py-3.5 text-sm text-muted">
          <PackageOpen aria-hidden className="mt-0.5 size-5 shrink-0 text-gold-dim" />
          {opened.length > 0
            ? 'Alle Truhen sind geöffnet. Die nächste wartet beim Wochen-Boss – oder hinter deinem nächsten Kapitel.'
            : 'Noch keine Truhe gefunden. Besiege deinen Wochen-Boss, schließe ein Kapitel ab – oder hab einfach Glück beim Abhaken.'}
        </p>
      )}

      {opened.length > 0 && (
        <div className="mt-6">
          <h3
            id={chronicleId}
            tabIndex={-1}
            className="mb-2 inline-block rounded text-xs font-semibold tracking-[0.14em] text-gold uppercase"
          >
            Chronik <span className="font-sans tracking-normal text-muted tabular-nums">· {formatNumber(opened.length)}</span>
          </h3>
          <ol aria-labelledby={chronicleId} className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface/60">
            {visibleOpened.map((chest) => {
              const content = chestContentInfo(chest.content, form)
              const source = chestSource(chest, context)
              const openedDay = chest.openedAt !== undefined ? toDayKey(new Date(chest.openedAt), dayStartHour) : undefined
              const color = RARITY_COLORS[chest.rarity] ?? RARITY_COLORS.common
              return (
                <li key={chest.id} data-rarity={chest.rarity} className="flex min-w-0 items-center gap-3 px-3.5 py-2.5">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-bg-deep/70 text-lg leading-none"
                    style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)` }}
                  >
                    {content.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-parchment">{content.label}</p>
                    <p className="truncate text-xs text-muted">
                      {source.label} · {source.detail}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    <Badge color={color}>{RARITY_LABELS[chest.rarity]}</Badge>
                    {openedDay !== undefined && (
                      <span className="text-[0.6875rem] text-faint">
                        <span className="sr-only">geöffnet am </span>
                        {formatDay(openedDay, 'short')}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          {opened.length > CHRONICLE_PREVIEW && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>
              {showAll ? 'Weniger anzeigen' : `Alle ${formatNumber(opened.length)} anzeigen`}
            </Button>
          )}
        </div>
      )}

      {dialog !== undefined && (
        <ChestOpenDialog
          chestId={dialog.chestId}
          open={dialog.open}
          onClose={closeDialog}
          onOpened={() => {
            openedInDialog.current = dialog.chestId
            cue(FEEDBACK_CUES.chest)
          }}
          returnFocus={() => focusTargetAfter(dialog.chestId)}
        />
      )}
    </section>
  )
}

/**
 * Truhen-Symbol: dieselbe gezeichnete Truhe wie im Truhen-Dialog und in der Meldung „Truhe gefunden“ (Beschläge in
 * der Seltenheitsfarbe), mit Leuchten (legendär: sanft pulsierend, wenn Effekte an sind).
 */
function ChestIcon({ rarity, effects }: { rarity: Chest['rarity']; effects: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-chest-icon={rarity}
      className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-radial from-(--accent-20) to-bg-deep/60 ring-1 ring-(--accent-60)"
    >
      <span
        className={cn(
          'absolute -inset-1 -z-10 rounded-[1.1rem] bg-(--accent-20) blur-md',
          rarity === 'legendary' && effects && 'motion-safe:animate-pulse',
        )}
      />
      <ChestGraphic rarity={rarity} phase="closed" fancy={false} className="w-10 drop-shadow-[0_3px_8px_rgb(0_0_0/0.55)]" />
    </span>
  )
}
