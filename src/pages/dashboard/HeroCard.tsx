import { ChevronRight, Coins } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import type { CharacterProfile, DayKey, GameState, HpLedgerEntry } from '../../domain/types'
import { Card, XpBar, cn, formatNumber } from '../../ui'
import { compactDayLabel, goldChipLabel } from './dashboardText'
import { HeroHp } from './HeroHp'
import { settlementNote } from './hpText'

export interface HeroCardProps {
  profile: CharacterProfile
  state: GameState
  /** Glanz-Animation im XP-Balken (Einstellung „Effekte“). */
  shimmer: boolean
  /** Heutiger Spieltag – auf dem Handy steht das Datum hier statt im (dort ausgeblendeten) Seitenkopf. */
  today: DayKey
  /** Abgerechnete Tage (`data.hpLedger`) – für die ruhige Notiz zur letzten Abrechnung unter dem HP-Balken. */
  hpLedger?: readonly HpLedgerEntry[]
}

/**
 * Kopfkarte mit Avatar, Name, Level/Rang, Abenteuertag, XP-Balken, Lebenspunkten (nur mit Lebenspunkten, nicht im
 * Sanften Modus) und Gold-Guthaben. Der übliche Tagesschaden der Abrechnung erscheint hier ruhig als Notiz
 * („Sonntag: −1 HP“) – nicht als Toast.
 * Die ganze Karte ist ein Link zur Heldenseite (unsichtbarer Link über der Fläche); das Gold ist ein eigener
 * Link zur Schatzkammer, der über dieser Fläche liegt.
 * Unter `md` eine flache Leiste (~96 px), damit die heutigen Quests weit oben stehen (PLAN §4): Datum und Gold
 * stehen dort rechtsbündig untereinander.
 */
