import { CalendarClock, Compass, Sparkles, Swords } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import { ATTRIBUTES } from '../../domain/attributes'
import { classDefinition, classNameFor } from '../../domain/combat/classes'
import { formatDay } from '../../domain/dates'
import type { AttributeId, GrammaticalForm, HeroClassDefinition, HeroClassState } from '../../domain/types'
import { attributeAccentVars, attributeColor } from '../../features/campaignTheme'
import { AttributeChip, Badge, Card, cn, formatNumber, tintTextColor } from '../../ui'
import {
  CLASS_WEEK_NOTE,
  attackPowers,
  classBonusText,
  classPathText,
  classReason,
  formatMultiplier,
  nextClassPaths,
  upcomingClass,
  xpNeededText,
} from './classView'
import type { AttributeProgress } from './classView'

export interface ClassCardProps {
  heroClass: HeroClassState
  /** Aktueller Stand der Attribute (`GameState.attributes`) – für die Klasse ab Montag und die nächsten Wege. */
  attributes: Readonly<Record<AttributeId, AttributeProgress>>
  form?: GrammaticalForm
}

/** Kurzbeschreibung der Klassenart: „Hybridklasse · Intelligenz & Weisheit“. */
function classKind(definition: HeroClassDefinition): string {
  const names = definition.attributes.map((attribute) => ATTRIBUTES[attribute]?.name ?? attribute)
  if (names.length === 2) return `Hybridklasse · ${names[0]} & ${names[1]}`
  if (names.length === 1) return `Grundklasse · ${names[0]}`
  return 'Startklasse · noch ohne Schwerpunkt'
}

/**
 * Held → Übersicht: die Klasse dieser Woche – Symbol, Name in der Sprachform des Helden, Beschreibung, warum
 * (die zwei stärksten Attribute zu Wochenbeginn), Klassen-Bonus, Angriffskraft je Attribut, die Klasse ab Montag
 * (falls der Stand schon eine andere ergibt) und mögliche nächste Klassen. Farbe: das Klassen-Attribut (Hybrid:
 * Verlauf beider), der Abenteurer trägt Gold.
 */
