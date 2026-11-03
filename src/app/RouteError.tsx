import { RotateCcw, TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'

/** Fehleranzeige des Routers (statt der englischen Standardseite). */
export function RouteError() {
  const error = useRouteError()
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4 py-10">
      <EmptyState
        className="w-full"
        icon={<TriangleAlert />}
        title="Da ist etwas schiefgelaufen"
        text={
          <>
            Ein unerwarteter Fehler ist aufgetreten. Deine Daten sind sicher auf diesem Gerät gespeichert.
            {detail && <span className="mt-3 block font-mono text-xs break-words text-faint">{detail}</span>}
          </>
        }
        action={
          <Button icon={<RotateCcw />} onClick={() => window.location.reload()}>
            Neu laden
          </Button>
        }
      />
    </div>
  )
}