export function HeroCard({ profile, state, shimmer, today, hpLedger }: HeroCardProps) {
  const nameId = useId()
  const { level, rank, adventureDay, gold, hp } = state

  return (
    <Card
      tone="gold"
      ornate
      padding="none"
      aria-labelledby={nameId}
      className="mb-5 transition-[border-color,box-shadow] duration-200 hover:border-gold/60 has-[a:active]:scale-[0.995] md:mb-6"
    >
      <Link
        to="/held"
        aria-label={`Heldenprofil von ${profile.name} öffnen`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-offset-3"
      />
      <div className="flex flex-col gap-2.5 py-3 pr-9 pl-3 md:flex-row md:items-center md:gap-8 md:py-5 md:pr-14 md:pl-6">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <div
            aria-hidden="true"
            className="relative grid size-11 shrink-0 place-items-center rounded-full bg-radial from-gold/25 via-gold/8 to-transparent text-[1.625rem] leading-none ring-2 ring-gold/45 md:size-[4.5rem] md:text-[2.5rem]"
          >
            <span className="absolute -inset-1 rounded-full ring-1 ring-gold/15 md:-inset-1.5" />
            {profile.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h2
                id={nameId}
                className="min-w-0 truncate font-display text-[1.0625rem] leading-tight font-bold tracking-wide text-parchment md:text-2xl"
              >
                {profile.name}
              </h2>
              {/* Datum nur auf dem Handy sichtbar; vorgelesen wird es im Seitenkopf. */}
              <span aria-hidden="true" className="shrink-0 text-[0.6875rem] font-medium whitespace-nowrap text-muted md:hidden">
                {compactDayLabel(today)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              {/* Handy: eine Zeile „Level 5 · Wanderer · Tag 31“; ab md zweizeilig mit „… deines Abenteuers“.
                  Neben dem Gold wird es auf schmalen Handys eng: Die Zeile ist dort eine umbrechende Flex-Zeile mit
                  der Höhe einer Textzeile – passt „· Tag 31“ nicht mehr daneben, rutscht es in die (abgeschnittene)
                  zweite Zeile, statt als „Ta…“ zu enden. Vorgelesen wird es weiterhin. */}
              <p className="mt-0.5 min-w-0 flex-1 text-xs font-semibold text-gold-bright max-md:flex max-md:h-4 max-md:flex-wrap max-md:gap-x-1 max-md:overflow-hidden md:mt-1 md:text-sm">
                <span className="max-md:min-w-0 max-md:truncate">
                  Level <span className="tabular-nums">{formatNumber(level.level)}</span> · {rank}
                </span>{' '}
                <span className="font-normal text-muted max-md:shrink-0 max-md:whitespace-nowrap md:mt-0.5 md:block md:text-xs">
                  <span aria-hidden="true" className="md:hidden">
                    ·{' '}
                  </span>
                  Tag <span className="tabular-nums">{formatNumber(adventureDay)}</span>
                  <span className="max-md:sr-only"> deines Abenteuers</span>
                </span>
              </p>
              <GoldChip balance={gold.balance} className="md:hidden" />
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 md:max-w-md md:flex-1 md:gap-2">
          <XpBar
            level={level.level}
            xpIntoLevel={level.xpIntoLevel}
            xpForNextLevel={level.xpForNextLevel}
            showLevel={false}
            shimmer={shimmer}
            // Handy: Zahlen rechts neben dem Balken (eine Zeile); ab md wie gehabt darüber.
            className="max-md:flex max-md:flex-row-reverse max-md:items-center max-md:gap-2.5 max-md:[&>div:first-child]:mb-0 max-md:[&>div:first-child]:shrink-0 max-md:[&>div:first-child]:gap-0 max-md:[&>div:first-child]:text-xs"
          />
          {hp.enabled && (
            <HeroHp hp={hp} note={settlementNote(hp, hpLedger, today)} freezes={state.inventory.streakFreezes} />
          )}
        </div>
        <GoldChip balance={gold.balance} size="lg" className="max-md:hidden md:ml-auto" />
      </div>
      <ChevronRight
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-5 -translate-y-1/2 text-gold/70 md:right-5"
      />
    </Card>
  )
}

/**
 * Gold-Guthaben als Münz-Abzeichen, das zur Schatzkammer führt („1.234 Gold – zur Schatzkammer“). Liegt über dem
 * unsichtbaren Helden-Link der Karte (eigene Ebene, keine verschachtelten Links). Ein negatives Guthaben (nach
 * nachträglichen Änderungen) erscheint rot. Das Tap-Ziel ist auch in der kompakten Form 40 px hoch.
 */
function GoldChip({ balance, size = 'sm', className }: { balance: number; size?: 'sm' | 'lg'; className?: string }) {
  const negative = balance < 0
  return (
    <Link
      to="/schatzkammer"
      aria-label={goldChipLabel(balance)}
      title="Zur Schatzkammer"
      data-gold-balance={balance}
      className={cn(
        'relative z-20 inline-flex shrink-0 items-center rounded-full border font-semibold whitespace-nowrap tabular-nums transition-[border-color,background-color,box-shadow] duration-150',
        'border-gold/40 bg-linear-to-b from-gold/18 to-gold/6 shadow-[inset_0_1px_0_rgb(240_201_106/0.2)] hover:border-gold/70 hover:from-gold/26 hover:shadow-[0_0_14px_-4px_rgb(240_201_106/0.6)] active:scale-95',
        // Kompakt sichtbar 26 px hoch, das Tap-Ziel per Pseudo-Element auf 40 px vergrößert.
        size === 'sm'
          ? 'h-[1.625rem] gap-1 px-2 text-xs before:absolute before:-inset-x-1 before:-inset-y-[7px] before:content-[""]'
          : 'h-10 gap-1.5 px-3.5 text-sm',
        negative ? 'text-danger' : 'text-gold-bright',
        className,
      )}
    >
      <Coins aria-hidden className={cn('shrink-0', size === 'sm' ? 'size-3.5' : 'size-4', negative ? 'text-danger' : 'text-gold')} />
      <span>{formatNumber(balance)}</span>
      {size === 'lg' && <span className="font-medium text-muted">Gold</span>}
    </Link>
  )
}