export function ClassCard({ heroClass, attributes, form }: ClassCardProps) {
  const titleId = useId()
  const { definition } = heroClass
  const name = classNameFor(definition, form)
  const reason = classReason(heroClass)
  const upcoming = upcomingClass(heroClass, attributes)
  const paths = nextClassPaths(attributes, 2)
  const powers = attackPowers(heroClass)
  const previous = heroClass.previousId !== undefined ? classDefinition(heroClass.previousId) : undefined
  const mainAttribute = definition.attributes[0]

  return (
    <Card
      padding="none"
      aria-labelledby={titleId}
      data-hero-class={definition.id}
      style={attributeAccentVars(mainAttribute)}
      className="overflow-hidden border-(--accent-35) shadow-[0_0_0_1px_var(--accent-10),0_18px_40px_-24px_var(--accent-60)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-(--accent-10) to-transparent"
      />
      <div className="relative grid gap-6 px-5 pt-5 pb-5 sm:px-6 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
        {/* Wer du bist */}
        <div className="flex min-w-0 items-start gap-4">
          <ClassEmblem definition={definition} />
          <div className="min-w-0 flex-1">
            <p aria-hidden="true" className="text-xs font-semibold tracking-[0.2em] text-(--accent-text) uppercase">
              Deine Klasse
            </p>
            <h2
              id={titleId}
              className="mt-0.5 font-display text-[1.5rem] leading-tight font-bold tracking-wide text-parchment sm:text-[1.75rem]"
            >
              <span className="sr-only">Deine Klasse:</span> {name}
            </h2>
            <p className="mt-1 text-[0.8125rem] text-muted">{classKind(definition)}</p>
            {previous && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-muted">
                <Badge color={attributeColor(mainAttribute)}>Neu diese Woche</Badge>
                <span>
                  vorher <span aria-hidden="true">{previous.icon} </span>
                  {classNameFor(previous, form)}
                </span>
              </p>
            )}
            <p className="mt-3 text-sm leading-relaxed text-parchment/90">{definition.description}</p>
          </div>
        </div>

        {/* Warum, Bonus, nächste Klasse */}
        <div className="flex min-w-0 flex-col gap-4">
          <ClassDetail title="Warum diese Klasse?" icon={<Compass aria-hidden />}>
            <ul aria-label="Deine stärksten Attribute zu Wochenbeginn" className="flex flex-wrap gap-1.5">
              {reason.top.map((entry) => (
                <li key={entry.id} className="inline-flex items-center gap-1">
                  <AttributeChip attribute={entry.id} />
                  <span className="text-xs font-semibold text-parchment tabular-nums">
                    Lvl {formatNumber(entry.level)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[0.8125rem] leading-snug text-muted">{reason.text}</p>
          </ClassDetail>

          <ClassDetail title="Klassenbonus" icon={<Swords aria-hidden />}>
            <p className="text-sm text-parchment">{classBonusText(heroClass)}</p>
          </ClassDetail>

          <ClassDetail title={upcoming ? 'Ab Montag' : 'Nächste mögliche Klasse'} icon={<Sparkles aria-hidden />}>
            {upcoming && (
              <p className="rounded-lg border border-(--accent-35) bg-(--accent-10) px-3 py-2 text-sm text-parchment">
                Dein Stand reicht schon:{' '}
                <strong className="font-semibold text-(--accent-text)">
                  <span aria-hidden="true">{upcoming.icon} </span>
                  {classNameFor(upcoming, form)}
                </strong>{' '}
                erwacht mit der neuen Woche.
              </p>
            )}
            {paths.length > 0 ? (
              <>
                {upcoming && <p className="mt-2.5 text-xs font-medium text-muted">Danach möglich:</p>}
                <ul className={cn('flex flex-col gap-1.5', upcoming && 'mt-1')}>
                  {paths.map((path) => {
                    const target = classNameFor(path.definition, form)
                    return (
                      <li
                        key={path.definition.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm text-parchment"
                      >
                        <span className="min-w-0">
                          <span className="sr-only">{classPathText(path, target)}</span>
                          <span aria-hidden="true">
                            Bring{' '}
                            <strong
                              className="font-semibold"
                              style={{ color: tintTextColor(attributeColor(path.attribute)) }}
                            >
                              {ATTRIBUTES[path.attribute]?.name}
                            </strong>{' '}
                            auf Level {formatNumber(path.targetLevel)} für{' '}
                            <strong className="font-semibold whitespace-nowrap">
                              {path.definition.icon} {target}
                            </strong>
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted tabular-nums">{xpNeededText(path.xpNeeded)}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              !upcoming && <p className="text-sm text-muted">Du hast alle Wege offen – jede Quest formt deine Klasse.</p>
            )}
          </ClassDetail>
        </div>
      </div>

      <AttackPowerStrip powers={powers} />

      <p className="flex items-start gap-2.5 border-t border-(--accent-20) bg-black/15 px-5 py-3 text-[0.8125rem] leading-snug text-muted sm:px-6">
        <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-(--accent)" />
        <span>
          {CLASS_WEEK_NOTE}{' '}
          <span className="whitespace-nowrap">Gilt seit Montag, {formatDay(heroClass.weekStart, 'short')}</span>
        </span>
      </p>
    </Card>
  )
}

/** Klassensymbol im Ring: Grundklasse in ihrer Farbe, Hybrid als Verlauf beider, Abenteurer in Gold. */
function ClassEmblem({ definition }: { definition: HeroClassDefinition }) {
  const [a, b] = definition.attributes
  const ring =
    a !== undefined && b !== undefined
      ? `conic-gradient(from 200deg, ${attributeColor(a)}, ${attributeColor(b)}, ${attributeColor(a)})`
      : 'var(--accent)'
  return (
    <div
      aria-hidden="true"
      className="relative grid size-16 shrink-0 place-items-center rounded-full p-[3px] shadow-[0_0_24px_-6px_var(--accent-60)] sm:size-[4.5rem]"
      style={{ background: ring }}
    >
      <span className="grid size-full place-items-center rounded-full bg-radial from-surface-raised to-bg-deep text-[2rem] leading-none sm:text-[2.25rem]">
        <span className="drop-shadow-[0_3px_8px_rgb(0_0_0/0.55)]">{definition.icon}</span>
      </span>
    </div>
  )
}

function ClassDetail({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <h3
        id={titleId}
        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-(--accent-text) uppercase [&_svg]:size-3.5"
      >
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Angriffskraft dieser Woche: Faktor auf die Quest-XP je Attribut, mit Klassen-Bonus hervorgehoben. */
function AttackPowerStrip({ powers }: { powers: ReturnType<typeof attackPowers> }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="border-t border-(--accent-20) px-5 py-4 sm:px-6">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={titleId} className="text-xs font-semibold tracking-[0.14em] text-(--accent-text) uppercase">
          Angriffskraft diese Woche
        </h3>
        <p className="text-xs text-muted">Schaden = Quest-XP × Faktor · Schwäche des Bosses × 1,5</p>
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {powers.map((power) => {
          const meta = ATTRIBUTES[power.attribute]
          return (
            <li
              key={power.attribute}
              data-boosted={power.boosted || undefined}
              className={cn(
                'flex min-w-0 flex-col items-center rounded-xl border px-1.5 py-2 text-center',
                power.boosted ? 'border-(--accent-35) bg-(--accent-10)' : 'border-border bg-surface/60',
              )}
            >
              <span className="sr-only">
                {meta?.name}: {power.attackName}, Level {formatNumber(power.level)}, Faktor{' '}
                {formatMultiplier(power.multiplier).replace('×', '')}
                {power.boosted ? ', mit Klassenbonus' : ''}
              </span>
              <span aria-hidden="true" className="text-lg leading-none">
                {meta?.icon}
              </span>
              <span aria-hidden="true" className="mt-1 w-full truncate text-[0.6875rem] text-muted">
                {power.attackName}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'font-display text-[0.9375rem] font-bold tabular-nums',
                  power.boosted ? 'text-(--accent-text)' : 'text-parchment',
                )}
              >
                {formatMultiplier(power.multiplier)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
