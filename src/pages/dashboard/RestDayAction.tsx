import { Tent } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button, ConfirmDialog } from '../../ui'
import { REST_SETTINGS_PATH } from '../settings/settingsText'
import { REST_DAY_ACTION_ID } from './dashboardFocus'
import { restConfirmText } from './hpText'

export interface RestDayActionProps {
  /** Legt heute als Ruhetag an. Wirft bei einem Fehler (der Dialog bleibt offen, der Fehler kommt als Toast). */
  onConfirm: () => Promise<void>
  /** Schon ein Teil der Tagesquests erledigt: Hinweis, dass es an einem Ruhetag keinen Perfekten Tag gibt. */
  hasProgress: boolean
}

/**
 * Leise Fußzeile der Tagesquest-Karte: „Zeit für eine Pause?“ mit „Heute Ruhetag“ – erst nach einer
 * Rückfrage wird der Ruhetag angelegt (heute bis heute) – und darunter der Weg zum Urlaub planen (Einstellungen →
 * Rast & Urlaub). Bewusst unaufdringlich unter den Quests.
 */
export function RestDayAction({ onConfirm, hasProgress }: RestDayActionProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/70 py-1.5 pr-1.5 pl-3.5 sm:pl-4">
      <p className="min-w-0 text-xs text-muted">
        Zeit für eine Pause?{' '}
        <Link
          to={REST_SETTINGS_PATH}
          className="whitespace-nowrap text-gold-bright/90 underline decoration-gold/35 underline-offset-2 hover:decoration-gold"
        >
          Urlaub planen
        </Link>
      </p>
      <Button
        id={REST_DAY_ACTION_ID}
        size="sm"
        variant="ghost"
        icon={<Tent />}
        onClick={() => setOpen(true)}
        className="shrink-0"
      >
        Heute Ruhetag
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        icon={<Tent />}
        title="Heute Ruhetag einlegen?"
        message={restConfirmText(hasProgress)}
        confirmLabel="Ruhetag einlegen"
        cancelLabel="Lieber nicht"
      />
    </div>
  )
}
