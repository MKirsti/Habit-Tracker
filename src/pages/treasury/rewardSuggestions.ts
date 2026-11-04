/**
 * Vorschläge für echte Belohnungen in der Schatzkammer – mit einem Tipp ins Formular übernommen.
 *
 * Preise nach Plan: ½ Gold pro XP. Mit einer Kampagne bringt ein beständiger Tag typisch 60–100 XP (inklusive
 * Streak-Bonus), also grob 30–50 Gold; mit drei Kampagnen gut das Doppelte. Daraus die drei Größen:
 * - klein (100–200 Gold): eine Kleinigkeit nach zwei, drei Tagen
 * - mittel (500–800 Gold): etwa zwei Wochen beständiges Spielen
 * - groß (2.000–5.000 Gold): ein Ziel für ein bis drei Monate
 * Innerhalb der Größen grob nach echtem Gegenwert (Faustregel: 100 Gold ≈ 3 €), damit Preise untereinander
 * stimmig wirken. Gesunde, abwechslungsreiche Ideen: Genuss, Auszeit, Erlebnis, Dinge, die weiterbringen.
 */
export type RewardSuggestionSize = 'small' | 'medium' | 'large'

export interface RewardSuggestion {
  /** Stabil, nur für React-Schlüssel und Tests. */
  id: string
  icon: string
  title: string
  description: string
  price: number
  repeatable: boolean
  size: RewardSuggestionSize
}

export const REWARD_SUGGESTION_SIZES: readonly RewardSuggestionSize[] = ['small', 'medium', 'large']

export const REWARD_SUGGESTION_SIZE_LABELS: Record<RewardSuggestionSize, string> = {
  small: 'Kleine Freuden',
  medium: 'Genuss & Auszeit',
  large: 'Große Wünsche',
}

/** Preisspanne je Größe – für die Überschriften und als Prüfregel der Vorschläge. */
export const REWARD_SUGGESTION_PRICE_RANGES: Record<RewardSuggestionSize, { min: number; max: number }> = {
  small: { min: 100, max: 200 },
  medium: { min: 500, max: 800 },
  large: { min: 2000, max: 5000 },
}

/** Nach Größe, darin nach Preis sortiert (so erscheinen sie auch in der Schatzkammer). */
export const REWARD_SUGGESTIONS: readonly RewardSuggestion[] = [
  {
    id: 'sweets',
    icon: '🍫',
    title: 'Süße Belohnung',
    description: 'Deine Lieblingsschokolade oder ein Stück Kuchen – bewusst genossen, ganz ohne Reue.',
    price: 100,
    repeatable: true,
    size: 'small',
  },
  {
    id: 'cafe',
    icon: '☕',
    title: 'Café-Besuch',
    description: 'Dein Lieblingsgetränk im Café, in aller Ruhe – vielleicht mit einem guten Buch.',
    price: 150,
    repeatable: true,
    size: 'small',
  },
  {
    id: 'plant',
    icon: '🪴',
    title: 'Neue Zimmerpflanze',
    description: 'Ein bisschen mehr Grün für dein Zuhause – sie wächst mit dir.',
    price: 200,
    repeatable: true,
    size: 'small',
  },
  {
    id: 'series',
    icon: '📺',
    title: 'Serienabend',
    description: 'Ein gemütlicher Abend auf dem Sofa mit deiner Lieblingsserie.',
    price: 200,
    repeatable: true,
    size: 'small',
  },
  {
    id: 'pizza',
    icon: '🍕',
    title: 'Pizza bestellen',
    description: 'Heute kocht jemand anderes für dich.',
    price: 500,
    repeatable: true,
    size: 'medium',
  },
  {
    id: 'cinema',
    icon: '🎬',
    title: 'Kinoabend',
    description: 'Großes Kino mit Popcorn – allein oder in guter Gesellschaft.',
    price: 600,
    repeatable: true,
    size: 'medium',
  },
  {
    id: 'book',
    icon: '📕',
    title: 'Neues Buch',
    description: 'Ein Buch, auf das du dich schon lange freust.',
    price: 700,
    repeatable: true,
    size: 'medium',
  },
  {
    id: 'sauna',
    icon: '🧖',
    title: 'Sauna oder Therme',
    description: 'Ein paar Stunden Wärme und Ruhe – eine Auszeit für Körper und Geist.',
    price: 800,
    repeatable: true,
    size: 'medium',
  },
  {
    id: 'massage',
    icon: '💆',
    title: 'Massage',
    description: 'Eine Stunde nur für dich: Verspannungen lösen, abschalten, durchatmen.',
    price: 2000,
    repeatable: true,
    size: 'large',
  },
  {
    id: 'game',
    icon: '🎮',
    title: 'Neues Spiel',
    description: 'Das Spiel, das ganz oben auf deiner Wunschliste steht.',
    price: 2500,
    repeatable: false,
    size: 'large',
  },
  {
    id: 'gear',
    icon: '👟',
    title: 'Neue Ausrüstung',
    description: 'Laufschuhe, eine Yogamatte oder Werkzeug für dein Hobby – etwas, das dich weiterbringt.',
    price: 3000,
    repeatable: false,
    size: 'large',
  },
  {
    id: 'trip',
    icon: '🧳',
    title: 'Wochenendausflug',
    description: 'Raus aus dem Alltag: zwei Tage an einem Ort, der dich lockt.',
    price: 5000,
    repeatable: false,
    size: 'large',
  },
]

function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase('de-DE')
}

/**
 * Vorschläge, die es noch nicht als (sichtbare) Belohnung gibt – gleicher Titel, ohne Groß-/Kleinschreibung und
 * Leerzeichen am Rand. Ausgeblendete Belohnungen zählen nicht: Ihr Vorschlag erscheint wieder.
 */
export function openRewardSuggestions(
  rewards: readonly { title: string; archived?: boolean }[],
  suggestions: readonly RewardSuggestion[] = REWARD_SUGGESTIONS,
): RewardSuggestion[] {
  const taken = new Set(
    rewards.filter((reward) => reward.archived !== true).map((reward) => normalizeTitle(reward.title)),
  )
  return suggestions.filter((suggestion) => !taken.has(normalizeTitle(suggestion.title)))
}
