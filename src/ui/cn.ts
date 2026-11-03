/** Werte, die `cn` akzeptiert: falsy-Werte werden ignoriert (praktisch für Bedingungen). */
export type ClassValue = string | false | null | undefined | 0

/**
 * Fügt CSS-Klassen zusammen und lässt leere/falsy Werte weg.
 *
 * Hinweis: Es gibt kein automatisches Auflösen widersprüchlicher Tailwind-Klassen (kein tailwind-merge).
 * Komponenten hängen `className` deshalb immer zuletzt an; für Überschreibungen ggf. `!`-Varianten nutzen.
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ')
}
