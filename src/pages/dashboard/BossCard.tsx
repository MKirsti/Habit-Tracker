import { Gift, Swords, Trophy } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import type { WeeklyBossState } from '../../domain/types'
import { Badge, Button, Card, ProgressBar, cn } from '../../ui'
import { BOSS_COLOR, bossVars } from './bossTheme'
import {
  CHEST_ON_VICTORY_TEXT,
  COLLECTION_PATH,
  NEXT_BOSS_TEXT,
  WEAK_SPOT_TEXT,
  attackIcon,
  bossHpNumbers,
  bossHpRatio,
  bossHpSpoken,
  damageLabel,
  daysLeftText,
  hitSpoken,
  noBossText,
  unopenedChestsLabel,
  unopenedChestsSpoken,
  weaknessInfo,
} from './combatText'
import type { LastWeekNote } from './combatText'
import { HIT_DURATION_MS, useBossHits, useOnScreen } from './useBossHits'
import type { BossHit } from './useBossHits'

export interface BossCardProps {
  /** Boss der laufenden Woche (`state.bosses.current`); fehlt, wenn diese Woche nichts geplant ist. */
  boss?: WeeklyBossState
  /** Gefundene, noch ungeöffnete Truhen (`state.inventory.unopenedChests`) – Link zu Held → Sammlung. */
  unopenedChests: number
  /** Es gibt aktive Quests (nur für den Text ohne Boss). */
  hasQuests: boolean
  /** Montags-Hinweis zum Boss der Vorwoche (`lastWeekNote`). */
  lastWeek?: LastWeekNote
  /** „Nachtragen“ (Sonntag) aus dem Montags-Hinweis. */
  onBackfill?: () => void
  /** Einstellung „Effekte“: ohne sie steigen Treffer nicht auf und das Symbol wackelt nicht (nur Ein-/Ausblenden). */
  effects: boolean
}

/**
 * Wochen-Boss direkt unter dem Helden-Kopf (Phase 3a): großes Symbol, Name, Lebensbalken in der Boss-Farbe (tiefes
 * Violett – klar verschieden vom Karmesin der Helden-HP), „noch N Tage“, Schwäche („Schwäche: ❤️ Vitalität“) und
 * „🎁 Truhe beim Sieg“. Besiegt: Sieges-Abzeichen, sein Spruch und der Hinweis auf den nächsten Gegner. Ohne geplanten
 * Schaden: ein ruhiger Platzhalter. Ungeöffnete Truhen verlinken auf Held → Sammlung.
 *
 * Beim Abhaken steigt der Treffer über dem Balken auf („🧠 Arkaner Blitz −36“, Schwäche hervorgehoben:
 * „Schwachstelle!“; der entscheidende Treffer über dem Siegesspruch) – ist die Karte gerade nicht zu sehen (weit
 * gescrollt), erscheint er unten als kleine Leiste.
 * Ohne Effekte (`settings.effects`) bleibt alles ruhig: kein Aufsteigen, kein Wackeln, der Treffer wird nur kurz
 * eingeblendet. Vorgelesen wird jeder Treffer über eine höfliche Live-Region.
 * Auf dem Handy kompakt (~85 px), ab `md` mit Beschreibung.
 */
