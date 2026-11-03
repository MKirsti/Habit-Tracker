import { motion } from 'motion/react'
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { cn } from '../ui/cn'
import { Divider } from '../ui/Ornament'
import { AppLogo } from './AppLogo'
import { NAV_ITEMS } from './navigation'

export interface LayoutProps {
  /** Optionaler Bereich über dem Seiteninhalt (z. B. die Charakter-Kopfzeile). */
  header?: ReactNode
  /** Seiteninhalt. Standard: das `<Outlet />` des Routers. */
  children?: ReactNode
}

/**
 * App-Rahmen: auf dem Handy Inhalt + feste untere Navigation, ab `md` eine Seitenleiste links.
 * Enthält keinerlei Datenzugriff – Inhalte kommen über Routen (Outlet) bzw. `header`.
 */
export function Layout({ header, children }: LayoutProps) {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  return (
    <div className="min-h-dvh">
      {/* Sprunglink für Tastaturnutzer (Button statt #-Link, weil der Hash-Router den Hash belegt). */}
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only z-[70] rounded-lg bg-gold px-4 py-2 font-semibold text-on-gold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Zum Inhalt springen
      </button>

      <Sidebar />

      <div className="md:pl-(--sidebar-width)">
        <MobileTopBar />
        <main
          ref={mainRef}
          id="main"
          tabIndex={-1}
          className={cn(
            'mx-auto w-full max-w-5xl focus:outline-none',
            'pt-6 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]',
            'pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+2rem)]',
            'sm:pr-6 sm:pl-6 md:px-10 md:pt-10 md:pb-16 lg:px-12',
          )}
        >
          {header}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {children ?? <Outlet />}
          </motion.div>
        </main>
      </div>

      <BottomNav />
      <ScrollRestoration />
    </div>
  )
}

/**
 * Schlanke Kopfzeile nur auf dem Handy (berücksichtigt die Statusleiste bei viewport-fit=cover).
 * 44 px + Haarlinie statt Ornament-Trenner, damit die heutigen Quests möglichst weit oben stehen.
 */
function MobileTopBar() {
  return (
    <header className="relative pt-safe md:hidden">
      <div className="flex h-11 items-center justify-center pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
        <AppLogo size="sm" />
      </div>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-12 bottom-0 h-px bg-linear-to-r from-transparent via-gold-dim/50 to-transparent"
      />
    </header>
  )
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-(--sidebar-width) flex-col border-r border-border/80 bg-bg-deep/75 pt-safe backdrop-blur-md md:flex">
      {/* Goldene Lichtkante rechts */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-16 right-0 w-px bg-linear-to-b from-transparent via-gold/25 to-transparent"
      />
      <div className="px-6 pt-8 pb-5">
        <AppLogo size="md" />
      </div>
      <Divider ornament className="px-6" />

      <nav aria-label="Hauptnavigation" className="flex-1 overflow-y-auto px-3 py-5">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, sidebarLabel, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'group relative flex h-11 items-center gap-3 rounded-xl px-3.5 text-[0.9375rem] font-medium transition-colors duration-150',
                    isActive ? 'text-gold-bright' : 'text-muted hover:bg-surface/80 hover:text-parchment',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active"
                        aria-hidden="true"
                        className="absolute inset-0 rounded-xl bg-linear-to-r from-gold/16 to-gold/4 ring-1 ring-gold/30 ring-inset"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      >
                        <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-gold-bright shadow-glow-sm" />
                      </motion.span>
                    )}
                    <Icon
                      aria-hidden
                      className={cn('relative size-5 shrink-0', isActive && 'drop-shadow-[0_0_6px_rgb(240_201_106/0.55)]')}
                      strokeWidth={isActive ? 2.1 : 1.8}
                    />
                    <span className="relative">{sidebarLabel}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <p className="px-6 pb-6 text-xs leading-relaxed text-muted">
        Jeder Tag ist ein neues Kapitel deines Abenteuers.
      </p>
    </aside>
  )
}

function BottomNav() {
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/90 bg-bg-deep/90 pb-safe px-safe backdrop-blur-xl md:hidden"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-gold/45 to-transparent"
      />
      <ul className="mx-auto grid h-(--bottom-nav-height) max-w-lg grid-cols-5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium tracking-wide transition-colors duration-150',
                  'focus-visible:-outline-offset-4',
                  isActive ? 'text-gold-bright' : 'text-muted active:text-parchment',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="bottom-nav-active"
                      aria-hidden="true"
                      className="absolute top-0 h-0.5 w-9 rounded-full bg-gold-bright shadow-glow-sm"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span
                    className={cn(
                      'grid h-7 w-12 place-items-center rounded-full transition-colors duration-200',
                      isActive && 'bg-gold/12',
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cn('size-[1.375rem]', isActive && 'drop-shadow-[0_0_6px_rgb(240_201_106/0.6)]')}
                      strokeWidth={isActive ? 2.1 : 1.8}
                    />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
