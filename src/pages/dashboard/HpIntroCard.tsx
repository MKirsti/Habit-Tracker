import { CalendarCheck, CalendarRange, Feather, Heart, Hourglass, Sunrise, Tent } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { markHpIntroSeen } from '../../data/repository'
import { Button, Card, useToast } from '../../ui'
import { HP_COLOR } from '../../features/feedback/hpTheme'
import { focusIsLost } from '../treasury/focus'
import { nextTabbableAfter } from './dashboardFocus'
import { hpIntroPoints } from './hpText'

/** Symbole der Punkte in der Reihenfolge von `hpIntroPoints()`. */
const POINT_ICONS: ReactNode[] = [<CalendarCheck key="day" />, <CalendarRange key="week" />, <Hourglass key="grace" />, <Tent key="rest" />, <Sunrise key="defeat" />]

/**
 * Einmalige Einführung „Neu: Lebenspunkte“ unter dem Helden-Kopf: erklärt die milde Tageswertung (eine Wertung pro
 * Tag – Heilung zuerst, höchstens −6 –, Wochenquests kosten nie, helfen aber, Gnadenfrist, Ruhetag & Pause, Niederlage
 * mit Gold-Obergrenze) und verweist auf den Sanften Modus in den Einstellungen. „Verstanden“ merkt sich das dauerhaft
 * (`markHpIntroSeen`).
 */
export function HpIntroCard() {
  const titleId = useId()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  async function confirm(event: MouseEvent<HTMLButtonElement>) {
    // Die Karte verschwindet gleich samt Knopf: Der Fokus wandert dann zum nächsten Bedienelement darunter
    // (meist „Heute / Gestern“ der Tagesquests) statt auf <body>.
    const card = event.currentTarget.closest('[data-hp-intro]')
    const next = card ? nextTabbableAfter(card) : null
    setBusy(true)
    try {
      await markHpIntroSeen()
      if (next?.isConnected && focusIsLost()) next.focus({ preventScroll: true })
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Das hat nicht geklappt',
        description: error instanceof Error ? error.message : 'Bitte versuche es noch einmal.',
      })
      setBusy(false)
    }
  }

  return (
    <Card as="section" aria-labelledby={titleId} padding="none" className="mb-5 md:mb-6" data-hp-intro="">
      <div className="px-4 pt-4 pb-3.5 sm:px-5 sm:pt-5 sm:pb-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/25 ring-1 ring-white/10 ring-inset"
          >
            <Heart className="size-5 fill-current opacity-90" style={{ color: HP_COLOR }} />
          </span>
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-gold uppercase">Neu</p>
            <h2 id={titleId} className="font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
              Lebenspunkte
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Eine sanfte Tageswertung – kein Stress pro Quest. Nichts zählt rückwirkend.
            </p>
          </div>
        </div>

        <ul className="mt-3 grid gap-x-6 gap-y-1.5 md:grid-cols-2 md:gap-y-2">
          {hpIntroPoints().map((point, index) => (
            <li key={point.title} className="flex items-start gap-2.5 text-sm">
              <span aria-hidden="true" className="mt-0.5 text-gold [&_svg]:size-4">
                {POINT_ICONS[index]}
              </span>
              <span className="min-w-0 text-muted">
                <strong className="font-semibold text-parchment">{point.title}</strong> {point.text}
              </span>
            </li>
          ))}
          <li className="flex items-start gap-2.5 text-sm">
            <span aria-hidden="true" className="mt-0.5 text-gold [&_svg]:size-4">
              <Feather />
            </span>
            <span className="min-w-0 text-muted">
              <strong className="font-semibold text-parchment">Lieber ohne?</strong> Den{' '}
              <Link
                to="/einstellungen"
                className="font-medium text-gold-bright underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
              >
                Sanften Modus
              </Link>{' '}
              findest du in den Einstellungen.
            </span>
          </li>
        </ul>
      </div>
      <div className="flex justify-end px-4 pb-4 sm:px-5 sm:pb-5">
        <Button onClick={(event) => void confirm(event)} loading={busy} className="max-sm:w-full">
          Verstanden
        </Button>
      </div>
    </Card>
  )
}
