import { useId } from 'react'

/**
 * Eindeutige ID für SVG-Verläufe/Masken (`url(#…)`). `useId()` kann Zeichen liefern, die in
 * solchen Referenzen stören – deshalb auf sichere Zeichen reduziert.
 */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}