export function BossCard({ boss, unopenedChests, hasQuests, lastWeek, onBackfill, effects }: BossCardProps) {
  const titleId = useId()
  const { hits, dismiss } = useBossHits(boss)
  // Beobachtet wird die ganze Zeile (Symbol, Name, Balken) – auch im Sieg, damit der letzte Treffer zu sehen ist.
  const [row, setRow] = useState<HTMLDivElement | null>(null)
  const rowOnScreen = useOnScreen(row)
  const latestHit = hits.at(-1)

  const chestLink = unopenedChests > 0 ? <ChestLink count={unopenedChests} /> : null
  const footer = lastWeek ? <LastWeekStrip note={lastWeek} onBackfill={onBackfill} /> : null

  if (boss === undefined) {
    const { title, text } = noBossText(hasQuests)
    return (
      <Card
        as="section"
        aria-labelledby={titleId}
        padding="none"
        tone="flat"
        className="mb-5 md:mb-6"
        style={bossVars()}
        data-boss-state="none"
      >
        <div className="flex items-center gap-3 px-3 py-3 md:gap-4 md:px-6 md:py-4">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/25 text-muted ring-1 ring-white/10 ring-inset md:size-12"
          >
            <Swords className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-[0.9375rem] leading-snug font-semibold tracking-wide text-parchment md:text-base">
              {title}
            </h2>
            <p className="text-xs text-muted md:text-sm">{text}</p>
          </div>
          {chestLink}
        </div>
        {footer}
      </Card>
    )
  }

  const weakness = weaknessInfo(boss.weakness)
  const hpText = bossHpNumbers(boss.hp, boss.maxHp)

  return (
    <Card
      as="section"
      aria-labelledby={titleId}
      padding="none"
      className={cn(
        'mb-5 border-(--boss-35)! md:mb-6',
        'shadow-[inset_0_1px_0_var(--boss-20),0_14px_36px_-20px_var(--boss-50)]',
        boss.defeated && 'border-gold/40!',
      )}
      style={bossVars()}
      data-boss-state={boss.defeated ? 'defeated' : 'active'}
      data-boss-id={boss.boss.id}
      data-boss-hp={boss.hp}
    >
      {/* Violetter Schimmer hinter dem Symbol – die Karte gehört dem Gegner. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-40 rounded-l-2xl bg-radial-[at_15%_50%] from-(--boss-20) to-transparent to-70% md:w-56"
      />
      <div ref={setRow} className="relative flex items-start gap-3 px-3 pt-3 pb-2.5 md:gap-5 md:px-6 md:pt-5 md:pb-4">
        <BossIcon icon={boss.boss.icon} defeated={boss.defeated} hitKey={effects ? latestHit?.id : undefined} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[0.625rem] leading-tight font-semibold tracking-[0.18em] text-muted uppercase md:text-[0.6875rem]">
                Wochen-Boss
              </p>
              {/* Der Name bricht um statt abgeschnitten zu werden („Schattenfürst der Prokrastination“ auf 360 px). */}
              <h2
                id={titleId}
                className="font-display text-[0.9375rem] leading-snug font-semibold tracking-wide text-balance wrap-break-word text-parchment md:text-xl"
              >
                {boss.boss.name}
              </h2>
            </div>
            {boss.defeated ? (
              <Badge tone="gold" icon={<Trophy aria-hidden />} className="shrink-0" data-boss-victory="">
                Besiegt
              </Badge>
            ) : (
              <span className="shrink-0 pt-0.5 text-[0.6875rem] font-medium whitespace-nowrap text-muted md:text-xs">
                {daysLeftText(boss.daysLeft)}
              </span>
            )}
          </div>

          {boss.defeated ? (
            // Der entscheidende Treffer steigt über dem Siegesspruch auf.
            <div className="relative mt-1">
              <p className="text-xs leading-snug text-parchment/85 md:text-sm">{boss.boss.defeatLine}</p>
              <HitLayer hits={hits} onDone={dismiss} still={!effects} />
            </div>
          ) : (
            <>
              <p className="mt-0.5 line-clamp-1 text-sm text-muted max-md:hidden">{boss.boss.description}</p>
              <div className="relative mt-1.5 flex items-center gap-2 md:mt-2.5">
                <ProgressBar
                  value={bossHpRatio(boss)}
                  color={BOSS_COLOR}
                  size="md"
                  glow
                  aria-label={`Lebenspunkte von ${boss.boss.name}`}
                  valueText={bossHpSpoken(boss.boss.name, boss.hp, boss.maxHp)}
                  className="min-w-0 flex-1"
                />
                <span aria-hidden="true" className="shrink-0 text-xs whitespace-nowrap text-muted tabular-nums">
                  {hpText}
                </span>
                <HitLayer hits={hits} onDone={dismiss} still={!effects} />
              </div>
            </>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] leading-5 md:mt-2 md:text-xs">
            {!boss.defeated && (
              <>
                <span title={weakness.title} className="inline-flex items-center gap-1 text-muted" data-boss-weakness={boss.weakness}>
                  <span className="sr-only">{weakness.title}</span>
                  <span aria-hidden="true">
                    Schwäche:{' '}
                    <span className="font-semibold" style={{ color: weakness.color }}>
                      {weakness.icon} {weakness.label}
                    </span>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-muted">
                  <span aria-hidden="true">🎁</span> {CHEST_ON_VICTORY_TEXT}
                </span>
              </>
            )}
            {boss.defeated && !chestLink && <span className="text-muted">{NEXT_BOSS_TEXT}</span>}
            {chestLink && <span className="ml-auto">{chestLink}</span>}
          </div>
        </div>
      </div>
      {footer}

      {/* Treffer vorlesen – die Region existiert immer, damit Ansagen zuverlässig ankommen. */}
      <p aria-live="polite" className="sr-only">
        {latestHit ? hitSpoken(latestHit.attack, boss.boss.name, boss.defeated) : ''}
      </p>
      {!rowOnScreen && <HitTicker boss={boss} hit={latestHit} still={!effects} />}
    </Card>
  )
}

/** Boss-Symbol im violetten Kreis; wackelt kurz bei jedem Treffer (nur mit Effekten), besiegt entsättigt mit Pokal. */
function BossIcon({ icon, defeated, hitKey }: { icon: string; defeated: boolean; hitKey?: string }) {
  return (
    <div className="relative shrink-0" aria-hidden="true">
      <motion.span
        key={hitKey ?? 'idle'}
        initial={false}
        animate={hitKey ? { x: [0, -4, 4, -3, 2, 0], scale: [1, 0.94, 1.02, 1] } : undefined}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className={cn(
          'grid size-12 place-items-center rounded-2xl text-[1.75rem] leading-none md:size-16 md:text-[2.375rem]',
          'bg-radial from-(--boss-35) via-(--boss-10) to-black/30 ring-1 ring-(--boss-50) ring-inset',
          'shadow-[0_0_18px_-6px_var(--boss)]',
          defeated && 'opacity-75 grayscale-[0.6]',
        )}
      >
        {icon}
      </motion.span>
      {defeated && (
        <span className="absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full bg-gold text-on-gold shadow-glow-sm ring-2 ring-surface md:size-6">
          <Trophy className="size-3 md:size-3.5" />
        </span>
      )}
    </div>
  )
}

/** Aufsteigende Treffer über dem rechten Ende des Lebensbalkens (rein dekorativ, vorgelesen wird separat). */
function HitLayer({ hits, onDone, still }: { hits: readonly BossHit[]; onDone: (id: string) => void; still: boolean }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute right-0 bottom-full z-10 flex flex-col items-end gap-0.5 pb-1">
      <AnimatePresence>
        {hits.map((hit) => (
          <HitFloat key={hit.id} hit={hit} onDone={onDone} still={still} />
        ))}
      </AnimatePresence>
    </span>
  )
}

function HitFloat({ hit, onDone, still }: { hit: BossHit; onDone: (id: string) => void; still: boolean }) {
  useDismissAfter(hit.id, onDone)
  const { attack } = hit
  return (
    <motion.span
      layout={still ? false : 'position'}
      data-boss-hit={attack.weakness ? 'weak' : 'normal'}
      data-boss-hit-motion={still ? 'still' : 'float'}
      initial={still ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.85 }}
      animate={
        still ? { opacity: [0, 1, 1, 0] } : { opacity: [0, 1, 1, 0], y: [8, 0, -6, -16], scale: [0.85, 1.08, 1, 1] }
      }
      transition={{ duration: HIT_DURATION_MS / 1000, times: [0, 0.12, 0.7, 1], ease: 'easeOut' }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-display text-xs font-bold whitespace-nowrap md:text-sm',
        'bg-bg-deep/80 ring-1 ring-(--boss-50) [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]',
        attack.weakness ? 'text-gold-bright ring-gold/60' : 'text-parchment',
      )}
    >
      <HitContent hit={hit} />
    </motion.span>
  )
}

function HitContent({ hit }: { hit: BossHit }) {
  const { attack } = hit
  return (
    <>
      <span>{attackIcon(attack.attribute)}</span>
      <span className="font-semibold">{attack.attackName}</span>
      <span className="tabular-nums">{damageLabel(attack.damage)}</span>
      {attack.weakness && (
        <span className="rounded-full bg-gold/20 px-1.5 text-[0.625rem] font-semibold tracking-wide text-gold-bright uppercase">
          {WEAK_SPOT_TEXT}
        </span>
      )}
    </>
  )
}

/** Ruft `onDone(id)` nach `HIT_DURATION_MS` (auch ohne Animation – z. B. in Tests oder ohne Effekte). */
function useDismissAfter(id: string, onDone: (id: string) => void) {
  const latest = useRef(onDone)
  useEffect(() => {
    latest.current = onDone
  })
  useEffect(() => {
    const timer = window.setTimeout(() => latest.current(id), HIT_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [id])
}

/**
 * Ist der Lebensbalken gerade nicht zu sehen (etwa beim Abhaken weit unten in der Liste), erscheint der Treffer als
 * kleine Leiste am Bildschirmrand – auf dem Handy über der unteren Navigation (Toasts stehen dort oben), ab `md` oben.
 */
function HitTicker({ boss, hit, still }: { boss: WeeklyBossState; hit?: BossHit; still: boolean }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center px-4 md:top-6 md:bottom-auto md:pl-[calc(var(--sidebar-width)+1rem)]"
      style={bossVars()}
    >
      <AnimatePresence>
        {hit && (
          <motion.div
            key={hit.id}
            data-boss-ticker=""
            initial={still ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={still ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'flex w-full max-w-xs items-center gap-2.5 rounded-2xl border border-(--boss-50) bg-surface/95 px-3 py-2 shadow-card backdrop-blur-md',
              hit.attack.weakness && 'border-gold/50',
            )}
          >
            <span className="text-xl leading-none">{boss.boss.icon}</span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'flex items-center gap-1.5 truncate font-display text-xs font-bold',
                  hit.attack.weakness ? 'text-gold-bright' : 'text-parchment',
                )}
              >
                <HitContent hit={hit} />
              </p>
              {boss.defeated ? (
                <p className="mt-0.5 text-[0.6875rem] font-semibold text-gold-bright">{boss.boss.name} besiegt!</p>
              ) : (
                <ProgressBar value={bossHpRatio(boss)} color={BOSS_COLOR} size="xs" className="mt-1" aria-label="Boss" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  )
}

/** Link zu den ungeöffneten Truhen (Held → Sammlung), 40 px Tap-Ziel. */
function ChestLink({ count }: { count: number }) {
  return (
    <Link
      to={COLLECTION_PATH}
      aria-label={unopenedChestsSpoken(count)}
      data-unopened-chests={count}
      className={cn(
        'relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap',
        'border-gold/45 bg-linear-to-b from-gold/20 to-gold/6 text-gold-bright transition-[border-color,box-shadow] duration-150',
        'hover:border-gold/75 hover:shadow-[0_0_14px_-4px_rgb(240_201_106/0.6)] active:scale-95',
        'before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-[""]',
      )}
    >
      <Gift aria-hidden className="size-3.5 text-gold" />
      {unopenedChestsLabel(count)}
    </Link>
  )
}

/** Montags-Hinweis zur Vorwoche als ruhige Fußzeile der Karte. */
function LastWeekStrip({ note, onBackfill }: { note: LastWeekNote; onBackfill?: () => void }): ReactNode {
  const backfill = note.kind === 'escaped' ? note.backfill : undefined
  return (
    <div
      role="note"
      aria-label="Letzte Woche"
      data-last-week={note.kind}
      className="relative border-t border-border/70 px-3 py-2.5 text-xs leading-snug md:px-6 md:py-3 md:text-sm"
    >
      <p className="text-muted">
        <span aria-hidden="true" className="mr-1.5">
          {note.kind === 'victory' ? '🏆' : note.icon}
        </span>
        <span className={note.kind === 'victory' ? 'font-medium text-gold-bright' : undefined}>{note.text}</span>
      </p>
      {backfill && (
        <div className="mt-1.5 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-faint">{backfill.text}</p>
          {onBackfill && (
            <Button size="sm" variant="secondary" onClick={onBackfill} aria-label="Sonntag nachtragen" className="shrink-0">
              Nachtragen
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
